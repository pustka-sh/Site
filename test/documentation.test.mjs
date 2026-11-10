import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDocumentationService, validateDocumentationPackage, renderDocumentationMarkdown, MAX_PACKAGE_BYTES } from '../server/services/documentation.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const registry=[{id:'relay',name:'Relay',repository:'https://github.com/pustka-sh/Relay'}];
const key='test-only-documentation-key-at-least-32-characters';
const start=Date.parse('2026-11-09T15:00:00.000Z');
const commit='a'.repeat(40);
const symbolId='dev.relay.Router#route(java.lang.String)';
function fixture(version='main'){
  return {schemaVersion:1,project:{...registry[0]},version,source:{commit,ref:version==='main'?'refs/heads/main':`refs/tags/${version}`},generatedAt:new Date(start).toISOString(),pages:[{slug:'overview',title:'Overview',kind:'guide',markdown:'# Relay\n\n[Setup](docs/setup.md)\n\n[source](src/main/java/dev/relay/Router.java)\n\nThe budget is $x^2$.',sourcePath:'README.md'},{slug:'setup',title:'Setup',kind:'guide',markdown:'# Setup',sourcePath:'docs/setup.md'}],api:{schemaVersion:1,language:'java',generator:'pustka-javadoc/1',symbols:[{id:symbolId,kind:'method',name:'route',qualifiedName:'dev.relay.Router.route',owner:'dev.relay.Router',signature:'public boolean route(String name)',summary:'Routes a named player.',description:'Author comment: use `route` for a player.\n\n[Router](javadoc:dev.relay.Router)',parameters:[{name:'name',type:'java.lang.String',description:'The **player name**.'}],returns:{type:'boolean',description:'Whether the player was accepted.'},throws:[{type:'java.io.IOException',description:'When transport fails.'}],since:'1.2',deprecated:false,deprecation:'',source:{path:'src/main/java/dev/relay/Router.java',line:42}}]}};
}
function signed(data,timestamp=String(start/1000),secret=key){const raw=Buffer.isBuffer(data)?data:Buffer.from(JSON.stringify(data));return [raw,{project:'relay',timestamp,signature:'sha256='+createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex')}];}
async function setup(t){const scratch=path.join(ROOT,'test','.scratch');await mkdir(scratch,{recursive:true});const dir=await mkdtemp(path.join(scratch,'documentation-'));t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));await rm(dir,{recursive:true,force:true});});let now=start;return {dir,service:createDocumentationService({dataDir:dir,projects:registry,keys:{relay:key},now:()=>now}),setNow:value=>{now=value;}};}
const rejectsCode=(fn,code,status)=>assert.rejects(fn,cause=>cause.code===code&&(!status||cause.status===status)&&cause.expose===true);

test('publication verifies raw-byte HMAC and replay window before parsing JSON',async t=>{
  const {service}=await setup(t);
  const bad=Buffer.from('{ invalid JSON');const [raw,headers]=signed(bad);
  await rejectsCode(()=>service.publish(raw,{...headers,signature:'sha256='+'0'.repeat(64)}),'DOCS_SIGNATURE_INVALID',401);
  await rejectsCode(()=>service.publish(raw,headers),'INVALID_DOCS_PACKAGE',400);
  for(const seconds of [-301,301]){const args=signed(fixture(),String(start/1000+seconds));await rejectsCode(()=>service.publish(...args),'DOCS_SIGNATURE_INVALID',401);}
  await rejectsCode(()=>service.publish(...signed(fixture(),String(start/1000),'wrong-key')),'DOCS_SIGNATURE_INVALID',401);
  const valid=signed(fixture());await rejectsCode(()=>service.publish(Buffer.concat([valid[0],Buffer.from(' ')]),valid[1]),'DOCS_SIGNATURE_INVALID',401);
  await rejectsCode(()=>service.publish(Buffer.alloc(MAX_PACKAGE_BYTES+1),valid[1]),'DOCS_PACKAGE_TOO_LARGE',413);
  const result=await service.publish(...valid);assert.equal(result.published,true);assert.equal(result.idempotent,false);
});

test('registry identity and branch/tag identity are enforced without exposing signing keys',async t=>{
  const {service,dir}=await setup(t);
  const foreign=fixture();foreign.project.repository='https://github.com/attacker/Relay';
  await rejectsCode(()=>service.publish(...signed(foreign)),'DOCS_PROJECT_MISMATCH',403);
  const fork=fixture();fork.source.ref='refs/pull/12/merge';
  await rejectsCode(()=>service.publish(...signed(fork)),'INVALID_DOCS_REF',400);
  const future=fixture();future.generatedAt='2099-01-01T00:00:00Z';
  await rejectsCode(()=>service.publish(...signed(future)),'INVALID_DOCS_TIMESTAMP',400);
  const disabled=createDocumentationService({dataDir:dir,projects:registry});
  await rejectsCode(()=>disabled.publish(...signed(fixture())),'DOCS_PUBLISH_DISABLED',503);
  await service.publish(...signed(fixture()));
  const responses=JSON.stringify([await service.projects(),await service.versions('relay'),await service.manifest('relay','main'),await service.page('relay','main','overview'),await service.symbol('relay','main',symbolId)]);
  assert.ok(!responses.includes(key));assert.ok(!responses.includes('DOCS_PUBLISH_KEYS'));
  const manifest=await service.manifest('relay','main');assert.equal(manifest.publishedAt,new Date(start).toISOString());assert.equal(manifest.pages[0].markdown,undefined);assert.equal(manifest.api.symbols[0].description,undefined);
});

test('release versions are immutable, concurrent publication serializes, and reruns are idempotent',async t=>{
  const {service}=await setup(t);const release=fixture('v1.2.0');
  const competing=fixture('v1.2.0');competing.source.commit='b'.repeat(40);
  const [first,second]=await Promise.allSettled([service.publish(...signed(release)),service.publish(...signed(competing))]);
  assert.equal(first.status,'fulfilled');assert.equal(second.status,'rejected');assert.equal(second.reason.code,'DOCS_RELEASE_IMMUTABLE');
  const rerun=fixture('v1.2.0');rerun.generatedAt=new Date(start+1000).toISOString();
  assert.equal((await service.publish(...signed(rerun))).idempotent,true);
  assert.equal((await service.manifest('relay','v1.2.0')).source.commit,commit);
  await service.publish(...signed(fixture()));
  assert.equal((await service.versions('relay')).defaultVersion,'v1.2.0');
});

test('main advances only with newer signed publications and snapshots survive restarts and rejected writes',async t=>{
  const {service,dir,setNow}=await setup(t);await service.publish(...signed(fixture()));
  const file=path.join(dir,'documentation','relay','main.json');const original=await readFile(file,'utf8');
  const invalid=fixture();invalid.pages[0].sourcePath='../secret';
  await rejectsCode(()=>service.publish(...signed(invalid)),'INVALID_DOCS_PACKAGE',400);
  assert.equal(await readFile(file,'utf8'),original);
  const updated=fixture();updated.source.commit='b'.repeat(40);updated.api.symbols[0].description='Updated source comment.';
  await rejectsCode(()=>service.publish(...signed(updated)),'DOCS_PUBLICATION_STALE',409);
  setNow(start+2000);await service.publish(...signed(updated,String(start/1000+2)));
  const restarted=createDocumentationService({dataDir:dir,projects:registry,now:()=>start+2000});
  assert.equal((await restarted.manifest('relay','main')).source.commit,'b'.repeat(40));
  assert.equal((await restarted.symbol('relay','main',symbolId)).symbol.description,'Updated source comment.');
  await rejectsCode(()=>service.publish(...signed(fixture(),String(start/1000+1))),'DOCS_PUBLICATION_STALE',409);
  assert.deepEqual((await readdir(path.dirname(file))).sort(),['main.json']);
  await writeFile(file,'{corrupt');
  await rejectsCode(()=>restarted.manifest('relay','main'),'DOCS_STORAGE_UNAVAILABLE',503);
});

test('package validation rejects path traversal, encoded paths, duplicate IDs and metadata outside the contract',()=>{
  for(const unsafe of ['../README.md','docs/../../secret','/etc/passwd','C:/private','docs\\secret.md','docs/%2e%2e/secret.md','docs/%252e%252e/secret','docs//guide.md','docs/./guide.md','docs/a.md?raw=true']){
    const data=fixture();data.pages[0].sourcePath=unsafe;assert.throws(()=>validateDocumentationPackage(data),cause=>cause.code==='INVALID_DOCS_PACKAGE',unsafe);
    const source=fixture();source.api.symbols[0].source.path=unsafe;assert.throws(()=>validateDocumentationPackage(source),cause=>cause.code==='INVALID_DOCS_PACKAGE',unsafe);
  }
  for(const version of ['../main','main%2f..','main%252f..','MAIN','v1.2','v1.2.3/other']){const data=fixture();data.version=version;assert.throws(()=>validateDocumentationPackage(data));}
  const duplicate=fixture();duplicate.api.symbols.push({...duplicate.api.symbols[0]});assert.throws(()=>validateDocumentationPackage(duplicate),cause=>cause.code==='DUPLICATE_DOCS_ID');
  const html=fixture();html.pages[0].html='<script>bad</script>';assert.throws(()=>validateDocumentationPackage(html),cause=>cause.code==='INVALID_DOCS_PACKAGE');
});

test('Markdown renders bounded math, escapes author HTML and disables script links and trusted KaTeX commands',()=>{
  const rendered=renderDocumentationMarkdown('# Formula\n\nInline $x^2$ and `literal $x$`.\n\n$$\n\\frac{a}{b}\n$$\n\n<script>alert(1)</script>\n<img src=x onerror=alert(1)>\n\n[unsafe](javascript:alert%281%29)\n\n$\\href{javascript:alert(1)}{click}$\n\n$\\htmlClass{evil}{x}$\n\n$\\unknownCommand{x}$');
  assert.match(rendered,/<h2 id="formula">/);assert.match(rendered,/class="katex"/);assert.match(rendered,/<math /);assert.match(rendered,/class="docs-math"/);
  assert.match(rendered,/<span class="katex-html" aria-hidden="true">/);
  assert.match(rendered,/<code>literal \$x\$<\/code>/);assert.match(rendered,/&lt;script&gt;/);
  assert.doesNotMatch(rendered,/<script|<img|href="javascript:|onerror="|class="evil"/i);
  assert.match(rendered,/math could not be rendered/);
  const capped=renderDocumentationMarkdown(Array(66).fill('$x$').join(' '));assert.match(capped,/math could not be rendered/);assert.equal((capped.match(/class="katex"/g)||[]).length,64);
  assert.throws(()=>renderDocumentationMarkdown('x'.repeat(262145)),cause=>cause.code==='DOCS_PAGE_TOO_LARGE');
});

test('reader responses preserve author comments and link guides, symbols and source at the exact published revision',async t=>{
  const {service}=await setup(t);await service.publish(...signed(fixture()));
  const page=await service.page('relay','main','overview');assert.equal(page.source.commit,commit);assert.match(page.page.html,/href="\/docs\/relay\/main\/setup"/);
  assert.ok(page.page.html.includes(`/blob/${commit}/src/main/java/dev/relay/Router.java`));
  const result=await service.symbol('relay','main',symbolId);assert.equal(result.symbol.source.line,42);assert.match(result.symbol.descriptionHtml,/Author comment: use <code>route<\/code>/);
  assert.match(result.symbol.descriptionHtml,/data-doc-symbol="dev.relay.Router"/);assert.match(result.symbol.descriptionHtml,/href="\?symbol=dev.relay.Router"/);
  assert.match(result.symbol.parameters[0].descriptionHtml,/<strong>player name<\/strong>/);assert.match(result.symbol.returns.descriptionHtml,/accepted/);assert.match(result.symbol.throws[0].descriptionHtml,/transport/);
  await rejectsCode(()=>service.page('relay','main','absent'),'DOCS_PAGE_NOT_FOUND',404);
  await rejectsCode(()=>service.symbol('relay','main','absent'),'DOCS_SYMBOL_NOT_FOUND',404);
  await rejectsCode(()=>service.manifest('relay','main%252f..'),'DOCS_VERSION_NOT_FOUND',404);
});

test('registered projects are discoverable before publication and never pretend an absent version exists',async t=>{
  const {service}=await setup(t);assert.deepEqual(await service.projects(),{projects:[{...registry[0],versions:[],defaultVersion:null}]});
  await rejectsCode(()=>service.manifest('relay','main'),'DOCS_VERSION_NOT_FOUND',404);
  await rejectsCode(()=>service.versions('unknown'),'DOCS_PROJECT_NOT_FOUND',404);
});

test('simultaneous cold version indexes share metadata, publications refresh it, and restart rebuilds it',async t=>{
  const {service,dir,setNow}=await setup(t);
  await service.publish(...signed(fixture()));await service.publish(...signed(fixture('v1.0.0')));
  const cold=await Promise.all(Array.from({length:8},()=>service.versions('relay')));
  // Shared frozen metadata proves concurrent callers used one index build, without timing assertions.
  for(const result of cold)assert.strictEqual(result.versions,cold[0].versions);
  const directory=await service.projects();assert.strictEqual(directory.projects[0].versions,cold[0].versions);
  assert.ok(Object.isFrozen(cold[0].versions));
  const changed=fixture();changed.source.commit='c'.repeat(40);setNow(start+2000);
  await service.publish(...signed(changed,String(start/1000+2)));
  const updated=await service.versions('relay');assert.notStrictEqual(updated.versions,cold[0].versions);assert.equal(updated.versions.find(item=>item.development).commit,'c'.repeat(40));
  await service.publish(...signed(fixture('v2.0.0'),String(start/1000+2)));
  const release=await service.versions('relay');assert.equal(release.defaultVersion,'v2.0.0');assert.equal(release.versions.length,3);
  const restarted=createDocumentationService({dataDir:dir,projects:registry,now:()=>start+2000});
  const restored=await restarted.versions('relay');assert.deepEqual(restored,release);assert.notStrictEqual(restored.versions,release.versions);
});

test('validated record reuse is limited to four snapshots and refreshes changed files',async t=>{
  const {service,dir}=await setup(t);
  for(let number=1;number<=6;number++)await service.publish(...signed(fixture(`v${number}.0.0`)));
  let clock=start;const reader=createDocumentationService({dataDir:dir,projects:registry,now:()=>clock});
  const first=await reader.manifest('relay','v1.0.0'),second=await reader.manifest('relay','v2.0.0');
  await reader.manifest('relay','v3.0.0');await reader.manifest('relay','v4.0.0');
  // Cached source objects are immutable; identity checks exercise reuse and LRU eviction directly.
  assert.strictEqual((await reader.page('relay','v1.0.0','overview')).source,first.source);
  await reader.manifest('relay','v5.0.0');
  assert.strictEqual((await reader.manifest('relay','v1.0.0')).source,first.source);
  assert.notStrictEqual((await reader.manifest('relay','v2.0.0')).source,second.source);
  assert.ok(Object.isFrozen(first.source));
  await reader.versions('relay');assert.strictEqual((await reader.manifest('relay','v1.0.0')).source,first.source);
  clock+=31000;await reader.versions('relay');
  // Refreshing all six metadata entries must not reread/evict four cached page snapshots.
  assert.strictEqual((await reader.manifest('relay','v1.0.0')).source,first.source);
  const file=path.join(dir,'documentation','relay','v1.0.0.json');const previous=await readFile(file,'utf8');
  const changed=previous.replace('Author comment:','Broken comment:');assert.equal(changed.length,previous.length);await writeFile(file,changed);
  await rejectsCode(()=>reader.manifest('relay','v1.0.0'),'DOCS_STORAGE_UNAVAILABLE',503);
  clock+=31000;assert.ok(!(await reader.versions('relay')).versions.some(item=>item.version==='v1.0.0'));
});

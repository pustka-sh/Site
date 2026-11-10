import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageDocumentation } from '../scripts/package-docs.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const run=promisify(execFile);
const commit='d'.repeat(40);
const api={schemaVersion:1,language:'java',generator:'fixture/1',symbols:[{id:'example.Router',kind:'class',name:'Router',qualifiedName:'example.Router',signature:'public class Router',description:'This text came from a source comment.',source:{path:'src/main/java/example/Router.java',line:8}}]};
async function setup(t){
  const scratch=path.join(ROOT,'test','.scratch');await mkdir(scratch,{recursive:true});const dir=await mkdtemp(path.join(scratch,'package-docs-'));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));await rm(dir,{recursive:true,force:true});});
  const root=path.join(dir,'project');await mkdir(path.join(root,'build'),{recursive:true});await mkdir(path.join(root,'docs'));
  const manifestPath=path.join(root,'pustka.docs.json'),apiPath=path.join(root,'build','api.json'),outPath=path.join(dir,'package.json');
  const manifest={schemaVersion:1,project:{id:'relay',name:'Relay',repository:'https://github.com/pustka-sh/Relay'},guides:[{path:'README.md',slug:'overview',title:'Overview'},{path:'docs/routing.md',slug:'routing',title:'Routing'}],api:{language:'java',artifact:'build/api.json'}};
  await writeFile(manifestPath,JSON.stringify(manifest));await writeFile(apiPath,JSON.stringify(api));await writeFile(path.join(root,'README.md'),'# Overview\n\nUse $r^2$ for the bound.');await writeFile(path.join(root,'docs','routing.md'),'# Routing\n\nAuthor-written guide.');
  return {dir,manifest,manifestPath,root,apiPath,outPath,version:'main',commit,ref:'refs/heads/main',now:()=>Date.parse('2026-11-09T15:00:00Z')};
}

test('packaging combines Markdown and normalized source comments with explicit immutable source identity',async t=>{
  const options=await setup(t);const result=await packageDocumentation(options);
  assert.equal(result.source.commit,commit);assert.equal(result.source.ref,'refs/heads/main');assert.equal(result.generatedAt,'2026-11-09T15:00:00.000Z');
  assert.equal(result.pages[1].sourcePath,'docs/routing.md');assert.equal(result.pages[1].markdown,'# Routing\n\nAuthor-written guide.');
  assert.equal(result.api.symbols[0].description,'This text came from a source comment.');assert.equal(result.api.symbols[0].source.line,8);assert.deepEqual(result.api.symbols[0].parameters,[]);
  assert.deepEqual(JSON.parse(await readFile(options.outPath,'utf8')),result);
  const release=await packageDocumentation({...options,version:'v2.0.0',ref:'refs/tags/v2.0.0'});assert.equal(release.version,'v2.0.0');
});

test('CLI builds a package without loading project JavaScript or running a manifest command',async t=>{
  const options=await setup(t);const sentinel=path.join(options.dir,'executed.txt');
  await writeFile(path.join(options.root,'package.json'),JSON.stringify({type:'module',scripts:{build:`node -e "require('fs').writeFileSync('${sentinel}','bad')"`}}));
  await writeFile(path.join(options.root,'malicious.mjs'),`throw new Error('Project code must not be imported');`);
  const {stdout}=await run(process.execPath,[path.join(ROOT,'scripts','package-docs.mjs'),'--manifest',options.manifestPath,'--root',options.root,'--api',options.apiPath,'--out',options.outPath,'--version','main','--commit',commit,'--ref','refs/heads/main'],{windowsHide:true,timeout:10000});
  assert.match(stdout,/Packaged relay\/main: 2 guides, 1 API symbols/);assert.equal(JSON.parse(await readFile(options.outPath,'utf8')).source.commit,commit);
  await assert.rejects(()=>readFile(sentinel),cause=>cause.code==='ENOENT');
  options.manifest.command='node malicious.mjs';await writeFile(options.manifestPath,JSON.stringify(options.manifest));
  await assert.rejects(()=>packageDocumentation(options),/manifest does not match/);
});

test('packaging rejects traversal, executable guides and mismatched API artifacts',async t=>{
  const options=await setup(t);
  for(const unsafe of ['../README.md','docs/../../outside.md','docs\\routing.md','/etc/passwd','docs/%2e%2e/guide.md','malicious.mjs']){
    const manifest={...options.manifest,guides:[{path:unsafe,slug:'unsafe',title:'Unsafe'}]};await writeFile(options.manifestPath,JSON.stringify(manifest));
    await assert.rejects(()=>packageDocumentation(options),/manifest does not match/,unsafe);
  }
  await writeFile(options.manifestPath,JSON.stringify(options.manifest));
  const another=path.join(options.root,'build','other.json');await writeFile(another,JSON.stringify(api));
  await assert.rejects(()=>packageDocumentation({...options,apiPath:another}),/must match the artifact/);
  const outside=path.join(options.dir,'outside.json');await writeFile(outside,JSON.stringify(api));
  await assert.rejects(()=>packageDocumentation({...options,apiPath:outside}),/within the project root/);
  await assert.rejects(()=>packageDocumentation({...options,manifestPath:outside}),/within the project root/);
});

test('packaging refuses linked guides that leave the project root',async t=>{
  const options=await setup(t);const outside=path.join(options.dir,'outside');await mkdir(outside);await writeFile(path.join(outside,'secret.md'),'Private input');
  try{await symlink(outside,path.join(options.root,'linked'),process.platform==='win32'?'junction':'dir');}catch(cause){if(['EPERM','EACCES','ENOTSUP'].includes(cause.code)){t.skip('Host does not permit symbolic links.');return;}throw cause;}
  const manifest={...options.manifest,guides:[{path:'linked/secret.md',slug:'linked',title:'Linked'}]};await writeFile(options.manifestPath,JSON.stringify(manifest));
  await assert.rejects(()=>packageDocumentation(options),/must not link outside/);
});

test('invalid metadata and oversized or malformed input preserve an already built package',async t=>{
  const options=await setup(t);await packageDocumentation(options);const previous=await readFile(options.outPath,'utf8');
  await assert.rejects(()=>packageDocumentation({...options,commit:'not-a-commit'}),cause=>cause.code==='INVALID_DOCS_PACKAGE');
  await assert.rejects(()=>packageDocumentation({...options,version:'v1.0.0',ref:'refs/heads/main'}),cause=>cause.code==='INVALID_DOCS_REF');
  await writeFile(path.join(options.root,'README.md'),'x'.repeat(262145));await assert.rejects(()=>packageDocumentation(options),/exceeds its size limit/);
  assert.equal(await readFile(options.outPath,'utf8'),previous);
  await writeFile(path.join(options.root,'README.md'),Buffer.from([0xff,0xfe]));await assert.rejects(()=>packageDocumentation(options),/must be UTF-8/);
  assert.equal(await readFile(options.outPath,'utf8'),previous);
  await writeFile(options.apiPath,JSON.stringify({...api,language:'python'}));await assert.rejects(()=>packageDocumentation(options),/language must match/);
});

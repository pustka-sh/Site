import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createApplication } from '../server/app.mjs';
import { loadConfig, ROOT } from '../server/config.mjs';
import { createDocumentationService } from '../server/services/documentation.mjs';
import { signDocumentation } from '../scripts/publish-docs.mjs';

const key = 'test-only-discovery-publication-key-1234567890';
const project = {id:'relay',name:'Relay',repository:'https://github.com/pustka-sh/Relay'};
const routeId = 'example.Router#route(java.lang.String)';
const oldCommit = 'a'.repeat(40), newCommit = 'b'.repeat(40);
const shell = '<!doctype html><html><head><title>pustka</title><meta name="description" content="Home"><meta property="og:title" content="Home"><meta property="og:description" content="Home"><meta property="og:url" content="https://pustka.sh/"><link rel="canonical" href="https://pustka.sh/"><script>/* trusted theme */</script></head><body><div id="root"><noscript><p>Original static shell.</p></noscript></div><script type="module" src="/assets/site.js"></script></body></html>';
const staticSitemap = '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://pustka.sh/static-sitemap-sentinel</loc></url></urlset>';

function symbol({id='example.Router',kind='class',name='Router',owner='',signature='public class Router',...fields}={}) {
  return {id,kind,name,qualifiedName:id.includes('#') ? id.replace('#','.').replace(/\(.*/, '') : id,owner,signature,summary:'An authored source description.',description:'The **actual source comment** is rendered here.',parameters:[],returns:null,throws:[],since:'',deprecated:false,deprecation:'',source:{path:'src/Router.java',line:12},...fields};
}

function packageFor(version,after=false) {
  const data = {
    schemaVersion:1,project,version,source:{commit:after ? newCommit : oldCommit,ref:`refs/tags/${version}`},generatedAt:new Date().toISOString(),
    pages:[{slug:'overview',title:'Source guide <&>',kind:'guide',sourcePath:'README.md',markdown:`# Source guide\n\nThe real published ${after ? 'updated' : 'original'} guide explains the transport.\n\n[Call route](javadoc:${encodeURIComponent(routeId)})\n\nThe budget is $x^2$.\n\n<script>alert("author HTML must stay inert")</script>`}],
    api:{schemaVersion:1,language:'java',generator:'integration-fixture',symbols:[
      symbol(after ? {stability:'supported',stabilityNote:'The documented wire contract.'} : {}),
      symbol({id:routeId,kind:'method',name:'route',owner:'example.Router',signature:`public ${after ? 'String' : 'boolean'} route(String name)`,parameters:[{name:'name',type:'java.lang.String',description:'The **player name** used by this request.'}],returns:{type:after ? 'java.lang.String' : 'boolean',description:'The published request result.'},throws:[{type:'java.io.IOException',description:'When transport fails.'}],...(after ? {stability:'experimental',stabilityNote:'The helper contract is still changing.'} : {})}),
      symbol({id:after ? 'example.Router#ping()' : 'example.Router#obsolete()',kind:'method',name:after ? 'ping' : 'obsolete',owner:'example.Router',signature:after ? 'public void ping()' : 'public void obsolete()',...(after ? {stability:'internal'} : {})}),
    ]},
  };
  if (after) data.pages.push({slug:'migration',title:'Migration',kind:'guide',sourcePath:'docs/migration.md',markdown:'# Migration\n\nReview the changed return type before adopting this version.'});
  return data;
}

async function setup(t) {
  const scratch = path.join(ROOT,'test','.scratch');
  await mkdir(scratch,{recursive:true});
  const dir = await mkdtemp(path.join(scratch,'docs-discovery-http-'));
  const dist = path.join(dir,'dist');
  await mkdir(dist);
  await writeFile(path.join(dist,'index.html'),shell);
  await writeFile(path.join(dist,'sitemap.xml'),staticSitemap);
  const config = {...loadConfig({DATA_DIR:dir,PUBLIC_ORIGIN:'https://pustka.sh',DOCS_SYNC_ENABLED:'false',DOCS_PUBLISH_KEYS:JSON.stringify({relay:key})}),distDir:dist};
  const runtime = await createApplication({config});
  let server;
  t.after(async () => {
    if (server) {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
    await runtime.close();
    assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));
    await rm(dir,{recursive:true,force:true});
  });
  server = await new Promise((resolve,reject) => {const instance=runtime.app.listen(0,'127.0.0.1',()=>resolve(instance));instance.once('error',reject);});
  const base = `http://127.0.0.1:${server.address().port}`;
  async function publish(data,timestamp) {
    const body = Buffer.from(JSON.stringify(data));
    const response = await fetch(`${base}/api/site/docs/publish`,{method:'POST',headers:signDocumentation(body,key,timestamp),body});
    const text = await response.text();
    assert.equal(response.status,201,text);
    return JSON.parse(text);
  }
  return {base,dir,runtime,publish};
}

test('published documentation routes expose real content, discoverable snapshots and structural comparisons', async t => {
  const {base,dir,runtime,publish} = await setup(t);
  const before = packageFor('v1.0.0'), after = packageFor('v1.1.0',true);
  const firstPublication = await publish(before), secondPublication = await publish(after);

  await t.test('guide and symbol responses contain readable authored content before JavaScript runs', async () => {
    const response = await fetch(`${base}/docs/relay/v1.1.0/overview`);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/text\/html/);
    const html = await response.text();
    assert.match(html,/<h1>Source guide &lt;&amp;&gt;<\/h1>/);
    assert.match(html,/<p>The real published updated guide explains the transport\.<\/p>/);
    assert.match(html,/class="katex"/);
    assert.match(html,new RegExp(`github.com/pustka-sh/Relay/blob/${newCommit}/README.md`));
    assert.ok(html.includes(`/docs/relay/v1.1.0/api?symbol=${encodeURIComponent(routeId)}`));
    assert.doesNotMatch(html,/<script>alert\("author HTML must stay inert"\)<\/script>|Loading this documentation/);
    assert.equal((html.match(/<script\b/g)||[]).length,2,'only the original trusted shell scripts execute');
    assert.match(html,/<template id="pustka-doc-bootstrap">/);
    const scriptPolicy = response.headers.get('content-security-policy').split(';').find(value=>value.trim().startsWith('script-src'));
    assert.match(scriptPolicy,/'self'/);
    assert.match(scriptPolicy,/'sha256-/);
    assert.doesNotMatch(scriptPolicy,/'unsafe-inline'|'unsafe-eval'|https:/);
    const symbolHtml = await (await fetch(`${base}/docs/relay/v1.1.0/api?symbol=${encodeURIComponent(routeId)}`)).text();
    assert.match(symbolHtml,/<h1 class="published-symbol-title">route<\/h1>/);
    assert.match(symbolHtml,/<strong>actual source comment<\/strong>/);
    assert.match(symbolHtml,/<strong>experimental<\/strong>/);
    assert.match(symbolHtml,/The helper contract is still changing\./);
    assert.match(symbolHtml,/<h2 id="api-parameters">Parameters<\/h2>/);
    assert.match(symbolHtml,/<strong>player name<\/strong>/);
    assert.match(symbolHtml,/The published request result\./);
    assert.match(symbolHtml,/When transport fails\./);
    assert.ok(symbolHtml.includes(`/blob/${newCommit}/src/Router.java#L12`));
    const manifest = await (await fetch(`${base}/api/site/docs/relay/v1.1.0`)).json();
    assert.equal(manifest.api.symbols.find(item=>item.id===routeId).stability,'experimental');
  });

  await t.test('dynamic sitemap index precedes the static file and version maps contain published content', async () => {
    const response = await fetch(`${base}/sitemap.xml`);
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/application\/xml/);
    const xml = await response.text();
    assert.match(xml,/<sitemapindex\b/);
    assert.doesNotMatch(xml,/static-sitemap-sentinel/);
    for (const location of ['/sitemaps/site.xml','/sitemaps/docs/relay/v1.0.0.xml','/sitemaps/docs/relay/v1.1.0.xml']) assert.ok(xml.includes(`https://pustka.sh${location}`),location);
    assert.equal(await (await fetch(`${base}/sitemaps/site.xml`)).text(),staticSitemap);
    const versionMap = await (await fetch(`${base}/sitemaps/docs/relay/v1.1.0.xml`)).text();
    for (const location of ['/docs/relay/v1.1.0','/docs/relay/v1.1.0/overview','/docs/relay/v1.1.0/migration','/docs/relay/v1.1.0/api',`/docs/relay/v1.1.0/api?symbol=${encodeURIComponent(routeId)}`]) assert.ok(versionMap.includes(`<loc>https://pustka.sh${location}</loc>`),location);
    assert.ok(versionMap.includes(`<lastmod>${secondPublication.publishedAt}</lastmod>`));
    assert.doesNotMatch(versionMap,/draft|preview|pr-\d/);
    assert.equal((await fetch(`${base}/sitemaps/docs/relay/v99.0.0.xml`)).status,404);
    assert.equal((await fetch(`${base}/sitemaps/docs/relay/pr-12.xml`)).status,404);
  });

  await t.test('compare route is resolved before the manifest route and reports real source changes through the service', async () => {
    const query = 'from=v1.0.0&to=v1.1.0';
    const response = await fetch(`${base}/api/site/docs/relay/compare?${query}`);
    assert.equal(response.status,200);
    const result = await response.json();
    assert.deepEqual(result.from,{version:'v1.0.0',commit:oldCommit});
    assert.deepEqual(result.to,{version:'v1.1.0',commit:newCommit});
    assert.equal(result.summary.added,1);
    assert.equal(result.summary.removed,1);
    assert.ok(result.summary.changed>=1);
    assert.equal(result.added[0].id,'example.Router#ping()');
    assert.equal(result.removed[0].id,'example.Router#obsolete()');
    const changed = result.changed.find(item=>item.id===routeId);
    assert.ok(changed.changes.includes('signature'));
    assert.ok(changed.changes.includes('returns'));
    assert.ok(changed.changes.includes('stability'));
    assert.equal(changed.reviewRequired,true);
    assert.equal(changed.before.stability,'unclassified');
    assert.equal(changed.after.stability,'experimental');
    assert.ok(result.guideChanges.some(page=>page.slug==='migration'&&page.kind==='added'));
    assert.match(result.disclaimer,/does not establish.*compatibility/);
    assert.deepEqual(await runtime.documentation.compare('relay','v1.0.0','v1.1.0'),result);
    const comparePage = await fetch(`${base}/docs/relay/compare?${query}`);
    assert.equal(comparePage.status,200);
    assert.match(await comparePage.text(),/<title>Compare relay documentation — pustka<\/title>/);
    for (const [path,status] of [
      ['/api/site/docs/relay/compare?from=v1.0.0',400],
      ['/api/site/docs/relay/compare?from=pr-12&to=v1.1.0',404],
      ['/api/site/docs/relay/compare?from=v99.0.0&to=v1.1.0',404],
      ['/api/site/docs/unknown/compare?from=v1.0.0&to=v1.1.0',404],
      ['/api/site/docs/relay/v99.0.0',404],
      ['/docs/relay/v99.0.0',404],
      ['/docs/relay/pr-12',404],
      ['/docs/relay/v1.1.0/missing',404],
      ['/docs/relay/v1.1.0/api?symbol=missing',404],
    ]) assert.equal((await fetch(base+path)).status,status,path);
  });

  await t.test('legacy stored snapshots keep their original digest without default stability fields after a service restart', async () => {
    const file = path.join(dir,'documentation','relay','v1.0.0.json');
    const originalBytes = await readFile(file,'utf8');
    const record = JSON.parse(originalBytes);
    for (const item of record.package.api.symbols) {
      assert.equal(Object.hasOwn(item,'stability'),false);
      assert.equal(Object.hasOwn(item,'stabilityNote'),false);
    }
    const {generatedAt,...historicalModel} = record.package;
    assert.equal(record.digest,createHash('sha256').update(JSON.stringify(historicalModel)).digest('hex'));
    const restarted = createDocumentationService({dataDir:dir,projects:[project]});
    const manifest = await restarted.manifest('relay','v1.0.0');
    const oldSymbol = (await restarted.symbol('relay','v1.0.0',routeId)).symbol;
    assert.equal(manifest.publishedAt,firstPublication.publishedAt);
    assert.equal(manifest.source.commit,oldCommit);
    assert.equal(Object.hasOwn(oldSymbol,'stability'),false);
    assert.equal(Object.hasOwn(oldSymbol,'stabilityNote'),false);
    assert.equal(Object.hasOwn(manifest.api.symbols.find(item=>item.id===routeId),'stability'),false);
    assert.deepEqual(await restarted.compare('relay','v1.0.0','v1.1.0'),await runtime.documentation.compare('relay','v1.0.0','v1.1.0'));
    assert.equal(await readFile(file,'utf8'),originalBytes,'reading the historical package never rewrites its digest or metadata');
  });

  await t.test('SSR uses one atomic document snapshot even when main advances before the response is rendered', async () => {
    const documentation = runtime.documentation;
    assert.equal(typeof documentation.document,'function');
    const original = Object.fromEntries(['document','manifest','page','symbol'].map(name=>[name,documentation[name]]));
    const capturedDocument = original.document.bind(documentation);
    const makeMain = (commit,label) => {
      const data = packageFor('main',true);
      data.source = {commit,ref:'refs/heads/main'};
      data.pages[0].markdown = `# Atomic guide ${label}\n\nAtomic guide body ${label}.`;
      data.api.symbols.find(item=>item.id===routeId).description = `Atomic symbol comment ${label}.`;
      return data;
    };
    const clock = Math.floor(Date.now()/1000);
    const mainA = makeMain(oldCommit,'A'), mainB = makeMain(newCommit,'B'), mainC = makeMain('c'.repeat(40),'C');
    await publish(mainA,String(clock-2));
    const updates = [{data:mainB,timestamp:String(clock-1)},{data:mainC,timestamp:String(clock)}];
    let atomicReads = 0;
    documentation.document = async (...args) => {
      const captured = await capturedDocument(...args);
      atomicReads++;
      const update = updates.shift();
      if (update) await publish(update.data,update.timestamp);
      return captured;
    };
    for (const name of ['manifest','page','symbol']) documentation[name] = async () => {throw new Error(`SSR must not separately call ${name} during a main publication.`);};
    const initialResources = html => {
      const encoded = /<template id="pustka-doc-bootstrap">([\s\S]*?)<\/template>/.exec(html)?.[1];
      assert.ok(encoded,'the captured snapshot includes inert initial reader resources');
      return JSON.parse(encoded.replace(/&(amp|lt|gt|quot|#39);/g,(_,name)=>({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]))).resources;
    };
    try {
      const guideResponse = await fetch(`${base}/docs/relay/main/overview`);
      assert.equal(guideResponse.status,200);
      const guideHtml = await guideResponse.text();
      assert.match(guideHtml,/<p>Atomic guide body A\.<\/p>/);
      assert.doesNotMatch(guideHtml,/Atomic guide body B\./);
      assert.ok(guideHtml.includes(`/blob/${oldCommit}/README.md`));
      const guideResources = initialResources(guideHtml);
      assert.equal(guideResources.find(item=>item.path==='/docs/relay/main').data.source.commit,oldCommit);
      assert.equal(guideResources.find(item=>item.path==='/docs/relay/main/pages/overview').data.source.commit,oldCommit);
      assert.match(guideResources.find(item=>item.path==='/docs/relay/main/pages/overview').data.page.markdown,/Atomic guide body A/);
      const symbolResponse = await fetch(`${base}/docs/relay/main/api?symbol=${encodeURIComponent(routeId)}`);
      assert.equal(symbolResponse.status,200);
      const symbolHtml = await symbolResponse.text();
      assert.match(symbolHtml,/<p>Atomic symbol comment B\.<\/p>/);
      assert.doesNotMatch(symbolHtml,/Atomic symbol comment C\./);
      assert.ok(symbolHtml.includes(`/blob/${newCommit}/src/Router.java#L12`));
      const symbolResources = initialResources(symbolHtml);
      assert.equal(symbolResources.find(item=>item.path==='/docs/relay/main').data.source.commit,newCommit);
      const selected = symbolResources.find(item=>item.path===`/docs/relay/main/api?symbol=${encodeURIComponent(routeId)}`).data;
      assert.equal(selected.source.commit,newCommit);
      assert.equal(selected.symbol.description,'Atomic symbol comment B.');
      assert.equal(atomicReads,2);
      const current = await capturedDocument('relay','main',{slug:'overview'});
      assert.equal(current.manifest.source.commit,'c'.repeat(40));
      assert.match(current.page.markdown,/Atomic guide body C/);
      const currentSymbol = await capturedDocument('relay','main',{slug:'api',symbolId:routeId});
      assert.equal(currentSymbol.manifest.source.commit,'c'.repeat(40));
      assert.equal(currentSymbol.symbol.description,'Atomic symbol comment C.');
    } finally {for (const [name,value] of Object.entries(original)) documentation[name]=value;}
  });
});

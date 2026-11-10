import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { createApplication } from '../server/app.mjs';
import { loadConfig, ROOT } from '../server/config.mjs';
import { signDocumentation, publishDocumentation } from '../scripts/publish-docs.mjs';

const key = 'test-only-docs-publication-key-1234567890';
const packageFor = (version='main') => ({
  schemaVersion:1, project:{id:'relay',name:'Relay',repository:'https://github.com/pustka-sh/Relay'},
  version, source:{commit:'a'.repeat(40),ref:version==='main'?'refs/heads/main':`refs/tags/${version}`},
  generatedAt:'2026-11-09T12:00:00.000Z',
  pages:[{slug:'overview',title:'Overview',kind:'guide',sourcePath:'README.md',markdown:'# Relay\n\n$E = mc^2$\n\n<script>alert(1)</script>\n\n'+'Documented behavior. '.repeat(6000)}],
  api:{schemaVersion:1,language:'java',generator:'pustka-javadoc/1',symbols:[]},
});

test('signed documentation publishing through Express', async t=>{
  const scratch=path.join(ROOT,'test','.scratch');
  await mkdir(scratch,{recursive:true});
  const dir=await mkdtemp(path.join(scratch,'docs-http-'));
  const dist=path.join(dir,'dist');await mkdir(dist);
  await writeFile(path.join(dist,'index.html'),'<html><head><title>pustka</title><meta name="description" content="Home"><link rel="canonical" href="https://pustka.sh/"><meta property="og:title" content="Home"></head><body>pustka docs reader</body></html>');
  const config={...loadConfig({DATA_DIR:dir,DOCS_SYNC_ENABLED:'false',DOCS_PUBLISH_KEYS:JSON.stringify({relay:key})}),distDir:dist};
  const runtime=await createApplication({config});
  const server=await new Promise(resolve=>{const s=runtime.app.listen(0,'127.0.0.1',()=>resolve(s));});
  const base=`http://127.0.0.1:${server.address().port}`;
  t.after(async()=>{
    server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await runtime.close();
    assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));await rm(dir,{recursive:true,force:true});
  });
  const publish=(body,headers=signDocumentation(body,key))=>fetch(base+'/api/site/docs/publish',{method:'POST',headers,body});
  await t.test('accepts signed packages larger than ordinary form limits, renders safe math, and serves source metadata',async()=>{
    const body=Buffer.from(JSON.stringify(packageFor()));assert.ok(body.length>96*1024);
    const result=await publish(body);assert.equal(result.status,201,await result.text());
    const directory=await(await fetch(base+'/api/site/docs/projects')).json();
    assert.equal(directory.projects[0].id,'relay');assert.equal(directory.projects[0].defaultVersion,'main');
    const manifest=await(await fetch(base+'/api/site/docs/relay/main')).json();
    assert.equal(manifest.source.commit,'a'.repeat(40));assert.equal(manifest.pages[0].sourcePath,'README.md');
    const page=await(await fetch(base+'/api/site/docs/relay/main/pages/overview')).json();
    assert.match(page.page.html,/katex/);assert.doesNotMatch(page.page.html,/<script[ >]/i);
    for(const route of ['/docs/projects','/docs/relay/main','/docs/relay/main/overview','/docs/relay/main/api','/api']) assert.equal((await fetch(base+route)).status,200,route);
    const guideHtml=await(await fetch(base+'/docs/relay/main/overview')).text();
    assert.match(guideHtml,/<title>Overview · Relay main — pustka<\/title>/);assert.match(guideHtml,/href="https:\/\/pustka.sh\/docs\/relay\/main\/overview"/);
    assert.equal((await fetch(base+'/docs/relay/main/missing')).status,404);
    assert.equal((await fetch(base+'/docs/relay/v99.0.0')).status,404);
    assert.equal((await fetch(base+'/api/site/docs/relay/v99.0.0')).status,404);
    assert.equal((await fetch(base+'/api/site/docs/relay/main/api?symbol=missing')).status,404);
  });
  await t.test('rejects tampering, stale signatures and browser cross-origin attempts without a valid key',async()=>{
    const body=Buffer.from(JSON.stringify(packageFor()));
    const headers=signDocumentation(body,key);
    assert.equal((await publish(Buffer.concat([body,Buffer.from(' ')]),headers)).status,401);
    assert.equal((await publish(body,signDocumentation(body,key,'1'))).status,401);
    assert.equal((await publish(body,{'Content-Type':'application/json','X-Pustka-Project':'relay',Origin:'https://foreign.example'})).status,401);
    assert.equal((await publish(body,{'Content-Type':'text/plain'})).status,415);
  });
  await t.test('publisher signs the unchanged file and releases remain immutable',async()=>{
    const file=path.join(dir,'package.json');const record=packageFor('v1.0.0');
    await writeFile(file,JSON.stringify(record));
    const result=await publishDocumentation({file,key,url:base+'/api/site/docs/publish'});assert.equal(result.published,true);
    record.source.commit='b'.repeat(40);
    assert.equal((await publish(Buffer.from(JSON.stringify(record)))).status,409);
    const after=await(await fetch(base+'/api/site/docs/relay/v1.0.0')).json();assert.equal(after.source.commit,'a'.repeat(40));
  });
});

test('publisher and configuration reject unsafe inputs without echoing keys',async()=>{
  for(const raw of ['{"relay":"short"}','[]','null','{"../escape":"'+key+'"}']) assert.throws(()=>loadConfig({DOCS_PUBLISH_KEYS:raw}),/DOCS_PUBLISH_KEYS/);
  assert.throws(()=>signDocumentation(Buffer.from('{}'),key),/identify a project/);
  await assert.rejects(publishDocumentation({file:'unused',key,url:'http://untrusted.example/api'}),/HTTPS/);
  await assert.rejects(publishDocumentation({file:'unused',key,url:'https://user:password@example.com/api'}),/HTTPS/);
});

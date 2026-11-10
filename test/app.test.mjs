import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { createApplication } from '../server/app.mjs';
import { loadConfig, ROOT } from '../server/config.mjs';

test('Express backend integration', async t => {
  const scratch = path.join(ROOT,'test','.scratch');
  mkdirSync(scratch,{recursive:true});
  const dir = mkdtempSync(path.join(scratch,'app-'));
  const dist = path.join(dir,'dist');
  mkdirSync(path.join(dist,'api'),{recursive:true});
  writeFileSync(path.join(dist,'index.html'),'<html><head><script>document.documentElement.dataset.theme="dark"</script></head><body>Home</body></html>');
  writeFileSync(path.join(dist,'api','index.html'),'<html><body>Dashboard API reference</body></html>');
  writeFileSync(path.join(dist,'404.html'),'<html><body>Not found</body></html>');
  const config = {...loadConfig({DATA_DIR:dir,DOCS_SYNC_ENABLED:'false'}),distDir:dist,webhookSecret:'test-webhook-secret'};
  let syncCount=0;
  const snapshot=JSON.parse(readFileSync(path.join(ROOT,'src/content/relay.json'),'utf8'));
  const content={content:async()=>snapshot,requestSync:()=>{syncCount++;return {accepted:true};},waitForIdle:async()=>{},rss:async()=>'<rss><channel /></rss>'};
  const github={getProjects:async()=>({projects:[],updatedAt:'2026-11-09',stale:false}),getReleases:async()=>({releases:[],updatedAt:'2026-11-09',stale:false})};
  const runtime=await createApplication({config,content,github,demo:{getSnapshot:async()=>{throw Object.assign(new Error('Demo is not configured.'),{status:503,code:'NOT_CONFIGURED',expose:true});}}});
  const server=await new Promise(resolve=>{const value=runtime.app.listen(0,'127.0.0.1',()=>resolve(value));});
  const base=`http://127.0.0.1:${server.address().port}`;
  const request=(route,body,headers={})=>fetch(base+route,{...(body===undefined?{}:{method:'POST',body:JSON.stringify(body)}),headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...headers}});
  t.after(async()=>{
    server.closeAllConnections();
    await new Promise(resolve=>server.close(resolve));
    await runtime.close();
    if(!path.resolve(dir).startsWith(path.resolve(scratch)+path.sep))throw new Error('Scratch cleanup escaped the test directory.');
    rmSync(dir,{recursive:true,force:true});
  });
  await t.test('serves health, capability flags, existing API documentation and CSP',async()=>{
    assert.equal((await request('/health')).status,200);
    const capabilities=await (await request('/api/site/capabilities')).json();
    assert.equal(capabilities.backend,true);assert.equal(capabilities.issueReporting,false);
    const reference=await request('/api');assert.match(await reference.text(),/Dashboard API reference/);
    assert.match(reference.headers.get('content-security-policy'),/sha256-/);
    assert.equal((await request('/api/site/missing')).status,404);
    assert.equal((await request('/missing')).status,404);
  });
  await t.test('rejects cross-origin writes, foreign same-site subdomains, invalid JSON and non-JSON',async()=>{
    assert.equal((await request('/api/site/feedback',{page:'/docs/relay',helpful:true},{Origin:'https://elsewhere.example'})).status,403);
    assert.equal((await request('/api/site/feedback',{page:'/docs/relay',helpful:true},{'Sec-Fetch-Site':'same-site'})).status,403);
    const malformed=await fetch(base+'/api/site/feedback',{method:'POST',headers:{'Content-Type':'application/json'},body:'{"secret":"do-not-echo"'});
    assert.equal(malformed.status,400);assert.doesNotMatch(await malformed.text(),/do-not-echo/);
    assert.equal((await fetch(base+'/api/site/feedback',{method:'POST',headers:{'Content-Type':'text/plain'},body:'hello'})).status,415);
  });
  await t.test('strips secrets and unknown nested fields before persisting a share',async()=>{
    const created=await request('/api/site/configs',{settings:{secret:'NEVER-PERSIST-THIS',forwardingSecret:'ALSO-PRIVATE',forwardingMode:'modern',motd:'My server',servers:[{name:'lobby',address:'127.0.0.1:25566',secret:'NESTED-PRIVATE',weight:1}]}});
    assert.equal(created.status,201);
    const record=await created.json();assert.match(record.id,/^[\w-]{16}$/);assert.equal(record.url,`/c/${record.id}`);
    const response=await request('/api/site/configs/'+record.id);const text=await response.text();assert.equal(response.status,200);
    assert.doesNotMatch(text,/NEVER-PERSIST|ALSO-PRIVATE|NESTED-PRIVATE|"secret"/);
    assert.equal(JSON.parse(text).settings.servers[0].name,'lobby');
    const page=await request('/c/'+record.id);assert.equal(page.status,200);assert.equal(page.headers.get('x-robots-tag'),'noindex, nofollow');
    for(const filename of ['site.sqlite','site.sqlite-wal']){try{assert.doesNotMatch(readFileSync(path.join(dir,filename)).toString('utf8'),/NEVER-PERSIST-THIS|ALSO-PRIVATE|NESTED-PRIVATE/);}catch(error){if(error.code!=='ENOENT')throw error;}}
    assert.equal((await request('/api/site/configs/not-a-valid-id')).status,404);
  });
  await t.test('validates shares and feedback without accepting arbitrary models',async()=>{
    assert.equal((await request('/api/site/configs',{settings:{secret:'only-secret'}})).status,400);
    assert.equal((await request('/api/site/configs',{settings:{dashboardPort:80}})).status,400);
    assert.equal((await request('/api/site/feedback',{page:'/docs/relay',helpful:true})).status,201);
    const counts=await(await request('/api/site/feedback?page=%2Fdocs%2Frelay')).json();assert.equal(counts.helpful,1);
    assert.equal((await request('/api/site/feedback',{page:'https://external.test',helpful:true})).status,400);
  });
  await t.test('rejects internal Minecraft targets before network access',async()=>{
    const result=await request('/api/site/server-check',{address:'127.0.0.1:25565'});
    assert.equal(result.status,400);const body=await result.text();assert.doesNotMatch(body,/stack|node:|Error:/);
  });
  await t.test('checks setup without echoing supplied secrets',async()=>{
    const result=await request('/api/site/setup-check',{relayToml:'online-mode=true\nforwarding-mode="modern"\nforwarding-secret="UNIQUE-SETUP-SECRET"',paperYaml:'proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: UNIQUE-SETUP-SECRET',serverProperties:'online-mode=false'});
    assert.equal(result.status,200);const report=await result.text();assert.doesNotMatch(report,/UNIQUE-SETUP-SECRET/);assert.ok(JSON.parse(report).checks.length>0);
  });
  await t.test('validates raw webhook signatures, repository, branch and replay',async()=>{
    const payload=JSON.stringify({repository:{full_name:'pustka-sh/Relay'},ref:'refs/heads/main'});
    const signature='sha256='+createHmac('sha256',config.webhookSecret).update(payload).digest('hex');
    const deliver=async(sig=signature,id='delivery-test-123')=>fetch(base+'/api/site/webhooks/github',{method:'POST',headers:{'Content-Type':'application/json','X-Hub-Signature-256':sig,'X-GitHub-Event':'push','X-GitHub-Delivery':id},body:payload});
    assert.equal((await deliver('sha256='+'0'.repeat(64))).status,401);assert.equal(syncCount,0);
    assert.equal((await deliver()).status,202);assert.equal(syncCount,1);
    assert.equal((await deliver()).status,200);assert.equal(syncCount,1);
  });
  await t.test('serves cached content and RSS, and reports demo unavailable honestly',async()=>{
    assert.equal((await(await request('/api/site/content')).json()).commit,snapshot.commit);
    assert.match((await request('/feed.xml')).headers.get('content-type'),/rss\+xml/);
    const response=await request('/api/site/demo');assert.equal(response.status,503);assert.equal((await response.json()).error.code,'NOT_CONFIGURED');
  });
  await t.test('suppresses unexpected internal error messages',async()=>{
    github.getProjects=async()=>{throw Object.assign(new Error('PASSWORD=private /internal/file'),{code:'SQLITE_ERROR'});};
    const result=await request('/api/site/projects');assert.equal(result.status,500);assert.doesNotMatch(await result.text(),/PASSWORD|internal\/file|SQLITE_ERROR/);
  });
});

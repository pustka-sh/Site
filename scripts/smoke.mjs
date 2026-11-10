import assert from 'node:assert/strict';
import { writeFileSync, readFileSync } from 'node:fs';
const base=process.argv[2] || 'http://127.0.0.1:3000';
const persistence=process.argv.includes('--persistence');
const marker=new URL('../.test-share-id',import.meta.url);
for(let attempt=0;;attempt++){
  try{const health=await fetch(base+'/health',{signal:AbortSignal.timeout(1000)});assert.equal(health.status,200);break;}
  catch(error){if(attempt>=30)throw error;await new Promise(resolve=>setTimeout(resolve,250));}
}
if(persistence){
 const id=readFileSync(marker,'utf8').trim();
 const response=await fetch(base+'/api/site/configs/'+id);
 assert.equal(response.status,200);assert.equal((await response.json()).settings.motd,'Container persistence check');
 console.log('Container restart preserved the secret-free shared config.');
}else{
 const post=(route,data)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
 const page=await fetch(base+'/tools');assert.equal(page.status,200);const html=await page.text();
 assert.match(html,/Workshop tools/);assert.match(page.headers.get('content-security-policy'),/sha256-/);
 for(const match of html.matchAll(/(?:src|href)="(\/assets\/[^"\s]+)"/g))assert.equal((await fetch(base+match[1])).status,200);
 assert.equal((await fetch(base+'/api')).status,200);
 assert.equal((await fetch(base+'/api/site/content')).status,200);
 assert.equal((await fetch(base+'/feed.xml')).status,200);
 const blocked=await post('/api/site/server-check',{address:'127.0.0.1:25565'});assert.equal(blocked.status,400);
 const created=await post('/api/site/configs',{settings:{motd:'Container persistence check',secret:'SMOKE-SECRET-MUST-NOT-PERSIST'}});assert.equal(created.status,201);
 const {id}=await created.json();writeFileSync(marker,id);
 const shared=await fetch(base+'/api/site/configs/'+id);assert.equal(shared.status,200);assert.doesNotMatch(await shared.text(),/SMOKE-SECRET/);
 assert.equal((await fetch(base+'/c/'+id)).status,200);
 assert.equal((await post('/api/site/feedback',{page:'/docs/relay',helpful:true})).status,201);
 assert.equal((await fetch(base+'/api/site/demo')).status,503);
 console.log('Built website, same-origin API, database, secret stripping and optional-feature states passed smoke checks.');
}

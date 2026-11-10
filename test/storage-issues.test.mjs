import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync,mkdtempSync,rmSync } from 'node:fs';
import path from 'node:path';
import { ROOT } from '../server/config.mjs';
import { createStore } from '../server/storage.mjs';
import { createIssueService } from '../server/services/issues.mjs';

test('shares survive reopening, expire, and respect capacity',()=>{
 const root=path.join(ROOT,'test','.scratch');mkdirSync(root,{recursive:true});const dir=mkdtempSync(path.join(root,'storage-'));let now=1000;
 let store=createStore({dataDir:dir,now:()=>now,maxShares:1});
 try{const created=store.createConfig({motd:'Hello'},1);store.close();store=createStore({dataDir:dir,now:()=>now,maxShares:1});assert.equal(store.getConfig(created.id).settings.motd,'Hello');assert.throws(()=>store.createConfig({motd:'Second'}),/capacity/);now+=86400001;assert.equal(store.getConfig(created.id),null);assert.ok(store.createConfig({motd:'After expiry'},1).id);}finally{store.close();if(!path.resolve(dir).startsWith(root+path.sep))throw Error('Invalid cleanup');rmSync(dir,{recursive:true,force:true});}
});
test('issue challenges are timed, IP-bound, single-use and neutralize mentions',async()=>{
 let now=10000;let sent;
 const service=createIssueService({enabled:true,token:'TEST-ONLY',repository:'pustka-sh/Relay',now:()=>now,fetchImpl:async(url,init)=>{sent=JSON.parse(init.body);return Response.json({html_url:'https://github.com/pustka-sh/Relay/issues/123'});}});
 const issued=service.challenge('127.0.0.1');const report={page:'/docs/relay',title:'Fix @everyone <tag>',body:'A sufficiently detailed report from a visitor.',website:'',challenge:issued.challenge};
 await assert.rejects(()=>service.report(report,'127.0.0.1'),/wait/);now+=3001;
 await assert.rejects(()=>service.report(report,'127.0.0.2'),/reload/);
 await assert.rejects(()=>service.report({...report,website:'bot'},'127.0.0.1'),/reload/);
 assert.equal((await service.report(report,'127.0.0.1')).url,'https://github.com/pustka-sh/Relay/issues/123');assert.doesNotMatch(sent.title,/@|<|>/);
 await assert.rejects(()=>service.report(report,'127.0.0.1'),/expired/);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdir,mkdtemp,rm } from 'node:fs/promises';
import path from 'node:path';
import { createHmac } from 'node:crypto';
import { buildDocumentationSearchIndex,documentationText,searchDocumentationIndex } from '../server/services/documentation-search.mjs';
import { createDocumentationService } from '../server/services/documentation.mjs';
import { ROOT } from '../server/config.mjs';

const project={id:'relay',name:'Relay',repository:'https://github.com/pustka-sh/Relay'},key='test-docs-search-key-at-least-32-characters';
function fixture(version='main',word='quartz'){
 const symbol={id:'dev.relay.Router#route(java.lang.String)',kind:'method',name:'route',qualifiedName:'dev.relay.Router.route',owner:'dev.relay.Router',signature:'public boolean route(String name)',summary:'Routes a player.',description:'Accepts the requested backend destination.',parameters:[{name:'name',type:'String',description:'A configured destination.'}],returns:{type:'boolean',description:'Whether the request was accepted.'},throws:[],since:'',deprecated:false,deprecation:'',source:{path:'src/Router.java',line:3}};
 return {schemaVersion:1,project,version,source:{commit:(word==='quartz'?'a':'b').repeat(40),ref:version==='main'?'refs/heads/main':`refs/tags/${version}`},generatedAt:'2026-11-09T12:00:00.000Z',pages:[{slug:'setup',title:'Setup',kind:'guide',sourcePath:'docs/setup.md',markdown:`# Setup\n\n## Forwarding\n\nChoose a ${word} backend destination.\n\n| Choice | Result |\n| --- | --- |\n| modern | Verified identity |`},{slug:'route-guide',title:'Routing guide',kind:'guide',sourcePath:'docs/route.md',markdown:'The word route appears in this guide.'}],api:{schemaVersion:1,language:'java',generator:'pustka-javadoc/1',symbols:[symbol]}};
}
test('search ranks exact API names above guide mentions, searches guide bodies, and returns versioned anchors',()=>{
 const index=buildDocumentationSearchIndex(fixture('v1.2.0'));
 assert.equal(searchDocumentationIndex(index,'route')[0].symbolKind,'method');
 const body=searchDocumentationIndex(index,'quartz')[0];assert.equal(body.title,'Setup');assert.match(body.snippet,/quartz backend/);assert.equal(body.to,'/docs/relay/v1.2.0/setup#forwarding');
 assert.equal(searchDocumentationIndex(index,'verified identity')[0].kind,'guide');
 assert.equal(searchDocumentationIndex(index,'configured destination')[0].kind,'symbol');
 assert.equal(searchDocumentationIndex(index,'q').length,0);
 assert.equal(documentationText('A **bold** [link](https://example.com), `code` &amp; text.\n\n- First\n- Second'),'A bold link , code & text. First Second');
 assert.ok(!JSON.stringify(searchDocumentationIndex(index,'destination')).includes('descriptionHtml'));
});
test('published search respects default release, explicit development scope, and changed main content',async t=>{
 const scratch=path.join(ROOT,'test','.scratch');await mkdir(scratch,{recursive:true});const dir=await mkdtemp(path.join(scratch,'search-'));
 t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));await rm(dir,{recursive:true,force:true});});
 let now=Date.parse('2026-11-09T15:00:00Z');
 const second={id:'tide',name:'Tide',repository:'https://github.com/pustka-sh/Tide'};
 const service=createDocumentationService({dataDir:dir,projects:[project,second],keys:{relay:key,tide:key},now:()=>now});
 const publish=async data=>{const body=Buffer.from(JSON.stringify(data)),timestamp=String(now/1000);return service.publish(body,{project:data.project.id,timestamp,signature:'sha256='+createHmac('sha256',key).update(timestamp+'.').update(body).digest('hex')});};
 assert.deepEqual((await service.search({query:'quartz'})).results,[]);
 await publish(fixture());await publish(fixture('v1.2.0'));
 assert.equal((await service.search({query:'quartz',project:'relay'})).scope.version,'v1.2.0');
 now+=2000;await publish(fixture('main','obsidian'));
 assert.equal((await service.search({query:'quartz',project:'relay',version:'main'})).results.length,0);
 assert.match((await service.search({query:'obsidian',project:'relay',version:'main'})).results[0].to,/\/main\//);
 assert.equal((await service.search({query:'obsidian'})).results.length,0);
 await publish({...fixture('main','amethyst'),project:second});
 assert.equal((await service.search({query:'amethyst'})).results[0].project,'tide');
 assert.equal((await service.search({query:'amethyst',project:'relay'})).results.length,0);
 assert.match((await service.search({query:'amethyst',project:'tide'})).results[0].to,/\/docs\/tide\/main\//);
 await assert.rejects(service.search({query:'route',project:'missing'}),error=>error.status===404);
 await assert.rejects(service.search({query:'route',project:'relay',version:'v99.0.0'}),error=>error.status===404);
 await assert.rejects(service.search({query:'x'}),error=>error.status===400);
 await assert.rejects(service.search({query:'route',version:'main'}),error=>error.status===400);
});

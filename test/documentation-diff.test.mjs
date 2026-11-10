import test from 'node:test';
import assert from 'node:assert/strict';
import { compareDocumentationPackages } from '../server/services/documentation-diff.mjs';

const symbol = (id, extra = {}) => ({id,kind:'method',name:id,qualifiedName:`example.Api.${id}`,owner:'example.Api',signature:`void ${id}()`,source:{path:'src/Api.java',line:4},...extra});
const pkg = (symbols = [], pages = []) => ({schemaVersion:1,project:{id:'example',name:'Example',repository:'https://github.com/pustka-sh/example'},version:'main',source:{commit:'a'.repeat(40),ref:'refs/heads/main'},generatedAt:'2026-11-09T00:00:00.000Z',pages,api:{schemaVersion:1,language:'java',generator:'pustka-javadoc/1',symbols}});
const guide = (slug, markdown = 'A guide') => ({slug,title:slug,kind:'guide',markdown,sourcePath:`docs/${slug}.md`});

test('comparison distinguishes additions, removals, structure, comments and support policy', () => {
  const before = pkg([symbol('removed'),symbol('signature'),symbol('comments'),symbol('policy'),symbol('unchanged')],[guide('removed'),guide('changed')]);
  const after = pkg([symbol('added'),symbol('signature',{signature:'int signature()',returns:{type:'int',description:''}}),symbol('comments',{description:'New explanation.'}),symbol('policy',{stability:'experimental',stabilityNote:'Wire format still evolves.'}),symbol('unchanged',{source:{path:'src/Api.java',line:30}})],[guide('changed','Updated'),guide('added')]);
  after.source.commit='b'.repeat(40);
  const original = structuredClone(before);
  const diff = compareDocumentationPackages(before,after);
  assert.deepEqual(before,original,'inputs remain untouched');
  assert.deepEqual(diff.summary,{added:1,removed:1,changed:3,documentationOnly:1,policyChanged:1});
  assert.equal(diff.added[0].id,'added');assert.equal(diff.removed[0].id,'removed');
  assert.equal(diff.changed.find(item=>item.id==='comments').reviewRequired,false);
  assert.deepEqual(diff.changed.find(item=>item.id==='signature').changes,['signature','returns']);
  assert.equal(diff.changed.find(item=>item.id==='policy').before.stability,'unclassified');
  assert.equal(diff.changed.find(item=>item.id==='policy').after.stability,'experimental');
  assert.deepEqual(diff.guideChanges.map(({slug,kind})=>[slug,kind]),[['added','added'],['changed','changed'],['removed','removed']]);
  assert.match(diff.disclaimer,/does not establish binary, source or runtime compatibility/);
  assert.equal(diff.to.commit,'b'.repeat(40));
});

test('parameter types/names, throws and deprecated state require review even without a new signature string', () => {
  const before=pkg([symbol('method',{parameters:[{name:'old',type:'int',description:'Old docs'}],throws:[{type:'IOException',description:'Old docs'}]})]);
  const after=pkg([symbol('method',{parameters:[{name:'next',type:'long',description:'New docs'}],throws:[{type:'RuntimeException',description:'New docs'}],deprecated:true})]);
  const [change]=compareDocumentationPackages(before,after).changed;
  assert.deepEqual(change.changes,['parameters','throws','documentation','deprecated']);
  assert.equal(change.reviewRequired,true);
});

test('source movement and package generation metadata do not invent API changes', () => {
  const before=pkg([symbol('same')]);const after=structuredClone(before);
  after.api.symbols[0].source.line=80;after.generatedAt='2026-11-10T00:00:00.000Z';
  const diff=compareDocumentationPackages(before,after);
  assert.equal(diff.changed.length,0);assert.equal(diff.guideChanges.length,0);
});

test('different projects and invalid packages are rejected rather than compared', () => {
  const before=pkg([symbol('one')]);const after=pkg([symbol('two')]);after.project.id='other';
  assert.throws(()=>compareDocumentationPackages(before,after),/same project/);
  after.project.id='example';after.project.repository='https://github.com/pustka-sh/other';
  assert.throws(()=>compareDocumentationPackages(before,after),/same project/);
  after.project.repository=before.project.repository;after.api.symbols[0].source.path='../escape';
  assert.throws(()=>compareDocumentationPackages(before,after),/schema version/);
});

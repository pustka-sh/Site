import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp,mkdir,writeFile,readFile,rm,symlink } from 'node:fs/promises';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { checkDocumentation } from '../scripts/check-docs.mjs';
import { packageDocumentation } from '../scripts/package-docs.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const source='package example;\npublic class Router {\n public void route(String name) {}\n}\n';
const example='package example;\npublic final class Demo { public static int value() { return 1; } }\n';
async function fixture(t){
  const scratch=path.join(ROOT,'test','.scratch');await mkdir(scratch,{recursive:true});
  const dir=await mkdtemp(path.join(scratch,'quality-'));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));await rm(dir,{recursive:true,force:true});});
  await mkdir(path.join(dir,'docs'));await mkdir(path.join(dir,'src'));await mkdir(path.join(dir,'build'));await mkdir(path.join(dir,'examples'));
  await writeFile(path.join(dir,'src/Router.java'),source);await writeFile(path.join(dir,'examples/Demo.java'),example);
  const overview='# Overview\n\n[Guide](docs/guide.md#the-same-heading-1)\n[Source](src/Router.java#L2-L3)\n[Directory](examples)\n[External](https://example.com/never-requested)\n[API](javadoc:example.Router%23route%28java.lang.String%29)\n[Quoted heading](docs/guide.md#inside-a-quote)\n';
  const guide='# Guide\n\n## The same heading\n\nBody.\n\n## The same heading\n\n> ## Inside a quote\n\n### Checked example\n\n```java\n'+example+'```\n';
  await writeFile(path.join(dir,'README.md'),overview);await writeFile(path.join(dir,'docs/guide.md'),guide);
  const symbol={id:'example.Router#route(java.lang.String)',kind:'method',name:'route',qualifiedName:'example.Router.route',owner:'example.Router',signature:'public void route(java.lang.String name)',summary:'Routes a player.',description:'Routes a player.',parameters:[{name:'name',type:'java.lang.String',description:''}],returns:{type:'void',description:''},throws:[],since:'',deprecated:false,deprecation:'',source:{path:'src/Router.java',line:3}};
  const project={id:'example',name:'Example',repository:'https://github.com/example/project'};
  const data={schemaVersion:1,project,version:'main',source:{commit:'a'.repeat(40),ref:'refs/heads/main'},generatedAt:new Date().toISOString(),pages:[{slug:'overview',title:'Overview',kind:'guide',sourcePath:'README.md',markdown:overview},{slug:'guide',title:'Guide',kind:'guide',sourcePath:'docs/guide.md',markdown:guide}],api:{schemaVersion:1,language:'java',generator:'fixture',symbols:[symbol]}};
  const manifest={schemaVersion:1,project,guides:data.pages.map(page=>({path:page.sourcePath,slug:page.slug,title:page.title})),api:{language:'java',artifact:'build/api.json'},checks:{examples:[{path:'examples/Demo.java',guide:'docs/guide.md',anchor:'checked-example'}]}};
  await writeFile(path.join(dir,'build/api.json'),JSON.stringify(data.api));
  const packagePath=path.join(dir,'build/package.json'),manifestPath=path.join(dir,'pustka.docs.json');
  const save=async()=>{await writeFile(packagePath,JSON.stringify(data));await writeFile(manifestPath,JSON.stringify(manifest));};await save();
  return {dir,data,manifest,save,options:{root:dir,packagePath,manifestPath}};
}

test('documentation checks validate real heading anchors, source lines, symbol links and synchronized examples',async t=>{
  const f=await fixture(t),reportPath=path.join(f.dir,'build/quality.json');
  const report=await checkDocumentation({...f.options,reportPath});
  assert.equal(report.ok,true);assert.equal(report.checks.declaredExamples,1);assert.equal(report.checks.links,6);
  assert.equal(report.coverage.documentedSymbols,1);assert.equal(report.coverage.missingParameters,1);
  assert.deepEqual(report.missingDocumentation[0].missing,['parameter:name']);
  assert.deepEqual(JSON.parse(await readFile(reportPath,'utf8')),report);
  const packaged=await packageDocumentation({root:f.dir,manifestPath:f.options.manifestPath,apiPath:path.join(f.dir,'build/api.json'),outPath:path.join(f.dir,'build/repackaged.json'),version:'main',commit:'a'.repeat(40),ref:'refs/heads/main'});
  assert.equal(packaged.pages.length,2);assert.equal(packaged.checks,undefined,'quality policy is not added to the browser package');
});

test('broken links, missing source targets and missing API references fail with actionable locations',async t=>{
  const f=await fixture(t);
  f.data.pages[0].markdown+='\n[Bad heading](docs/guide.md#absent)\n[Missing file](docs/absent.md)\n[Bad source line](src/Router.java#L99)\n[Bad symbol](javadoc:example.Missing)\n';
  await writeFile(path.join(f.dir,'README.md'),f.data.pages[0].markdown);
  f.data.api.symbols[0].source.path='src/Missing.java';await f.save();
  const report=await checkDocumentation(f.options);assert.equal(report.ok,false);
  for(const code of ['MISSING_ANCHOR','MISSING_LINK_TARGET','MISSING_SOURCE_LINE','MISSING_SYMBOL','MISSING_API_SOURCE'])assert.ok(report.errors.some(issue=>issue.code===code),code);
  assert.ok(report.errors.some(issue=>issue.file==='README.md'&&issue.line>1));
});

test('missing descriptions remain a contributor report while drifted guides and example blocks fail',async t=>{
  const f=await fixture(t);f.data.api.symbols[0].summary='';f.data.api.symbols[0].description='';await f.save();
  let report=await checkDocumentation(f.options);assert.equal(report.ok,true);assert.equal(report.coverage.missingDescriptions,1);
  await writeFile(path.join(f.dir,'examples/Demo.java'),example.replace('return 1','return 2'));
  await writeFile(path.join(f.dir,'README.md'),'# Changed after packaging\n');
  report=await checkDocumentation(f.options);assert.equal(report.ok,false);
  assert.ok(report.errors.some(issue=>issue.code==='EXAMPLE_DRIFT'));assert.ok(report.errors.some(issue=>issue.code==='STALE_GUIDE'));
});

test('unsafe local links, malformed schemes and encoded traversal cannot read outside the checkout',async t=>{
  const f=await fixture(t);
  f.data.pages[0].markdown+='\n[Outside](../outside.md)\n[Encoded](%2e%2e/outside.md)\n[Script](javascript:alert%281%29)\n';
  await writeFile(path.join(f.dir,'README.md'),f.data.pages[0].markdown);await f.save();
  const report=await checkDocumentation(f.options);assert.equal(report.ok,false);
  assert.equal(report.errors.filter(issue=>issue.code==='MISSING_LINK_TARGET').length,2);
  assert.ok(report.errors.some(issue=>issue.code==='INVALID_LINK'));
});

test('linked source files outside the checkout are rejected',async t=>{
  const f=await fixture(t),outside=path.join(f.dir,'..',path.basename(f.dir)+'-outside.java');
  await writeFile(outside,source);t.after(()=>rm(outside,{force:true}));
  const link=path.join(f.dir,'src/Linked.java');
  try{await symlink(outside,link,'file');}catch(cause){if(['EPERM','EACCES'].includes(cause.code)){t.skip('This Windows host cannot create symlink fixtures.');return;}throw cause;}
  f.data.api.symbols[0].source.path='src/Linked.java';await f.save();
  const report=await checkDocumentation(f.options);assert.ok(report.errors.some(issue=>issue.code==='MISSING_API_SOURCE'));
});

test('CLI writes failure reports and never executes project JavaScript',async t=>{
  const f=await fixture(t),marker=path.join(f.dir,'EXECUTED');
  await writeFile(path.join(f.dir,'package.json'),JSON.stringify({type:'module'}));
  await writeFile(path.join(f.dir,'project.js'),`import {writeFileSync} from 'node:fs';writeFileSync(${JSON.stringify(marker)},'bad');`);
  f.data.pages[0].markdown+='\n[Readable source only](project.js)\n[Broken](missing.md)\n';await writeFile(path.join(f.dir,'README.md'),f.data.pages[0].markdown);await f.save();
  const reportPath=path.join(f.dir,'build/failed.json');
  assert.throws(()=>execFileSync(process.execPath,[path.join(ROOT,'scripts/check-docs.mjs'),'--root',f.dir,'--package',f.options.packagePath,'--manifest',f.options.manifestPath,'--report',reportPath],{encoding:'utf8',timeout:10000,stdio:'pipe'}),cause=>cause.status===1);
  assert.equal(JSON.parse(await readFile(reportPath,'utf8')).ok,false);
  await assert.rejects(readFile(marker),{code:'ENOENT'});
});

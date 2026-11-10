import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import katex from 'katex';
import { generateDocumentationPreview, previewSymbolAnchor } from '../scripts/preview-docs.mjs';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const SHA='a'.repeat(40);
const symbolId='example.Api#send(java.lang.String)';
async function fixture(t) {
  const scratch=path.join(ROOT,'test','.scratch');await mkdir(scratch,{recursive:true});
  const dir=await mkdtemp(path.join(scratch,'preview-'));
  t.after(async()=>{assert.ok(path.resolve(dir).startsWith(path.resolve(scratch)+path.sep));await rm(dir,{recursive:true,force:true});});
  const data={schemaVersion:1,project:{id:'example',name:'Example <draft>',repository:'https://github.com/example/project'},version:'main',source:{commit:SHA,ref:'refs/heads/main'},generatedAt:'2026-11-09T00:00:00.000Z',pages:[{slug:'overview',title:'Overview <img src=x onerror=alert(1)>',kind:'guide',sourcePath:'README.md',markdown:`# A real guide\n\n<script>alert('author HTML')</script>\n\n[API](javadoc:${encodeURIComponent(symbolId)})\n\n[Next guide](docs/next.md#details)\n\n[Source](src/Api.java#L4)\n\n![Remote image](https://tracking.example/pixel)\n\n$x^2$\n`},{slug:'next',title:'Next guide',kind:'guide',sourcePath:'docs/next.md',markdown:'# Next\n\n## Details\n\n[Back](../README.md)\n\n[API](/docs/example/main/api?symbol='+encodeURIComponent(symbolId)+')\n'}],api:{schemaVersion:1,language:'java',generator:'fixture',symbols:[{id:symbolId,kind:'method',name:'send',qualifiedName:'example.Api.send',owner:'example.Api',signature:'void send(String <value>)',summary:'Sends a value.',description:'[Guide](../README.md)\n\n<img src="https://tracking.example/never">\n\n[Bad](javascript:alert%281%29)',parameters:[{name:'value',type:'String',description:'The <value> to send.'}],returns:{type:'void',description:''},source:{path:'src/Api.java',line:4},stability:'experimental',stabilityNote:'Subject to review.'}]}};
  const file=path.join(dir,'package.json'),outDir=path.join(dir,'rendered');
  const save=()=>writeFile(file,JSON.stringify(data,null,2));await save();
  return {dir,data,file,outDir,save};
}

test('draft preview renders escaped guides and API with exact commit, local navigation and integrity manifest',async t=>{
  const f=await fixture(t);const input=await readFile(f.file);
  const report=await generateDocumentationPreview({file:f.file,outDir:f.outDir});
  assert.equal(report.commit,SHA);assert.ok(report.files>20);
  const home=await readFile(path.join(f.outDir,'index.html'),'utf8');
  const guide=await readFile(path.join(f.outDir,'guides/overview.html'),'utf8');
  const next=await readFile(path.join(f.outDir,'guides/next.html'),'utf8');
  const api=await readFile(path.join(f.outDir,'api.html'),'utf8');
  for (const html of [home,guide,next,api]) {
    assert.match(html,/DRAFT \/ UNMERGED DOCUMENTATION/);assert.match(html,new RegExp(SHA));
    assert.doesNotMatch(html,/<script\b|<img\b|<iframe\b|<form\b|javascript:/i);
    assert.doesNotMatch(html,/(?:src|href)="https?:[^\"]+\.(?:css|js|woff2?|ttf)(?:[?#\"])/i);
    assert.match(html,/script-src 'none'/);assert.match(html,/noindex,nofollow/);
  }
  assert.match(guide,/&lt;script&gt;alert\('author HTML'\)&lt;\/script&gt;/);
  assert.match(guide,/Overview &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(guide,new RegExp(`href="../api.html#${previewSymbolAnchor(symbolId)}"`));
  assert.match(guide,/href="next.html#details"/);assert.match(next,/href="overview.html"/);
  assert.match(next,new RegExp(`href="../api.html#${previewSymbolAnchor(symbolId)}"`));
  assert.match(api,/void send\(String &lt;value&gt;\)/);assert.match(api,/Support policy: experimental/);
  assert.match(api,/href="guides\/overview.html"/);assert.match(guide,/class="katex/);
  assert.match(guide,new RegExp(`https://github.com/example/project/blob/${SHA}/src/Api.java#L4`));
  const manifest=JSON.parse(await readFile(path.join(f.outDir,'preview-manifest.json'),'utf8'));
  assert.equal(manifest.draft,true);assert.equal(manifest.source.commit,SHA);
  assert.equal(manifest.packageSha256,createHash('sha256').update(input).digest('hex'));
  for (const file of manifest.files) {
    const content=await readFile(path.join(f.outDir,file.path));
    assert.equal(content.length,file.bytes);assert.equal(createHash('sha256').update(content).digest('hex'),file.sha256);
  }
  const mathCss=await readFile(path.join(f.outDir,'assets/katex.min.css'),'utf8');
  assert.doesNotMatch(mathCss,/https?:|@import/);
  for (const match of mathCss.matchAll(/url\(([^)]+)\)/g)) {
    assert.match(match[1],/^fonts\/KaTeX_[A-Za-z0-9-]+\.(?:woff2?|ttf)$/);
    await readFile(path.join(f.outDir,'assets',match[1]));
  }
});

test('preview accepts an explicitly empty destination and refuses to replace unrelated files',async t=>{
  const f=await fixture(t);await mkdir(f.outDir);await writeFile(path.join(f.outDir,'keep.txt'),'Do not replace.');
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir}),/existing files are never overwritten/);
  assert.equal(await readFile(path.join(f.outDir,'keep.txt'),'utf8'),'Do not replace.');
  const empty=path.join(f.dir,'empty');await mkdir(empty);
  await generateDocumentationPreview({file:f.file,outDir:empty});
  assert.match(await readFile(path.join(empty,'index.html'),'utf8'),/in review/);
});

test('invalid/traversing package paths and oversized raw input cannot generate output',async t=>{
  const f=await fixture(t);f.data.pages[0].slug='../escape';await f.save();
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir}),/valid UTF-8 schema/);
  f.data.pages[0].slug='overview';f.data.api.symbols[0].source.path='../secret';await f.save();
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir}),/valid UTF-8 schema/);
  await writeFile(f.file,Buffer.alloc(8*1024*1024+1,32));
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir}),/exceeds its size limit/);
  assert.equal((await readdir(f.dir)).includes('rendered'),false);
});

test('rendered output bounds clean up only the invocation’s staging directory',async t=>{
  const f=await fixture(t);const marker=path.join(f.dir,'keep.txt');await writeFile(marker,'Keep this.');
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir,maxOutputBytes:1024}),/output size limit/);
  assert.equal(await readFile(marker,'utf8'),'Keep this.');
  assert.equal((await readdir(f.dir)).some(name=>name==='rendered'||name.startsWith('.pustka-docs-preview-')),false);
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir,maxOutputBytes:65*1024*1024}),/between 1 byte and 64 MiB/);
});

test('aggregate API bounds stop within a symbol instead of rendering every expanding comment first',async t=>{
  const f=await fixture(t);
  const baseline=await generateDocumentationPreview({file:f.file,outDir:path.join(f.dir,'baseline')});
  const expandingComment=Array.from({length:64},()=>String.raw`$\frac{a}{b}$`).join(' ');
  f.data.api.symbols[0].parameters=Array.from({length:200},(_,index)=>({name:`parameter${index}`,type:'String',description:expandingComment}));
  await f.save();
  let renderedExpressions=0;
  const original=katex.renderToString;
  t.mock.method(katex,'renderToString',function(...args){renderedExpressions++;return original.apply(this,args);});
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:f.outDir,maxOutputBytes:baseline.bytes+100000}),/output size limit/);
  assert.ok(renderedExpressions>64,'the renderer reached an expanding API comment');
  assert.ok(renderedExpressions<64*5,`rendering stopped near the bound rather than expanding all 12,800 expressions (${renderedExpressions} rendered)`);
  assert.equal((await readdir(f.dir)).some(name=>name==='rendered'||name.startsWith('.pustka-docs-preview-')),false);
  assert.match(await readFile(path.join(f.dir,'baseline/index.html'),'utf8'),/DRAFT/);
});

test('linked output directories and linked parent directories are refused without following them',async t=>{
  const f=await fixture(t),actual=path.join(f.dir,'actual'),linked=path.join(f.dir,'linked');await mkdir(actual);
  try {await symlink(actual,linked,process.platform==='win32'?'junction':'dir');}
  catch(error) {if (['EPERM','EACCES','ENOSYS'].includes(error.code)) {t.skip('Symbolic links are unavailable on this host.');return;}throw error;}
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:linked}),/symbolic links/);
  await assert.rejects(generateDocumentationPreview({file:f.file,outDir:path.join(linked,'child')}),/symbolic links/);
  assert.deepEqual(await readdir(actual),[]);
});

test('preview CLI renders the same static review artifact without a publication key',async t=>{
  const f=await fixture(t);
  const result=execFileSync(process.execPath,['scripts/preview-docs.mjs','--file',f.file,'--out',f.outDir],{cwd:ROOT,encoding:'utf8',env:{...process.env,PUSTKA_DOCS_PUBLISH_KEY:''}});
  assert.match(result,/Rendered draft documentation for example main/);
  assert.match(await readFile(path.join(f.outDir,'index.html'),'utf8'),/DRAFT/);
});

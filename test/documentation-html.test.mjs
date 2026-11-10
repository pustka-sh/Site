import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { documentationHtml, renderPublishedDocumentation } from '../server/documentation-html.mjs';
import { renderDocumentationMarkdown } from '../server/services/documentation.mjs';
import { parseDocumentationBootstrap } from '../src/lib/documentBootstrap.js';
import { consumeDocumentationBootstrap, readDocumentationBootstrap } from '../src/lib/documentBootstrap.js';
import { usePublishedResource } from '../src/lib/publishedDocs.js';

const template = '<!doctype html><html><head><title>Original</title><meta name="description" content="Original"><meta property="og:title" content="Original"><meta property="og:description" content="Original"><meta property="og:url" content="https://pustka.sh/"><link rel="canonical" href="https://pustka.sh/"><script>/* trusted theme */</script></head><body><div id="root"><noscript><div>Original fallback</div></noscript></div><script src="/assets/main.js" type="module"></script></body></html>';
const commit = 'a'.repeat(40);
const base = '/docs/example/main';
const symbol = {id:'example.Router#route(java.lang.String)',kind:'method',name:'route',qualifiedName:'example.Router.route',owner:'example.Router',signature:'public <T> String route(String name)',summary:'Routes a player.',description:'Routes a **player**.',parameters:[{name:'name',type:'String',description:'The player name.',descriptionHtml:'<p>The player name.</p>'}],returns:{type:'String',description:'The result.',descriptionHtml:'<p>The result.</p>'},throws:[{type:'IOException',description:'The request failed.',descriptionHtml:'<p>The request failed.</p>'}],since:'1.0',deprecated:true,deprecation:'Use the typed request.',deprecationHtml:'<p>Use the typed request.</p>',source:{path:'src/Router.java',line:12},stability:'experimental',stabilityNote:'The source contract is still changing.',descriptionHtml:'<p>Routes a <strong>player</strong>.</p>'};
const manifest = {schemaVersion:1,project:{id:'example',name:'Example',repository:'https://github.com/example/project'},version:'main',source:{commit,ref:'refs/heads/main'},generatedAt:'2026-11-08T10:00:00.000Z',publishedAt:'2026-11-09T10:00:00.000Z',pages:[{slug:'overview',title:'Overview',kind:'guide',sourcePath:'README.md'},{slug:'guide',title:'Guide',kind:'guide',sourcePath:'docs/guide.md'}],api:{language:'java',generator:'fixture',symbols:[{id:'example.Router',kind:'class',name:'Router',qualifiedName:'example.Router',signature:'public class Router',summary:'Routes requests.'},symbol]}};
const decode = value => value.replace(/&(amp|lt|gt|quot|#39);/g, (_, name) => ({amp:'&',lt:'<',gt:'>',quot:'"','#39':"'"}[name]));
const bootstrapText = html => decode(/<template id="pustka-doc-bootstrap">([\s\S]*?)<\/template>/.exec(html)?.[1] || '');
const render = options => renderPublishedDocumentation(template,{manifest,origin:'https://pustka.sh',pathname:base,...options});

test('metadata helper keeps its original API and can replace nested root fallback with trusted content', () => {
  const html = documentationHtml(template,{title:'Title <&"',description:'Description $& <',url:'https://pustka.sh/docs?a=1&b=2',body:'<main><h1>Actual $& content</h1></main>',extraHead:'<link rel="stylesheet" href="/reader.css">'});
  assert.match(html,/<title>Title &lt;&amp;&quot;<\/title>/);
  assert.match(html,/content="Description \$&amp; &lt;"/);
  assert.match(html,/<main><h1>Actual \$& content<\/h1><\/main>/);
  assert.doesNotMatch(html,/Original fallback|<noscript>/);
  assert.match(html,/<script>\/\* trusted theme \*\/<\/script>/);
  assert.match(html,/href="\/reader.css"/);
});

test('overview and API index contain useful semantic content and versioned links before JavaScript', () => {
  const overview = render({});
  assert.match(overview,/<article class="docs-content published-docs-content">/);
  assert.match(overview,/<h1>Example, documented\.<\/h1>/);
  assert.match(overview,/href="\/docs\/example\/main\/guide"/);
  assert.match(overview,new RegExp(`https://github.com/example/project/tree/${commit}`));
  const index = render({pathname:`${base}/api`});
  assert.match(index,/public &lt;T&gt; String route\(String name\)/);
  assert.match(index,/Routes requests\./);
  assert.match(index,/href="\/docs\/example\/main\/api\?symbol=example.Router%23route\(java.lang.String\)"/);
  assert.equal(parseDocumentationBootstrap(bootstrapText(index)).get(base).version,'main');
});

test('guide HTML, math and comment links are server-rendered with exact commit source and adjacent guides', () => {
  const markdown = '# Real guide\n\nA useful guide with $x^2$. [Call route](javadoc:example.Router%23route%28java.lang.String%29)\n\n<script>alert(1)</script>';
  const page = {...manifest.pages[1],markdown,html:renderDocumentationMarkdown(markdown,{...manifest,sourcePath:'docs/guide.md'})};
  const html = render({pathname:`${base}/guide`,page});
  assert.match(html,/<h1>Guide<\/h1>/);
  assert.match(html,/A useful guide with/);
  assert.match(html,/class="katex"/);
  assert.match(html,/href="\/docs\/example\/main\/api\?symbol=example.Router%23route\(java.lang.String\)"/);
  assert.match(html,new RegExp(`https://github.com/example/project/blob/${commit}/docs/guide.md`));
  assert.match(html,/← Overview/);
  assert.doesNotMatch(html,/<script>alert\(1\)<\/script>/);
  assert.equal(parseDocumentationBootstrap(bootstrapText(html)).get(`${base}/pages/guide`).page.markdown,markdown);
});

test('symbol content includes authored details, parameter/return/throws, owner and policy without JavaScript', () => {
  const html = render({pathname:`${base}/api`,symbol,symbolId:symbol.id});
  assert.match(html,/<h1 class="published-symbol-title">route<\/h1>/);
  assert.match(html,/Routes a <strong>player<\/strong>/);
  for (const text of ['Parameters','Returns','Throws','The player name.','The result.','The request failed.','experimental','source contract is still changing.']) assert.ok(html.includes(text),text);
  assert.match(html,new RegExp(`/blob/${commit}/src/Router.java#L12`));
  assert.match(html,/href="\/docs\/example\/main\/api\?symbol=example.Router" class="published-owner"/);
  const resource = parseDocumentationBootstrap(bootstrapText(html)).get(`${base}/api?symbol=${encodeURIComponent(symbol.id)}`);
  assert.equal(resource.symbol.id,symbol.id);
});

test('metadata, source, text and inert bootstrap cannot break out with malicious authored strings', () => {
  const malicious = '</template><script src="https://evil.test/x.js">alert(1)</script><img src=x onerror=alert(1)> & $&';
  const copy = structuredClone(manifest);
  copy.project.name = malicious;
  copy.project.repository = 'javascript:alert(1)';
  const badSymbol = {...symbol,name:malicious,signature:malicious,summary:malicious,description:malicious,descriptionHtml:renderDocumentationMarkdown(malicious),source:{path:'../../bad" onmouseover="x',line:1}};
  const html = render({manifest:copy,pathname:`${base}/api`,symbol:badSymbol,symbolId:badSymbol.id});
  assert.equal((html.match(/<template\b/g)||[]).length,1);
  assert.equal((html.match(/<script\b/g)||[]).length,2,'only existing trusted shell scripts');
  assert.doesNotMatch(html,/<img|href="javascript:|<[^>]+\sonmouseover=/);
  const json = bootstrapText(html);
  assert.equal(JSON.parse(json).resources[1].data.symbol.name,malicious);
  assert.match(html,/&lt;\/template&gt;&lt;script/);
  assert.match(html,/rel="canonical" href="https:\/\/pustka.sh\/docs\/example\/main\/api\?symbol=/);
});

test('inert bootstrap parser rejects malformed or unrelated resources and preserves exact resource paths', () => {
  for (const text of ['', 'not json', JSON.stringify({schemaVersion:2,resources:[]}), JSON.stringify({schemaVersion:1,pathname:base,resources:[{path:'//evil.test/docs',data:{}}]}), JSON.stringify({schemaVersion:1,pathname:base,resources:[{path:base,data:{}},{path:base,data:{}}]})]) assert.equal(parseDocumentationBootstrap(text).size,0);
  const html = render({});
  const parsed = parseDocumentationBootstrap(bootstrapText(html));
  assert.equal(parsed.get('/docs/example/main/pages/absent'),undefined);
  assert.equal(parsed.get('/docs/example/main').project.name,'Example');
});

test('reader starts with bootstrap content, while old static and client navigation paths keep the fetch-loading fallback', async () => {
  const html = render({});
  const previous = globalThis.document;
  let removed = false;
  globalThis.document = {getElementById:id => id === 'pustka-doc-bootstrap' ? {content:{textContent:bootstrapText(html)},remove:()=>{removed=true;}} : null};
  try {
    function Probe({path}) { const state=usePublishedResource(path); return React.createElement('p',null,state.loading ? 'Loading' : state.data.project.name); }
    assert.equal(renderToStaticMarkup(React.createElement(Probe,{path:base})),'<p>Example</p>');
    assert.equal(renderToStaticMarkup(React.createElement(Probe,{path:'/docs/other/main'})),'<p>Loading</p>');
    assert.equal(removed,true);
    consumeDocumentationBootstrap(base);
    assert.equal(readDocumentationBootstrap(base),undefined,'returning to the original route after the first committed reader uses the API');
    const oldClient = await import(`../src/lib/documentBootstrap.js?old-client=${Date.now()}`);
    globalThis.document = {getElementById:()=>null};
    assert.equal(oldClient.readDocumentationBootstrap(base),undefined);
  } finally { if (previous === undefined) delete globalThis.document; else globalThis.document = previous; }
});

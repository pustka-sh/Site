import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {journal} from '../src/data/journal.js';
import {renderDocumentationMarkdown} from '../server/services/documentation.mjs';
import {journalHtmlBody} from '../server/journal-html.mjs';
import {documentationHtml} from '../server/documentation-html.mjs';

test('published journal notes have matching source, safe rendered text and revision-pinned references',async()=>{
  const generated=JSON.parse(await readFile(new URL('../src/content/journal.generated.json',import.meta.url),'utf8'));
  assert.equal(new Set(journal.map(entry=>entry.slug)).size,journal.length);
  for(const entry of journal){
    const markdown=await readFile(new URL(`../src/content/journal/${entry.file}`,import.meta.url),'utf8');
    const built=generated.find(item=>item.slug===entry.slug);
    assert.equal(built.markdown,markdown);assert.equal(built.html,renderDocumentationMarkdown(markdown));
    assert.match(markdown,/https:\/\/github\.com\/pustka-sh\/(?:Site|Relay)\/blob\/[a-f0-9]{40}\//);
    assert.doesNotMatch(built.html,/<script\b|\son[a-z]+=/i);
    const html=documentationHtml('<html><head><title>pustka</title></head><body><div id="root"></div></body></html>',{title:entry.title,description:entry.description,url:`https://pustka.sh/journal/${entry.slug}`,body:journalHtmlBody(generated,entry.slug)});
    assert.ok(html.includes(built.html));assert.match(html,/<article\b/);assert.match(html,/<time datetime="2026-11-09">/);assert.ok(html.includes(`<h1>${entry.title}</h1>`));
  }
  const index=journalHtmlBody(generated);
  for(const entry of journal)assert.ok(index.includes(`href="/journal/${entry.slug}"`));
  assert.throws(()=>journalHtmlBody(generated,'missing'));
});

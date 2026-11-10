import test from 'node:test';
import assert from 'node:assert/strict';
import { documentationSitemapIndex, documentationVersionSitemap } from '../server/documentation-sitemap.mjs';

const commit = 'a'.repeat(40), publishedAt = '2026-11-09T12:34:56.789Z';
const version = {version:'main',commit,publishedAt,generatedAt:'2026-11-08T00:00:00.000Z'};
const manifest = {project:{id:'relay'},version:'main',source:{commit},pages:[{slug:'overview'},{slug:'guide'},{slug:'draft-guide',draft:true}],api:{symbols:[{id:'example.Router#route(java.lang.String)'},{id:'example.A&B<"x">'},{id:'draft.Symbol',draft:true}]}};
const documentation = {
  async projects() { return {projects:[{id:'relay',versions:[version,{...version,version:'1.0.0',draft:true},{...version,version:'1.1.0',preview:true},{...version,version:'pr-14'},{...version,version:'1.2.0',publishedAt:null}]}]}; },
  async versions() { return {versions:[version]}; },
  async manifest() { return manifest; },
};

test('sitemap index links a static map and real published versions with publication dates, excluding drafts', async () => {
  const xml = await documentationSitemapIndex({documentation,origin:'https://pustka.sh'});
  assert.match(xml,/^<\?xml version="1.0" encoding="UTF-8"\?>/);
  assert.match(xml,/<sitemapindex xmlns="http:\/\/www.sitemaps.org\/schemas\/sitemap\/0.9">/);
  assert.match(xml,/<loc>https:\/\/pustka.sh\/sitemaps\/site.xml<\/loc>/);
  assert.match(xml,/<loc>https:\/\/pustka.sh\/sitemaps\/docs\/relay\/main.xml<\/loc>/);
  assert.equal((xml.match(/<sitemap>/g)||[]).length,2);
  assert.match(xml,new RegExp(`<lastmod>${publishedAt.replaceAll('.','\\.')}</lastmod>`));
  assert.doesNotMatch(xml,/1\.0\.0|1\.1\.0|1\.2\.0|pr-14|generatedAt/);
});

test('version sitemap includes overview, guides, API and encoded symbols with exact publication time', async () => {
  const xml = await documentationVersionSitemap({documentation,origin:'https://pustka.sh',project:'relay',version:'main'});
  for (const url of ['/docs/relay/main','/docs/relay/main/overview','/docs/relay/main/guide','/docs/relay/main/api',`/docs/relay/main/api?symbol=${encodeURIComponent(manifest.api.symbols[0].id)}`,`/docs/relay/main/api?symbol=${encodeURIComponent(manifest.api.symbols[1].id)}`]) assert.ok(xml.includes(`<loc>https://pustka.sh${url}</loc>`),url);
  assert.equal((xml.match(/<url>/g)||[]).length,6);
  assert.equal((xml.match(/<lastmod>/g)||[]).length,6);
  assert.doesNotMatch(xml,/draft-guide|draft.Symbol|2026-11-08/);
});

test('XML escaping is separate from URL encoding and origin configuration stays bounded', async () => {
  const xml = await documentationSitemapIndex({documentation,origin:'https://docs&tools.example'});
  assert.match(xml,/<loc>https:\/\/docs&amp;tools.example\/sitemaps\/site.xml<\/loc>/);
  assert.doesNotMatch(xml,/docs&tools/);
  for (const origin of ['javascript:alert(1)','https://user:secret@example.com','https://example.com/path','https://example.com/?visitor=evil']) await assert.rejects(documentationSitemapIndex({documentation,origin}),/origin/);
});

test('draft, preview and mismatched source packages are never rendered as published sitemap versions', async () => {
  const options = {documentation,origin:'https://pustka.sh',project:'relay',version:'main'};
  for (const patch of [{draft:true},{preview:true},{status:'draft'},{channel:'preview'},{publishedAt:null}]) await assert.rejects(documentationVersionSitemap({...options,documentation:{...documentation,versions:async()=>({versions:[{...version,...patch}]})}}),{status:404});
  await assert.rejects(documentationVersionSitemap({...options,version:'pr-1'}),{status:404});
  await assert.rejects(documentationVersionSitemap({...options,documentation:{...documentation,manifest:async()=>({...manifest,source:{commit:'b'.repeat(40)}})}}),{status:404});
});

test('sitemap protocol limits fail safely and long identifiers remain discoverable through the API index', async () => {
  const tooMany = {projects:async()=>({projects:[{id:'relay',versions:Array.from({length:50000},(_,i)=>({...version,version:`0.0.${i}`}))}]})};
  await assert.rejects(documentationSitemapIndex({documentation:tooMany,origin:'https://pustka.sh'}),/entry limit/);
  const longSymbols = {...documentation,manifest:async()=>({...manifest,api:{symbols:[{id:'é'.repeat(1000)}]}})};
  const xml = await documentationVersionSitemap({documentation:longSymbols,origin:'https://pustka.sh',project:'relay',version:'main'});
  assert.match(xml,/<loc>https:\/\/pustka.sh\/docs\/relay\/main\/api<\/loc>/);
  assert.doesNotMatch(xml,/symbol=/);
});

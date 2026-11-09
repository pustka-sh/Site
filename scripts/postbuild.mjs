#!/usr/bin/env node
/*
 * After `vite build`: give every route its own HTML file with the right title,
 * description, canonical URL and social tags, so clean URLs work on any static
 * host without rewrite rules, and link previews describe the page shared.
 * Also writes 404.html (served by most hosts for unknown paths) and sitemap.xml.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pages, SITE } from '../src/data/site.js';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const template = readFileSync(join(dist, 'index.html'), 'utf8');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function render({ path, title, description }, extraHead = '') {
  const url = SITE + (path === '/' ? '/' : path);
  return template
    .replace(/<title>[^<]*<\/title>/, `<title>${esc(title)}</title>`)
    .replace(/(<meta name="description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<link rel="canonical" href=")[^"]*/, `$1${url}`)
    .replace(/(<meta property="og:title" content=")[^"]*/, `$1${esc(title)}`)
    .replace(/(<meta property="og:description" content=")[^"]*/, `$1${esc(description)}`)
    .replace(/(<meta property="og:url" content=")[^"]*/, `$1${url}`)
    .replace('</head>', `${extraHead}</head>`);
}

for (const page of pages) {
  const file = page.path === '/' ? join(dist, 'index.html') : join(dist, page.path.slice(1), 'index.html');
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, render(page));
}

writeFileSync(
  join(dist, '404.html'),
  render({ path: '/404', title: 'The void — pustka', description: 'Nothing here. Yet.' }, '  <meta name="robots" content="noindex">\n'),
);

const today = new Date().toISOString().slice(0, 10);
writeFileSync(
  join(dist, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages
    .map((p) => `  <url><loc>${SITE}${p.path === '/' ? '/' : p.path}</loc><lastmod>${today}</lastmod></url>`)
    .join('\n')}\n</urlset>\n`,
);

console.log(`postbuild: ${pages.length} route pages, 404.html, sitemap.xml`);

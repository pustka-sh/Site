const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

/** Metadata strings are untrusted. body/extraHead are trusted, rendered HTML only. */
export function documentationHtml(template, {title,description,url,body,extraHead=''}) {
  let html = template.replace(/<title>[^<]*<\/title>/,()=>`<title>${escape(title)}</title>`);
  for (const [prefix,value] of [
    ['<meta name="description" content="',description],
    ['<meta property="og:title" content="',title],
    ['<meta property="og:description" content="',description],
    ['<meta property="og:url" content="',url],
    ['<link rel="canonical" href="',url],
  ]) {
    const start = html.indexOf(prefix);
    if (start < 0) continue;
    const contentStart=start+prefix.length, end=html.indexOf('"',contentStart);
    if(end>=0)html=html.slice(0,contentStart)+escape(value)+html.slice(end);
  }
  if (typeof body === 'string') html = replaceRoot(html, body);
  if (extraHead) html = html.replace('</head>', () => `${extraHead}\n</head>`);
  return html;
}

function replaceRoot(template, body) {
  const opening = /<div\b[^>]*\bid=["']root["'][^>]*>/i.exec(template);
  if (!opening) throw new Error('The documentation shell has no root element.');
  const tags = /<\/?div\b[^>]*>/gi;
  tags.lastIndex = opening.index + opening[0].length;
  let depth = 1, match;
  while ((match = tags.exec(template))) {
    depth += /^<\//.test(match[0]) ? -1 : 1;
    if (!depth) return template.slice(0, opening.index + opening[0].length) + body + template.slice(match.index);
  }
  throw new Error('The documentation shell has an unclosed root element.');
}

const docBase = (project, version) => `/docs/${encodeURIComponent(project)}/${encodeURIComponent(version)}`;
const apiLink = (base, id) => `${base}/api${id ? `?symbol=${encodeURIComponent(id)}` : ''}`;
const isType = symbol => ['class','interface','enum','record','annotation'].includes(symbol.kind);
const kind = value => String(value || 'symbol').replaceAll('-', ' ');
const link = (href, text, attributes = '') => `<a href="${escape(href)}"${attributes}>${escape(text)}</a>`;

function sourceUrl(manifest, source) {
  const repository = manifest.project?.repository, commit = manifest.source?.commit;
  if (!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository || '') || !/^[a-f0-9]{40}$/i.test(commit || '')) return null;
  if (!source?.path) return `${repository}/tree/${commit}`;
  const parts = source.path.split('/');
  if (/[\\\u0000-\u001f\u007f:#?%]/.test(source.path) || parts.some(part => !part || part === '.' || part === '..')) return null;
  return `${repository}/blob/${commit}/${parts.map(encodeURIComponent).join('/')}${Number.isSafeInteger(source.line) && source.line > 0 ? `#L${source.line}` : ''}`;
}

function revision(manifest, source) {
  const href = sourceUrl(manifest, source);
  return `<div class="published-revision"><span class="published-channel ${manifest.version === 'main' ? 'development' : 'release'}">${manifest.version === 'main' ? 'Development documentation' : 'Released documentation'}</span><code>${escape(manifest.version)}</code><span>Source <code>${escape(manifest.source?.commit || '')}</code></span>${href ? link(href, source?.path ? `${source.path}${source.line ? `:${source.line}` : ''}` : 'View this revision', ' rel="noopener noreferrer"') : ''}</div>`;
}

/** This fragment comes only from the service's Markdown renderer, never upload HTML. */
function prose(html, fallback, base) {
  if (typeof html !== 'string' || !html.trim()) return fallback ? `<p class="published-prose">${escape(fallback)}</p>` : '';
  // Source links use ?symbol= for the interactive reader. A full link also works without JS.
  const rewritten = html.replace(/href="\?symbol=([^"<>]*)"/g, (_, id) => `href="${escape(base)}/api?symbol=${id}"`);
  return `<div class="published-prose">${rewritten}</div>`;
}

function symbolList(symbols, base) {
  return `<div class="published-symbol-list">${symbols.map(symbol => `<a href="${escape(apiLink(base, symbol.id))}"><span class="published-kind">${escape(kind(symbol.kind))}</span><span><strong>${escape(symbol.qualifiedName || symbol.name)}</strong><code>${escape(symbol.signature)}</code>${symbol.summary ? `<small>${escape(symbol.summary)}</small>` : ''}</span>${symbol.deprecated ? '<span class="published-deprecated">Deprecated</span>' : ''}<span aria-hidden="true">→</span></a>`).join('')}</div>`;
}

function symbolBody(manifest, symbol, base) {
  const symbols = manifest.api?.symbols || [];
  const owner = symbols.find(item => item.id === symbol.owner || item.qualifiedName === symbol.owner);
  const members = symbols.filter(item => item.id !== symbol.id && (item.owner === symbol.qualifiedName || item.owner === symbol.id));
  const stability = ['supported','experimental','internal'].includes(symbol.stability) ? symbol.stability : 'unclassified';
  return `<p class="published-symbol-kind">${escape(kind(symbol.kind))}${symbol.deprecated ? ' · Deprecated' : ''}</p><h1 class="published-symbol-title">${escape(symbol.name)}</h1><p class="published-qualified-name">${escape(symbol.qualifiedName)}</p>${owner ? link(apiLink(base,owner.id),`In ${owner.qualifiedName || owner.name}`, ' class="published-owner"') : ''}${revision(manifest,symbol.source)}<p class="published-api-policy">API policy: <strong>${escape(stability)}</strong>${symbol.stabilityNote ? ` · ${escape(symbol.stabilityNote)}` : ''}</p><pre class="published-signature"><code>${escape(symbol.signature)}</code></pre>
    ${symbol.deprecated ? `<aside class="published-deprecation"><strong>Deprecated API</strong>${prose(symbol.deprecationHtml,symbol.deprecation || 'This symbol is marked deprecated in its source.',base)}</aside>` : ''}
    ${prose(symbol.descriptionHtml || symbol.summaryHtml,symbol.description || symbol.summary || 'No description has been written for this symbol in the source yet. Its signature and location are still available.',base)}
    ${symbol.parameters?.length ? `<h2 id="api-parameters">Parameters</h2><div class="table-wrap"><table class="reference-table published-parameter-table"><thead><tr><th scope="col">Name / type</th><th scope="col">Description</th></tr></thead><tbody>${symbol.parameters.map(parameter => `<tr><td><code>${escape(parameter.name)}</code><small>${escape(parameter.type)}</small></td><td>${prose(parameter.descriptionHtml,parameter.description || 'Not documented in the source.',base)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${symbol.returns && symbol.returns.type !== 'void' ? `<h2 id="api-returns">Returns</h2><p><code>${escape(symbol.returns.type)}</code></p>${prose(symbol.returns.descriptionHtml,symbol.returns.description || 'No return description is provided in the source.',base)}` : ''}
    ${symbol.throws?.length ? `<h2 id="api-throws">Throws</h2>${symbol.throws.map(exception => `<div class="published-exception"><code>${escape(exception.type)}</code>${prose(exception.descriptionHtml,exception.description || 'Not documented in the source.',base)}</div>`).join('')}` : ''}
    ${symbol.since ? `<p class="published-since">Since <code>${escape(symbol.since)}</code></p>` : ''}
    ${members.length ? `<h2 id="api-members">Members</h2>${symbolList(members,base)}` : ''}`;
}

function overviewBody(manifest, base) {
  const symbols = manifest.api?.symbols || [];
  return `<h1>${escape(manifest.project.name)}, documented.</h1><p class="lead">Guides and API references from the same source revision.</p>${revision(manifest)}<div class="published-snapshot-facts"><span><strong>${manifest.pages.length}</strong> guides</span><span><strong>${symbols.filter(isType).length}</strong> API types</span><span><strong>${symbols.length}</strong> symbols</span></div><h2 id="package-guides">Start with a guide</h2><div class="published-guide-list">${manifest.pages.map(page => `<a href="${escape(`${base}/${encodeURIComponent(page.slug)}`)}"><span>${escape(page.title)}<small>${escape(page.sourcePath)}</small></span><span aria-hidden="true">→</span></a>`).join('')}</div>${manifest.pages.length ? '' : '<p>No guides are included in this package.</p>'}<h2 id="package-api">Explore the API</h2><p>Comments, signatures, and source links stay tied to this version.</p>${link(apiLink(base),'Browse API reference →',' class="button"')}`;
}

/** Render only a published, validated manifest and service-sanitized page/symbol response. */
export function renderPublishedDocumentation(template, {manifest,page=null,symbol=null,origin,pathname,symbolId=null}) {
  const project = manifest.project, version = manifest.version;
  const base = docBase(project.id,version), pages = manifest.pages || [];
  const route = new URL(pathname, 'https://documentation.invalid');
  const api = route.pathname === `${base}/api`;
  const label = page?.title || symbol?.qualifiedName || (api ? 'API reference' : 'Documentation');
  const title = `${label} · ${project.name} ${version} — pustka`;
  const description = (symbol?.summary || `${label} for ${project.name} ${version}, published from source revision ${manifest.source.commit}.`).slice(0,300);
  const canonical = new URL(api && symbolId ? apiLink(base,symbolId) : route.pathname, checkedOrigin(origin)).href;
  let content;
  if (page) {
    const index = pages.findIndex(item => item.slug === page.slug), previous = pages[index-1], next = pages[index+1];
    content = `<h1>${escape(page.title)}</h1>${revision(manifest,{path:page.sourcePath})}${prose(page.html,page.markdown,base)}<nav class="published-guide-pagination" aria-label="Adjacent guides">${previous ? link(`${base}/${encodeURIComponent(previous.slug)}`,`← ${previous.title}`) : ''}${next ? link(`${base}/${encodeURIComponent(next.slug)}`,`${next.title} →`,' class="next"') : ''}</nav>`;
  } else if (symbol) content = symbolBody(manifest,symbol,base);
  else if (api) content = `<h1>The source, explained.</h1><p class="lead">${escape(project.name)} / ${escape(manifest.api?.language || 'Source')} API reference</p>${revision(manifest)}<p>${manifest.api?.symbols?.length || 0} documented symbols. Choose a type or member.</p>${symbolList(manifest.api?.symbols || [],base)}`;
  else content = overviewBody(manifest,base);
  const body = `<header class="container"><nav aria-label="Main navigation">${link('/','pustka')} / ${link('/projects','Projects')} / ${link('/docs/projects','Documentation')}</nav></header><main class="published-docs-shell"><aside class="published-docs-sidebar" aria-label="Versioned documentation navigation"><p class="sidebar-label">${escape(project.name)} / ${escape(version)}</p>${link(base,'Overview', !page && !api ? ' aria-current="page" class="active"' : '')}<p class="sidebar-label">GUIDES</p>${pages.map(item => link(`${base}/${encodeURIComponent(item.slug)}`,item.title,item.slug === page?.slug ? ' aria-current="page" class="active"' : '')).join('')}<p class="sidebar-label">SOURCE REFERENCE</p>${link(apiLink(base),'API reference', api ? ' aria-current="page" class="active"' : '')}${link('/docs/projects','All project documentation')}</aside><article class="docs-content published-docs-content"><nav class="breadcrumbs" aria-label="Breadcrumb">${link('/docs/projects','Docs')}<span>/</span>${link(base,project.name)}<span>/</span>${link(base,version)}${page || api ? `<span>/</span><span>${escape(page?.title || 'API reference')}</span>` : ''}</nav>${content}<footer class="published-package-footer">${link(base,`${project.name} ${version} documentation`)}<span>${version === 'main' ? 'Development snapshots can change.' : 'This release documentation is preserved.'}</span></footer></article></main>`;
  const resources = [{path:base,data:manifest}];
  if (page) resources.push({path:`${base}/pages/${encodeURIComponent(page.slug)}`,data:{page,project,version,source:manifest.source}});
  if (symbol) resources.push({path:`${base}/api?symbol=${encodeURIComponent(symbolId || symbol.id)}`,data:{symbol,project,version,source:manifest.source}});
  const bootstrap = `<template id="pustka-doc-bootstrap">${escape(JSON.stringify({schemaVersion:1,pathname:route.pathname,resources}))}</template>`;
  return documentationHtml(template,{title,description,url:canonical,body}).replace('</body>', () => `${bootstrap}\n</body>`);
}

function checkedOrigin(value) {
  const url = new URL(value);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('A documentation origin is required.');
  return url.origin;
}

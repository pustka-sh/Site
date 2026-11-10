import { isDocsVersion, isProjectId } from './services/documentation.mjs';

const XML_HEADER = '<?xml version="1.0" encoding="UTF-8"?>\n';
const NAMESPACE = 'http://www.sitemaps.org/schemas/sitemap/0.9';
const MAX_ENTRIES = 50000;
const MAX_BYTES = 50 * 1024 * 1024;
const escapeXml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[char]));
const missing = () => Object.assign(new Error('This published documentation version does not exist.'), {status:404,code:'DOCS_VERSION_NOT_FOUND',expose:true});

function checkedOrigin(value) {
  const url = new URL(value);
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('A sitemap origin is required.');
  return url.origin;
}

function publicationDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T/.test(value) || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function isPublished(version) {
  return version && isDocsVersion(version.version) && publicationDate(version.publishedAt) && /^[a-f0-9]{40}$/i.test(version.commit || '') && !version.draft && !version.preview && !['draft','preview'].includes(version.status) && !['draft','preview'].includes(version.channel);
}

function xmlDocument(kind, entries) {
  if (entries.length > MAX_ENTRIES) throw new Error('The sitemap exceeds the entry limit.');
  const child = kind === 'sitemapindex' ? 'sitemap' : 'url';
  const xml = `${XML_HEADER}<${kind} xmlns="${NAMESPACE}">\n${entries.map(({loc,lastmod}) => {
    if (loc.length >= 2048) throw new Error('A sitemap URL exceeds the protocol limit.');
    return `  <${child}><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${escapeXml(lastmod)}</lastmod>` : ''}</${child}>`;
  }).join('\n')}\n</${kind}>\n`;
  if (Buffer.byteLength(xml) > MAX_BYTES) throw new Error('The sitemap exceeds the byte limit.');
  return xml;
}

/** Only registry-backed published versions appear; preview artifacts have no index entry. */
export async function documentationSitemapIndex({documentation,origin,staticPages=[]}) {
  const base = checkedOrigin(origin);
  const {projects} = await documentation.projects();
  if (!Array.isArray(projects) || projects.length > 50) throw new Error('The documentation project directory is invalid.');
  const dates = Array.isArray(staticPages) ? staticPages.map(page => publicationDate(page?.lastmod)).filter(Boolean) : [];
  const entries = [{loc:`${base}/sitemaps/site.xml`,...(dates.length ? {lastmod:dates.sort().at(-1)} : {})}];
  const seen = new Set();
  for (const project of projects) {
    if (!isProjectId(project.id)) continue;
    for (const version of project.versions || []) {
      if (!isPublished(version)) continue;
      const key = `${project.id}/${version.version}`;
      if (seen.has(key)) continue;
      seen.add(key);
      entries.push({loc:`${base}/sitemaps/docs/${encodeURIComponent(project.id)}/${encodeURIComponent(version.version)}.xml`,lastmod:publicationDate(version.publishedAt)});
    }
  }
  return xmlDocument('sitemapindex',entries);
}

/** Render a single, bounded published snapshot. Visitor-supplied URLs never enter it. */
export async function documentationVersionSitemap({documentation,origin,project,version}) {
  if (!isProjectId(project) || !isDocsVersion(version)) throw missing();
  const originBase = checkedOrigin(origin);
  const directory = await documentation.versions(project);
  const publication = directory.versions?.find(entry => entry.version === version && isPublished(entry));
  if (!publication) throw missing();
  const manifest = await documentation.manifest(project,version);
  if (manifest.project?.id !== project || manifest.version !== version || manifest.source?.commit !== publication.commit || manifest.draft || manifest.preview) throw missing();
  const base = `${originBase}/docs/${encodeURIComponent(project)}/${encodeURIComponent(version)}`;
  const lastmod = publicationDate(publication.publishedAt);
  const paths = [base];
  for (const page of manifest.pages || []) {
    if (!page.draft && /^[a-z0-9][a-z0-9-]{0,79}$/.test(page.slug || '') && page.slug !== 'api') paths.push(`${base}/${encodeURIComponent(page.slug)}`);
  }
  paths.push(`${base}/api`);
  for (const symbol of manifest.api?.symbols || []) {
    if (!symbol.draft && typeof symbol.id === 'string' && symbol.id && symbol.id.length <= 2000 && !/[\u0000-\u001f\u007f]/.test(symbol.id)) {
      const url = `${base}/api?symbol=${encodeURIComponent(symbol.id)}`;
      // Sitemaps require loc values shorter than 2,048 characters. The API index
      // still links unusual longer identifiers that cannot fit the protocol.
      if (url.length < 2048) paths.push(url);
    }
  }
  return xmlDocument('urlset',[...new Set(paths)].map(loc => ({loc,lastmod})));
}

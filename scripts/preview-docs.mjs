import { createHash } from 'node:crypto';
import { lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import sanitizeHtml from 'sanitize-html';
import { MAX_PACKAGE_BYTES, renderDocumentationMarkdown, validateDocumentationPackage } from '../server/services/documentation.mjs';

export const MAX_PREVIEW_BYTES = 64 * 1024 * 1024;
const MAX_HTML_BYTES = 16 * 1024 * 1024;
const MAX_ASSET_BYTES = 512 * 1024;
const markdownTags=[...new Set([...sanitizeHtml.defaults.allowedTags,'span','div','math','semantics','mrow','mi','mo','mn','msup','msub','mfrac','msqrt','mroot','mtable','mtr','mtd','mspace','mstyle','annotation','mpadded','mphantom','menclose','mover','munder','munderover','msubsup','mtext','svg','path','line','rect','polygon','polyline'])];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const digest = value => createHash('sha256').update(value).digest('hex');
export const previewSymbolAnchor = id => `symbol-${digest(id)}`;
const fail = message => new Error(message);
const within = (directory, target) => {const relative=path.relative(directory,target);return relative && !path.isAbsolute(relative) && relative!=='..' && !relative.startsWith('..'+path.sep);};

async function noLinks(target, {missing = false} = {}) {
  const absolute=path.resolve(target), parsed=path.parse(absolute);
  let current=parsed.root;
  for (const part of absolute.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    current=path.join(current,part);
    try {if ((await lstat(current)).isSymbolicLink()) throw fail('Documentation preview paths must not contain symbolic links.');}
    catch (error) {if (error.code==='ENOENT' && missing) return;throw error;}
  }
}

async function readBounded(file, limit) {
  await noLinks(file);
  const info=await lstat(file);
  if (!info.isFile() || info.size>limit) throw fail('A documentation preview input is not a regular file or exceeds its size limit.');
  const handle=await open(file,'r');
  try {
    const opened=await handle.stat();
    if (!opened.isFile() || opened.size>limit || opened.ino!==info.ino || opened.dev!==info.dev) throw fail('A documentation preview input changed while being read.');
    const bytes=await handle.readFile();
    if (bytes.length>limit) throw fail('A documentation preview input exceeds its size limit.');
    return bytes;
  } finally {await handle.close();}
}

function sourceLink(data, source) {
  const root=`${data.project.repository}/blob/${data.source.commit}`;
  return source?.path ? `${root}/${source.path.split('/').map(encodeURIComponent).join('/')}${source.line?`#L${source.line}`:''}` : `${data.project.repository}/tree/${data.source.commit}`;
}

const css = `:root{color-scheme:dark;--bg:#0b0707;--fg:#eee3df;--muted:#b7aaa5;--line:#493333;--accent:#ff817a}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.75 ui-monospace,SFMono-Regular,Consolas,monospace}a{color:var(--accent);text-underline-offset:.25em}a:focus-visible{outline:2px solid var(--accent);outline-offset:4px}.draft{padding:14px 5vw;border-bottom:1px solid #b7514a;background:#341818;font-size:.8rem}.draft strong{letter-spacing:.12em}.masthead{padding:32px 5vw;border-bottom:1px solid var(--line)}.masthead>a{font-size:1.3rem;letter-spacing:-.06em;text-decoration:none;color:var(--fg)}.masthead p{margin:.4em 0 0;color:var(--muted);overflow-wrap:anywhere}.layout{display:grid;grid-template-columns:minmax(210px,285px) minmax(0,900px);gap:55px;max-width:1400px;margin:auto;padding:40px 5vw}nav{font-size:.83rem}nav ul{list-style:none;padding:0}nav li{margin:.55em 0}nav a{overflow-wrap:anywhere}nav .label,.eyebrow{color:var(--muted);font-size:.72rem;letter-spacing:.1em;text-transform:uppercase}main{min-width:0}h1{font-size:clamp(2rem,5vw,3.1rem);line-height:1.15;letter-spacing:-.06em;margin:.35em 0 .7em}h2,h3,h4{line-height:1.35;scroll-margin-top:24px}h2{margin-top:2em}p,li{overflow-wrap:anywhere}pre{overflow:auto;padding:20px;border:1px solid var(--line);background:#140c0c;line-height:1.6}code{font:inherit;font-size:.88em}p code,li code,td code{color:#ffb2a7}blockquote{margin:1.8em 0;border-left:2px solid var(--accent);padding:0 1.5em;color:var(--muted)}table{display:block;overflow:auto;border-collapse:collapse;width:100%;font-size:.85rem}th,td{border:1px solid var(--line);padding:10px;text-align:left;vertical-align:top}.revision{color:var(--muted);font-size:.75rem;overflow-wrap:anywhere}.symbol{border-top:1px solid var(--line);padding:24px 0;scroll-margin-top:24px}.symbol h2{margin:.3em 0;font-size:1.4rem}.symbol .qualified{font-size:.75rem;color:var(--muted);overflow-wrap:anywhere}.policy{border-left:2px solid var(--accent);padding-left:15px;margin:1.5em 0}.symbol-index{columns:2;column-gap:25px;padding-left:1.3em}.symbol-index li{break-inside:avoid;font-size:.8rem;margin:.45em 0}.docs-math{overflow:auto;padding:10px 0}.katex{font-size:1.1em}.math-error{color:#ffc1b9}footer{border-top:1px solid var(--line);padding:25px 5vw;color:var(--muted);font-size:.75rem}.skip{position:absolute;left:10px;top:-100px}.skip:focus{top:10px;background:var(--bg);padding:10px;z-index:2}@media(max-width:760px){.layout{display:block;padding-top:24px}nav{border-bottom:1px solid var(--line);padding-bottom:20px;margin-bottom:30px}.symbol-index{columns:1}}@media print{:root{color-scheme:light;--bg:white;--fg:black;--muted:#444;--line:#aaa;--accent:#801515}.layout{display:block}nav{display:none}pre{white-space:pre-wrap;background:white}.draft{color:black;background:#eee}}`;

function renderer(data, filename) {
  const guideFiles=new Map(data.pages.map(page => [page.slug,`guides/${page.slug}.html`]));
  const symbolIds=new Set(data.api.symbols.map(symbol => symbol.id));
  const relative = target => path.posix.relative(path.posix.dirname(filename),target) || path.posix.basename(target);
  const apiHref = id => symbolIds.has(id) ? `${relative('api.html')}#${previewSymbolAnchor(id)}` : `${relative('api.html')}#api-index`;
  const mapLink = attributes => {
    const symbol=attributes['data-doc-symbol'];
    if (symbol) return apiHref(symbol);
    const href=attributes.href || '#';
    if (href.startsWith('?symbol=')) {try {return apiHref(new URLSearchParams(href.slice(1)).get('symbol'));} catch {return '#';}}
    if (!href.startsWith('/')) return href;
    let url;
    try {url=new URL(href,'https://preview.invalid');} catch {return '#';}
    const prefix=`/docs/${data.project.id}/${data.version}`;
    if (url.pathname===prefix || url.pathname===prefix+'/') return relative('index.html');
    if (url.pathname===prefix+'/api') return url.searchParams.has('symbol') ? apiHref(url.searchParams.get('symbol')) : `${relative('api.html')}#api-index`;
    const slug=url.pathname.startsWith(prefix+'/') ? url.pathname.slice(prefix.length+1) : '';
    if (guideFiles.has(slug)) return relative(guideFiles.get(slug))+url.hash;
    // A preview never depends on another page being present on a live host.
    return '#';
  };
  const markdown = (text, sourcePath) => sanitizeHtml(renderDocumentationMarkdown(text,{...data,sourcePath}),{
    // The upstream renderer already escapes author HTML and sanitizes its exact
    // Markdown/KaTeX vocabulary. This pass only rewrites those safe links.
    allowedTags:markdownTags,allowedAttributes:false,allowedSchemes:['https','http','mailto'],allowProtocolRelative:false,
    transformTags:{a:(_tag,attributes) => {
      const {'data-doc-symbol':_symbol,...rest}=attributes;
      return {tagName:'a',attribs:{...rest,href:mapLink(attributes)}};
    }},
  });
  const revision = source => `<p class="revision">Source <code>${escape(data.source.commit)}</code> · <a href="${escape(sourceLink(data,source))}" target="_blank" rel="noopener noreferrer">${escape(source?.path ? `${source.path}${source.line?':'+source.line:''}` : 'View this revision')} ↗</a></p>`;
  const shell = (title,body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'self' 'unsafe-inline'; font-src 'self'; img-src data:; object-src 'none'; base-uri 'none'; form-action 'none'"><title>${escape(title)} — ${escape(data.project.name)} draft</title><link rel="stylesheet" href="${relative('assets/preview.css')}"><link rel="stylesheet" href="${relative('assets/katex.min.css')}"></head><body><a class="skip" href="#content">Skip to documentation</a><div class="draft"><strong>DRAFT / UNMERGED DOCUMENTATION</strong> · Review artifact only. This is not the published documentation.</div><header class="masthead"><a href="${relative('index.html')}">pustka / ${escape(data.project.name)}</a><p>${escape(data.version)} · exact source <code>${escape(data.source.commit)}</code></p></header><div class="layout"><nav aria-label="Draft documentation"><p class="label">The package</p><ul><li><a href="${relative('index.html')}">Overview</a></li><li><a href="${relative('api.html')}#api-index">API reference (${data.api.symbols.length})</a></li></ul><p class="label">Guides</p><ul>${data.pages.map(page=>`<li><a href="${relative(guideFiles.get(page.slug))}">${escape(page.title)}</a></li>`).join('')}</ul><p class="label">Review record</p><a href="${relative('preview-manifest.json')}">Package hash and file manifest</a></nav><main id="content"><p class="eyebrow">Review the words beside the code</p>${body}</main></div><footer>Static Pustka documentation preview · no JavaScript, tracking or remote assets · generated from a validated package.</footer></body></html>`;
  return {relative,apiHref,markdown,revision,shell};
}

function appendSymbolHtml(symbol, render, append) {
  const md = text => render.markdown(text || '',symbol.source.path);
  const support=symbol.stability || 'unclassified';
  append(`<article class="symbol" id="${previewSymbolAnchor(symbol.id)}"><p class="eyebrow">${escape(symbol.kind)}${symbol.deprecated?' · deprecated':''}</p><h2>${escape(symbol.name)}</h2><p class="qualified">${escape(symbol.qualifiedName)}</p>${render.revision(symbol.source)}<pre><code>${escape(symbol.signature)}</code></pre><aside class="policy"><strong>Support policy: ${escape(support)}</strong>${symbol.stabilityNote?`<p>${escape(symbol.stabilityNote)}</p>`:''}${!symbol.stability?'<p>No support policy is declared for this symbol.</p>':''}</aside>`);
  if (symbol.deprecated) {
    append('<aside class="policy"><strong>Deprecated in source</strong>');
    append(md(symbol.deprecation || 'No deprecation explanation is provided.'));append('</aside>');
  }
  append(md(symbol.description || symbol.summary || 'No description is provided in the source.'));
  if (symbol.parameters.length) {
    append('<h3>Parameters</h3><table><thead><tr><th>Name / type</th><th>Description</th></tr></thead><tbody>');
    for (const parameter of symbol.parameters) {
      append(`<tr><td><code>${escape(parameter.name)}</code><br><code>${escape(parameter.type)}</code></td><td>`);
      append(md(parameter.description || 'No parameter description is provided.'));append('</td></tr>');
    }
    append('</tbody></table>');
  }
  if (symbol.returns && symbol.returns.type!=='void') {
    append(`<h3>Returns</h3><p><code>${escape(symbol.returns.type)}</code></p>`);append(md(symbol.returns.description));
  }
  if (symbol.throws.length) {
    append('<h3>Throws</h3>');
    for (const exception of symbol.throws) {append(`<p><code>${escape(exception.type)}</code></p>`);append(md(exception.description));}
  }
  if (symbol.since) append(`<p>Since <code>${escape(symbol.since)}</code></p>`);
  append('</article>');
}

/** Render data only: no project code, remote fetches or publishing credentials. */
export async function generateDocumentationPreview({file,outDir,maxOutputBytes=MAX_PREVIEW_BYTES}={}) {
  if (!file || !outDir) throw fail('A documentation package file and preview output directory are required.');
  if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes<1 || maxOutputBytes>MAX_PREVIEW_BYTES) throw fail('The preview output limit must be between 1 byte and 64 MiB.');
  const input=await readBounded(path.resolve(file),MAX_PACKAGE_BYTES);
  let data;
  try {data=validateDocumentationPackage(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(input)));}
  catch {throw fail('The documentation preview requires a valid UTF-8 schema version 1 package.');}
  const output=path.resolve(outDir), parent=path.dirname(output);
  if (output===path.parse(output).root) throw fail('The preview output must be a new or empty directory.');
  await noLinks(parent,{missing:true});await mkdir(parent,{recursive:true});await noLinks(parent);
  const parentReal=await realpath(parent);
  const verifyOutput = async () => {
    await noLinks(output,{missing:true});
    if (await realpath(parent)!==parentReal) throw fail('The preview output parent changed.');
    try {const info=await lstat(output);if (!info.isDirectory() || (await readdir(output)).length) throw fail('The preview output must be a new or empty directory; existing files are never overwritten.');return true;}
    catch (error) {if (error.code==='ENOENT') return false;throw error;}
  };
  await verifyOutput();
  const staging=await mkdtemp(path.join(parent,'.pustka-docs-preview-'));
  const files=[];let bytesWritten=0,completed=false;
  const write = async (name,content,{html=false,asset=false}={}) => {
    const destination=path.resolve(staging,name);
    if (!within(staging,destination) || name.includes('\\')) throw fail('The preview file path leaves its output directory.');
    const bytes=Buffer.isBuffer(content)?content:Buffer.from(content);
    if ((html && bytes.length>MAX_HTML_BYTES) || (asset && bytes.length>MAX_ASSET_BYTES) || bytesWritten+bytes.length>maxOutputBytes) throw fail('The rendered documentation preview exceeds its output size limit.');
    await mkdir(path.dirname(destination),{recursive:true});
    await writeFile(destination,bytes,{flag:'wx'});
    bytesWritten+=bytes.length;files.push({path:name,bytes:bytes.length,sha256:digest(bytes)});
  };
  try {
    await write('assets/preview.css',css,{asset:true});
    const katexDir=fileURLToPath(new URL('../node_modules/katex/dist/',import.meta.url));
    await write('assets/katex.min.css',await readBounded(path.join(katexDir,'katex.min.css'),MAX_ASSET_BYTES),{asset:true});
    const fontDir=path.join(katexDir,'fonts');await noLinks(fontDir);
    const fonts=(await readdir(fontDir)).filter(name=>/^KaTeX_[A-Za-z0-9-]+\.(woff2?|ttf)$/.test(name)).sort();
    if (!fonts.length || fonts.length>100) throw fail('The local math font bundle is unavailable or exceeds its file limit.');
    for (const name of fonts) await write(`assets/fonts/${name}`,await readBounded(path.join(fontDir,name),MAX_ASSET_BYTES),{asset:true});
    const home=renderer(data,'index.html');
    await write('index.html',home.shell(`${data.project.name} documentation`,`<h1>${escape(data.project.name)}, in review.</h1><p>Guides and source-authored API documentation from one exact revision. Use this draft to review a change before it is merged.</p>${home.revision()}<h2>Read a guide</h2><ul>${data.pages.map(page=>`<li><a href="guides/${page.slug}.html">${escape(page.title)}</a></li>`).join('')}</ul><h2>Inspect the API</h2><p><a href="api.html#api-index">${data.api.symbols.length} documented symbols →</a></p>`),{html:true});
    for (const page of data.pages) {
      const name=`guides/${page.slug}.html`,render=renderer(data,name);
      await write(name,render.shell(page.title,`<h1>${escape(page.title)}</h1>${render.revision({path:page.sourcePath})}${render.markdown(page.markdown,page.sourcePath)}`),{html:true});
    }
    const api=renderer(data,'api.html');
    const parts=[],shellBytes=Buffer.byteLength(api.shell('API reference',''));
    let apiBytes=shellBytes;
    const append = fragment => {
      const nextBytes=apiBytes+Buffer.byteLength(fragment);
      if (nextBytes>MAX_HTML_BYTES || bytesWritten+nextBytes>maxOutputBytes) throw fail('The rendered documentation preview exceeds its output size limit.');
      apiBytes=nextBytes;parts.push(fragment);
    };
    // Account for navigation, shell and every prose field before retaining it.
    // No complete symbol or unbounded parameter/exception array is joined first.
    append(`<h1>API reference.</h1>${api.revision()}<p>Descriptions and signatures extracted from source. Support labels describe authored policy; this draft does not establish binary or runtime compatibility.</p><h2 id="api-index">All symbols</h2><ul class="symbol-index">`);
    for (const symbol of data.api.symbols) append(`<li><a href="#${previewSymbolAnchor(symbol.id)}">${escape(symbol.qualifiedName || symbol.name)}</a> <small>${escape(symbol.kind)}</small></li>`);
    append('</ul>');
    for (const symbol of data.api.symbols) appendSymbolHtml(symbol,api,append);
    await write('api.html',api.shell('API reference',parts.join('')),{html:true});
    const manifest={schemaVersion:1,draft:true,project:data.project,version:data.version,source:data.source,generatedAt:data.generatedAt,packageSha256:digest(input),files:[...files].sort((a,b)=>a.path.localeCompare(b.path))};
    await write('preview-manifest.json',JSON.stringify(manifest,null,2)+'\n');
    if (await verifyOutput()) await rmdir(output); // Only an empty, verified directory.
    await rename(staging,output);completed=true;
    return {project:data.project.id,version:data.version,commit:data.source.commit,packageSha256:manifest.packageSha256,files:files.length,bytes:bytesWritten,index:path.join(output,'index.html')};
  } finally {
    // This directory was created by this invocation, never an operator's target.
    if (!completed && within(parent,staging) && path.basename(staging).startsWith('.pustka-docs-preview-')) {
      const info=await lstat(staging).catch(()=>null);
      if (info?.isDirectory() && !info.isSymbolicLink()) await rm(staging,{recursive:true,force:true});
    }
  }
}

async function main() {
  const {values}=parseArgs({options:{file:{type:'string'},out:{type:'string'}},strict:true,allowPositionals:false});
  if (!values.file || !values.out) throw fail('Usage: node scripts/preview-docs.mjs --file <package.json> --out <new-or-empty-directory>');
  const result=await generateDocumentationPreview({file:values.file,outDir:values.out});
  console.log(`Rendered draft documentation for ${result.project} ${result.version} at ${result.commit} (${result.files} files, ${result.bytes} bytes).`);
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  main().catch(error=>{console.error(error.message);process.exitCode=1;});
}

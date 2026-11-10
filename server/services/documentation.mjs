import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, lstat, realpath, readdir, readFile, writeFile, rename, unlink } from 'node:fs/promises';
import path from 'node:path';
import { Marked } from 'marked';
import GithubSlugger from 'github-slugger';
import katex from 'katex';
import sanitizeHtml from 'sanitize-html';
import { z } from 'zod';
import { buildDocumentationSearchIndex, searchDocumentationIndex } from './documentation-search.mjs';

export const MAX_PACKAGE_BYTES = 8 * 1024 * 1024;
export const isProjectId = value => typeof value === 'string' && /^[a-z][a-z0-9-]{0,39}$/.test(value);
export const isDocsVersion = value => typeof value === 'string' && (value === 'main' || /^v?\d{1,5}\.\d{1,5}\.\d{1,5}(?:-[A-Za-z0-9][A-Za-z0-9.-]{0,49})?$/.test(value));
export const isSourcePath = value => typeof value === 'string' && value.length > 0 && value.length <= 500 && !/[\\\u0000-\u001f\u007f:#?%]/.test(value) && !path.posix.isAbsolute(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const error = (status, code, message) => Object.assign(new Error(message), {status, code, expose:true});
const escapeHtml = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const text = (max = 65536) => z.string().max(max).refine(value => !value.includes('\0'));
const optionalText = max => text(max).default('');
const sourcePath = z.string().refine(isSourcePath);
const projectSchema = z.object({id:z.string().refine(isProjectId),name:text(80).min(1),repository:z.string().max(200).regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)}).strict();
const describe = z.object({name:text(150).min(1),type:text(1500),description:optionalText(32768)}).strict();
const returnSchema = z.object({type:text(1500),description:optionalText(32768)}).strict();
const throwsSchema = z.object({type:text(1500),description:optionalText(32768)}).strict();
const symbolSchema = z.object({
  id:text(2000).min(1),kind:z.enum(['class','interface','enum','record','annotation','constructor','method','field','enum-constant']),
  name:text(200).min(1),qualifiedName:text(2000),owner:optionalText(1500),signature:text(4000),
  summary:optionalText(16384),description:optionalText(65536),parameters:z.array(describe).max(200).default([]),
  returns:returnSchema.nullable().default(null),throws:z.array(throwsSchema).max(100).default([]),
  since:optionalText(2000),deprecated:z.boolean().default(false),deprecation:optionalText(16384),
  source:z.object({path:sourcePath,line:z.number().int().min(1).max(10000000)}).strict(),
}).strict();
export const apiArtifactSchema = z.object({schemaVersion:z.literal(1),language:z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),generator:text(100).min(1),symbols:z.array(symbolSchema).max(12000)}).strict();
const pageSchema = z.object({slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).refine(value=>value!=='api'),title:text(200).min(1),kind:z.literal('guide'),markdown:text(262144),sourcePath}).strict();
const packageSchema = z.object({
  schemaVersion:z.literal(1),project:projectSchema,version:z.string().refine(isDocsVersion),
  source:z.object({commit:z.string().regex(/^[a-f0-9]{40}$/),ref:text(200).min(1)}).strict(),
  generatedAt:z.string().datetime({offset:true}),pages:z.array(pageSchema).max(150),api:apiArtifactSchema,
}).strict();

export function validateDocumentationPackage(input) {
  const result = packageSchema.safeParse(input);
  if (!result.success) throw error(400,'INVALID_DOCS_PACKAGE','The documentation package does not match schema version 1.');
  const data = result.data;
  if (data.source.ref !== (data.version === 'main' ? 'refs/heads/main' : `refs/tags/${data.version}`)) throw error(400,'INVALID_DOCS_REF','The package version does not match its source branch or tag.');
  if (!data.pages.length && !data.api.symbols.length) throw error(400,'EMPTY_DOCS_PACKAGE','The package contains no documentation.');
  if (new Set(data.pages.map(page=>page.slug)).size !== data.pages.length || new Set(data.api.symbols.map(symbol=>symbol.id)).size !== data.api.symbols.length) throw error(400,'DUPLICATE_DOCS_ID','Guide slugs and API symbol identifiers must be unique.');
  if (Buffer.byteLength(JSON.stringify(data)) > MAX_PACKAGE_BYTES) throw error(413,'DOCS_PACKAGE_TOO_LARGE','The documentation package exceeds 8 MiB.');
  return data;
}

const mathTags = ['math','semantics','mrow','mi','mo','mn','msup','msub','mfrac','msqrt','mroot','mtable','mtr','mtd','mspace','mstyle','annotation','mpadded','mphantom','menclose','mover','munder','munderover','msubsup','mtext','svg','path','line','rect','polygon','polyline'];
function safeLink(href, context) {
  if (typeof href !== 'string' || href.length > 3000 || /[\u0000-\u0020\u007f]/.test(href)) return {href:'#'};
  if (href.startsWith('javadoc:')) {
    let symbol;
    try { symbol=decodeURIComponent(href.slice(8)); } catch { symbol=href.slice(8); }
    if (!symbol || symbol.length > 2000 || /[\u0000-\u001f\u007f]/.test(symbol)) return {href:'#'};
    return {href:`?symbol=${encodeURIComponent(symbol)}`,symbol};
  }
  if (href.startsWith('#')) return {href};
  if (/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href)) {
    try {const url=new URL(href);if(['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password)return {href:url.href,external:true};}catch{}
    return {href:'#'};
  }
  if (href.startsWith('//') || href.includes('\\')) return {href:'#'};
  // Root-relative documentation routes are same-origin, but never authority URLs.
  if (href.startsWith('/')) return {href};
  const [relative, fragment=''] = href.split('#',2);
  let decoded;
  try { decoded=decodeURIComponent(relative); } catch { return {href:'#'}; }
  const candidate=path.posix.normalize(path.posix.join(path.posix.dirname(context.sourcePath || 'README.md'),decoded));
  if (!isSourcePath(candidate)) return {href:'#'};
  const guide=context.pages?.find(page=>page.sourcePath===candidate);
  if(guide&&context.project?.id&&context.version)return {href:`/docs/${context.project.id}/${context.version}/${guide.slug}${fragment?'#'+encodeURIComponent(fragment):''}`};
  if(context.project?.repository&&context.source?.commit)return {href:`${context.project.repository}/blob/${context.source.commit}/${candidate.split('/').map(encodeURIComponent).join('/')}${fragment?'#'+encodeURIComponent(fragment):''}`,external:true};
  return {href:'#'};
}

/** Renders author text only; uploaded HTML is always escaped before sanitization. */
export function renderDocumentationMarkdown(markdown, context = {}) {
  if(typeof markdown!=='string'||markdown.length>262144)throw error(413,'DOCS_PAGE_TOO_LARGE','This documentation page exceeds the rendering limit.');
  const slugger=new GithubSlugger();
  let mathCount=0,mathBytes=0;
  const renderMath=(source,displayMode)=>{
    const failure=()=>`<span class="math-error" role="note">${escapeHtml((displayMode?'$$':'$')+source+(displayMode?'$$':'$'))} <span>(math could not be rendered)</span></span>`;
    if(source.length>2048||++mathCount>64)return failure();
    try{
      const html=katex.renderToString(source,{displayMode,trust:false,throwOnError:true,maxExpand:500,maxSize:10,strict:'error',output:'htmlAndMathml'});
      if(html.length>65536||(mathBytes+=html.length)>262144)return failure();
      return html;
    }catch{return failure();}
  };
  const marked=new Marked({gfm:true,breaks:false,renderer:{
    html({text:raw}){return escapeHtml(raw);},
    heading({tokens,depth,text:raw}){return `<h${Math.min(depth+1,6)} id="${escapeHtml(slugger.slug(raw))}">${this.parser.parseInline(tokens)}</h${Math.min(depth+1,6)}>\n`;},
    code({text:raw,lang}){const language=/^[A-Za-z0-9-]{1,30}$/.test(lang||'')?` class="language-${escapeHtml(lang)}"`:'';return `<pre><code${language}>${escapeHtml(raw)}</code></pre>\n`;},
    link({href,title,tokens}){const target=safeLink(href,context);return `<a href="${escapeHtml(target.href)}"${target.external?' target="_blank" rel="noopener noreferrer"':''}${target.symbol?` data-doc-symbol="${escapeHtml(target.symbol)}"`:''}${title?` title="${escapeHtml(title)}"`:''}>${this.parser.parseInline(tokens)}</a>`;},
    image({href,text:alt}){const target=safeLink(href,context);return `<a href="${escapeHtml(target.href)}"${target.external?' target="_blank" rel="noopener noreferrer"':''}>${escapeHtml(alt||'Image')}</a>`;},
  },extensions:[
    {name:'displayMath',level:'block',start:source=>source.indexOf('$$'),tokenizer(source){const match=/^\$\$[ \t]*\n?([\s\S]+?)\n?\$\$(?:[ \t]*(?:\n|$))/.exec(source);if(match)return {type:'displayMath',raw:match[0],text:match[1]};},renderer:token=>`<div class="docs-math">${renderMath(token.text,true)}</div>\n`},
    {name:'inlineMath',level:'inline',start:source=>source.indexOf('$'),tokenizer(source){const match=/^\$(?!\$)((?:\\.|[^$\n\\])+?)\$(?!\$)/.exec(source);if(match)return {type:'inlineMath',raw:match[0],text:match[1]};},renderer:token=>renderMath(token.text,false)},
  ]});
  const rendered=marked.parse(markdown);
  if(rendered.length>2*1024*1024)throw error(413,'DOCS_PAGE_TOO_LARGE','This documentation page exceeds the rendering limit.');
  return sanitizeHtml(rendered,{
    allowedTags:[...new Set([...sanitizeHtml.defaults.allowedTags,...mathTags,'span','div'])],
    allowedAttributes:{...sanitizeHtml.defaults.allowedAttributes,'*':['class','style','role','aria-hidden'],a:['href','title','target','rel','data-doc-symbol'],h2:['id'],h3:['id'],h4:['id'],h5:['id'],h6:['id'],math:['xmlns','display'],annotation:['encoding'],svg:['width','height','viewbox','preserveaspectratio','xmlns'],path:['d','fill','stroke','stroke-width'],line:['x1','x2','y1','y2'],rect:['x','y','width','height'],polygon:['points'],polyline:['points'],mo:['fence','stretchy','symmetric','minsize','maxsize'],mspace:['width','height','depth'],mstyle:['mathcolor','mathsize','displaystyle','scriptlevel'],mtable:['columnalign','columnspacing','rowspacing'],mtd:['columnalign','rowspan','columnspan'],mpadded:['width','height','depth','lspace','voffset']},
    allowedSchemes:['http','https','mailto'],allowProtocolRelative:false,
    transformTags:{a:(tagName,attributes)=>({tagName,attribs:attributes.target==='_blank'?{...attributes,rel:'noopener noreferrer'}:attributes})},
  });
}

function projectRegistry(projects) {
  if(!Array.isArray(projects)||projects.length>50)throw new Error('A project registry is required.');
  const map=new Map();
  for(const item of projects){const parsed=projectSchema.safeParse({id:item.id,name:item.name,repository:item.repository});if(!parsed.success||map.has(item.id))throw new Error('Invalid documentation project registry.');map.set(item.id,parsed.data);}
  return map;
}
function digestPackage(data){const {generatedAt,...stable}=data;return createHash('sha256').update(JSON.stringify(stable)).digest('hex');}
const fileIdentity=info=>[info.dev,info.ino,info.size,info.mtimeNs,info.ctimeNs].join(':');
function freezeModel(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freezeModel(item);Object.freeze(value);}return value;}
function compareVersions(a,b){
  if(a.version==='main')return 1;if(b.version==='main')return -1;
  const parse=value=>value.replace(/^v/,'').split('-');const [av,ap]=parse(a.version),[bv,bp]=parse(b.version);
  const an=av.split('.').map(Number),bn=bv.split('.').map(Number);for(let i=0;i<3;i++)if(an[i]!==bn[i])return bn[i]-an[i];
  if(!ap&&bp)return -1;if(ap&&!bp)return 1;return b.version.localeCompare(a.version);
}

export function createDocumentationService({dataDir,projects,keys={},now=Date.now}={}) {
  if(!dataDir)throw new Error('A documentation data directory is required.');
  const registry=projectRegistry(projects);
  if(!keys||typeof keys!=='object'||Array.isArray(keys))throw new Error('Documentation publication keys must be a project map.');
  for(const [id,key]of Object.entries(keys))if(!registry.has(id)||typeof key!=='string'||key.length<32||key.length>512)throw new Error('Each documentation publication key must belong to a registered project and contain at least 32 characters.');
  const root=path.resolve(dataDir,'documentation');const queues=new Map();const rendered=new Map();
  const searchIndexes=new Map();let searchBytes=0;
  function searchIndex(record){
    const key=`${record.package.project.id}/${record.package.version}/${record.digest}`;
    const cached=searchIndexes.get(key);
    if(cached){searchIndexes.delete(key);searchIndexes.set(key,cached);return cached.entries;}
    const entries=buildDocumentationSearchIndex(record.package),bytes=Buffer.byteLength(JSON.stringify(entries));
    if(bytes<=32*1024*1024){
      while(searchIndexes.size>=4||searchBytes+bytes>32*1024*1024){const oldest=searchIndexes.keys().next().value;searchBytes-=searchIndexes.get(oldest).bytes;searchIndexes.delete(oldest);}
      searchIndexes.set(key,{entries,bytes});searchBytes+=bytes;
    }
    return entries;
  }
  // Historical packages can be large: retain at most four validated snapshots and 32 MiB of serialized input.
  const records=new Map(),recordLoads=new Map(),versionMetadata=new Map(),versionLoads=new Map(),metadataRevisions=new Map(),snapshotMetadata=new Map();let recordBytes=0;
  function forgetRecord(file){const cached=records.get(file);if(cached){recordBytes-=cached.bytes;records.delete(file);}}
  function rememberRecord(file,identity,record,bytes){
    forgetRecord(file);
    while(records.size>=4||recordBytes+bytes>32*1024*1024)forgetRecord(records.keys().next().value);
    records.set(file,{identity,record,bytes});recordBytes+=bytes;return record;
  }
  function invalidateProject(id){versionMetadata.delete(id);metadataRevisions.set(id,(metadataRevisions.get(id)||0)+1);}
  function rememberSnapshotMetadata(id,version,identity,record){
    let entries=snapshotMetadata.get(id);if(!entries){entries=new Map();snapshotMetadata.set(id,entries);}
    entries.delete(version);if(entries.size>=100)entries.delete(entries.keys().next().value);
    const value=freezeModel(meta(record));entries.set(version,{identity,value});return value;
  }
  const findProject=id=>{const entry=registry.get(id);if(!entry)throw error(404,'DOCS_PROJECT_NOT_FOUND','This documentation project is not registered.');return entry;};
  const filename=(id,version)=>{findProject(id);if(!isDocsVersion(version))throw error(404,'DOCS_VERSION_NOT_FOUND','This documentation version is not available.');return path.join(root,id,`${version}.json`);};
  const context=(record,sourcePath)=>({...record.package,sourcePath});
  async function verifyStoredDirectory(id){
    const directory=path.join(root,id);
    const [rootInfo,directoryInfo]=await Promise.all([lstat(root,{bigint:true}),lstat(directory,{bigint:true})]);
    if(rootInfo.isSymbolicLink()||!rootInfo.isDirectory()||directoryInfo.isSymbolicLink()||!directoryInfo.isDirectory()||!((await realpath(directory)).startsWith((await realpath(root))+path.sep)))throw error(503,'DOCS_STORAGE_UNAVAILABLE','Documentation storage is unavailable.');
    return {directory,identity:fileIdentity(directoryInfo)};
  }
  async function safeDirectory(id){
    try{
      await mkdir(root,{recursive:true,mode:0o700});
      if((await lstat(root)).isSymbolicLink())throw new Error('Linked documentation storage.');
      await mkdir(path.join(root,id),{recursive:true,mode:0o700});
      return (await verifyStoredDirectory(id)).directory;
    }catch{throw error(503,'DOCS_STORAGE_UNAVAILABLE','Documentation storage is unavailable.');}
  }
  async function readRecord(id,version,missingOk=false){
    const file=filename(id,version);
    try{
      await verifyStoredDirectory(id);
      const info=await lstat(file,{bigint:true});if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_PACKAGE_BYTES+4096)throw new Error('Invalid stored snapshot.');
      const identity=fileIdentity(info),cached=records.get(file);
      if(cached?.identity===identity){records.delete(file);records.set(file,cached);rememberSnapshotMetadata(id,version,identity,cached.record);return cached.record;}
      forgetRecord(file);
      const pending=recordLoads.get(file);if(pending?.identity===identity)return await pending.promise;
      const promise=(async()=>{
        const record=JSON.parse(await readFile(file,'utf8'));const data=validateDocumentationPackage(record.package);
        if(data.project.id!==id||data.version!==version||data.project.repository!==findProject(id).repository||record.digest!==digestPackage(data)||!Number.isFinite(Date.parse(record.publishedAt))||!Number.isSafeInteger(record.issuedAt))throw new Error('Invalid stored snapshot.');
        const validated=freezeModel({package:data,publishedAt:record.publishedAt,issuedAt:record.issuedAt,digest:record.digest});
        rememberSnapshotMetadata(id,version,identity,validated);
        return rememberRecord(file,identity,validated,Number(info.size));
      })();
      const load={identity,promise};recordLoads.set(file,load);promise.finally(()=>{if(recordLoads.get(file)===load)recordLoads.delete(file);}).catch(()=>{});
      return await promise;
    }catch(cause){forgetRecord(file);if(cause.code==='ENOENT'){if(missingOk)return null;throw error(404,'DOCS_VERSION_NOT_FOUND','This documentation version has not been published.');}if(cause.expose&&cause.status===404)throw cause;throw error(503,'DOCS_STORAGE_UNAVAILABLE','This documentation snapshot could not be loaded.');}
  }
  const meta=record=>({version:record.package.version,commit:record.package.source.commit,generatedAt:record.package.generatedAt,publishedAt:record.publishedAt,development:record.package.version==='main'});
  async function snapshotMeta(id,version){
    const info=await lstat(filename(id,version),{bigint:true});if(!info.isFile()||info.isSymbolicLink()||info.size>MAX_PACKAGE_BYTES+4096)throw new Error('Invalid stored snapshot.');
    const cached=snapshotMetadata.get(id)?.get(version);
    if(cached?.identity===fileIdentity(info))return cached.value;
    return meta(await readRecord(id,version));
  }
  async function listVersions(id){
    findProject(id);let directory;
    try{directory=await verifyStoredDirectory(id);}catch(cause){versionMetadata.delete(id);if(cause.code==='ENOENT')return [];throw error(503,'DOCS_STORAGE_UNAVAILABLE','Documentation versions could not be loaded.');}
    const revision=metadataRevisions.get(id)||0,cached=versionMetadata.get(id);
    if(cached?.identity===directory.identity&&cached.expiresAt>now())return cached.versions;
    const pending=versionLoads.get(id);if(pending?.identity===directory.identity&&pending.revision===revision)return pending.promise;
    const promise=(async()=>{
      let entries;try{entries=await readdir(directory.directory,{withFileTypes:true});}catch{throw error(503,'DOCS_STORAGE_UNAVAILABLE','Documentation versions could not be loaded.');}
      const versions=[];for(const entry of entries.slice(0,250)){if(!entry.isFile()||!entry.name.endsWith('.json'))continue;const version=entry.name.slice(0,-5);if(!isDocsVersion(version))continue;try{versions.push(await snapshotMeta(id,version));}catch{}}
      freezeModel(versions.sort(compareVersions));
      // A publication during the scan must not repopulate the cache with its previous index.
      if((metadataRevisions.get(id)||0)===revision&&(await verifyStoredDirectory(id)).identity===directory.identity)versionMetadata.set(id,{identity:directory.identity,expiresAt:now()+30000,versions});
      return versions;
    })();
    const load={identity:directory.identity,revision,promise};versionLoads.set(id,load);promise.finally(()=>{if(versionLoads.get(id)===load)versionLoads.delete(id);}).catch(()=>{});
    return promise;
  }
  async function versionIndex(id){const project=findProject(id),versions=await listVersions(id);return {project,versions,defaultVersion:versions.find(v=>!v.development&&!v.version.includes('-'))?.version||versions.find(v=>v.development)?.version||versions[0]?.version||null};}
  function renderCached(record,key,markdown,sourcePath){
    const cacheKey=`${record.package.project.id}/${record.package.version}/${record.digest}/${key}`;
    if(rendered.has(cacheKey))return rendered.get(cacheKey);
    const html=renderDocumentationMarkdown(markdown,context(record,sourcePath));
    if(html.length<524288){if(rendered.size>=64)rendered.delete(rendered.keys().next().value);rendered.set(cacheKey,html);}
    return html;
  }
  async function publish(rawBody,{project:id,timestamp,signature}={}){
    findProject(id);const key=Object.hasOwn(keys,id)?keys[id]:undefined;if(!key)throw error(503,'DOCS_PUBLISH_DISABLED','Publishing is not configured for this project.');
    if(!Buffer.isBuffer(rawBody)||rawBody.length>MAX_PACKAGE_BYTES)throw error(413,'DOCS_PACKAGE_TOO_LARGE','The documentation package exceeds 8 MiB.');
    if(typeof timestamp!=='string'||!/^\d{10,12}$/.test(timestamp)||Math.abs(now()/1000-Number(timestamp))>300||!/^sha256=[a-f0-9]{64}$/i.test(signature||''))throw error(401,'DOCS_SIGNATURE_INVALID','The publication signature or timestamp is invalid.');
    const expected=createHmac('sha256',key).update(timestamp+'.').update(rawBody).digest();const supplied=Buffer.from(signature.slice(7),'hex');
    if(supplied.length!==expected.length||!timingSafeEqual(supplied,expected))throw error(401,'DOCS_SIGNATURE_INVALID','The publication signature or timestamp is invalid.');
    let parsed;try{parsed=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(rawBody));}catch{throw error(400,'INVALID_DOCS_PACKAGE','The documentation package is not valid JSON.');}
    const data=validateDocumentationPackage(parsed);const trusted=findProject(id);
    if(Date.parse(data.generatedAt)>now()+300000)throw error(400,'INVALID_DOCS_TIMESTAMP','The documentation generation time is in the future.');
    if(data.project.id!==id||data.project.repository!==trusted.repository)throw error(403,'DOCS_PROJECT_MISMATCH','The package does not belong to the registered publication project.');
    data.project={...trusted};
    // Project serialization also makes the project-wide version capacity atomic.
    const queueKey=id;const previous=queues.get(queueKey)||Promise.resolve();
    const task=previous.catch(()=>{}).then(async()=>{
      const directory=await safeDirectory(id);const existing=await readRecord(id,data.version,true);const digest=digestPackage(data);
      if(existing?.digest===digest)return {published:true,idempotent:true,project:id,version:data.version,commit:existing.package.source.commit,publishedAt:existing.publishedAt};
      if(existing&&data.version!=='main')throw error(409,'DOCS_RELEASE_IMMUTABLE','Released documentation cannot be replaced. Publish a new version.');
      if(existing&&Number(timestamp)<=existing.issuedAt)throw error(409,'DOCS_PUBLICATION_STALE','A newer documentation publication is already available.');
      if(!existing&&(await listVersions(id)).length>=100)throw error(409,'DOCS_VERSION_CAPACITY','This project has reached its documentation version capacity.');
      const record={package:data,publishedAt:new Date(now()).toISOString(),issuedAt:Number(timestamp),digest};
      const temporary=path.join(directory,`.publish-${randomBytes(12).toString('hex')}.tmp`);
      try{await writeFile(temporary,JSON.stringify(record),{encoding:'utf8',mode:0o600,flag:'wx'});await rename(temporary,filename(id,data.version));}catch{throw error(503,'DOCS_STORAGE_UNAVAILABLE','The documentation package could not be published. The previous version is unchanged.');}finally{await unlink(temporary).catch(()=>{});}
      forgetRecord(filename(id,data.version));invalidateProject(id);
      return {published:true,idempotent:false,project:id,version:data.version,commit:data.source.commit,publishedAt:record.publishedAt};
    });
    queues.set(queueKey,task);task.finally(()=>{if(queues.get(queueKey)===task)queues.delete(queueKey);}).catch(()=>{});return task;
  }
  return {
    async search({query,project=null,version=null,limit=20}={}){
      if(typeof query!=='string'||query.trim().length<2||query.length>120||!Number.isInteger(limit)||limit<1||limit>30||(version&&!project))throw error(400,'INVALID_DOCS_SEARCH','Enter 2–120 characters and choose a project before choosing a version.');
      if(project)findProject(project);
      if(version&&!isDocsVersion(version))throw error(404,'DOCS_VERSION_NOT_FOUND','This documentation version is not available.');
      const results=[];let resolvedVersion=version;
      for(const id of project?[project]:registry.keys()){
        const selected=version||(await versionIndex(id)).defaultVersion;if(!selected)continue;
        if(project)resolvedVersion=selected;
        const record=await readRecord(id,selected);results.push(...searchDocumentationIndex(searchIndex(record),query,limit+1));
      }
      results.sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)||a.id.localeCompare(b.id));
      return {query:query.trim(),scope:{project,version:project?resolvedVersion:null},results:results.slice(0,limit),truncated:results.length>limit};
    },
    async projects(){const result=[];for(const project of registry.values()){const {versions,defaultVersion}=await versionIndex(project.id);result.push({...project,versions,defaultVersion});}return {projects:result};},
    versions:versionIndex,
    async manifest(id,version){const record=await readRecord(id,version),data=record.package;return {schemaVersion:1,project:data.project,version:data.version,source:data.source,generatedAt:data.generatedAt,publishedAt:record.publishedAt,pages:data.pages.map(({markdown,...page})=>page),api:{language:data.api.language,generator:data.api.generator,symbols:data.api.symbols.map(({id,kind,name,qualifiedName,owner,signature,summary,deprecated})=>({id,kind,name,qualifiedName,owner,signature,summary,deprecated}))}};},
    async page(id,version,slug){const record=await readRecord(id,version),page=record.package.pages.find(item=>item.slug===slug);if(!page)throw error(404,'DOCS_PAGE_NOT_FOUND','This documentation page does not exist.');return {page:{...page,html:renderCached(record,`page/${slug}`,page.markdown,page.sourcePath)},project:record.package.project,version,source:record.package.source};},
    async symbol(id,version,symbolId){const record=await readRecord(id,version),symbol=record.package.api.symbols.find(item=>item.id===symbolId);if(!symbol)throw error(404,'DOCS_SYMBOL_NOT_FOUND','This API symbol does not exist in this version.');const render=(label,markdown)=>renderCached(record,`api/${symbolId}/${label}`,markdown,symbol.source.path);return {symbol:{...symbol,summaryHtml:render('summary',symbol.summary),descriptionHtml:render('description',symbol.description),deprecationHtml:render('deprecation',symbol.deprecation),parameters:symbol.parameters.map((value,i)=>({...value,descriptionHtml:render(`parameter-${i}`,value.description)})),returns:symbol.returns?{...symbol.returns,descriptionHtml:render('returns',symbol.returns.description)}:null,throws:symbol.throws.map((value,i)=>({...value,descriptionHtml:render(`throws-${i}`,value.description)}))},project:record.package.project,version,source:record.package.source};},
    publish,
  };
}

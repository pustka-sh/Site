import { readFile,realpath,lstat,mkdir,writeFile,rename,unlink } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { randomBytes } from 'node:crypto';
import { Marked } from 'marked';
import GithubSlugger from 'github-slugger';
import { MAX_PACKAGE_BYTES,validateDocumentationPackage } from '../server/services/documentation.mjs';
import { documentationManifestSchema } from './package-docs.mjs';

const MAX_FILE_BYTES=4*1024*1024,MAX_READ_BYTES=64*1024*1024;
const normalize=text=>text.replace(/\r\n?/g,'\n').trimEnd();
const error=message=>Object.assign(new Error(message),{expose:true});
const safeText=value=>String(value).replace(/[\u0000-\u001f\u007f]/g,' ').slice(0,1500);
const belongs=(root,file)=>{const relative=path.relative(root,file);return !path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};

function parseMarkdown(markdown){
  const marked=new Marked({gfm:true}),tokens=marked.lexer(markdown),slugger=new GithubSlugger(),anchors=new Set(),blocks=[],links=[];
  let currentAnchor='';
  marked.walkTokens(tokens,token=>{
    if(token.type==='heading'){currentAnchor=slugger.slug(token.text);anchors.add(currentAnchor);}
    if(token.type==='code')blocks.push({anchor:currentAnchor,language:(token.lang||'').split(/\s+/,1)[0],text:token.text});
    if(token.type==='link'||token.type==='image')links.push({href:token.href,line:markdown.slice(0,Math.max(0,markdown.indexOf(token.raw))).split('\n').length});
  });
  return {anchors,links,blocks};
}

/** Checks data and source files only. Project JavaScript, commands and remote URLs are never executed. */
export async function checkDocumentation({root,packagePath,manifestPath,reportPath}={}){
  if(!root||!packagePath)throw error('A checkout root and documentation package are required.');
  const projectRoot=await realpath(path.resolve(root));
  if(!(await lstat(projectRoot)).isDirectory())throw error('The checkout root must be a directory.');
  let readBytes=0;
  const files=new Map(),markdownFiles=new Map();
  async function resolveLocal(file){
    const candidate=path.resolve(projectRoot,file);
    if(!belongs(projectRoot,candidate))throw error('The documentation target leaves the checkout.');
    const actual=await realpath(candidate);
    if(!belongs(projectRoot,actual))throw error('The documentation target links outside the checkout.');
    return actual;
  }
  async function textFile(file,limit=MAX_FILE_BYTES){
    const actual=await resolveLocal(file);
    if(!files.has(actual))files.set(actual,(async()=>{
      const info=await lstat(actual);
      if(!info.isFile()||info.size>limit||readBytes+info.size>MAX_READ_BYTES)throw error('The documentation input is not a regular file or exceeds a read limit.');
      readBytes+=info.size;
      const bytes=await readFile(actual);
      if(bytes.length>limit)throw error('The documentation input exceeds its read limit.');
      try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw error('Documentation text must be valid UTF-8.');}
    })());
    return files.get(actual);
  }
  async function markdownFile(file){
    const actual=await resolveLocal(file);
    if(!markdownFiles.has(actual))markdownFiles.set(actual,parseMarkdown(await textFile(actual)));
    return markdownFiles.get(actual);
  }
  let data;
  try{data=validateDocumentationPackage(JSON.parse(await textFile(packagePath,MAX_PACKAGE_BYTES)));}
  catch{throw error('The documentation package is missing, invalid, outside the checkout or exceeds its size limit.');}
  let manifest=null;
  if(manifestPath){
    try{manifest=documentationManifestSchema.parse(JSON.parse(await textFile(manifestPath,262144)));}
    catch{throw error('The documentation manifest is missing, invalid or outside the checkout.');}
    if(manifest.project.id!==data.project.id||manifest.project.repository!==data.project.repository)throw error('The manifest and package must identify the same project and repository.');
  }
  const errors=[],missingDocumentation=[],symbols=new Set(data.api.symbols.map(symbol=>symbol.id));
  const add=(code,file,message,line=null)=>{if(errors.length<1000)errors.push({code,file,line,message:safeText(message)});};
  let linkCount=0,sourceCount=0,documented=0,parameterCount=0,documentedParameters=0;
  async function checkLink(href,from,line){
    linkCount++;
    if(typeof href!=='string'||!href||href.length>3000||/[\u0000-\u0020\u007f\\]/.test(href)){add('INVALID_LINK',from,'Link destination is empty, malformed or contains control characters.',line);return;}
    if(href.startsWith('javadoc:')){
      let id;try{id=decodeURIComponent(href.slice(8));}catch{add('INVALID_SYMBOL_LINK',from,'The API symbol link is not correctly encoded.',line);return;}
      if(!symbols.has(id))add('MISSING_SYMBOL',from,`API symbol does not exist in this package: ${id}`,line);
      return;
    }
    if(/^[A-Za-z][A-Za-z0-9+.-]*:/.test(href)){
      try{const url=new URL(href);if(!['http:','https:','mailto:'].includes(url.protocol)||url.username||url.password)throw new Error();}
      catch{add('INVALID_LINK',from,'Link uses an unsupported scheme or embedded credentials.',line);}
      return;
    }
    if(href.startsWith('//')){add('INVALID_LINK',from,'Protocol-relative links are not supported.',line);return;}
    let target,fragment;
    try{
      const hash=href.indexOf('#'),rawPath=hash<0?href:href.slice(0,hash);
      fragment=hash<0?'':decodeURIComponent(href.slice(hash+1));
      const query=rawPath.indexOf('?');
      const local=decodeURIComponent(query<0?rawPath:rawPath.slice(0,query));
      if(/[\u0000-\u001f\u007f\\]/.test(local)||/[\u0000-\u001f\u007f]/.test(fragment))throw new Error();
      target=local?(local.startsWith('/')?path.resolve(projectRoot,'.'+local):path.resolve(projectRoot,path.dirname(from),local)):path.resolve(projectRoot,from);
      const actual=await resolveLocal(target),info=await lstat(actual);
      if(!info.isFile()&&!info.isDirectory())throw new Error();
      if(fragment){
        if(info.isDirectory())throw new Error('Anchors on directory links cannot be verified.');
        if(actual.toLowerCase().endsWith('.md')){
          if(!(await markdownFile(actual)).anchors.has(fragment))add('MISSING_ANCHOR',from,`Heading #${fragment} does not exist in ${path.relative(projectRoot,actual).replaceAll(path.sep,'/')}.`,line);
        }else if(/^L\d+(?:-L\d+)?$/.test(fragment)){
          const lines=(await textFile(actual)).split(/\r\n?|\n/).length;
          const positions=fragment.slice(1).split('-L').map(Number);
          if(positions.some(value=>value<1||value>lines)||positions.length===2&&positions[1]<positions[0])add('MISSING_SOURCE_LINE',from,`Source line #${fragment} is outside the target file.`,line);
        }else add('UNCHECKABLE_ANCHOR',from,`Only Markdown heading anchors or source #L line links can be checked locally: ${href}`,line);
      }
    }catch(cause){add('MISSING_LINK_TARGET',from,`Local link cannot resolve safely inside the checkout: ${href}`,line);}
  }
  for(const page of data.pages){
    try{
      const authored=await textFile(page.sourcePath);
      if(normalize(authored)!==normalize(page.markdown))add('STALE_GUIDE',page.sourcePath,'The packaged guide differs from the checkout. Rebuild the package.');
      const parsed=parseMarkdown(page.markdown);
      markdownFiles.set(await resolveLocal(page.sourcePath),parsed);
      for(const link of parsed.links)await checkLink(link.href,page.sourcePath,link.line);
    }catch{add('MISSING_GUIDE_SOURCE',page.sourcePath,'The guide source is missing, invalid or outside the checkout.');}
  }
  for(const symbol of data.api.symbols){
    sourceCount++;
    try{
      const source=await textFile(symbol.source.path);
      if(symbol.source.line>source.split(/\r\n?|\n/).length)add('MISSING_SOURCE_LINE',symbol.source.path,`API source line is outside the file: ${symbol.id}`,symbol.source.line);
    }catch{add('MISSING_API_SOURCE',symbol.source.path,`API source cannot be read safely: ${symbol.id}`,symbol.source.line);}
    const missing=[];
    const hasDescription=Boolean((symbol.description||symbol.summary).replace(/[`\s]/g,'').replaceAll('{@inheritDoc}',''));
    if(hasDescription)documented++;else missing.push('description');
    for(const parameter of symbol.parameters){parameterCount++;if(parameter.description.trim())documentedParameters++;else missing.push(`parameter:${parameter.name}`);}
    if(missing.length)missingDocumentation.push({id:symbol.id,source:symbol.source,missing});
    const comments=[symbol.description,symbol.deprecation,symbol.since,...symbol.parameters.map(value=>value.description),symbol.returns?.description,...symbol.throws.map(value=>value.description)];
    for(const comment of comments.filter(Boolean))for(const link of parseMarkdown(comment).links)await checkLink(link.href,symbol.source.path,symbol.source.line);
  }
  const examples=manifest?.checks?.examples||[];
  for(const example of examples){
    if(!data.pages.some(page=>page.sourcePath===example.guide)){add('UNCHECKED_EXAMPLE_GUIDE',example.guide,'The example guide must be included in the published package.');continue;}
    try{
      const code=await textFile(example.path),parsed=await markdownFile(example.guide);
      const blocks=parsed.blocks.filter(block=>block.anchor===example.anchor&&block.language==='java');
      if(blocks.length!==1||normalize(blocks[0].text)!==normalize(code))add('EXAMPLE_DRIFT',example.guide,`The Java example under #${example.anchor} must exactly match ${example.path}.`);
    }catch{add('MISSING_EXAMPLE_SOURCE',example.path,'The declared Java example cannot be read safely.');}
  }
  const report={schemaVersion:1,project:data.project.id,version:data.version,commit:data.source.commit,ok:errors.length===0,checks:{guides:data.pages.length,links:linkCount,sourceTargets:sourceCount,declaredExamples:examples.length},coverage:{symbols:data.api.symbols.length,documentedSymbols:documented,missingDescriptions:data.api.symbols.length-documented,parameters:parameterCount,documentedParameters,missingParameters:parameterCount-documentedParameters},errors,missingDocumentation};
  if(reportPath){
    const output=path.resolve(reportPath);await mkdir(path.dirname(output),{recursive:true});
    const temporary=path.join(path.dirname(output),`.docs-quality-${randomBytes(12).toString('hex')}.tmp`);
    try{await writeFile(temporary,JSON.stringify(report,null,2)+'\n',{encoding:'utf8',mode:0o600,flag:'wx'});await rename(temporary,output);}finally{await unlink(temporary).catch(()=>{});}
  }
  return report;
}

async function main(){
  const {values}=parseArgs({options:Object.fromEntries(['root','package','manifest','report'].map(name=>[name,{type:'string'}])),strict:true,allowPositionals:false});
  const report=await checkDocumentation({root:values.root,packagePath:values.package,manifestPath:values.manifest,reportPath:values.report});
  console.log(`Documentation checks: ${report.ok?'passed':'failed'}; ${report.checks.guides} guides, ${report.checks.links} links, ${report.checks.sourceTargets} API source targets, ${report.checks.declaredExamples} declared examples.`);
  console.log(`Authored descriptions: ${report.coverage.documentedSymbols}/${report.coverage.symbols} symbols; parameter descriptions: ${report.coverage.documentedParameters}/${report.coverage.parameters}. Missing comments are reported for contributors.`);
  for(const issue of report.errors.slice(0,20))console.error(`${safeText(issue.file)}${issue.line?':'+issue.line:''}: ${issue.code}: ${issue.message}`);
  if(!report.ok)process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(cause=>{console.error(cause.expose?safeText(cause.message):'Documentation checks could not complete. Check the package, manifest and checkout paths.');process.exitCode=1;});

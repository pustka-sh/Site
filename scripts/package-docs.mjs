import { readFile, realpath, lstat, mkdir, writeFile, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { MAX_PACKAGE_BYTES, apiArtifactSchema, isProjectId, isSourcePath, validateDocumentationPackage } from '../server/services/documentation.mjs';

const projectSchema=z.object({id:z.string().refine(isProjectId),name:z.string().min(1).max(80),repository:z.string().max(200).regex(/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/)}).strict();
export const documentationManifestSchema=z.object({
  schemaVersion:z.literal(1),project:projectSchema,
  guides:z.array(z.object({path:z.string().refine(isSourcePath).refine(value=>value.endsWith('.md')),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/).refine(value=>value!=='api'),title:z.string().min(1).max(200)}).strict()).max(150),
  api:z.object({language:z.string().regex(/^[a-z][a-z0-9-]{0,29}$/),artifact:z.string().refine(isSourcePath).refine(value=>value.endsWith('.json'))}).strict(),
  checks:z.object({examples:z.array(z.object({path:z.string().refine(isSourcePath).refine(value=>value.endsWith('.java')),guide:z.string().refine(isSourcePath).refine(value=>value.endsWith('.md')),anchor:z.string().min(1).max(200)}).strict()).max(100)}).strict().optional(),
}).strict();

function packagingError(message){return Object.assign(new Error(message),{code:'DOCS_PACKAGING_FAILED',expose:true});}
async function readBounded(file,limit){
  const info=await lstat(file);
  if(!info.isFile()||info.size>limit)throw packagingError(`The documentation input is not a regular file or exceeds its size limit: ${file}`);
  const bytes=await readFile(file);
  if(bytes.length>limit)throw packagingError(`The documentation input exceeds its size limit: ${file}`);
  try{return new TextDecoder('utf-8',{fatal:true}).decode(bytes);}catch{throw packagingError(`The documentation input must be UTF-8: ${file}`);}
}
async function containedFile(root,file){
  const resolved=path.resolve(file);const relative=path.relative(root,resolved);
  if(!relative||relative.startsWith('..'+path.sep)||relative==='..'||path.isAbsolute(relative))throw packagingError('Documentation inputs must remain within the project root.');
  const actual=await realpath(resolved);const actualRelative=path.relative(root,actual);
  if(!actualRelative||actualRelative==='..'||actualRelative.startsWith('..'+path.sep)||path.isAbsolute(actualRelative))throw packagingError('Documentation inputs must not link outside the project root.');
  return actual;
}

/** Combines source-adapter JSON and Markdown only; no project code is loaded or run. */
export async function packageDocumentation({manifestPath,root,apiPath,outPath,version,commit,ref,now=Date.now}={}){
  if(!manifestPath||!root||!outPath||!version||!commit||!ref)throw packagingError('Manifest, root, output, version, commit and ref are required.');
  const projectRoot=await realpath(path.resolve(root));
  if(!(await lstat(projectRoot)).isDirectory())throw packagingError('The documentation root must be a directory.');
  const manifestFile=await containedFile(projectRoot,manifestPath);
  let manifest;
  try{manifest=documentationManifestSchema.parse(JSON.parse(await readBounded(manifestFile,262144)));}catch(cause){if(cause.code==='DOCS_PACKAGING_FAILED')throw cause;throw packagingError('The project documentation manifest does not match schema version 1.');}
  const artifactFile=await containedFile(projectRoot,path.join(projectRoot,...manifest.api.artifact.split('/')));
  if(apiPath&&(await containedFile(projectRoot,apiPath))!==artifactFile)throw packagingError('The API input must match the artifact declared in the manifest.');
  let api;
  try{api=apiArtifactSchema.parse(JSON.parse(await readBounded(artifactFile,MAX_PACKAGE_BYTES)));}catch(cause){if(cause.code==='DOCS_PACKAGING_FAILED')throw cause;throw packagingError('The API documentation artifact does not match schema version 1.');}
  if(api.language!==manifest.api.language)throw packagingError('The API artifact language must match the manifest.');
  const pages=[];
  for(const guide of manifest.guides){
    const file=await containedFile(projectRoot,path.join(projectRoot,...guide.path.split('/')));
    pages.push({slug:guide.slug,title:guide.title,kind:'guide',markdown:await readBounded(file,262144),sourcePath:guide.path});
  }
  const data=validateDocumentationPackage({schemaVersion:1,project:manifest.project,version,source:{commit,ref},generatedAt:new Date(now()).toISOString(),pages,api});
  // The output is an explicit CLI destination, and may sit outside the source checkout.
  const output=path.resolve(outPath);await mkdir(path.dirname(output),{recursive:true});
  const temporary=path.join(path.dirname(output),`.docs-package-${randomBytes(12).toString('hex')}.tmp`);
  try{await writeFile(temporary,JSON.stringify(data)+'\n',{encoding:'utf8',flag:'wx',mode:0o600});await rename(temporary,output);}finally{await unlink(temporary).catch(()=>{});}
  return data;
}

async function main(){
  const {values}=parseArgs({options:Object.fromEntries(['manifest','root','api','out','version','commit','ref'].map(name=>[name,{type:'string'}])),strict:true,allowPositionals:false});
  const result=await packageDocumentation({manifestPath:values.manifest,root:values.root,apiPath:values.api,outPath:values.out,version:values.version,commit:values.commit,ref:values.ref});
  console.log(`Packaged ${result.project.id}/${result.version}: ${result.pages.length} guides, ${result.api.symbols.length} API symbols.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
  main().catch(cause=>{console.error(cause.expose?cause.message:'The documentation package could not be built. Check the input files and paths.');process.exitCode=1;});
}

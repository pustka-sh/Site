import test from 'node:test';
import assert from 'node:assert/strict';
import {execFile,spawnSync} from 'node:child_process';
import {promisify} from 'node:util';
import {access,mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import YAML from 'yaml';

const ROOT=path.resolve(fileURLToPath(new URL('..',import.meta.url)));
const run=promisify(execFile);
const image='ghcr.io/pustka-sh/site',commit='a'.repeat(40);
const digest='sha256:'+'b'.repeat(64),otherDigest='sha256:'+'c'.repeat(64);
const workflow=YAML.parse(await readFile(path.join(ROOT,'.github','workflows','build.yml'),'utf8'));
const publishScript=workflow.jobs.publish.steps.find(step=>step.name==='Publish commit and latest tags')?.run;
assert.equal(typeof publishScript,'string','The real publishing step must exist.');

async function findBash(){
  const candidates=process.platform==='win32'?
    [path.join(process.env.ProgramFiles||'C:\\Program Files','Git','bin','bash.exe'),path.join(process.env.ProgramFiles||'C:\\Program Files','Git','usr','bin','bash.exe'),...(process.env.LOCALAPPDATA?[path.join(process.env.LOCALAPPDATA,'Programs','Git','bin','bash.exe')]:[])]:
    ['/bin/bash','/usr/bin/bash'];
  for(const candidate of candidates){
    try{await access(candidate);const result=spawnSync(candidate,['--noprofile','--norc','--version'],{encoding:'utf8',windowsHide:true,timeout:5000});if(result.status===0&&result.stdout.startsWith('GNU bash'))return candidate;}catch{/* Try another installed Bash without invoking WSL. */}
  }
  return null;
}
const bash=await findBash();
const options={skip:bash?false:'Requires /bin/bash on Linux or an installed Git Bash on Windows.'};

const dockerShim=`#!/usr/bin/env bash
printf '%s\\n' "$*" >> calls.log
case "$1" in
  tag) exit 0 ;;
  push)
    count=0
    if test -f push-count; then read -r count < push-count; fi
    count=$((count + 1))
    printf '%s\\n' "$count" > push-count
    if test "$SCENARIO" = persistent || { test "$SCENARIO" = retry && test "$count" -eq 1; }; then
      printf 'registry rejected this push\\n' >&2
      exit 9
    fi
    exit 0
    ;;
  buildx)
    if test "$SCENARIO" = mismatch && [[ "$4" = *:latest ]]; then
      printf '%s\\n' "$OTHER_DIGEST"
    else
      printf '%s\\n' "$REGISTRY_DIGEST"
    fi
    ;;
  image)
    # Docker save/load can retain this source alias before the registry reference.
    # The former local RepoDigests[0] check must not report this as a push failure.
    printf 'pustka-site@%s\\n' "$REGISTRY_DIGEST"
    ;;
  *) printf 'Unexpected Docker operation\\n' >&2; exit 20 ;;
esac
`;

async function execute(t,scenario){
  const scratch=path.join(ROOT,'test','.scratch');await mkdir(scratch,{recursive:true});
  const directory=await mkdtemp(path.join(scratch,'container-publishing-'));
  t.after(async()=>{assert.ok(path.resolve(directory).startsWith(path.resolve(scratch)+path.sep));await rm(directory,{recursive:true,force:true});});
  await mkdir(path.join(directory,'bin'));
  await writeFile(path.join(directory,'bin','docker'),dockerShim,{mode:0o755});
  await writeFile(path.join(directory,'bin','sleep'),'#!/usr/bin/env bash\nprintf "sleep %s\\n" "$*" >> calls.log\n',{mode:0o755});
  await writeFile(path.join(directory,'publish.sh'),'export PATH="$PWD/bin:$PATH"\n'+publishScript);
  let status=0,stdout='',stderr='';
  try{({stdout,stderr}=await run(bash,['--noprofile','--norc','-e','publish.sh'],{cwd:directory,env:{...process.env,IMAGE:image,GITHUB_SHA:commit,GITHUB_STEP_SUMMARY:'summary.md',SCENARIO:scenario,REGISTRY_DIGEST:digest,OTHER_DIGEST:otherDigest},windowsHide:true,timeout:10000}));}
  catch(error){if(typeof error.code!=='number')throw error;status=error.code;stdout=error.stdout||'';stderr=error.stderr||'';}
  const calls=(await readFile(path.join(directory,'calls.log'),'utf8')).trim().split('\n');
  let summary='';try{summary=await readFile(path.join(directory,'summary.md'),'utf8');}catch(error){if(error.code!=='ENOENT')throw error;}
  return {status,stdout,stderr,calls,summary};
}

test('publication succeeds using remote tag digests despite a stale local archive alias',options,async t=>{
  const result=await execute(t,'success');assert.equal(result.status,0,result.stderr);
  assert.ok(result.summary.includes(`${image}@${digest}`));
  assert.ok(result.calls.some(call=>call.startsWith(`buildx imagetools inspect ${image}:sha-${commit} `)));
  assert.ok(result.calls.some(call=>call.startsWith(`buildx imagetools inspect ${image}:latest `)));
  assert.equal(result.calls.filter(call=>call.startsWith('image inspect ')).length,0);
  assert.equal(result.calls.filter(call=>call.startsWith('push ')).length,2);
});

test('one transient registry failure retries the same image once and then publishes both tags',options,async t=>{
  const result=await execute(t,'retry');assert.equal(result.status,0,result.stderr);
  assert.deepEqual(result.calls.filter(call=>call.startsWith('push ')),[`push ${image}:sha-${commit}`,`push ${image}:sha-${commit}`,`push ${image}:latest`]);
  assert.equal(result.calls.filter(call=>call.startsWith('sleep ')).length,1);
  assert.ok(result.summary.includes(`${image}@${digest}`));
});

test('a persistent first-tag failure stops after the bounded retry without publishing latest or a success summary',options,async t=>{
  const result=await execute(t,'persistent');assert.notEqual(result.status,0);
  assert.deepEqual(result.calls.filter(call=>call.startsWith('push ')),[`push ${image}:sha-${commit}`,`push ${image}:sha-${commit}`]);
  assert.equal(result.calls.filter(call=>call.startsWith('sleep ')).length,1);
  assert.equal(result.calls.filter(call=>call.startsWith('buildx ')).length,0);assert.equal(result.summary,'');
});

test('different registry digests for the commit and latest tags fail before recording a successful publication',options,async t=>{
  const result=await execute(t,'mismatch');assert.notEqual(result.status,0);
  assert.equal(result.calls.filter(call=>call.startsWith('push ')).length,2);
  assert.equal(result.calls.filter(call=>call.startsWith('buildx ')).length,2);
  assert.equal(result.summary,'');
});

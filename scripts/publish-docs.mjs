import { createHmac } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const MAX_BYTES = 8 * 1024 * 1024;

export function signDocumentation(body, key, timestamp = Math.floor(Date.now() / 1000).toString()) {
  if (typeof key !== 'string' || key.length < 32 || key.length > 512) throw new Error('Set PUSTKA_DOCS_PUBLISH_KEY to the project publication key (at least 32 characters).');
  let project;
  try { project = JSON.parse(body.toString('utf8')).project?.id; } catch { throw new Error('The documentation package is not valid JSON.'); }
  if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(project || '')) throw new Error('The package must identify a project.');
  return {
    'Content-Type':'application/json',
    'X-Pustka-Project':project,
    'X-Pustka-Timestamp':timestamp,
    'X-Pustka-Signature':'sha256=' + createHmac('sha256', key).update(timestamp + '.').update(body).digest('hex'),
  };
}

export async function publishDocumentation({file, key, url = 'https://pustka.sh/api/site/docs/publish', fetcher = fetch}) {
  const endpoint = new URL(url);
  const loopback = ['localhost','127.0.0.1','[::1]'].includes(endpoint.hostname);
  if ((endpoint.protocol !== 'https:' && !(loopback && endpoint.protocol === 'http:')) || endpoint.username || endpoint.password || endpoint.search || endpoint.hash) throw new Error('The publication URL must use HTTPS (HTTP is allowed on localhost for development).');
  const info = await stat(file);
  if (!info.isFile() || info.size > MAX_BYTES) throw new Error('The documentation package must be a file no larger than 8 MiB.');
  const body = await readFile(file);
  if (body.length > MAX_BYTES) throw new Error('The documentation package exceeds 8 MiB.');
  const headers = signDocumentation(body, key);
  const response = await fetcher(endpoint, {method:'POST', headers, body, redirect:'error', signal:AbortSignal.timeout(20000)});
  // Do not echo remote responses or transport details: neither is trusted output.
  if (!response.ok) throw new Error(`Documentation publication failed (HTTP ${response.status}).`);
  await response.body?.cancel();
  return {project:headers['X-Pustka-Project'], published:true};
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== '--file' || !args[1]) throw new Error('Usage: node scripts/publish-docs.mjs --file <package.json>');
  const result = await publishDocumentation({file:args[1], key:process.env.PUSTKA_DOCS_PUBLISH_KEY, url:process.env.PUSTKA_DOCS_PUBLISH_URL || undefined});
  console.log(`Published ${result.project} documentation.`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error instanceof TypeError ? 'Documentation publication could not reach the configured endpoint.' : error.message); process.exitCode = 1; });
}

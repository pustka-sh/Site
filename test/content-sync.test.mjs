import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';
import { createContentService, verifyWebhook, renderRss } from '../server/services/content-sync.mjs';

const exec = promisify(execFile);

const data = {
  repo: 'https://github.com/pustka-sh/Relay', commit: 'a'.repeat(40), syncedAt: '2026-11-09',
  docs: {}, readme: {}, defaultConfig: 'bind="0.0.0.0:25565"', versions: [{ protocol: 764, versions: ['1.20.2'] }],
  changelog: [{ hash: 'a'.repeat(40), short: 'aaaaaaa', date: '2026-11-09', subject: 'Fix <login> & forwarding', merge: false }],
};
async function sandbox(t) {
  const scratch = resolve('test/.scratch');
  await mkdir(scratch, { recursive: true });
  const dir = await mkdtemp(join(scratch, 'content-'));
  t.after(() => { assert.ok(resolve(dir).startsWith(scratch + sep)); return rm(dir, { recursive: true, force: true }); });
  const contentFile = join(dir, 'bundled.json');
  await writeFile(contentFile, JSON.stringify(data));
  return { dir, contentFile };
}

test('webhook authentication verifies exact bytes and rejects tampering or malformed signatures', () => {
  const body = Buffer.from('{"ref":"refs/heads/main"}');
  const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(body).digest('hex')}`;
  assert.equal(verifyWebhook(body, signature, 'webhook-secret'), true);
  assert.equal(verifyWebhook(Buffer.from(`${body} `), signature, 'webhook-secret'), false);
  assert.equal(verifyWebhook(body, signature, ''), false);
  assert.equal(verifyWebhook(body, 'sha256=garbage', 'webhook-secret'), false);
});

test('successful sync publishes validated JSON atomically and subsequent processes read it', async (t) => {
  const { dir, contentFile } = await sandbox(t);
  const next = { ...data, commit: 'b'.repeat(40) };
  const service = createContentService({ dataDir: dir, contentFile, cooldownMs: 0, runSync: async (output) => writeFile(output, JSON.stringify(next)) });
  assert.equal((await service.content()).commit, data.commit);
  assert.equal(service.requestSync().accepted, true);
  await service.waitForIdle();
  assert.equal((await service.content()).commit, next.commit);
  assert.equal(service.status().lastError, null);
  assert.equal(JSON.parse(await readFile(join(dir, 'relay-content.json'), 'utf8')).commit, next.commit);
  const restarted = createContentService({ dataDir: dir, contentFile, syncEnabled: false });
  assert.equal((await restarted.content()).commit, next.commit);
  assert.throws(() => restarted.requestSync(), /not configured/);
  await service.close();
  await restarted.close();
});

test('invalid or failed sync leaves the last-good content intact and hides child errors', async (t) => {
  const { dir, contentFile } = await sandbox(t);
  const service = createContentService({ dataDir: dir, contentFile, cooldownMs: 0, runSync: async (output) => writeFile(output, '{"token":"do-not-return"}') });
  await service.content();
  service.requestSync();
  await service.waitForIdle();
  assert.equal((await service.content()).commit, data.commit);
  assert.match(service.status().lastError, /previous snapshot/);
  assert.ok(!JSON.stringify(service.status()).includes('do-not-return'));
  await service.close();
});

test('RSS uses real commit IDs, escapes XML, and excludes merge commits', () => {
  const rss = renderRss({ ...data, changelog: [...data.changelog, { ...data.changelog[0], hash: 'b'.repeat(40), merge: true, subject: 'Merge hidden' }] });
  assert.match(rss, /Fix &lt;login&gt; &amp; forwarding/);
  assert.match(rss, new RegExp(`https://github.com/pustka-sh/Relay/commit/${'a'.repeat(40)}`));
  assert.ok(!rss.includes('Merge hidden'));
  assert.match(rss, /https:\/\/pustka.sh\/feed.xml/);
});

test('concurrent sync requests coalesce into one follow-up without parallel git jobs', async (t) => {
  const { dir, contentFile } = await sandbox(t);
  let release;
  const gate = new Promise((accept) => { release = accept; });
  let calls = 0;
  let running = 0;
  let maximum = 0;
  const service = createContentService({ dataDir: dir, contentFile, cooldownMs: 0, runSync: async (output) => {
    calls++;
    running++;
    maximum = Math.max(maximum, running);
    if (calls === 1) await gate;
    await writeFile(output, JSON.stringify(data));
    running--;
  } });
  service.requestSync();
  service.requestSync();
  service.requestSync();
  release();
  await service.waitForIdle();
  assert.equal(calls, 2);
  assert.equal(maximum, 1);
  await service.close();
});

test('sync CLI writes only the chosen output and escapes upstream executable content', async (t) => {
  const { dir } = await sandbox(t);
  const repo = join(dir, 'relay');
  await mkdir(join(repo, 'docs'), { recursive: true });
  await mkdir(join(repo, 'proxy/src/main/java/dev/relay/protocol'), { recursive: true });
  await mkdir(join(repo, 'proxy/src/main/resources'), { recursive: true });
  await writeFile(join(repo, 'README.md'), '# Relay\n\n## Status\n\nWorking.\n');
  await writeFile(join(repo, 'proxy/src/main/java/dev/relay/protocol/ProtocolVersion.java'), 'MINECRAFT_1_20_2(764, "1.20.2")');
  await writeFile(join(repo, 'proxy/src/main/resources/relay.default.toml'), 'bind = "0.0.0.0:25565"');
  const markdown = '# Test\n\n## Links\n\n[Bad](javascript:alert%281%29)\n\n<script>alert(1)</script>\n\n[Good](https://github.com/pustka-sh/Relay)\n';
  for (const file of ['backend-api.md', 'client-api.md', 'server-packets.md', 'protocol-ids.md']) await writeFile(join(repo, 'docs', file), markdown);
  await exec('git', ['init', '--quiet', repo]);
  await exec('git', ['-C', repo, 'add', '.']);
  await exec('git', ['-C', repo, '-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Fixture docs']);
  const output = join(dir, 'generated.json');
  await exec(process.execPath, [resolve('scripts/sync-relay.mjs')], { env: { ...process.env, RELAY_DIR: repo, OUTPUT_PATH: output }, timeout: 20_000 });
  const generated = JSON.parse(await readFile(output, 'utf8'));
  assert.match(generated.docs.backend.html, /&lt;script&gt;/);
  assert.ok(!generated.docs.backend.html.includes('href="javascript:'));
  assert.match(generated.docs.backend.html, /href="https:\/\/github.com\/pustka-sh\/Relay"/);
  assert.equal(generated.versions[0].protocol, 764);
});

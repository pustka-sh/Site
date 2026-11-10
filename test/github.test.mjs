import test from 'node:test';
import assert from 'node:assert/strict';
import { createGithubService, validateProjects, readJsonResponse } from '../server/services/github.mjs';

const project = { id: 'relay', name: 'Relay', description: 'A proxy', category: 'Minecraft proxy', repository: 'https://github.com/pustka-sh/Relay' };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const fixture = (url) => {
  if (url.includes('/releases?')) return json([{ id: 1, tag_name: 'v1.0.0', name: 'Relay 1', published_at: '2026-11-09T00:00:00Z', html_url: `${project.repository}/releases/tag/v1.0.0`, assets: [{ id: 4, name: 'relay.jar', size: 12, browser_download_url: `${project.repository}/releases/download/v1.0.0/relay.jar`, digest: `sha256:${'a'.repeat(64)}` }] }]);
  if (url.includes('/commits?')) return json([{ html_url: `${project.repository}/commit/${'a'.repeat(40)}`, commit: { committer: { date: '2026-11-09T00:00:00Z' } } }]);
  if (url.includes('/search/issues?')) return json({ total_count: 3 });
  return json({ stargazers_count: 9, open_issues_count: 14 });
};

test('GitHub snapshots use accurate issue count, cache concurrent requests, and never expose credentials', async () => {
  const calls = [];
  const service = createGithubService({ projects: [project], token: 'private-token', fetchImpl: async (url, options) => { calls.push({ url, options }); return fixture(url); } });
  const [first, second] = await Promise.all([service.getProjects(), service.getProjects()]);
  assert.deepEqual(first, second);
  assert.equal(calls.length, 4);
  assert.equal(first.projects[0].stats.stars, 9);
  assert.equal(first.projects[0].stats.openIssues, 3);
  assert.equal(first.projects[0].latestRelease.assets[0].sha256, 'a'.repeat(64));
  assert.ok(calls.every((call) => call.url.startsWith('https://api.github.com/') && call.options.redirect === 'error'));
  assert.ok(calls.every((call) => call.options.headers.Authorization === 'Bearer private-token'));
  assert.ok(!JSON.stringify(first).includes('private-token'));
  await service.getProjects();
  assert.equal(calls.length, 4);
});

test('a refresh failure returns the dated last-good snapshot rather than invented counts', async () => {
  let clock = 0;
  let fail = false;
  const service = createGithubService({ projects: [project], now: () => clock, fetchImpl: async (url) => fail ? json({ message: 'token secret error' }, 403) : fixture(url) });
  const first = await service.getProjects();
  clock = 300_001;
  fail = true;
  const stale = await service.getProjects();
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, first.updatedAt);
  assert.equal(stale.projects[0].stats.stars, 9);
  assert.ok(!JSON.stringify(stale).includes('secret'));
});

test('release mapping rejects unsafe download destinations and does not invent missing checksums', async () => {
  const service = createGithubService({ projects: [project], fetchImpl: async () => json([{ id: 1, tag_name: 'v2', assets: [
    { id: 1, name: 'bad.jar', browser_download_url: 'https://evil.example/download', size: 1 },
    { id: 2, name: 'relay.jar', browser_download_url: `${project.repository}/releases/download/v2/relay.jar`, size: 3 },
  ] }]) });
  const result = await service.getReleases();
  assert.equal(result.releases[0].assets.length, 1);
  assert.equal(result.releases[0].assets[0].sha256, null);
  assert.throws(() => service.getReleases('../private'), /Project not found/);
});

test('registry refuses visitor URLs and JSON reads enforce limits', async () => {
  assert.throws(() => validateProjects([{ ...project, repository: 'https://github.com.evil.example/user/repo' }]), /invalid/);
  assert.throws(() => validateProjects([{ ...project, repository: 'http://127.0.0.1/admin' }]), /invalid/);
  await assert.rejects(readJsonResponse(json({ body: 'x'.repeat(100) }), 20), /too large/);
});

test('cold upstream failures back off before retrying and recover after the bounded delay', async () => {
  let clock = 0;
  let calls = 0;
  let fail = true;
  const service = createGithubService({ projects: [project], now: () => clock, fetchImpl: async (url) => {
    calls++;
    return fail ? json({ message: 'rate limited' }, 403) : fixture(url);
  } });
  await assert.rejects(service.getReleases(), (error) => error.code === 'UPSTREAM_UNAVAILABLE');
  assert.equal(calls, 1);
  clock = 29_999;
  await assert.rejects(service.getReleases(), (error) => error.code === 'UPSTREAM_UNAVAILABLE');
  await assert.rejects(service.getReleases(), (error) => error.code === 'UPSTREAM_UNAVAILABLE');
  assert.equal(calls, 1);
  clock = 30_000;
  fail = false;
  const recovered = await service.getReleases();
  assert.equal(calls, 2);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.updatedAt, new Date(clock).toISOString());
});

test('stale snapshots preserve their original date while refresh failures are backed off', async () => {
  let clock = 0;
  let calls = 0;
  let fail = false;
  const service = createGithubService({ projects: [project], now: () => clock, fetchImpl: async (url) => {
    calls++;
    return fail ? json({}, 503) : fixture(url);
  } });
  const first = await service.getReleases();
  clock = 300_001;
  fail = true;
  const stale = await service.getReleases();
  assert.equal(calls, 2);
  assert.equal(stale.stale, true);
  assert.equal(stale.updatedAt, first.updatedAt);
  clock += 29_999;
  const backedOff = await service.getReleases();
  assert.equal(calls, 2);
  assert.equal(backedOff.updatedAt, first.updatedAt);
  assert.equal(backedOff.stale, true);
  clock++;
  fail = false;
  const recovered = await service.getReleases();
  assert.equal(calls, 3);
  assert.equal(recovered.stale, false);
  assert.equal(recovered.updatedAt, new Date(clock).toISOString());
});

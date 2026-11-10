import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoService } from '../server/services/demo.mjs';

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const overview = { node: 'private-hostname', bind: '10.0.0.5:25565', players: 3, maxPlayers: 100, servers: 2, serversUp: 1, groups: 1, uptimeSeconds: 500, balance: 'least-players', controlToken: 'never-public' };
const servers = [{ name: 'lobby', address: '10.0.0.6:25566', players: 3, status: 'HEALTHY', latencyMillis: 8, uuid: 'private-uuid', load: { memoryUsedMb: 500 } }];

test('unconfigured demo is explicit and rejects unsafe configuration', async () => {
  await assert.rejects(createDemoService().getSnapshot(), (error) => error.status === 503 && error.code === 'NOT_CONFIGURED');
  assert.throws(() => createDemoService({ url: 'file:///etc/passwd' }), /HTTP/);
  assert.throws(() => createDemoService({ url: 'http://user:pass@dashboard:8080' }), /HTTP/);
  assert.throws(() => createDemoService({ url: 'http://dashboard:8080/other' }), /path/);
});

test('demo exposes only privacy-safe counts and health from two fixed GET routes', async () => {
  const calls = [];
  const service = createDemoService({ url: 'http://dashboard:8080', fetchImpl: async (url, options) => { calls.push({ url: String(url), options }); return json(String(url).endsWith('/overview') ? overview : servers); } });
  const result = await service.getSnapshot();
  assert.equal(result.overview.players, 3);
  assert.equal(result.servers[0].online, true);
  assert.equal(result.servers[0].latencyMs, 8);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((call) => call.options.method === 'GET'));
  const output = JSON.stringify(result);
  for (const secret of ['private-hostname', '10.0.0.', 'never-public', 'private-uuid', 'memoryUsedMb']) assert.ok(!output.includes(secret));
  await service.getSnapshot();
  assert.equal(calls.length, 2);
});

test('current Relay session login stays server-side and redirects are never followed', async () => {
  const calls = [];
  const session = 'a'.repeat(32);
  const service = createDemoService({ url: 'http://dashboard:8080', username: 'viewer', password: 'private-password', fetchImpl: async (url, options) => {
    calls.push({ url: String(url), options });
    if (String(url).endsWith('/login')) return new Response(null, { status: 302, headers: { 'set-cookie': `relay_session=${session}; Path=/; HttpOnly; SameSite=Strict`, location: '/' } });
    assert.equal(options.headers.Cookie, `relay_session=${session}`);
    return json(String(url).endsWith('/overview') ? overview : servers);
  } });
  const result = await service.getSnapshot();
  assert.equal(calls.filter((call) => call.options.method === 'POST').length, 1);
  assert.equal(calls[0].options.redirect, 'manual');
  assert.ok(!JSON.stringify(result).includes('private-password'));
  assert.ok(!JSON.stringify(result).includes(session));
});

test('demo refresh errors retain clearly marked last-good data', async () => {
  let clock = 0;
  let fail = false;
  const service = createDemoService({ url: 'http://dashboard:8080', now: () => clock, fetchImpl: async (url) => fail ? json({ token: 'do-not-leak' }, 500) : json(String(url).endsWith('/overview') ? overview : servers) });
  const first = await service.getSnapshot();
  clock = 5001;
  fail = true;
  const next = await service.getSnapshot();
  assert.equal(next.stale, true);
  assert.equal(next.updatedAt, first.updatedAt);
  assert.ok(!JSON.stringify(next).includes('do-not-leak'));
});

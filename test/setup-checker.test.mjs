import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectSetup, parseServerProperties } from '../server/services/setup-checker.mjs';

const secret = 'a-secure-test-secret-that-must-never-appear-in-results';
const input = () => ({
  relayToml: `online-mode = true\nforwarding-mode = "modern"\nforwarding-secret = "${secret}"\nproxy-protocol-send = false\n[servers]\nlobby = "127.0.0.1:25566"\n`,
  paperYaml: `proxies:\n  velocity:\n    enabled: true\n    online-mode: true\n    secret: '${secret}'\n  proxy-protocol: false\n`,
  serverProperties: 'online-mode=false\nserver-port=25566\n',
});
const check = (result, id) => result.checks.find((entry) => entry.id === id);

test('compares modern forwarding and returns useful counts without echoing config', () => {
  const result = inspectSetup(input());
  assert.equal(result.ok, true);
  assert.equal(result.summary.failures, 0);
  assert.equal(check(result, 'forwarding.secret').status, 'pass');
  assert.equal(check(result, 'forwarding.auth').status, 'pass');
  assert.equal(check(result, 'network.boundary').status, 'warn');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
  assert.doesNotMatch(JSON.stringify(result), /127\.0\.0\.1:25566/);
});

test('finds secret, authentication and one-sided PROXY mismatches together', () => {
  const files = input();
  files.paperYaml = files.paperYaml.replace(secret, 'another-secret-never-to-echo').replace('proxy-protocol: false', 'proxy-protocol: true');
  files.serverProperties = 'online-mode=true';
  const result = inspectSetup(files);
  assert.equal(result.ok, false);
  for (const id of ['auth.backend', 'forwarding.secret', 'proxy-protocol.backend']) assert.equal(check(result, id).status, 'fail');
  assert.doesNotMatch(JSON.stringify(result), /another-secret-never-to-echo/);
});

test('matches Paper forwarded online mode to an intentionally offline proxy', () => {
  const files = input(); files.relayToml = files.relayToml.replace('online-mode = true', 'online-mode = false');
  let result = inspectSetup(files);
  assert.equal(check(result, 'forwarding.auth').status, 'fail');
  files.paperYaml = files.paperYaml.replace('online-mode: true', 'online-mode: false');
  result = inspectSetup(files);
  assert.equal(result.ok, true);
  assert.equal(check(result, 'auth.proxy').status, 'warn');
});

test('does not read paths or falsely compare a forwarding secret stored in a separate file', () => {
  const files = input(); files.relayToml = files.relayToml.replace(`forwarding-secret = "${secret}"`, 'forwarding-secret-file = "/etc/private/not-a-real-file"');
  const result = inspectSetup(files);
  assert.equal(check(result, 'forwarding.secret').status, 'warn');
  assert.doesNotMatch(JSON.stringify(result), /\/etc\/private/);
});

test('legacy and none modes warn about the checks these three files cannot prove', () => {
  const files = input(); files.paperYaml = files.paperYaml.replace('enabled: true', 'enabled: false');
  files.relayToml = files.relayToml.replace('"modern"', '"legacy"');
  assert.equal(check(inspectSetup(files), 'forwarding.legacy').status, 'warn');
  files.relayToml = files.relayToml.replace('"legacy"', '"none"');
  assert.equal(check(inspectSetup(files), 'forwarding.none').status, 'warn');
});

test('parser failures never return secret-bearing parser source excerpts', () => {
  const files = input(); files.relayToml = `forwarding-secret = "${secret}`;
  const result = inspectSetup(files);
  assert.equal(result.ok, false);
  assert.equal(check(result, 'syntax.relay').status, 'fail');
  assert.doesNotMatch(JSON.stringify(result), new RegExp(secret));
});

test('rejects YAML aliases and duplicate keys without expanding untrusted structures', () => {
  const files = input(); files.paperYaml = 'first: &a [a, b, c]\nsecond: *a';
  assert.equal(check(inspectSetup(files), 'syntax.paper').status, 'fail');
  files.paperYaml = 'proxies: {}\nproxies: {}';
  assert.equal(check(inspectSetup(files), 'syntax.paper').status, 'fail');
  files.paperYaml = 'proxies: !!untrusted-custom-tag {}';
  assert.equal(check(inspectSetup(files), 'syntax.paper').status, 'fail');
});

test('checks types instead of treating quoted false as a truthy boolean', () => {
  const files = input(); files.paperYaml = files.paperYaml.replace('enabled: true', 'enabled: "false"');
  assert.equal(check(inspectSetup(files), 'type.velocity-enabled').status, 'fail');
});

test('handles Java properties escapes/continuations and rejects duplicate keys', () => {
  const parsed = parseServerProperties('# comment\nonline\\u002dmode = false\nmessage = hello\\\n  world\n');
  assert.equal(parsed['online-mode'], 'false'); assert.equal(parsed.message, 'helloworld');
  const files = input(); files.serverProperties = 'online-mode=false\nonline-mode=true';
  assert.equal(check(inspectSetup(files), 'syntax.properties').status, 'fail');
});

test('bounds all pasted files and exposes only safe validation errors', () => {
  assert.throws(() => inspectSetup({}), { status: 400, expose: true, code: 'SETUP_INPUT_REQUIRED' });
  const files = input(); files.paperYaml = 'a'.repeat(65_537);
  assert.throws(() => inspectSetup(files), { status: 400, expose: true, code: 'SETUP_INPUT_TOO_LARGE' });
});

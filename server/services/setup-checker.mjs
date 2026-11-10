import TOML from '@iarna/toml';
import { parseDocument } from 'yaml';
import { createHash, timingSafeEqual } from 'node:crypto';

const MAX_FILE_BYTES = 65_536;
function inputError(code, message) { return Object.assign(new Error(message), { status: 400, code, expose: true }); }

function sourceText(input, key) {
  const value = input?.[key];
  if (typeof value !== 'string' || !value.trim()) throw inputError('SETUP_INPUT_REQUIRED', 'Paste all three configuration files to compare them.');
  if (Buffer.byteLength(value, 'utf8') > MAX_FILE_BYTES) throw inputError('SETUP_INPUT_TOO_LARGE', 'Each configuration file must be no larger than 64 KiB.');
  if (value.includes('\0')) throw inputError('SETUP_INVALID_TEXT', 'Configuration files must contain plain text.');
  return value;
}

function unescapeProperty(value) {
  return value.replace(/\\(u[0-9a-fA-F]{4}|.)/g, (_, part) => {
    if (part[0] === 'u') return String.fromCharCode(parseInt(part.slice(1), 16));
    return ({ t: '\t', r: '\r', n: '\n', f: '\f' })[part] ?? part;
  });
}

/** Read Java properties without executing or interpolating anything. Reject ambiguous duplicates. */
export function parseServerProperties(text) {
  const properties = Object.create(null);
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  if (lines.length > 4096) throw new Error('Too many property lines.');
  for (let index = 0; index < lines.length; index++) {
    let line = lines[index].trimStart();
    if (!line || /^[#!]/.test(line)) continue;
    while ((line.match(/\\+$/)?.[0].length ?? 0) % 2) {
      if (++index >= lines.length) throw new Error('Unterminated property continuation.');
      line = line.slice(0, -1) + lines[index].trimStart();
    }
    let separator = line.length, escaped = false;
    for (let i = 0; i < line.length; i++) {
      if (!escaped && /[\s=:]/.test(line[i])) { separator = i; break; }
      if (line[i] === '\\') escaped = !escaped; else escaped = false;
    }
    const key = unescapeProperty(line.slice(0, separator));
    const rawValue = line.slice(separator).replace(/^\s*[=:]?\s*/, '');
    if (Object.hasOwn(properties, key)) throw new Error('Duplicate property.');
    properties[key] = unescapeProperty(rawValue);
  }
  return properties;
}

function secretMatches(first, second) {
  const digest = (value) => createHash('sha256').update(value, 'utf8').digest();
  return timingSafeEqual(digest(first), digest(second));
}

/** Static comparison only. Pasted contents and secrets are never included in the result. */
export function inspectSetup(input) {
  const text = {
    relayToml: sourceText(input, 'relayToml'),
    paperYaml: sourceText(input, 'paperYaml'),
    serverProperties: sourceText(input, 'serverProperties'),
  };
  const checks = [];
  const add = (id, status, title, detail) => checks.push({ id, status, title, detail });
  const summary = () => {
    const counts = { pass: 0, warn: 0, fail: 0 };
    checks.forEach((check) => counts[check.status]++);
    return { ok: counts.fail === 0, checks, summary: { passes: counts.pass, warnings: counts.warn, failures: counts.fail, total: checks.length, scope: 'Static configuration comparison; no files are stored and no runtime connection is attempted.' } };
  };
  let relay, paper, properties;
  try {
    relay = TOML.parse(text.relayToml);
    add('syntax.relay', 'pass', 'Relay TOML parses', 'The pasted relay.toml is valid TOML.');
  } catch { add('syntax.relay', 'fail', 'Relay TOML could not be parsed', 'Check TOML syntax and duplicate keys. Parser details are omitted to avoid echoing secrets.'); }
  try {
    const document = parseDocument(text.paperYaml, { schema: 'core', uniqueKeys: true, prettyErrors: false });
    if (document.errors.length || document.warnings.length) throw new Error('Invalid YAML.');
    paper = document.toJS({ maxAliasCount: 0 });
    if (!paper || typeof paper !== 'object' || Array.isArray(paper)) throw new Error('Expected YAML mapping.');
    add('syntax.paper', 'pass', 'Paper YAML parses', 'The pasted paper-global.yml is a valid mapping.');
  } catch { add('syntax.paper', 'fail', 'Paper YAML could not be parsed', 'Use a YAML mapping with unique keys and without aliases or custom tags. Parser details are omitted to avoid echoing secrets.'); }
  try {
    properties = parseServerProperties(text.serverProperties);
    add('syntax.properties', 'pass', 'Backend properties parse', 'The pasted server.properties contains unambiguous property keys.');
  } catch { add('syntax.properties', 'fail', 'Backend properties could not be parsed', 'Check duplicate keys and continued lines in server.properties.'); }
  if (!relay || !paper || !properties) return summary();

  const typedBoolean = (value, fallback, id, label) => {
    if (value === undefined) return fallback;
    if (typeof value !== 'boolean') {
      add(id, 'fail', `${label} must be a boolean`, 'Use an unquoted true or false value in TOML and YAML.');
      return fallback;
    }
    return value;
  };
  const proxyOnline = typedBoolean(relay['online-mode'], true, 'type.proxy-online', 'Relay online-mode');
  add('auth.proxy', proxyOnline ? 'pass' : 'warn', proxyOnline ? 'Proxy authentication is enabled' : 'Proxy authentication is disabled', proxyOnline
    ? 'Relay authenticates joining players.' : 'Offline mode permits unverified identities. Use it only for an intentional, controlled setup.');
  const backendOnline = properties['online-mode'] ?? 'true';
  if (!['true', 'false'].includes(backendOnline)) add('type.backend-online', 'fail', 'Backend online-mode is invalid', 'Use online-mode=false in server.properties when players connect through Relay.');
  else add('auth.backend', backendOnline === 'false' ? 'pass' : 'fail', backendOnline === 'false' ? 'Backend delegates authentication' : 'Backend authentication conflicts with the proxy', backendOnline === 'false'
    ? 'The backend uses online-mode=false, as proxy forwarding requires.' : 'Set online-mode=false in the backend’s server.properties. Relay already handles authentication.');

  const mode = relay['forwarding-mode'] ?? 'modern';
  const velocity = paper.proxies?.velocity ?? {};
  if (!velocity || typeof velocity !== 'object' || Array.isArray(velocity)) {
    add('type.velocity', 'fail', 'Paper forwarding section is invalid', 'proxies.velocity must be a YAML mapping.');
    return summary();
  }
  const velocityEnabled = typedBoolean(velocity.enabled, false, 'type.velocity-enabled', 'Paper Velocity forwarding');
  if (mode === 'modern') {
    add('forwarding.enabled', velocityEnabled ? 'pass' : 'fail', velocityEnabled ? 'Modern forwarding is enabled on Paper' : 'Paper is missing modern forwarding', velocityEnabled
      ? 'Paper accepts the Velocity-compatible modern forwarding used by Relay.' : 'Set proxies.velocity.enabled=true in paper-global.yml.');
    const paperOnline = typedBoolean(velocity['online-mode'], true, 'type.velocity-online', 'Paper Velocity online-mode');
    add('forwarding.auth', paperOnline === proxyOnline ? 'pass' : 'fail', paperOnline === proxyOnline ? 'Forwarded authentication modes agree' : 'Forwarded authentication modes differ', paperOnline === proxyOnline
      ? 'Paper’s proxies.velocity.online-mode matches Relay’s online-mode.' : 'Set proxies.velocity.online-mode to match Relay’s online-mode.');
    const proxySecret = relay['forwarding-secret'];
    const paperSecret = velocity.secret;
    if (relay['forwarding-secret-file'] !== undefined && (typeof relay['forwarding-secret-file'] !== 'string' || !relay['forwarding-secret-file'].trim())) {
      add('forwarding.secret', 'fail', 'External forwarding secret setting is invalid', 'forwarding-secret-file must be a nonempty file path string. This checker does not read server files.');
    } else if (relay['forwarding-secret-file'] !== undefined) {
      add('forwarding.secret', 'warn', 'External forwarding secret cannot be compared', 'Relay reads a separate secret file. Its contents are not part of these pasted files; confirm locally that Paper uses the same value.');
    } else if (typeof proxySecret !== 'string' || typeof paperSecret !== 'string' || !proxySecret || !paperSecret) {
      add('forwarding.secret', 'fail', 'A forwarding secret is missing', 'Provide a forwarding-secret in Relay and proxies.velocity.secret in Paper. No secret values are returned by this checker.');
    } else if (['CHANGE-ME', '<contents of forwarding.secret>'].includes(proxySecret) || ['CHANGE-ME', '<contents of forwarding.secret>'].includes(paperSecret)) {
      add('forwarding.secret', 'fail', 'A forwarding secret is still a placeholder', 'Generate a real secret locally and use the identical value on Relay and Paper.');
    } else {
      const match = secretMatches(proxySecret, paperSecret);
      add('forwarding.secret', match ? 'pass' : 'fail', match ? 'Forwarding secrets match' : 'Forwarding secrets differ', match
        ? 'The secret values agree. Neither value is included in this report.' : 'Copy the same forwarding secret to Relay and Paper, then restart both. Neither value is included in this report.');
    }
  } else if (mode === 'legacy') {
    add('forwarding.enabled', velocityEnabled ? 'fail' : 'pass', velocityEnabled ? 'Modern forwarding conflicts with legacy mode' : 'Modern forwarding is disabled', velocityEnabled
      ? 'Disable proxies.velocity.enabled when using legacy forwarding.' : 'Paper is not expecting Velocity modern forwarding.');
    add('forwarding.legacy', 'warn', 'Check the legacy setting locally', 'Legacy forwarding also requires settings.bungeecord=true in spigot.yml, which is not among the pasted files. Keep backend ports private.');
  } else if (mode === 'none') {
    add('forwarding.enabled', velocityEnabled ? 'fail' : 'pass', velocityEnabled ? 'Paper expects forwarding that Relay will not send' : 'Forwarding settings agree', velocityEnabled
      ? 'Disable proxies.velocity.enabled or enable modern forwarding on Relay.' : 'Neither side is using modern forwarding.');
    add('forwarding.none', 'warn', 'Player identity forwarding is disabled', 'No-forwarding mode is intended for controlled local testing.');
  } else add('forwarding.mode', 'fail', 'Unknown forwarding mode', 'Choose modern, legacy, or none in Relay’s forwarding-mode.');

  const sendProxy = typedBoolean(relay['proxy-protocol-send'], false, 'type.proxy-send', 'Relay proxy-protocol-send');
  const receiveProxy = typedBoolean(paper.proxies?.['proxy-protocol'], false, 'type.paper-proxy', 'Paper proxy-protocol');
  add('proxy-protocol.backend', sendProxy === receiveProxy ? 'pass' : 'fail', sendProxy === receiveProxy ? 'Backend PROXY protocol settings agree' : 'Backend PROXY protocol settings differ', sendProxy === receiveProxy
    ? 'Relay’s outgoing PROXY protocol setting matches Paper’s incoming setting.' : 'Match Relay proxy-protocol-send with Paper proxies.proxy-protocol; enabling only one side breaks connections.');
  if (typedBoolean(relay['proxy-protocol-receive'], false, 'type.proxy-receive', 'Relay proxy-protocol-receive')) {
    add('proxy-protocol.frontend', 'warn', 'Confirm the upstream load balancer', 'Relay expects an incoming PROXY header. These files cannot confirm that a trusted upstream load balancer sends it.');
  }
  add('network.boundary', 'warn', 'Confirm backend network isolation', 'Configuration text cannot prove firewall rules. Backend listeners should be reachable only from the proxy or other trusted infrastructure.');
  return summary();
}

import { Resolver } from 'node:dns/promises';
import { createConnection, isIP } from 'node:net';
import { domainToASCII } from 'node:url';
import { performance } from 'node:perf_hooks';
import { inflateSync } from 'node:zlib';
import ipaddr from 'ipaddr.js';

const MAX_PACKET = 65_536;
const MAX_CONCURRENT = 4;
let activeChecks = 0;

function failure(status, code, message) {
  return Object.assign(new Error(message), { status, code, expose: true });
}
const timeoutError = () => failure(504, 'MC_TIMEOUT', 'The server did not answer within four seconds.');
const blockedError = () => failure(400, 'ADDRESS_NOT_PUBLIC', 'Only public internet Minecraft server addresses can be checked.');
const protocolError = () => failure(502, 'MC_INVALID_RESPONSE', 'The address did not return a valid Minecraft Java status response.');

const special4 = [
  '0.0.0.0/8', '10.0.0.0/8', '100.64.0.0/10', '127.0.0.0/8', '169.254.0.0/16',
  '172.16.0.0/12', '192.0.0.0/24', '192.0.2.0/24', '192.31.196.0/24',
  '192.52.193.0/24', '192.88.99.0/24', '192.168.0.0/16', '192.175.48.0/24',
  '198.18.0.0/15', '198.51.100.0/24', '203.0.113.0/24', '224.0.0.0/4', '240.0.0.0/4',
].map((cidr) => ipaddr.parseCIDR(cidr));
const special6 = ['2001::/23', '2001:db8::/32', '2002::/16', '2620:4f:8000::/48', '3fff::/20'].map((cidr) => ipaddr.parseCIDR(cidr));
const global6 = ipaddr.parseCIDR('2000::/3');

/** Conservative public-unicast allowlist, including IPv6 transition-address defenses. */
export function isPublicAddress(value) {
  if (typeof value !== 'string' || !isIP(value) || value.includes('%')) return false;
  try {
    const address = ipaddr.parse(value);
    if (address.kind() === 'ipv4') return address.range() === 'unicast' && !special4.some((cidr) => address.match(cidr));
    if (address.isIPv4MappedAddress()) return false;
    return address.range() === 'unicast' && address.match(global6) && !special6.some((cidr) => address.match(cidr));
  } catch { return false; }
}

function validHostname(value) {
  if (typeof value !== 'string' || value.length > 253) return false;
  const labels = value.split('.');
  if (labels.length < 2 || !/[a-z]/i.test(labels.at(-1))) return false;
  if (/(?:^|\.)(?:localhost|local|internal|home|lan|test|invalid|onion|arpa)$/i.test(value)) return false;
  return labels.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/i.test(label));
}

export function parseServerAddress(input) {
  if (typeof input !== 'string' || input.length > 280 || /[\s/@?#\\%\u0000-\u001f]/.test(input.trim())) {
    throw failure(400, 'INVALID_ADDRESS', 'Enter a hostname or public IP, optionally followed by a Minecraft port.');
  }
  const value = input.trim();
  let host, port = 25565, explicitPort = false;
  if (value.startsWith('[')) {
    const match = value.match(/^\[([^\]]+)\](?::(\d{1,5}))?$/);
    if (!match || isIP(match[1]) !== 6) throw blockedError();
    host = match[1];
    if (match[2]) { port = Number(match[2]); explicitPort = true; }
  } else if (isIP(value) === 6) host = value;
  else {
    const match = value.match(/^([^:]+)(?::(\d{1,5}))?$/);
    if (!match) throw failure(400, 'INVALID_ADDRESS', 'Enter a hostname or public IP with an optional port.');
    host = domainToASCII(match[1].replace(/\.$/, '')).toLowerCase();
    if (match[2]) { port = Number(match[2]); explicitPort = true; }
  }
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw failure(400, 'INVALID_PORT', 'Minecraft ports must be between 1024 and 65535.');
  if (isIP(host)) { if (!isPublicAddress(host)) throw blockedError(); }
  else if (!validHostname(host)) throw failure(400, 'INVALID_ADDRESS', 'Enter a fully qualified public server hostname.');
  const address = `${isIP(host) === 6 ? `[${host}]` : host}${explicitPort ? `:${port}` : ''}`;
  return { host, port, explicitPort, address };
}

function abortable(promise, signal) {
  if (signal.aborted) return Promise.reject(timeoutError());
  return new Promise((resolve, reject) => {
    const abort = () => reject(timeoutError());
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

async function lookupPublic(host, resolver, signal) {
  if (isIP(host)) {
    if (!isPublicAddress(host)) throw blockedError();
    return [{ address: host, family: isIP(host) }];
  }
  const result = await abortable(Promise.allSettled([resolver.resolve4(host), resolver.resolve6(host)]), signal);
  const addresses = result.flatMap((entry, i) => entry.status === 'fulfilled'
    ? entry.value.map((address) => ({ address, family: i === 0 ? 4 : 6 })) : []);
  if (addresses.length > 32 || addresses.some((entry) => !isPublicAddress(entry.address))) throw blockedError();
  if (!addresses.length) throw failure(422, 'DNS_NOT_FOUND', 'That server hostname could not be resolved.');
  return addresses;
}

/** Validate every base/SRV answer and pass a literal IP to net.connect, never a hostname. */
export async function resolvePublicTarget(parsed, { resolver, signal }) {
  if (isIP(parsed.host)) {
    if (!isPublicAddress(parsed.host)) throw blockedError();
    return { ip: parsed.host, family: isIP(parsed.host), port: parsed.port };
  }
  const [base, srv] = await abortable(Promise.allSettled([
    lookupPublic(parsed.host, resolver, signal),
    parsed.explicitPort ? Promise.resolve([]) : resolver.resolveSrv(`_minecraft._tcp.${parsed.host}`),
  ]), signal);
  if (base.status === 'rejected' && base.reason.code !== 'DNS_NOT_FOUND') throw base.reason;
  const records = srv.status === 'fulfilled' ? srv.value : [];
  if (!Array.isArray(records) || records.length > 8) throw blockedError();
  if (records.length) {
    const validated = await Promise.all(records.map(async (record) => {
      const name = typeof record.name === 'string' ? record.name.replace(/\.$/, '').toLowerCase() : '';
      if (!validHostname(name) || !Number.isInteger(record.port) || record.port < 1024 || record.port > 65535) throw blockedError();
      const addresses = await lookupPublic(name, resolver, signal);
      return { ip: addresses[0].address, family: addresses[0].family, port: record.port, priority: Number(record.priority) || 0 };
    }));
    return validated.sort((a, b) => a.priority - b.priority)[0];
  }
  if (base.status === 'rejected') throw base.reason;
  return { ip: base.value[0].address, family: base.value[0].family, port: parsed.port };
}

export function encodeVarInt(number) {
  let value = number >>> 0;
  const bytes = [];
  do { let byte = value & 0x7f; value >>>= 7; if (value) byte |= 0x80; bytes.push(byte); } while (value);
  return Buffer.from(bytes);
}

export function readVarInt(buffer, start = 0) {
  let value = 0;
  for (let i = 0; i < 5; i++) {
    if (start + i >= buffer.length) return null;
    const byte = buffer[start + i];
    if (i === 4 && (byte & 0xf0)) throw protocolError();
    value += (byte & 0x7f) * 2 ** (7 * i);
    if (!(byte & 0x80)) return { value, bytes: i + 1 };
  }
  throw protocolError();
}

function packet(payload) { return Buffer.concat([encodeVarInt(payload.length), payload]); }
function handshake(host, port) {
  const hostname = Buffer.from(host, 'utf8');
  const portBytes = Buffer.alloc(2); portBytes.writeUInt16BE(port);
  return packet(Buffer.concat([Buffer.from([0]), encodeVarInt(-1), encodeVarInt(hostname.length), hostname, portBytes, Buffer.from([1])]));
}

export function decodeStatusPacket(buffer) {
  const length = readVarInt(buffer);
  if (!length) return null;
  if (length.value < 3 || length.value > MAX_PACKET) throw protocolError();
  if (buffer.length < length.bytes + length.value) return null;
  const body = buffer.subarray(length.bytes, length.bytes + length.value);
  const id = readVarInt(body);
  if (!id || id.value !== 0) throw protocolError();
  const textLength = readVarInt(body, id.bytes);
  if (!textLength || textLength.value < 2 || textLength.value > MAX_PACKET - 3) throw protocolError();
  const start = id.bytes + textLength.bytes;
  if (start + textLength.value !== body.length) throw protocolError();
  try {
    const status = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body.subarray(start)));
    if (!status || Array.isArray(status) || typeof status !== 'object') throw protocolError();
    if (!status.version || typeof status.version.name !== 'string' || status.version.name.length > 120
      || !Number.isInteger(status.version.protocol) || status.version.protocol < 0 || status.version.protocol > 0x7fffffff) throw protocolError();
    return status;
  } catch { throw protocolError(); }
}

function plainText(component, depth = 0, budget = { nodes: 0 }) {
  if (depth > 16 || ++budget.nodes > 256) return '';
  if (typeof component === 'string' || typeof component === 'number') return String(component).slice(0, 4096);
  if (Array.isArray(component)) return component.map((part) => plainText(part, depth + 1, budget)).join('').slice(0, 4096);
  if (component && typeof component === 'object') return `${plainText(component.text ?? component.translate ?? '', depth + 1, budget)}${plainText(component.extra ?? [], depth + 1, budget)}`.slice(0, 4096);
  return '';
}

const crcTable = Array.from({ length: 256 }, (_, i) => { let n = i; for (let bit = 0; bit < 8; bit++) n = (n & 1) ? 0xedb88320 ^ (n >>> 1) : n >>> 1; return n >>> 0; });
function crc32(bytes) { let n = 0xffffffff; for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8); return (n ^ 0xffffffff) >>> 0; }

/** Only return structurally valid, bounded, non-interlaced 64x64 PNGs. No SVG/data HTML. */
export function safeServerIcon(input) {
  if (typeof input !== 'string' || input.length > 44_000 || !/^data:image\/png;base64,[A-Za-z0-9+/]+={0,2}$/.test(input)) return null;
  try {
    const encoded = input.slice('data:image/png;base64,'.length);
    const bytes = Buffer.from(encoded, 'base64');
    if (bytes.toString('base64') !== encoded || bytes.length > 32_768 || !bytes.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex'))) return null;
    let offset = 8, chunks = 0, channels = 0, palette = false, ended = false;
    const compressed = [];
    while (offset + 12 <= bytes.length && ++chunks <= 128) {
      const length = bytes.readUInt32BE(offset);
      if (length > 32_768 || offset + length + 12 > bytes.length) return null;
      const type = bytes.toString('ascii', offset + 4, offset + 8);
      if (!/^[A-Za-z]{4}$/.test(type) || crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== bytes.readUInt32BE(offset + 8 + length)) return null;
      if (chunks === 1) {
        if (type !== 'IHDR' || length !== 13 || bytes.readUInt32BE(offset + 8) !== 64 || bytes.readUInt32BE(offset + 12) !== 64 || bytes[offset + 16] !== 8
          || bytes[offset + 18] !== 0 || bytes[offset + 19] !== 0 || bytes[offset + 20] !== 0) return null;
        channels = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 })[bytes[offset + 17]];
        if (!channels) return null;
      } else if (type === 'IHDR') return null;
      if (type === 'PLTE') { if (!length || length > 768 || length % 3) return null; palette = true; }
      if (type === 'IDAT') compressed.push(bytes.subarray(offset + 8, offset + 8 + length));
      if (type === 'IEND') { if (length !== 0 || offset + 12 !== bytes.length) return null; ended = true; break; }
      if (/^[A-Z]/.test(type) && !['IHDR', 'PLTE', 'IDAT', 'IEND'].includes(type)) return null;
      offset += length + 12;
    }
    if (!ended || !compressed.length || (bytes[25] === 3 && !palette)) return null;
    const raw = inflateSync(Buffer.concat(compressed), { maxOutputLength: 33_000 });
    if (raw.length !== 64 * (1 + 64 * channels)) return null;
    for (let row = 0; row < 64; row++) if (raw[row * (1 + 64 * channels)] > 4) return null;
    return input;
  } catch { return null; }
}

function pingTarget(target, parsed, { connect, signal }) {
  return new Promise((resolve, reject) => {
    let socket, done = false, received = Buffer.alloc(0);
    const started = performance.now();
    const finish = (error, status) => {
      if (done) return; done = true;
      signal.removeEventListener('abort', abort);
      socket?.destroy();
      if (error) reject(error); else resolve({ status, latencyMs: Math.max(0, Math.round(performance.now() - started)) });
    };
    const abort = () => finish(timeoutError());
    if (signal.aborted) { reject(timeoutError()); return; }
    signal.addEventListener('abort', abort, { once: true });
    try {
      socket = connect({ host: target.ip, port: target.port, family: target.family, autoSelectFamily: false });
      socket.once('connect', () => socket.write(Buffer.concat([handshake(parsed.host, parsed.port), Buffer.from([1, 0])])));
      socket.on('data', (chunk) => {
        if (done) return;
        try {
          if (!Buffer.isBuffer(chunk) || received.length + chunk.length > MAX_PACKET + 5) throw protocolError();
          received = Buffer.concat([received, chunk]);
          const status = decodeStatusPacket(received);
          if (status) finish(null, status);
        } catch (error) { finish(error.status ? error : protocolError()); }
      });
      socket.once('error', () => finish(failure(502, 'MC_UNREACHABLE', 'The Minecraft server could not be reached.')));
      socket.once('end', () => finish(failure(502, 'MC_UNREACHABLE', 'The server closed the connection before returning a Minecraft status.')));
      socket.once('close', () => { if (!done) finish(failure(502, 'MC_UNREACHABLE', 'The server connection closed before a status was received.')); });
    } catch { finish(failure(502, 'MC_UNREACHABLE', 'The Minecraft server could not be reached.')); }
  });
}

export async function checkMinecraftServer(address, {
  versions = [], resolverFactory = () => new Resolver({ timeout: 1000, tries: 1 }),
  connect = createConnection, timeoutMs = 4000, signal: externalSignal,
} = {}) {
  const parsed = parseServerAddress(address);
  if (activeChecks >= MAX_CONCURRENT) throw failure(429, 'MC_BUSY', 'Server checks are busy. Please try again shortly.');
  activeChecks++;
  const controller = new AbortController();
  const signal = externalSignal ? AbortSignal.any([controller.signal, externalSignal]) : controller.signal;
  const timer = setTimeout(() => controller.abort(), Math.max(20, Math.min(4000, Number(timeoutMs) || 4000)));
  let resolver;
  const cancel = () => resolver?.cancel?.();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    resolver = resolverFactory();
    const target = await resolvePublicTarget(parsed, { resolver, signal });
    const { status, latencyMs } = await pingTarget(target, parsed, { connect, signal });
    const listed = (Array.isArray(versions) ? versions : []).find((entry) => Number(entry.protocol) === status.version.protocol);
    const knownVersions = listed ? (Array.isArray(listed.versions) ? listed.versions : [listed.version ?? listed.name].filter(Boolean)) : [];
    const verified = Array.isArray(listed?.joinTested) && listed.joinTested.length > 0;
    const count = (n) => Number.isSafeInteger(n) && n >= 0 && n <= 10_000_000 ? n : null;
    return {
      address: parsed.address, online: true,
      motd: plainText(status.description).replace(/§[0-9a-fk-orx]/gi, '').replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').slice(0, 4096),
      version: { name: status.version.name.replace(/[\u0000-\u001f\u007f]/g, ''), protocol: status.version.protocol },
      players: { online: count(status.players?.online), max: count(status.players?.max) }, latencyMs,
      icon: safeServerIcon(status.favicon),
      compatibility: {
        supported: Boolean(listed), versions: knownVersions,
        note: !listed ? 'This protocol is not listed in Relay’s synced compatibility data.' : verified
          ? `Relay lists this protocol; real joins are recorded for ${listed.joinTested.join(', ')}. A status check does not verify backend forwarding or your complete setup.`
          : 'Relay lists this protocol, but no real-client join is recorded for it in the synced data. Test your complete setup before use.',
      },
    };
  } finally {
    clearTimeout(timer); signal.removeEventListener('abort', cancel); resolver?.cancel?.(); activeChecks--;
  }
}

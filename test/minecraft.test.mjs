import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { deflateSync } from 'node:zlib';
import {
  checkMinecraftServer, parseServerAddress, isPublicAddress, encodeVarInt, readVarInt,
  decodeStatusPacket, safeServerIcon,
} from '../server/services/minecraft.mjs';

const status = () => ({
  version: { name: 'Paper 1.20.2', protocol: 764 },
  players: { online: 7, max: 100, sample: [{ name: 'private-player', id: 'private-uuid' }] },
  description: { text: '§aWelcome ', extra: [{ text: 'to the server' }] },
});
function responsePacket(data = status(), id = 0) {
  const json = Buffer.from(JSON.stringify(data));
  const body = Buffer.concat([encodeVarInt(id), encodeVarInt(json.length), json]);
  return Buffer.concat([encodeVarInt(body.length), body]);
}
function resolver(records = {}) {
  return {
    resolve4: async (host) => records[host]?.v4 ?? [],
    resolve6: async (host) => records[host]?.v6 ?? [],
    resolveSrv: async (host) => records[host]?.srv ?? [],
    cancel() {},
  };
}
function socketFixture(bytes = responsePacket(), { fragmented = false, silent = false } = {}) {
  const sockets = [], connections = [], writes = [];
  const connect = (options) => {
    connections.push(options);
    const socket = new EventEmitter(); sockets.push(socket);
    socket.destroyed = false;
    socket.destroy = () => { socket.destroyed = true; queueMicrotask(() => socket.emit('close')); };
    socket.write = (data) => {
      writes.push(data);
      if (!silent) queueMicrotask(() => {
        if (fragmented) { socket.emit('data', bytes.subarray(0, 1)); socket.emit('data', bytes.subarray(1, 7)); socket.emit('data', bytes.subarray(7)); }
        else socket.emit('data', bytes);
      });
    };
    queueMicrotask(() => socket.emit('connect'));
    return socket;
  };
  return { connect, sockets, connections, writes };
}

test('rejects private, special, mapped, scoped and alternate-format IP input', () => {
  const blocked = ['127.0.0.1', '10.0.0.1', '172.17.1.1', '169.254.169.254', '192.168.1.4', '100.64.0.1', '0.0.0.0', '224.0.0.1', '192.0.2.10', '198.51.100.2', '203.0.113.2', '198.18.0.1', '::1', '[::ffff:127.0.0.1]', '[::ffff:8.8.8.8]', 'fc00::1', 'fe80::1', '2001:db8::1', '2002:0808:0808::1', '64:ff9b::808:808', '3fff::1', '[fe80::1%eth0]', '2130706433', '127.1', '0177.0.0.1', '0x7f000001'];
  for (const value of blocked) assert.throws(() => parseServerAddress(value), { status: 400 }, value);
  for (const value of ['8.8.8.8', '93.184.216.34', '2606:4700:4700::1111']) assert.equal(isPublicAddress(value), true, value);
});

test('only accepts plain, qualified hostnames and safe Minecraft ports', () => {
  for (const value of ['http://play.example.com', 'play.example.com/path', 'user@play.example.com', 'localhost', 'metadata.internal', 'foo.local', 'play.example.com:80', 'play.example.com:65536', 'play.example.com:0', 'play.example.com?x=1']) {
    assert.throws(() => parseServerAddress(value), { status: 400 }, value);
  }
  assert.deepEqual(parseServerAddress(' PLAY.PUSTKA.SH.:25566 '), { host: 'play.pustka.sh', port: 25566, explicitPort: true, address: 'play.pustka.sh:25566' });
  assert.equal(parseServerAddress('[2606:4700:4700::1111]:25565').port, 25565);
});

test('rejects an entire mixed public/private DNS answer before opening a socket', async () => {
  let connected = false;
  await assert.rejects(checkMinecraftServer('play.pustka.sh', {
    resolverFactory: () => resolver({ 'play.pustka.sh': { v4: ['93.184.216.34'], v6: ['fd00::1'] } }),
    connect() { connected = true; },
  }), { code: 'ADDRESS_NOT_PUBLIC', status: 400, expose: true });
  assert.equal(connected, false);
});

test('rejects private SRV targets even if another record has a public target', async () => {
  let connected = false;
  await assert.rejects(checkMinecraftServer('play.pustka.sh', {
    resolverFactory: () => resolver({
      'play.pustka.sh': { v4: ['93.184.216.34'] },
      '_minecraft._tcp.play.pustka.sh': { srv: [{ name: 'public.pustka.sh', port: 25565, priority: 0 }, { name: 'private.pustka.sh', port: 25565, priority: 100 }] },
      'public.pustka.sh': { v4: ['93.184.216.34'] }, 'private.pustka.sh': { v4: ['10.0.0.2'] },
    }), connect() { connected = true; },
  }), { code: 'ADDRESS_NOT_PUBLIC' });
  assert.equal(connected, false);
});

test('pins DNS to a literal public IP, handles fragmented framing, and excludes player identifiers', async () => {
  const fixture = socketFixture(responsePacket(), { fragmented: true });
  let resolutions = 0;
  const result = await checkMinecraftServer('play.pustka.sh', {
    versions: [{ protocol: 764, versions: ['1.20.2'], joinTested: ['1.20.2'] }],
    resolverFactory: () => ({ ...resolver(), resolve4: async () => (++resolutions === 1 ? ['93.184.216.34'] : ['127.0.0.1']) }),
    connect: fixture.connect,
  });
  assert.equal(resolutions, 1);
  assert.deepEqual(fixture.connections[0], { host: '93.184.216.34', port: 25565, family: 4, autoSelectFamily: false });
  assert.equal(result.motd, 'Welcome to the server');
  assert.deepEqual(result.players, { online: 7, max: 100 });
  assert.equal(result.compatibility.supported, true);
  assert.match(result.compatibility.note, /real joins/);
  assert.equal(result.icon, null);
  assert.ok(fixture.writes[0].includes(Buffer.from('play.pustka.sh')));
  assert.equal(fixture.sockets[0].destroyed, true);
  assert.doesNotMatch(JSON.stringify(result), /private-player|private-uuid|93\.184\.216/);
});

test('honors a public SRV port while preserving original handshake hostname', async () => {
  const fixture = socketFixture();
  await checkMinecraftServer('play.pustka.sh', { resolverFactory: () => resolver({
    '_minecraft._tcp.play.pustka.sh': { srv: [{ name: 'node.pustka.sh.', port: 25570, priority: 0 }] },
    'node.pustka.sh': { v4: ['93.184.216.34'] },
  }), connect: fixture.connect });
  assert.equal(fixture.connections[0].port, 25570);
  assert.ok(fixture.writes[0].includes(Buffer.from('play.pustka.sh')));
  assert.equal(fixture.writes[0].includes(Buffer.from('node.pustka.sh')), false);
});

test('times out silent sockets, destroys them, and releases concurrency slots', async () => {
  const fixture = socketFixture(undefined, { silent: true });
  const attempts = Array.from({ length: 4 }, () => checkMinecraftServer('8.8.8.8', { connect: fixture.connect, resolverFactory: () => resolver(), timeoutMs: 25 }));
  await assert.rejects(checkMinecraftServer('8.8.8.8'), { code: 'MC_BUSY', status: 429 });
  const results = await Promise.allSettled(attempts);
  assert.equal(results.every((entry) => entry.status === 'rejected' && entry.reason.code === 'MC_TIMEOUT'), true);
  assert.equal(fixture.sockets.every((socket) => socket.destroyed), true);
  const next = socketFixture();
  assert.equal((await checkMinecraftServer('8.8.8.8', { connect: next.connect, resolverFactory: () => resolver() })).online, true);
});

test('cancels slow DNS without making a connection', async () => {
  let cancelled = false, connected = false;
  const pending = () => new Promise(() => {});
  await assert.rejects(checkMinecraftServer('play.pustka.sh', {
    resolverFactory: () => ({ resolve4: pending, resolve6: pending, resolveSrv: pending, cancel() { cancelled = true; } }),
    connect() { connected = true; }, timeoutMs: 20,
  }), { code: 'MC_TIMEOUT', expose: true });
  assert.equal(cancelled, true); assert.equal(connected, false);
});

test('rejects oversized, malformed, wrong-type and invalid UTF-8 packets', () => {
  assert.equal(decodeStatusPacket(responsePacket().subarray(0, 3)), null);
  assert.throws(() => decodeStatusPacket(encodeVarInt(65_537)), { code: 'MC_INVALID_RESPONSE' });
  assert.throws(() => decodeStatusPacket(responsePacket(status(), 1)), { code: 'MC_INVALID_RESPONSE' });
  assert.throws(() => readVarInt(Buffer.from([255, 255, 255, 255, 127])), { code: 'MC_INVALID_RESPONSE' });
  assert.throws(() => decodeStatusPacket(Buffer.from([4, 0, 2, 0xc0, 0xff])), { code: 'MC_INVALID_RESPONSE' });
  assert.throws(() => decodeStatusPacket(responsePacket({ version: { name: 'Bad', protocol: '764' } })), { code: 'MC_INVALID_RESPONSE' });
});

function crc(bytes) { let result = 0xffffffff; for (const byte of bytes) { result ^= byte; for (let i = 0; i < 8; i++) result = (result & 1) ? 0xedb88320 ^ (result >>> 1) : result >>> 1; } return (result ^ 0xffffffff) >>> 0; }
function png(width = 64) {
  const chunk = (type, data) => { const name = Buffer.from(type); const size = Buffer.alloc(4); size.writeUInt32BE(data.length); const checksum = Buffer.alloc(4); checksum.writeUInt32BE(crc(Buffer.concat([name, data]))); return Buffer.concat([size, name, data, checksum]); };
  const header = Buffer.alloc(13); header.writeUInt32BE(width); header.writeUInt32BE(64, 4); header[8] = 8; header[9] = 6;
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', header), chunk('IDAT', deflateSync(Buffer.alloc(64 * (width * 4 + 1)))), chunk('IEND', Buffer.alloc(0))]);
}
test('accepts only bounded valid 64x64 PNG favicons', () => {
  const icon = `data:image/png;base64,${png().toString('base64')}`;
  assert.equal(safeServerIcon(icon), icon);
  assert.equal(safeServerIcon(`data:image/png;base64,${png(32).toString('base64')}`), null);
  const corrupt = png(); corrupt[corrupt.length - 1] ^= 1;
  assert.equal(safeServerIcon(`data:image/png;base64,${corrupt.toString('base64')}`), null);
  assert.equal(safeServerIcon('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(safeServerIcon('https://example.com/icon.png'), null);
});

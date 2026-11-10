import { createHmac, timingSafeEqual, randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { readFile, stat, mkdir, rename, rm } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serviceError } from './github.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const BUNDLED = join(ROOT, 'src/content/relay.json');
const MAX_CONTENT_BYTES = 8 * 1024 * 1024;
const xml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);

export function verifyWebhook(rawBody, signature, secret) {
  if (!secret || !Buffer.isBuffer(rawBody) || !/^sha256=[a-f\d]{64}$/i.test(signature || '')) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const supplied = Buffer.from(signature.slice(7), 'hex');
  return supplied.length === expected.length && timingSafeEqual(expected, supplied);
}

export function validateContent(data) {
  if (!data || typeof data !== 'object' || data.repo !== 'https://github.com/pustka-sh/Relay' || !/^[a-f\d]{40}$/i.test(data.commit || '') || !/^\d{4}-\d{2}-\d{2}$/.test(data.syncedAt || '') || !Array.isArray(data.versions) || !Array.isArray(data.changelog) || !data.docs || !data.readme || typeof data.defaultConfig !== 'string') throw serviceError('The documentation snapshot is invalid.');
  if (data.changelog.length > 5000 || data.versions.length > 500 || data.versions.some((v) => !Number.isSafeInteger(v.protocol) || !Array.isArray(v.versions) || v.versions.some((n) => typeof n !== 'string'))) throw serviceError('The documentation snapshot is invalid.');
  return data;
}

async function readContent(file) {
  if ((await stat(file)).size > MAX_CONTENT_BYTES) throw serviceError('The documentation snapshot is too large.');
  return validateContent(JSON.parse(await readFile(file, 'utf8')));
}

export function renderRss(content, { origin = 'https://pustka.sh' } = {}) {
  const base = new URL(origin);
  if (!['https:', 'http:'].includes(base.protocol) || base.username || base.password) throw new Error('RSS origin must be HTTP(S).');
  const items = (content.changelog || []).filter((c) => !c.merge && /^[a-f\d]{40}$/i.test(c.hash || '')).slice(0, 50).map((c) => {
    const link = `https://github.com/pustka-sh/Relay/commit/${c.hash}`;
    const date = new Date(`${c.date}T00:00:00Z`);
    return `<item><title>${xml(c.subject)}</title><link>${xml(link)}</link><guid isPermaLink="true">${xml(link)}</guid>${Number.isFinite(date.getTime()) ? `<pubDate>${date.toUTCString()}</pubDate>` : ''}<description>${xml(`Relay ${c.short || c.hash.slice(0, 7)}: ${c.subject}`)}</description></item>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>pustka — Relay changelog</title><link>${xml(new URL('/changelog', base))}</link><description>Changes to Relay, the pustka Minecraft proxy.</description><language>en</language><atom:link href="${xml(new URL('/feed.xml', base))}" rel="self" type="application/rss+xml"/>${items}</channel></rss>\n`;
}

/** Keeps the last complete snapshot available while a fixed-repository sync runs. */
export function createContentService({ dataDir, contentFile = BUNDLED, syncEnabled = true, syncTimeoutMs = 120_000, cooldownMs = 60_000, runSync, now = Date.now } = {}) {
  if (!dataDir) throw new Error('A persistent data directory is required.');
  const directory = resolve(dataDir);
  const persistentFile = join(directory, 'relay-content.json');
  let cached = null;
  let loading = null;
  let active = null;
  let timer = null;
  let rerun = false;
  let closed = false;
  let state = { enabled: syncEnabled, running: false, queued: false, lastStartedAt: null, lastSuccessAt: null, lastError: null, commit: null };
  const load = async () => {
    if (cached) return cached;
    loading ||= (async () => {
      try { cached = await readContent(persistentFile); }
      catch { cached = await readContent(contentFile); }
      state.commit = cached.commit;
      return cached;
    })().finally(() => { loading = null; });
    return loading;
  };
  const executeScript = (outputPath) => new Promise((accept, reject) => {
    // Only documented sync variables reach the child: no website/GitHub/demo secrets.
    const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(PATH|Path|PATHEXT|SystemRoot|WINDIR|TMP|TEMP|TMPDIR|HOME|USERPROFILE|LANG|LC_ALL|NODE_EXTRA_CA_CERTS|SSL_CERT_FILE|GIT_SSL_CAINFO)$/i.test(key)));
    Object.assign(env, { OUTPUT_PATH: outputPath, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: process.platform === 'win32' ? 'NUL' : '/dev/null' });
    execFile(process.execPath, ['--max-old-space-size=256', join(ROOT, 'scripts/sync-relay.mjs')], { cwd: ROOT, env, timeout: syncTimeoutMs, maxBuffer: 512 * 1024, windowsHide: true }, (error) => error ? reject(serviceError('Documentation sync failed. The previous snapshot is still available.')) : accept());
  });
  async function perform() {
    state = { ...state, running: true, queued: false, lastStartedAt: new Date(now()).toISOString(), lastError: null };
    const temporary = join(directory, `.relay-sync-${randomBytes(8).toString('hex')}.json`);
    try {
      await mkdir(directory, { recursive: true });
      await (runSync || executeScript)(temporary);
      const next = await readContent(temporary);
      await rename(temporary, persistentFile);
      cached = next;
      state = { ...state, lastSuccessAt: new Date(now()).toISOString(), lastError: null, commit: next.commit };
    } catch {
      state.lastError = 'Documentation sync failed. The previous snapshot is still available.';
    } finally {
      await rm(temporary, { force: true }).catch(() => {});
      state.running = false;
    }
  }
  function schedule(delay = 0) {
    state.queued = delay > 0;
    if (delay > 0) {
      timer = setTimeout(() => { timer = null; start(); }, delay);
      timer.unref?.();
    } else start();
  }
  function start() {
    if (closed) return;
    active = perform().finally(() => {
      active = null;
      if (rerun && !closed) { rerun = false; schedule(cooldownMs); }
      else state.queued = false;
    });
  }
  function requestSync() {
    if (!syncEnabled || closed) throw serviceError('Automatic documentation sync is not configured.', 503, 'NOT_CONFIGURED');
    if (active) { rerun = true; state.queued = true; return { accepted: true, queued: true, status: { ...state } }; }
    if (timer) return { accepted: true, queued: true, status: { ...state } };
    const last = state.lastStartedAt ? Date.parse(state.lastStartedAt) : -Infinity;
    schedule(Math.max(0, cooldownMs - (now() - last)));
    return { accepted: true, queued: Boolean(timer), status: { ...state } };
  }
  return {
    content: load,
    requestSync,
    status: () => ({ ...state }),
    rss: async (options) => renderRss(await load(), options),
    waitForIdle: async () => { while (active) await active; },
    close: async () => { closed = true; rerun = false; if (timer) clearTimeout(timer); timer = null; state.queued = false; if (active) await active; },
  };
}

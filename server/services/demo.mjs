import { readJsonResponse, serviceError } from './github.mjs';

const count = (value) => Number.isFinite(value) && value >= 0 ? Math.floor(value) : null;
const text = (value, size = 80) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').slice(0, size) : '';

/**
 * A fixed, operator-configured dashboard adapter. The proxy control token is never
 * accepted here: Relay's HTTP dashboard authenticates with its own session cookie.
 */
export function createDemoService({ url = '', username = '', password = '', authorization = '', fetchImpl = fetch, now = Date.now, cacheMs = 5_000, timeoutMs = 5_000 } = {}) {
  let base = null;
  if (url) {
    base = new URL(url);
    if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password || base.search || base.hash) throw new Error('Demo dashboard URL must be a plain HTTP(S) origin.');
    // A fixed origin prevents a path setting from changing the allowlisted API routes.
    if (base.pathname !== '/') throw new Error('Demo dashboard URL must not include a path.');
  }
  if (Boolean(username) !== Boolean(password)) throw new Error('Demo dashboard username and password must be configured together.');
  if (/[\r\n]/.test(authorization) || authorization.length > 4096) throw new Error('Demo dashboard authorization is invalid.');
  let session = null;
  let authenticating = null;
  let cached = null;
  let pending = null;

  async function login() {
    if (!username) return;
    if (session) return;
    if (authenticating) return authenticating;
    authenticating = (async () => {
      const response = await fetchImpl(new URL('/login', base), {
        method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(timeoutMs),
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...(authorization ? { Authorization: authorization } : {}) },
        body: new URLSearchParams({ username, password }).toString(),
      });
      // No redirect is followed and only this one cookie is retained server-side.
      const cookies = response.headers.getSetCookie?.() || [response.headers.get('set-cookie') || ''];
      const cookie = cookies.map((value) => /(?:^|,\s*)relay_session=([A-Za-z\d_-]{16,256})(?:;|$)/.exec(value)?.[1]).find(Boolean);
      await response.body?.cancel().catch(() => {});
      if (![302, 303].includes(response.status) || !cookie) throw serviceError('The demo dashboard could not be authenticated.');
      session = `relay_session=${cookie}`;
    })().finally(() => { authenticating = null; });
    return authenticating;
  }
  async function get(path, retry = true) {
    if (!['/api/overview', '/api/servers'].includes(path)) throw new Error('Unsupported dashboard read.');
    await login();
    const response = await fetchImpl(new URL(path, base), {
      method: 'GET', redirect: 'error', signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: 'application/json', ...(session ? { Cookie: session } : {}), ...(authorization ? { Authorization: authorization } : {}) },
    });
    if (response.status === 401 && username && retry) {
      await response.body?.cancel().catch(() => {});
      session = null;
      return get(path, false);
    }
    if (!response.ok) throw serviceError('The demo network is temporarily unavailable.');
    return readJsonResponse(response, 512 * 1024);
  }
  async function getSnapshot() {
    if (!base) throw serviceError('The demo network has not been connected yet.', 503, 'NOT_CONFIGURED');
    if (cached && now() - cached.at < cacheMs) return { ...cached.value, stale: false };
    if (pending) return pending;
    pending = (async () => {
      try {
        const [overview, servers] = await Promise.all([get('/api/overview'), get('/api/servers')]);
        if (!overview || typeof overview !== 'object' || !Array.isArray(servers)) throw serviceError('The demo network is temporarily unavailable.');
        const value = {
          configured: true,
          overview: {
            players: count(overview.players), maxPlayers: count(overview.maxPlayers),
            servers: count(overview.servers), serversUp: count(overview.serversUp),
            groups: count(overview.groups), uptimeSeconds: count(overview.uptimeSeconds),
            balance: text(overview.balance, 40),
          },
          servers: servers.slice(0, 100).map((server) => ({
            name: text(server.name),
            online: ['HEALTHY', 'DEGRADED', 'DRAINING', 'UP', 'ONLINE'].includes(String(server.status).toUpperCase()),
            status: text(server.status, 24),
            players: count(server.players),
            latencyMs: count(server.latencyMillis),
          })),
          updatedAt: new Date(now()).toISOString(),
        };
        cached = { at: now(), value };
        return { ...value, stale: false };
      } catch {
        if (cached) return { ...cached.value, stale: true };
        throw serviceError('The demo network is temporarily unavailable.');
      } finally { pending = null; }
    })();
    return pending;
  }
  return { configured: Boolean(base), getSnapshot };
}

import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const integer = (value, fallback, min, max) => {
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) throw new Error('Invalid numeric server configuration.');
  return parsed;
};
function publicationKeys(value) {
  if (!value) return {};
  try {
    if (value.length > 16384) throw new Error();
    const keys = JSON.parse(value);
    if (!keys || Array.isArray(keys) || typeof keys !== 'object' || Object.keys(keys).length > 100) throw new Error();
    for (const [project, key] of Object.entries(keys)) {
      if (!/^[a-z0-9][a-z0-9-]{0,39}$/.test(project) || typeof key !== 'string' || key.length < 32 || key.length > 512) throw new Error();
    }
    return keys;
  } catch {
    throw new Error('DOCS_PUBLISH_KEYS must be a JSON object of project IDs and keys of at least 32 characters.');
  }
}
export function loadConfig(env = process.env) {
  const production = env.NODE_ENV === 'production';
  let origin = env.PUBLIC_ORIGIN || '';
  if (origin) {
    const parsed = new URL(origin);
    if (!['https:', 'http:'].includes(parsed.protocol) || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) throw new Error('PUBLIC_ORIGIN must be a single HTTP(S) origin.');
    origin = parsed.origin;
    if (production && parsed.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) throw new Error('PUBLIC_ORIGIN must use HTTPS in production.');
  }
  return {
    production, origin,
    port: integer(env.PORT, 3000, 1, 65535),
    host: env.HOST || '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR || path.join(ROOT, 'data')),
    distDir: path.join(ROOT, 'dist'),
    trustProxy: env.TRUST_PROXY ? env.TRUST_PROXY.split(',').map(x => x.trim()).filter(Boolean) : false,
    githubToken: env.GITHUB_TOKEN || '',
    issueToken: env.ISSUE_GITHUB_TOKEN || '',
    issueRepo: env.ISSUE_REPOSITORY || 'pustka-sh/Relay',
    issueReporting: env.ENABLE_ISSUE_REPORTS === 'true',
    webhookSecret: env.GITHUB_WEBHOOK_SECRET || '',
    docsPublishKeys: publicationKeys(env.DOCS_PUBLISH_KEYS),
    shareDays: integer(env.SHARE_TTL_DAYS, 30, 1, 365),
    syncEnabled: env.DOCS_SYNC_ENABLED !== 'false',
    syncOnStart: env.DOCS_SYNC_ON_START !== 'false',
    syncMinutes: integer(env.DOCS_SYNC_INTERVAL_MINUTES, 360, 0, 10080),
    demoUrl: env.DEMO_DASHBOARD_URL || '',
    demoUsername: env.DEMO_DASHBOARD_USERNAME || '',
    demoPassword: env.DEMO_DASHBOARD_PASSWORD || '',
    demoAuthorization: env.DEMO_DASHBOARD_AUTHORIZATION || '',
  };
}

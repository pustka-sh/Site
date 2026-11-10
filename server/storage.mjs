import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, chmodSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';

export function createStore({dataDir, now = Date.now, maxShares = 10000} = {}) {
  mkdirSync(dataDir, {recursive: true, mode: 0o700});
  const filename = path.join(dataDir, 'site.sqlite');
  const db = new DatabaseSync(filename);
  try { chmodSync(filename, 0o600); } catch { /* Windows uses filesystem ACLs. */ }
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS configs (id TEXT PRIMARY KEY, settings TEXT NOT NULL, created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS configs_expiry ON configs(expires_at);
    CREATE TABLE IF NOT EXISTS feedback (page TEXT NOT NULL, helpful INTEGER NOT NULL CHECK(helpful IN (0,1)), votes INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(page,helpful));`);
  const prune = () => db.prepare('DELETE FROM configs WHERE expires_at <= ?').run(now());
  prune();
  return {
    createConfig(settings, days = 30) {
      prune();
      if (Number(db.prepare('SELECT count(*) AS n FROM configs').get().n) >= maxShares) throw Object.assign(new Error('Config sharing is temporarily at capacity.'), {status: 503, code: 'SHARE_CAPACITY'});
      const id = randomBytes(12).toString('base64url');
      const createdAt = now(), expiresAt = createdAt + days * 86400000;
      db.prepare('INSERT INTO configs(id,settings,created_at,expires_at) VALUES(?,?,?,?)').run(id, JSON.stringify(settings), createdAt, expiresAt);
      return {id, createdAt: new Date(createdAt).toISOString(), expiresAt: new Date(expiresAt).toISOString()};
    },
    getConfig(id) {
      if (!/^[A-Za-z0-9_-]{16}$/.test(id)) return null;
      const row = db.prepare('SELECT settings,created_at,expires_at FROM configs WHERE id=? AND expires_at>?').get(id, now());
      return row ? {settings: JSON.parse(row.settings), createdAt: new Date(row.created_at).toISOString(), expiresAt: new Date(row.expires_at).toISOString()} : null;
    },
    vote(page, helpful) {
      db.prepare('INSERT INTO feedback(page,helpful,votes) VALUES(?,?,1) ON CONFLICT(page,helpful) DO UPDATE SET votes=votes+1').run(page, helpful ? 1 : 0);
      return {recorded: true};
    },
    feedback(page) {
      const rows = db.prepare('SELECT helpful,votes FROM feedback WHERE page=?').all(page);
      return {helpful: Number(rows.find(r=>r.helpful === 1)?.votes || 0), notHelpful: Number(rows.find(r=>r.helpful === 0)?.votes || 0)};
    },
    prune,
    close: () => db.close(),
  };
}

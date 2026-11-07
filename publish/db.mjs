import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
CREATE TABLE IF NOT EXISTS shares (slug TEXT PRIMARY KEY, epoch TEXT NOT NULL, html_sha TEXT NOT NULL, pw_hash TEXT, hide_contacts INTEGER NOT NULL DEFAULT 0, views INTEGER NOT NULL DEFAULT 0, updated TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS snapshots (slug TEXT NOT NULL, sha TEXT NOT NULL, html TEXT NOT NULL, PRIMARY KEY (slug, sha));
CREATE TABLE IF NOT EXISTS view_hits (slug TEXT NOT NULL, client TEXT NOT NULL, hour INTEGER NOT NULL, PRIMARY KEY (slug, client, hour));
CREATE TABLE IF NOT EXISTS comments (id INTEGER PRIMARY KEY, slug TEXT NOT NULL, link_id TEXT NOT NULL, author TEXT NOT NULL, body TEXT NOT NULL, created TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS comments_slug ON comments (slug, id);`;

export function openDb(path) {
  const db = new DatabaseSync(path);
  db.exec(SCHEMA);
  const q = {
    getShare: db.prepare('SELECT * FROM shares WHERE slug = ?'),
    putSnapshot: db.prepare('INSERT OR IGNORE INTO snapshots (slug, sha, html) VALUES (?, ?, ?)'),
    // epoch is set once per share lifetime, so a token minted before a DELETE dies even if the same HTML comes back.
    upsertShare: db.prepare(`INSERT INTO shares (slug, epoch, html_sha, pw_hash, hide_contacts, updated) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(slug) DO UPDATE SET html_sha = excluded.html_sha, pw_hash = excluded.pw_hash, hide_contacts = excluded.hide_contacts, updated = excluded.updated`),
    getSnapshot: db.prepare('SELECT html FROM snapshots WHERE slug = ? AND sha = ?'),
    addHit: db.prepare('INSERT OR IGNORE INTO view_hits (slug, client, hour) VALUES (?, ?, ?)'),
    pruneHits: db.prepare('DELETE FROM view_hits WHERE hour < ?'),
    bumpViews: db.prepare('UPDATE shares SET views = views + 1 WHERE slug = ?'),
    addComment: db.prepare('INSERT INTO comments (slug, link_id, author, body, created) VALUES (?, ?, ?, ?, ?)'),
    listComments: db.prepare('SELECT author, body, created, link_id AS linkId FROM comments WHERE slug = ? ORDER BY id'),
    deletes: ['shares', 'snapshots', 'view_hits', 'comments'].map((t) => db.prepare(`DELETE FROM ${t} WHERE slug = ?`)),
  };
  const tx = (fn) => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  return {
    getShare: (slug) => q.getShare.get(slug),
    getSnapshot: (slug, sha) => q.getSnapshot.get(slug, sha)?.html,
    publish: (slug, sha, html, pwHash, hideContacts) => tx(() => {
      q.putSnapshot.run(slug, sha, html);
      q.upsertShare.run(slug, randomBytes(8).toString('hex'), sha, pwHash, hideContacts ? 1 : 0, new Date().toISOString());
    }),
    recordView: (slug, client, hour) => tx(() => {
      if (q.addHit.run(slug, client, hour).changes !== 1) return;
      q.bumpViews.run(slug);
      q.pruneHits.run(hour - 1);
    }),
    addComment: (slug, linkId, author, body) => q.addComment.run(slug, linkId, author, body, new Date().toISOString()),
    listComments: (slug) => q.listComments.all(slug),
    deleteShare: (slug) => tx(() => q.deletes.map((d) => d.run(slug).changes)[0] === 1),
    close: () => db.close(),
  };
}

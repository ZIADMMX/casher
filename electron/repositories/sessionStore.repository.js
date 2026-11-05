// Session persistence: revoked JWT ids and cleanup of legacy secret settings.
// The database module is required lazily so the session service can load before
// the database exists (and so tests can swap it).
function getDb() {
  return require('../database/db').db;
}

function deleteLegacySecretSettings(keys) {
  const db = getDb();
  const placeholders = keys.map(() => '?').join(', ');
  const removed = db.prepare(`DELETE FROM settings WHERE key IN (${placeholders})`).run(...keys);
  if (removed.changes) {
    db.prepare("UPDATE settings SET value = '' WHERE key = 'last_active_session_token'").run();
  }
  return removed.changes;
}

function saveRevocation(jti, revokedFrom, expiresAt, now) {
  const db = getDb();
  db.prepare('DELETE FROM revoked_tokens WHERE expires_at <= ?').run(now);
  db.prepare(`
    INSERT INTO revoked_tokens (jti, revoked_from, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(jti) DO UPDATE SET revoked_from = MIN(revoked_from, excluded.revoked_from)
  `).run(jti, revokedFrom, expiresAt);
}

function getRevokedFrom(jti) {
  return getDb().prepare('SELECT revoked_from FROM revoked_tokens WHERE jti = ?').get(jti)?.revoked_from ?? null;
}

module.exports = { deleteLegacySecretSettings, saveRevocation, getRevokedFrom };

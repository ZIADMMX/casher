// Outgoing webhooks: each row is an external URL that gets a signed POST when
// one of its subscribed events happens. Idempotent, so it runs on every start.
function ensureWebhooks(dbInstance) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      secret TEXT NOT NULL,
      events TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1,
      last_status INTEGER,
      last_error TEXT,
      last_delivery_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

module.exports = { ensureWebhooks };

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
    );
    -- Deliveries that failed for a reason worth retrying (no connection, timeout, 5xx, 429), sent again by retryPending.
    CREATE TABLE IF NOT EXISTS webhook_outbox (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      body TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 1,
      next_at DATETIME NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_webhook_outbox_next ON webhook_outbox(next_at);
  `);
}

module.exports = { ensureWebhooks };

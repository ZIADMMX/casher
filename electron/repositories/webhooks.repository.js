const { db } = require('../database/db');
const { encryptSecret, decryptSecret } = require('../security/vault');

function format(row) {
  if (!row) return null;
  return {
    ...row,
    secret: decryptSecret(row.secret),
    events: JSON.parse(row.events || '[]'),
    is_active: !!row.is_active,
  };
}

function listWebhooks() {
  return db.prepare('SELECT * FROM webhooks ORDER BY id DESC').all().map(format);
}

function getWebhook(id) {
  return format(db.prepare('SELECT * FROM webhooks WHERE id = ?').get(id));
}

function createWebhook({ name, url, secret, events, is_active }) {
  const info = db.prepare(`
    INSERT INTO webhooks (name, url, secret, events, is_active) VALUES (?, ?, ?, ?, ?)
  `).run(name, url, encryptSecret(secret), JSON.stringify(events), is_active ? 1 : 0);
  return getWebhook(info.lastInsertRowid);
}

function updateWebhook(id, { name, url, events, is_active }) {
  db.prepare(`
    UPDATE webhooks SET name = ?, url = ?, events = ?, is_active = ? WHERE id = ?
  `).run(name, url, JSON.stringify(events), is_active ? 1 : 0, id);
  return getWebhook(id);
}

function deleteWebhook(id) {
  return db.prepare('DELETE FROM webhooks WHERE id = ?').run(id).changes > 0;
}

function recordDelivery(id, status, error) {
  db.prepare(`
    UPDATE webhooks SET last_status = ?, last_error = ?, last_delivery_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, error, id);
}

const MAX_QUEUED = 500; // per webhook: a dead endpoint must not fill the database

function queueRetry(webhookId, event, body, attempts, waitMinutes) {
  const waiting = db.prepare('SELECT COUNT(*) AS n FROM webhook_outbox WHERE webhook_id = ?').get(webhookId).n;
  if (waiting >= MAX_QUEUED) return false;
  db.prepare(`INSERT INTO webhook_outbox (webhook_id, event, body, attempts, next_at) VALUES (?, ?, ?, ?, datetime('now', ?))`)
    .run(webhookId, event, body, attempts, `+${waitMinutes} minutes`);
  return true;
}
const dueRetries = () => db.prepare("SELECT * FROM webhook_outbox WHERE next_at <= datetime('now') ORDER BY id LIMIT 50").all();
const deleteRetry = (id) => db.prepare('DELETE FROM webhook_outbox WHERE id = ?').run(id);
const rescheduleRetry = (id, attempts, waitMinutes) =>
  db.prepare("UPDATE webhook_outbox SET attempts = ?, next_at = datetime('now', ?) WHERE id = ?").run(attempts, `+${waitMinutes} minutes`, id);

module.exports = { queueRetry, dueRetries, deleteRetry, rescheduleRetry, listWebhooks, getWebhook, createWebhook, updateWebhook, deleteWebhook, recordDelivery };

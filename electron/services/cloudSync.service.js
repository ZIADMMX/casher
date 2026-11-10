// Desktop side of cloud sync: push every new or changed syncable row to the
// online central server so the mobile admin app can read it.
//
// Progress is a cursor per table on (updated_at, uuid), not a per-row flag:
// sales, sale_items and returns are append-only ledgers whose guards refuse
// row updates, so they cannot be marked as sent. Rows from the current second
// are left for the next run, because a later write in that same second could
// get a uuid that sorts before the cursor and be skipped.
// The server upserts by uuid and keeps the newest copy, so sending a row twice
// (a crash between the push and the cursor move) is harmless.
const fs = require('node:fs');
const path = require('node:path');
const { app } = require('electron');
const { db } = require('../database/db');
const { SYNC_TABLES } = require('../database/migrations/syncMetadata');
const { encryptSecret, decryptSecret } = require('../security/vault');

const BATCH_ROWS = 200;
const BATCH_BYTES = 1.5 * 1024 * 1024;
const KEY = /^fsk_[A-Za-z0-9_-]{43}$/;
const SKIPPED_COLUMNS = new Set(['is_synced', 'synced_at']);
const SQLITE_DATETIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d+)?$/;
// Deleted rows (see ensureDeleteTombstones); pushed last, after the rows themselves.
const TOMBSTONES = 'sync_tombstones';

const status = { lastRunAt: null, lastSuccessAt: null, lastError: null, lastPushed: 0 };
let running = null;
// Bumped by configure(): a run started with the old server stops before moving any cursor.
let configVersion = 0;

function configPath() {
  return path.join(app.getPath('userData'), 'cloud-sync.json');
}

function readConfig() {
  try {
    const stored = JSON.parse(fs.readFileSync(configPath(), 'utf8'));
    return { baseUrl: stored.baseUrl || '', deviceKey: decryptSecret(stored.deviceKey) || '' };
  } catch (error) {
    if (error.code === 'ENOENT') return { baseUrl: '', deviceKey: '' };
    throw new Error(`تعذر قراءة إعداد المزامنة السحابية: ${error.message}`);
  }
}

function validateBaseUrl(value) {
  let parsed;
  try {
    parsed = new URL(String(value || '').trim());
  } catch {
    throw new Error('عنوان خادم المزامنة غير صالح');
  }
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password
    || (parsed.pathname && parsed.pathname !== '/') || parsed.search || parsed.hash) {
    throw new Error('المزامنة السحابية تتطلب عنوان HTTPS مثل https://cloud.example.com');
  }
  return parsed.origin;
}

/** Save { baseUrl, deviceKey }, or pass null to turn sync off. The key is stored encrypted. */
function configure(value, database = db) {
  configVersion += 1;
  if (!value) {
    fs.rmSync(configPath(), { force: true });
    return getStatus();
  }
  const baseUrl = validateBaseUrl(value.baseUrl);
  const deviceKey = String(value.deviceKey || '').trim();
  if (!KEY.test(deviceKey)) throw new Error('مفتاح مزامنة الجهاز غير صالح');
  fs.mkdirSync(path.dirname(configPath()), { recursive: true });
  fs.writeFileSync(configPath(), JSON.stringify({ baseUrl, deviceKey: encryptSecret(deviceKey) }), {
    encoding: 'utf8',
    mode: 0o600,
  });
  // A new server or device starts empty, so send everything again (the server upserts, repeats are harmless).
  if (hasTable(database, 'sync_cursors')) database.exec('DELETE FROM sync_cursors');
  return getStatus();
}

function getStatus() {
  const { baseUrl, deviceKey } = readConfig();
  return { configured: Boolean(baseUrl && deviceKey), baseUrl, running: Boolean(running), ...status };
}

function ensureCursorTable(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_cursors (
      table_name TEXT PRIMARY KEY,
      updated_at TEXT NOT NULL,
      uuid TEXT NOT NULL
    )
  `);
}

function hasTable(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

/** SQLite CURRENT_TIMESTAMP text ("YYYY-MM-DD HH:MM:SS", UTC) to ISO, or null when unreadable. */
function toIso(value) {
  const text = String(value || '');
  const time = Date.parse(text.includes('T') ? text : `${text.replace(' ', 'T')}Z`);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function toRecord(table, row) {
  const data = {};
  for (const [column, value] of Object.entries(row)) {
    if (SKIPPED_COLUMNS.has(column)) continue;
    // Blobs (images, files) are not sent: they would bloat every push.
    if (Buffer.isBuffer(value)) data[column] = null;
    // SQLite datetimes are UTC without a zone; send ISO so the server reads them as UTC.
    else if (typeof value === 'string' && SQLITE_DATETIME.test(value)) data[column] = toIso(value);
    else data[column] = value;
  }
  const updatedAt = toIso(row.updated_at);
  return updatedAt ? { table, uuid: row.uuid, updated_at: updatedAt, data } : null;
}

function toTombstone(row) {
  const updatedAt = toIso(row.updated_at);
  return updatedAt ? { table: row.table_name, uuid: row.uuid, updated_at: updatedAt, deleted: true, data: {} } : null;
}

async function push(baseUrl, deviceKey, records) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${deviceKey}` },
      body: JSON.stringify({ records }),
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    // fetch only rejects for network problems; the cursor stays put, so the next run retries
    if (error.name === 'TimeoutError') throw new Error('خادم المزامنة اتأخر في الرد، وهيتعاد الرفع تلقائيًا');
    throw new Error('تعذر الوصول لخادم المزامنة (مفيش نت؟)، وهيتعاد الرفع تلقائيًا');
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    // erp-api answers { error: { code, message } }; older servers sent a plain string
    throw new Error(body.error?.message || (typeof body.error === 'string' && body.error) || `رفض خادم المزامنة الدفعة (${response.status})`);
  }
}

async function syncTable(database, table, config, version) {
  const cursorRow = database.prepare('SELECT updated_at, uuid FROM sync_cursors WHERE table_name = ?').get(table);
  let cursor = cursorRow || { updated_at: '', uuid: '' };
  const select = database.prepare(table === TOMBSTONES ? `
    SELECT table_name, uuid, deleted_at AS updated_at FROM ${TOMBSTONES}
    WHERE deleted_at < datetime('now', '-1 second')
      AND (deleted_at > @updated_at OR (deleted_at = @updated_at AND uuid > @uuid))
    ORDER BY deleted_at, uuid
    LIMIT ${BATCH_ROWS}
  ` : `
    SELECT * FROM ${table}
    WHERE uuid IS NOT NULL AND updated_at IS NOT NULL
      AND updated_at < datetime('now', '-1 second')
      AND (updated_at > @updated_at OR (updated_at = @updated_at AND uuid > @uuid))
    ORDER BY updated_at, uuid
    LIMIT ${BATCH_ROWS}
  `);
  const saveCursor = database.prepare(`
    INSERT INTO sync_cursors (table_name, updated_at, uuid) VALUES (?, ?, ?)
    ON CONFLICT(table_name) DO UPDATE SET updated_at = excluded.updated_at, uuid = excluded.uuid
  `);

  let pushed = 0;
  for (;;) {
    const rows = select.all(cursor);
    if (rows.length === 0) return pushed;
    const records = [];
    let bytes = 0;
    let last = null;
    for (const row of rows) {
      const record = table === TOMBSTONES ? toTombstone(row) : toRecord(table, row);
      const size = record ? Buffer.byteLength(JSON.stringify(record)) : 0;
      if (records.length > 0 && bytes + size > BATCH_BYTES) break;
      if (record) records.push(record);
      bytes += size;
      last = row;
    }
    if (records.length > 0) await push(config.baseUrl, config.deviceKey, records);
    if (version !== configVersion) return null;
    cursor = { updated_at: last.updated_at, uuid: last.uuid };
    saveCursor.run(table, cursor.updated_at, cursor.uuid);
    pushed += records.length;
  }
}

async function runSync(database) {
  const version = configVersion;
  const config = readConfig();
  if (!config.baseUrl || !config.deviceKey) return { skipped: true };
  status.lastRunAt = new Date().toISOString();
  try {
    ensureCursorTable(database);
    let pushed = 0;
    for (const table of [...SYNC_TABLES, TOMBSTONES]) {
      if (!hasTable(database, table)) continue;
      const count = await syncTable(database, table, config, version);
      // The server changed mid-run: stop here and let the next run start over with the new one.
      if (count === null) return { pushed, restarted: true };
      pushed += count;
    }
    Object.assign(status, { lastSuccessAt: new Date().toISOString(), lastError: null, lastPushed: pushed });
    return { pushed };
  } catch (error) {
    status.lastError = error.message;
    throw error;
  }
}

/** Push everything new since the last run. Overlapping calls share one run. */
function syncOnce(database = db) {
  if (!running) running = runSync(database).finally(() => { running = null; });
  return running;
}

module.exports = { configure, getStatus, syncOnce, toIso };

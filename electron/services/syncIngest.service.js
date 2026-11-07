// Server side of cloud sync: a shop's desktop pushes its rows here and the
// central server keeps one copy per (device, table, uuid) as JSON. The rows are
// not mapped into the central POS tables on purpose: local integer ids collide
// across shops, and the mobile admin only needs to read them.
//
// Each desktop authenticates with its own device key (issued by an admin, bound
// to one branch, revocable). Only the key's sha256 is stored. Rows are scoped to
// the device, so one shop's key can never overwrite another shop's rows.
const crypto = require('node:crypto');

// Must match SYNC_TABLES in electron/database/migrations/syncMetadata.js (a test checks).
const SYNC_TABLES = ['sales', 'sale_items', 'products', 'product_variants', 'customers', 'returns', 'shifts', 'orders'];
const MAX_RECORDS = 500;
const MAX_FUTURE_MS = 5 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^fsk_[A-Za-z0-9_-]{43}$/;

const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS sync_devices (
    id SERIAL PRIMARY KEY,
    branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
    name TEXT NOT NULL,
    key_hash TEXT NOT NULL UNIQUE,
    created_by BIGINT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_seen_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ
  );
  CREATE TABLE IF NOT EXISTS sync_records (
    device_id INTEGER NOT NULL REFERENCES sync_devices(id) ON DELETE CASCADE,
    table_name TEXT NOT NULL,
    uuid UUID NOT NULL,
    branch_id INTEGER NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    data JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (device_id, table_name, uuid)
  );
  CREATE INDEX IF NOT EXISTS idx_sync_records_branch_table_updated
    ON sync_records (branch_id, table_name, updated_at);
  -- Reports join rows by their local ids, which are only unique per device.
  CREATE INDEX IF NOT EXISTS idx_sync_records_local_id
    ON sync_records (device_id, table_name, (data->>'id'));
  CREATE INDEX IF NOT EXISTS idx_sync_records_sale_id
    ON sync_records (device_id, table_name, (data->>'sale_id'));
`;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function hashKey(key) {
  return crypto.createHash('sha256').update(key).digest('hex');
}

function newDeviceKey() {
  return `fsk_${crypto.randomBytes(32).toString('base64url')}`;
}

/** Device key from "Authorization: Bearer fsk_..." or null. */
function readDeviceKey(req) {
  const match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
  return match && KEY.test(match[1]) ? match[1] : null;
}

/**
 * Check a push body and return the rows to store, one per (table, uuid), newest wins.
 * Throws a 400 error on anything malformed so a broken client fails loudly.
 */
function validateBatch(body, now = Date.now()) {
  const records = body?.records;
  if (!Array.isArray(records) || records.length === 0 || records.length > MAX_RECORDS) {
    throw badRequest(`records يجب أن تكون قائمة من 1 إلى ${MAX_RECORDS} صف`);
  }
  const byKey = new Map();
  for (const record of records) {
    const { table, uuid, updated_at: updatedAt, data } = record || {};
    if (!SYNC_TABLES.includes(table)) throw badRequest(`جدول غير مسموح بمزامنته: ${table}`);
    if (typeof uuid !== 'string' || !UUID.test(uuid)) throw badRequest('uuid غير صالح');
    const time = Date.parse(updatedAt);
    if (typeof updatedAt !== 'string' || Number.isNaN(time)) throw badRequest('updated_at غير صالح');
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw badRequest('data يجب أن تكون كائن');
    // A device clock far in the future would make that row win every later
    // update, so a timestamp ahead of the server is pulled back to now.
    const clamped = Math.min(time, now + MAX_FUTURE_MS);
    const key = `${table}:${uuid.toLowerCase()}`;
    const previous = byKey.get(key);
    if (!previous || previous.time <= clamped) {
      byKey.set(key, { table, uuid: uuid.toLowerCase(), time: clamped, data });
    }
  }
  return [...byKey.values()].map(({ table, uuid, time, data }) => ({
    table, uuid, updated_at: new Date(time).toISOString(), data,
  }));
}

/** Active device for a key, or null. */
async function findDevice(query, key) {
  const result = await query(
    `UPDATE sync_devices SET last_seen_at = CURRENT_TIMESTAMP
     WHERE key_hash = $1 AND revoked_at IS NULL
     RETURNING id, branch_id`,
    [hashKey(key)]
  );
  return result.rows[0] || null;
}

/** Upsert the rows in one statement; an older copy never replaces a newer one. */
async function ingest(query, device, records) {
  await query(
    `INSERT INTO sync_records (device_id, branch_id, table_name, uuid, updated_at, data)
     SELECT $1, $2, t.table_name, t.uuid, t.updated_at, t.data
     FROM unnest($3::text[], $4::uuid[], $5::timestamptz[], $6::jsonb[])
       AS t(table_name, uuid, updated_at, data)
     ON CONFLICT (device_id, table_name, uuid) DO UPDATE
       SET data = EXCLUDED.data, updated_at = EXCLUDED.updated_at, received_at = CURRENT_TIMESTAMP
       WHERE sync_records.updated_at <= EXCLUDED.updated_at`,
    [
      device.id,
      device.branch_id,
      records.map((r) => r.table),
      records.map((r) => r.uuid),
      records.map((r) => r.updated_at),
      records.map((r) => JSON.stringify(r.data)),
    ]
  );
  return { accepted: records.length };
}

module.exports = {
  SYNC_TABLES,
  MAX_RECORDS,
  SCHEMA_SQL,
  hashKey,
  newDeviceKey,
  readDeviceKey,
  validateBatch,
  findDevice,
  ingest,
};

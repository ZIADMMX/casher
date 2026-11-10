// Every row that will one day sync to the cloud needs an id that is unique
// across devices (the integer id is not: two shops both have sale #5) and a
// last-change time. The columns were added in schema v3, but nothing filled
// them: new rows got uuid = NULL, the v3 backfill stopped at 5000 rows, and on
// tables that already had rows updated_at was never added at all (SQLite
// refuses a CURRENT_TIMESTAMP default on ADD COLUMN, and the error was
// swallowed). This makes the database keep them current by itself.
//
// - Existing rows get a uuid and updated_at.
// - An AFTER INSERT trigger gives each new row a uuid and updated_at.
// - An AFTER UPDATE trigger moves updated_at forward on every real change. An
//   update that touches the sync columns themselves (is_synced, synced_at) is
//   the sync engine's own bookkeeping and leaves updated_at alone.
// - returns is append-only (its guard refuses any UPDATE), so a trigger cannot
//   fill it in afterwards: returns.repository writes uuid and updated_at in the
//   INSERT itself, and the existing rows are filled with foreign keys off, when
//   the ledger guards do not fire.
//
// Deciding what is_synced means (outbox, conflicts) belongs to the sync design.
const crypto = require('node:crypto');
const { addColumnIfMissing } = require('./helpers');

const SYNC_TABLES = [
  'sales',
  'sale_items',
  'products',
  'product_variants',
  'customers',
  'returns',
  'shifts',
  'orders',
];

// Tables whose new rows cannot be touched after insert (see above).
const FILLED_BY_INSERT = new Set(['returns']);

// A random version-4 UUID in SQL (SQLite has no uuid function).
const SQL_UUID = `lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4'
  || substr(lower(hex(randomblob(2))), 2) || '-'
  || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-'
  || lower(hex(randomblob(6)))`;

function hasTable(database, name) {
  return Boolean(database.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
}

function ensureColumns(database, table) {
  addColumnIfMissing(table, 'uuid', 'TEXT', database);
  addColumnIfMissing(table, 'is_synced', 'INTEGER NOT NULL DEFAULT 0', database);
  addColumnIfMissing(table, 'synced_at', 'DATETIME', database);
  addColumnIfMissing(table, 'updated_at', 'DATETIME', database);
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_${table}_sync ON ${table}(is_synced);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table}(uuid) WHERE uuid IS NOT NULL;
  `);
}

function backfill(database, table) {
  const columns = database.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
  const since = columns.includes('created_at') ? 'COALESCE(created_at, CURRENT_TIMESTAMP)' : 'CURRENT_TIMESTAMP';
  database.exec(`UPDATE ${table} SET updated_at = ${since} WHERE updated_at IS NULL`);

  const missing = database.prepare(`SELECT rowid AS rid FROM ${table} WHERE uuid IS NULL OR uuid = ''`).all();
  const setUuid = database.prepare(`UPDATE ${table} SET uuid = ? WHERE rowid = ?`);
  for (const row of missing) setUuid.run(crypto.randomUUID(), row.rid);
}

function ensureTriggers(database, table) {
  if (FILLED_BY_INSERT.has(table)) return;
  database.exec(`
    CREATE TRIGGER IF NOT EXISTS trg_${table}_sync_insert
    AFTER INSERT ON ${table}
    WHEN NEW.uuid IS NULL OR NEW.uuid = '' OR NEW.updated_at IS NULL
    BEGIN
        UPDATE ${table}
        SET uuid = CASE WHEN uuid IS NULL OR uuid = '' THEN ${SQL_UUID} ELSE uuid END,
            updated_at = COALESCE(updated_at, CURRENT_TIMESTAMP)
        WHERE rowid = NEW.rowid;
    END;

    CREATE TRIGGER IF NOT EXISTS trg_${table}_sync_update
    AFTER UPDATE ON ${table}
    WHEN NEW.updated_at IS OLD.updated_at
     AND NEW.is_synced IS OLD.is_synced
     AND NEW.synced_at IS OLD.synced_at
    BEGIN
        UPDATE ${table} SET updated_at = CURRENT_TIMESTAMP WHERE rowid = NEW.rowid;
    END;
  `);
}

function ensureSyncMetadata(database) {
  const tables = SYNC_TABLES.filter((table) => hasTable(database, table));
  // Foreign keys off so the append-only ledger guards let the one-time fill
  // through; they are back on before any user write.
  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      for (const table of tables) {
        ensureColumns(database, table);
        backfill(database, table);
        ensureTriggers(database, table);
      }
    })();
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

// A deleted row is gone, so the cursor can never see it. An AFTER DELETE trigger
// leaves its uuid here and cloudSync pushes it as { deleted: true }.
function ensureDeleteTombstones(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS sync_tombstones (
      table_name TEXT NOT NULL,
      uuid TEXT NOT NULL,
      deleted_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (table_name, uuid)
    )
  `);
  for (const table of SYNC_TABLES.filter((t) => hasTable(database, t))) {
    database.exec(`
      CREATE TRIGGER IF NOT EXISTS trg_${table}_sync_delete
      AFTER DELETE ON ${table}
      WHEN OLD.uuid IS NOT NULL AND OLD.uuid <> ''
      BEGIN
          INSERT OR REPLACE INTO sync_tombstones (table_name, uuid, deleted_at)
          VALUES ('${table}', OLD.uuid, CURRENT_TIMESTAMP);
      END;
    `);
  }
}

module.exports = { ensureSyncMetadata, ensureDeleteTombstones, SYNC_TABLES };

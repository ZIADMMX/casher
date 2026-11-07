// Sync metadata (schema v18): every syncable row carries a cross-device uuid and
// an updated_at the database keeps current by itself.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
const returnsRepo = require('../../electron/repositories/returns.repository');
const { SYNC_TABLES } = require('../../electron/database/migrations/syncMetadata');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function seed() {
  db.exec(`
    INSERT INTO users (id, username, password_hash, role) VALUES (1, 'owner', 'x', 'admin');
    INSERT INTO products (id, name) VALUES (1, 'قميص');
    INSERT INTO product_variants (id, product_id, sku, purchase_price, selling_price, stock_quantity)
      VALUES (1, 1, 'S-1', 50, 100, 10);
    INSERT INTO customers (id, name) VALUES (1, 'أحمد');
    INSERT INTO sales (id, user_id, total_amount, payment_method) VALUES (1, 1, 100, 'cash');
    INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, unit_cost) VALUES (1, 1, 1, 100, 50);
  `);
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  runAllMigrations();
  seed();
});

afterAll(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
  closeDatabase();
});

describe('new rows', () => {
  test.each(['products', 'product_variants', 'customers', 'sales', 'sale_items'])(
    '%s rows get a v4 uuid and updated_at on insert',
    (table) => {
      const row = db.prepare(`SELECT uuid, updated_at FROM ${table} ORDER BY rowid DESC LIMIT 1`).get();
      expect(row.uuid).toMatch(UUID);
      expect(row.updated_at).toBeTruthy();
    },
  );

  test('a uuid given by the caller is kept', () => {
    db.prepare("INSERT INTO customers (name, uuid) VALUES ('سارة', '11111111-1111-4111-8111-111111111111')").run();
    expect(db.prepare("SELECT uuid FROM customers WHERE name = 'سارة'").get().uuid)
      .toBe('11111111-1111-4111-8111-111111111111');
  });

  test('returns get a uuid from the repository, and the ledger still refuses edits', () => {
    const id = returnsRepo.create({ saleId: 1, variantId: 1, quantity: 1, refundAmount: 100, userId: 1 });
    const row = db.prepare('SELECT uuid, updated_at FROM returns WHERE id = ?').get(id);
    expect(row.uuid).toMatch(UUID);
    expect(row.updated_at).toBeTruthy();
    expect(() => db.prepare("UPDATE returns SET reason = 'x' WHERE id = ?").run(id)).toThrow(/append-only/);
  });
});

describe('updated_at', () => {
  const OLD = '2020-01-01 00:00:00';

  test('moves forward when a row really changes', () => {
    db.prepare('UPDATE products SET updated_at = ? WHERE id = 1').run(OLD);
    db.prepare("UPDATE products SET name = 'قميص قطن' WHERE id = 1").run();
    expect(db.prepare('SELECT updated_at FROM products WHERE id = 1').get().updated_at).not.toBe(OLD);
  });

  test('stays put when only the sync bookkeeping changes', () => {
    db.prepare('UPDATE customers SET updated_at = ? WHERE id = 1').run(OLD);
    db.prepare('UPDATE customers SET is_synced = 1, synced_at = CURRENT_TIMESTAMP WHERE id = 1').run();
    expect(db.prepare('SELECT updated_at FROM customers WHERE id = 1').get().updated_at).toBe(OLD);
  });

  test('a stock change after a sale counts as a change', () => {
    db.prepare('UPDATE product_variants SET updated_at = ? WHERE id = 1').run(OLD);
    db.prepare('UPDATE product_variants SET stock_quantity = stock_quantity - 1 WHERE id = 1').run();
    expect(db.prepare('SELECT updated_at FROM product_variants WHERE id = 1').get().updated_at).not.toBe(OLD);
  });
});

describe('upgrading an older database that already has data', () => {
  beforeAll(() => {
    // Recreate what v17 databases look like: rows without uuid, no sync
    // triggers, and sales without updated_at (the v3 ADD COLUMN failed silently).
    db.pragma('foreign_keys = OFF');
    for (const table of SYNC_TABLES) {
      db.exec(`DROP TRIGGER IF EXISTS trg_${table}_sync_insert; DROP TRIGGER IF EXISTS trg_${table}_sync_update;`);
      db.exec(`UPDATE ${table} SET uuid = NULL`);
    }
    db.exec('DROP INDEX IF EXISTS idx_sales_sync; DROP INDEX IF EXISTS idx_sales_uuid;');
    db.exec('ALTER TABLE sales DROP COLUMN updated_at');
    db.pragma('foreign_keys = ON');
    db.pragma('user_version = 17');

    runAllMigrations();
  });

  test('reaches schema 18', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(require('../../electron/database/connection').DATABASE_SCHEMA_VERSION);
  });

  test.each(SYNC_TABLES)('every existing %s row has a uuid and updated_at', (table) => {
    const missing = db.prepare(
      `SELECT COUNT(*) AS n FROM ${table} WHERE uuid IS NULL OR uuid = '' OR updated_at IS NULL`,
    ).get().n;
    expect(missing).toBe(0);
  });

  test('sales got its missing updated_at column back, filled from created_at', () => {
    const row = db.prepare('SELECT created_at, updated_at FROM sales WHERE id = 1').get();
    expect(row.updated_at).toBe(row.created_at);
  });

  test('new rows after the upgrade get a uuid again', () => {
    db.prepare("INSERT INTO products (name) VALUES ('بنطلون')").run();
    expect(db.prepare("SELECT uuid FROM products WHERE name = 'بنطلون'").get().uuid).toMatch(UUID);
  });

  test('uuids are unique', () => {
    for (const table of SYNC_TABLES) {
      const { total, distinctCount } = db.prepare(
        `SELECT COUNT(*) AS total, COUNT(DISTINCT uuid) AS distinctCount FROM ${table}`,
      ).get();
      expect(distinctCount).toBe(total);
    }
  });
});

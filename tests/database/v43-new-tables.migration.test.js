// A database already at v42 returned early and never got the tables added later (loyalty ledger, customer tracking
// history/photos, webhook outbox): screens failed with "no such table". v43 must create them.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const tableExists = (name) => Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe('v43 migration', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    db.exec(`
      DROP TABLE loyalty_ledger; DROP TABLE webhook_outbox; DROP TABLE work_order_events; DROP TABLE work_order_photos;
      DROP INDEX idx_work_orders_tracking_token;
      ALTER TABLE work_orders DROP COLUMN tracking_token; ALTER TABLE work_orders DROP COLUMN tracking_hash;
      ALTER TABLE work_order_lines DROP COLUMN done;
    `);
    db.pragma('user_version = 42');
    runAllMigrations();
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('creates what a v42 database is missing and reaches the current version', () => {
    for (const table of ['loyalty_ledger', 'webhook_outbox', 'work_order_events', 'work_order_photos']) expect(tableExists(table)).toBe(true);
    expect(columnsOf('work_orders')).toEqual(expect.arrayContaining(['tracking_token', 'tracking_hash']));
    expect(columnsOf('work_order_lines')).toContain('done');
    expect(db.pragma('user_version', { simple: true })).toBe(require('../../electron/database/connection').DATABASE_SCHEMA_VERSION);
  });
});

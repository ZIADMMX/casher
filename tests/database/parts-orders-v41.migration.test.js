// A database already at v40 returned early and never got parts_orders, so work-order screens failed with
// "no such table: parts_orders". v41 must create it.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe('v41 parts orders migration', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    db.exec('ALTER TABLE work_order_lines DROP COLUMN parts_order_id; DROP TABLE parts_order_items; DROP TABLE parts_orders;');
    db.pragma('user_version = 40');
    runAllMigrations();
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('creates the tables a v40 database is missing and reaches the current version', () => {
    expect(columnsOf('parts_orders')).toEqual(expect.arrayContaining(['po_number', 'supplier_id', 'status']));
    expect(columnsOf('work_order_lines')).toContain('parts_order_id');
    expect(db.pragma('user_version', { simple: true })).toBe(require('../../electron/database/connection').DATABASE_SCHEMA_VERSION);
  });
});

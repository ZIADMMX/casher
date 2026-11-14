// A database already at v35 returned early and never got the timed-freeze / upgrade columns,
// so subscriptions:getAll failed with "no such column: frozen_until". v36 must add them.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe('v36 gym subscription columns migration', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    db.exec(`
      ALTER TABLE customer_subscriptions DROP COLUMN frozen_until;
      ALTER TABLE customer_subscriptions DROP COLUMN upgraded_from_id;
    `);
    db.pragma('user_version = 35');
    runAllMigrations();
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('adds the columns a v35 database is missing and reaches the current version', () => {
    expect(columnsOf('customer_subscriptions')).toEqual(expect.arrayContaining(['frozen_until', 'upgraded_from_id']));
    expect(db.pragma('user_version', { simple: true })).toBe(require('../../electron/database/connection').DATABASE_SCHEMA_VERSION);
  });
});

// A database already at v33 skipped the v7/v10 steps, so columns later added to
// those steps never reached it. v34 must add them through runAllMigrations.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe('v34 legal columns migration', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    db.exec(`
      ALTER TABLE customers DROP COLUMN legal_profile;
      ALTER TABLE courts DROP COLUMN working_hours;
      ALTER TABLE legal_cases DROP COLUMN verdict_result;
      ALTER TABLE legal_cases DROP COLUMN verdict_date;
    `);
    db.pragma('user_version = 33');
    runAllMigrations();
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('adds the columns a v33 database is missing', () => {
    expect(columnsOf('customers')).toContain('legal_profile');
    expect(columnsOf('courts')).toContain('working_hours');
    expect(columnsOf('legal_cases')).toEqual(expect.arrayContaining(['verdict_result', 'verdict_date']));
    expect(db.pragma('user_version', { simple: true })).toBe(require('../../electron/database/connection').DATABASE_SCHEMA_VERSION);
  });
});

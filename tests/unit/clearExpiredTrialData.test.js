const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { clearExpiredTrialData } = require('../../electron/database/db');
if (originalUserDataDir === undefined) {
  delete process.env.FOX_USER_DATA_DIR;
} else {
  process.env.FOX_USER_DATA_DIR = originalUserDataDir;
}

const Database = require('better-sqlite3');

describe('clearExpiredTrialData', () => {
  let database;

  beforeEach(() => {
    database = new Database(':memory:');
    database.pragma('foreign_keys = ON');
    database.exec(`
      CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL REFERENCES customers(id),
        total REAL NOT NULL
      );
      INSERT INTO customers (name) VALUES ('Customer');
      INSERT INTO sales (customer_id, total) VALUES (1, 25);
      INSERT INTO settings (key, value) VALUES
        ('trial_start_date', '2025-01-01T00:00:00.000Z'),
        ('last_known_server_clock', '2025-01-02T00:00:00.000Z'),
        ('license_key', 'activation-key'),
        ('store_name', 'Trial Store');
    `);
  });

  afterEach(() => {
    database.close();
  });

  test('clears related store data and preserves the database schema and license metadata', () => {
    const schemaBefore = database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all().map(({ name }) => name);

    expect(clearExpiredTrialData(database)).toBe(true);

    expect(database.prepare('SELECT COUNT(*) AS count FROM customers').get().count).toBe(0);
    expect(database.prepare('SELECT COUNT(*) AS count FROM sales').get().count).toBe(0);
    expect(database.prepare('SELECT key, value FROM settings ORDER BY key').all()).toEqual([
      { key: 'last_known_server_clock', value: '2025-01-02T00:00:00.000Z' },
      { key: 'license_key', value: 'activation-key' },
      { key: 'license_trial_purged', value: '1' },
      { key: 'trial_start_date', value: '2025-01-01T00:00:00.000Z' },
    ]);
    expect(database.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name"
    ).all().map(({ name }) => name)).toEqual(schemaBefore);
    expect(database.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(database.pragma('foreign_key_check')).toEqual([]);
    expect(database.prepare('SELECT COUNT(*) AS count FROM sqlite_sequence').get().count).toBe(0);
  });

  test('keeps later data cleared without repeating the expensive vacuum', () => {
    clearExpiredTrialData(database);
    database.prepare('INSERT INTO customers (name) VALUES (?)').run('Unexpected write');

    expect(clearExpiredTrialData(database)).toBe(false);
    expect(database.prepare('SELECT COUNT(*) AS count FROM customers').get().count).toBe(0);
  });
});

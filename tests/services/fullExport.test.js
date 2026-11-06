const Database = require('better-sqlite3');

jest.mock('electron', () => ({ dialog: {} }));
const { buildFullExportWorkbook } = require('../../electron/services/export.service');

test('full export has every business table and no secrets', () => {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, password_hash TEXT, recovery_key_hash TEXT);
    CREATE TABLE sales (id INTEGER PRIMARY KEY, total_amount REAL);
    CREATE TABLE settings (key TEXT, value TEXT);
    CREATE TABLE revoked_tokens (jti TEXT);
    CREATE VIRTUAL TABLE products_fts USING fts5(name);
    INSERT INTO users VALUES (1, 'owner', '$2b$secret', '$2b$rec');
    INSERT INTO sales VALUES (1, 99.5);
    INSERT INTO settings VALUES ('license_key', 'FOX1-X');
  `);

  const workbook = buildFullExportWorkbook(db);
  const sheets = workbook.worksheets.map((s) => s.name).sort();
  expect(sheets).toEqual(['sales', 'users']);

  const users = workbook.getWorksheet('users');
  expect(users.getRow(1).values.filter(Boolean)).toEqual(['id', 'username']);
  expect(users.getRow(2).values.filter(Boolean)).toEqual([1, 'owner']);
  expect(workbook.getWorksheet('sales').getRow(2).values.filter(Boolean)).toEqual([1, 99.5]);
});

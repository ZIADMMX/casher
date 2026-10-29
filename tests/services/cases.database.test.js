const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

describe('Database: lawyer_time_logs foreign key definition and migration', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
  });

  afterEach(() => {
    if (db) db.close();
  });

  test('schema.sql creates lawyer_time_logs with ON DELETE RESTRICT for lawyer_id', () => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    const fks = db.prepare('PRAGMA foreign_key_list(lawyer_time_logs)').all();
    const userFk = fks.find((f) => f.from === 'lawyer_id' && f.table === 'users');

    expect(userFk).toBeDefined();
    expect(userFk.on_delete).toBe('RESTRICT');

    const columns = db.prepare('PRAGMA table_info(lawyer_time_logs)').all();
    const lawyerIdCol = columns.find((c) => c.name === 'lawyer_id');

    expect(lawyerIdCol).toBeDefined();
    expect(lawyerIdCol.notnull).toBe(1);
  });

  test('prevents deleting a user with active time logs due to RESTRICT', () => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');
    db.exec(schema);

    // Create customer, user and case
    db.prepare("INSERT INTO customers (id, name, phone) VALUES (1, 'Client 1', '01000000000')").run();
    db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (1, 'lawyer1', 'hash', 'cashier')").run();
    db.prepare("INSERT INTO legal_cases (id, case_number, court_name, opponent_name, subject, client_id) VALUES (10, 'CASE-001', 'Court A', 'Opponent B', 'Subject C', 1)").run();

    // Create time log
    db.prepare(`
      INSERT INTO lawyer_time_logs (case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date)
      VALUES (10, 1, 3.5, 200, 700, 'Legal Research', '2026-10-16')
    `).run();

    // Attempting to delete user must fail cleanly due to RESTRICT foreign key
    expect(() => {
      db.prepare('DELETE FROM users WHERE id = 1').run();
    }).toThrow(/FOREIGN KEY constraint failed/);
  });

  test('migrates legacy ON DELETE SET NULL table to ON DELETE RESTRICT preserving data', () => {
    // Setup legacy table structure
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
      CREATE TABLE legal_cases (id INTEGER PRIMARY KEY);
      CREATE TABLE lawyer_time_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          case_id INTEGER NOT NULL,
          lawyer_id INTEGER NOT NULL,
          hours REAL NOT NULL CHECK(hours > 0),
          hourly_rate REAL NOT NULL DEFAULT 0,
          total_amount REAL NOT NULL DEFAULT 0,
          activity_description TEXT NOT NULL,
          date DATE NOT NULL,
          is_billed INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
          FOREIGN KEY (lawyer_id) REFERENCES users(id) ON DELETE SET NULL
      );
      INSERT INTO users VALUES (1, 'lawyer_old');
      INSERT INTO legal_cases VALUES (10);
      INSERT INTO lawyer_time_logs (case_id, lawyer_id, hours, activity_description, date)
      VALUES (10, 1, 5, 'Court session', '2026-10-16');
    `);

    // Verify it starts with legacy SET NULL
    const fksBefore = db.prepare('PRAGMA foreign_key_list(lawyer_time_logs)').all();
    const userFkBefore = fksBefore.find((f) => f.from === 'lawyer_id' && f.table === 'users');
    expect(userFkBefore.on_delete).toBe('SET NULL');

    // Run migration logic
    const { migrateCasesTables } = require('../../electron/database/db');
    migrateCasesTables(db);

    // Verify after migration
    const fksAfter = db.prepare('PRAGMA foreign_key_list(lawyer_time_logs)').all();
    const userFkAfter = fksAfter.find((f) => f.from === 'lawyer_id' && f.table === 'users');
    expect(userFkAfter.on_delete).toBe('RESTRICT');

    const log = db.prepare('SELECT * FROM lawyer_time_logs WHERE id = 1').get();
    expect(log.hours).toBe(5);
    expect(log.activity_description).toBe('Court session');
  });
});

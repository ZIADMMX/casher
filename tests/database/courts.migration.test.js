const Database = require('better-sqlite3');

const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const {
  db,
  migrateCourtsTables,
  migrateLegalCaseArchiveFinance,
  migrateCustomerPowerOfAttorneyTables,
  migrateLegalClientInteractions,
} = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

describe('courts database migration', () => {
  let migrationDb;

  beforeEach(() => {
    migrationDb = new Database(':memory:');
    migrationDb.exec(`
      CREATE TABLE legal_cases (
        id INTEGER PRIMARY KEY,
        court_name TEXT NOT NULL,
        paid_amount REAL NOT NULL DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO legal_cases (court_name) VALUES ('محكمة قديمة');
    `);
    migrationDb.pragma('user_version = 6');
  });

  afterEach(() => migrationDb.close());
  afterAll(() => db.close());

  test('adds the court directory and keeps existing cases compatible', () => {
    migrateCourtsTables(migrationDb);
    migrateCourtsTables(migrationDb);

    const columns = migrationDb.prepare('PRAGMA table_info(legal_cases)').all();
    expect(columns.some((column) => column.name === 'court_id')).toBe(true);
    expect(migrationDb.prepare('SELECT court_name, court_id FROM legal_cases').get()).toEqual({
      court_name: 'محكمة قديمة',
      court_id: null,
    });
    expect(migrationDb.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'courts'").get()).toBeTruthy();
  });

  test('backfills document history and reconciles previous paid totals with fee transactions', () => {
    migrationDb.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY);
      CREATE TABLE case_financials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL,
        type TEXT NOT NULL,
        amount REAL NOT NULL,
        date TEXT,
        description TEXT,
        paid_by_client INTEGER,
        uploaded_by INTEGER
      );
      CREATE TABLE case_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        case_id INTEGER NOT NULL,
        title TEXT NOT NULL,
        doc_type TEXT,
        file_path TEXT NOT NULL,
        file_size INTEGER,
        version INTEGER DEFAULT 1,
        uploaded_by INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO case_financials (case_id, type, amount) VALUES (1, 'fee_payment', 50);
      INSERT INTO case_documents (case_id, title, file_path, version)
      VALUES (1, 'مذكرة', 'C:\\\\legacy\\\\memo.pdf', 2);
      UPDATE legal_cases SET paid_amount = 200 WHERE id = 1;
    `);

    migrateLegalCaseArchiveFinance(migrationDb);
    migrateLegalCaseArchiveFinance(migrationDb);

    expect(migrationDb.prepare(`
      SELECT SUM(amount) AS total FROM case_financials
      WHERE case_id = 1 AND type = 'fee_payment'
    `).get().total).toBe(200);
    expect(migrationDb.prepare(`
      SELECT COUNT(*) AS count FROM case_financials
      WHERE case_id = 1 AND description LIKE 'دفعة أتعاب افتتاحية%'
    `).get().count).toBe(1);
    expect(migrationDb.prepare('SELECT version FROM case_document_versions WHERE document_id = 1').get().version).toBe(2);
  });

  test('creates the customer power of attorney table and indexes idempotently', () => {
    migrationDb.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY);
      CREATE TABLE users (id INTEGER PRIMARY KEY);
    `);

    migrateCustomerPowerOfAttorneyTables(migrationDb);
    migrateCustomerPowerOfAttorneyTables(migrationDb);

    expect(migrationDb.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customer_power_of_attorneys'"
    ).get()).toBeTruthy();
    expect(migrationDb.prepare('PRAGMA table_info(customer_power_of_attorneys)').all()
      .map((column) => column.name))
      .toEqual(expect.arrayContaining(['customer_id', 'number', 'issued_at', 'scope', 'expires_at']));
  });

  test('creates an independent legal client contact history table idempotently', () => {
    migrationDb.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY);
      CREATE TABLE users (id INTEGER PRIMARY KEY);
    `);

    migrateLegalClientInteractions(migrationDb);
    migrateLegalClientInteractions(migrationDb);

    expect(migrationDb.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'legal_client_interactions'"
    ).get()).toBeTruthy();
    expect(migrationDb.prepare('PRAGMA table_info(legal_client_interactions)').all()
      .map((column) => column.name))
      .toEqual(expect.arrayContaining(['customer_id', 'created_by', 'type', 'subject', 'follow_up_date']));
  });
});

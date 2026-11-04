const fs = require('node:fs');
const path = require('node:path');

describe('database schema migrations', () => {
  const baseTestDir = path.join(__dirname, '../.jest-cache');
  if (!fs.existsSync(baseTestDir)) fs.mkdirSync(baseTestDir, { recursive: true });

  it('adds branch_id and warehouse_id to legacy sales schema', () => {
    const tempDir = fs.mkdtempSync(path.join(baseTestDir, 'foxcloud-sales-'));
    process.env.FOX_USER_DATA_DIR = tempDir;
    jest.resetModules();

    const { db, migrateSalesTable, closeDatabase } = require('../electron/database/db.js');

    db.exec(`
      CREATE TABLE IF NOT EXISTS branches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
      );

      CREATE TABLE IF NOT EXISTS warehouses (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        branch_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (branch_id) REFERENCES branches(id)
      );

      CREATE TABLE IF NOT EXISTS customers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        role TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1
      );

      CREATE TABLE IF NOT EXISTS sales (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER,
        user_id INTEGER,
        total_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        payment_method TEXT CHECK(payment_method IN ('cash', 'card', 'credit')),
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id),
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
    `);

    db.pragma('user_version = 0');
    migrateSalesTable();

    const salesColumns = db.prepare('PRAGMA table_info(sales)').all().map((column) => column.name);
    expect(salesColumns).toEqual(expect.arrayContaining(['branch_id', 'warehouse_id']));

    const salesSql = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'sales'").get().sql;
    expect(salesSql).toContain('branch_id');
    expect(salesSql).toContain('warehouse_id');

    closeDatabase();
  });

  describe('kitchen order migration', () => {
    it('adds constrained restaurant mode and kitchen status columns to existing sales', () => {
      const Database = require('better-sqlite3');
      const migrationDb = new Database(':memory:');
      const { migrateKitchenOrdersV5 } = require('../electron/database/db.js');
      migrationDb.exec('CREATE TABLE sales (id INTEGER PRIMARY KEY)');

      migrateKitchenOrdersV5(migrationDb);

      const columns = migrationDb.prepare('PRAGMA table_info(sales)').all().map((column) => column.name);
      expect(columns).toEqual(expect.arrayContaining(['order_mode', 'kitchen_status']));
      expect(() => migrationDb.prepare(
        "INSERT INTO sales (order_mode, kitchen_status) VALUES ('invalid', 'new')"
      ).run()).toThrow();
      migrationDb.close();
    });
  });

  it('adds branch_id and warehouse_id to legacy shifts schema during initDatabase', () => {
    const tempDir = fs.mkdtempSync(path.join(baseTestDir, 'foxcloud-shifts-'));
    process.env.FOX_USER_DATA_DIR = tempDir;
    jest.resetModules();

    const Database = require('better-sqlite3');
    const dbPath = path.join(tempDir, 'shop.db');
    const setupDb = new Database(dbPath);
    setupDb.exec(`
      CREATE TABLE shifts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        opened_by_name TEXT,
        start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
        end_time DATETIME,
        opening_cash REAL NOT NULL DEFAULT 0,
        status TEXT CHECK(status IN ('open', 'closed')) DEFAULT 'open',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);
    setupDb.close();

    const { db, initDatabase, closeDatabase } = require('../electron/database/db.js');
    expect(() => initDatabase()).not.toThrow();

    const shiftColumns = db.prepare('PRAGMA table_info(shifts)').all().map((column) => column.name);
    expect(shiftColumns).toContain('branch_id');
    expect(shiftColumns).toContain('warehouse_id');

    closeDatabase();
  });
});

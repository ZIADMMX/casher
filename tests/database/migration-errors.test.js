const Database = require('better-sqlite3');

const {
  addColumnIfMissing,
  foreignKeyViolationCounts,
  assertNoNewForeignKeyViolations,
} = require('../../electron/database/migrations/helpers');

describe('foreign key check around a table rebuild', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE sales (id INTEGER PRIMARY KEY, customer_id INTEGER REFERENCES customers(id));
      INSERT INTO customers (id, name) VALUES (1, 'a'), (2, 'b');
      INSERT INTO sales (id, customer_id) VALUES (10, 1), (11, 2);
    `);
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    console.warn.mockRestore();
    db.close();
  });

  // Mimics a migration: foreign keys off, rebuild in a transaction, check before commit.
  function rebuild(change) {
    const before = foreignKeyViolationCounts(db);
    db.pragma('foreign_keys = OFF');
    try {
      db.transaction(() => {
        change();
        assertNoNewForeignKeyViolations(before, 'test rebuild', db);
      })();
    } finally {
      db.pragma('foreign_keys = ON');
    }
  }

  test('a rebuild that breaks links throws and rolls back', () => {
    expect(() => rebuild(() => {
      db.exec(`
        CREATE TABLE customers_new (id INTEGER PRIMARY KEY, name TEXT);
        INSERT INTO customers_new (id, name) SELECT id + 100, name FROM customers;
        DROP TABLE customers;
        ALTER TABLE customers_new RENAME TO customers;
      `);
    })).toThrow(/sales: 0 → 2/);

    expect(db.prepare('SELECT id FROM customers ORDER BY id').all().map((r) => r.id)).toEqual([1, 2]);
  });

  test('a clean rebuild passes', () => {
    expect(() => rebuild(() => {
      db.exec(`
        CREATE TABLE customers_new (id INTEGER PRIMARY KEY, name TEXT, phone TEXT);
        INSERT INTO customers_new (id, name) SELECT id, name FROM customers;
        DROP TABLE customers;
        ALTER TABLE customers_new RENAME TO customers;
      `);
    })).not.toThrow();
    expect(console.warn).not.toHaveBeenCalled();
  });

  test('links broken before the upgrade are only reported, not blocking', () => {
    db.pragma('foreign_keys = OFF');
    db.exec('INSERT INTO sales (id, customer_id) VALUES (12, 999)');
    db.pragma('foreign_keys = ON');

    expect(() => rebuild(() => {
      db.exec('CREATE TABLE extra (id INTEGER PRIMARY KEY)');
    })).not.toThrow();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('test rebuild'), { sales: 1 });
  });
});

describe('addColumnIfMissing', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    db.exec('CREATE TABLE things (id INTEGER PRIMARY KEY, name TEXT)');
  });

  afterEach(() => db.close());

  const columns = () => db.prepare('PRAGMA table_info(things)').all().map((c) => c.name);

  test('adds a missing column and reports it', () => {
    expect(addColumnIfMissing('things', 'price', 'REAL DEFAULT 0', db)).toBe(true);
    expect(columns()).toContain('price');
  });

  test('leaves an existing column alone', () => {
    expect(addColumnIfMissing('things', 'name', 'TEXT', db)).toBe(false);
  });

  test('a failed column addition stops the upgrade instead of being swallowed', () => {
    // SQLite refuses a NOT NULL column without a default once the table has rows.
    db.exec("INSERT INTO things (name) VALUES ('x')");
    expect(() => addColumnIfMissing('things', 'code', 'TEXT NOT NULL', db))
      .toThrow(/things.*code|code.*things/);
    expect(columns()).not.toContain('code');
  });

  test('a missing table is an error, not a silent no-op', () => {
    expect(() => addColumnIfMissing('nope', 'x', 'TEXT', db)).toThrow(/nope/);
  });

  test('rejects names that are not plain identifiers', () => {
    expect(() => addColumnIfMissing('things; DROP TABLE things', 'x', 'TEXT', db)).toThrow();
    expect(columns()).toEqual(['id', 'name']);
  });
});

jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return { db };
});

const { db } = require('../../electron/database/db');
const repository = require('../../electron/repositories/legalClientInteractions.repository');

describe('legal client interaction repository', () => {
  beforeEach(() => {
    db.exec(`
      CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT);
      CREATE TABLE customers (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        last_interaction_at TEXT
      );
      CREATE TABLE crm_interactions (
        id INTEGER PRIMARY KEY,
        customer_id INTEGER NOT NULL,
        subject TEXT NOT NULL
      );
      CREATE TABLE legal_client_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        created_by INTEGER,
        type TEXT NOT NULL,
        subject TEXT NOT NULL,
        details TEXT,
        follow_up_date TEXT,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      );
      INSERT INTO users (id, username) VALUES (7, 'lawyer');
      INSERT INTO customers (id, name, last_interaction_at) VALUES (1, 'موكل', NULL);
    `);
  });

  afterEach(() => {
    db.exec(`
      DROP TABLE legal_client_interactions;
      DROP TABLE crm_interactions;
      DROP TABLE customers;
      DROP TABLE users;
    `);
  });

  afterAll(() => db.close());

  test('stores legal contacts separately without changing CRM history or customer CRM fields', () => {
    const saved = repository.create({
      customer_id: 1,
      created_by: 7,
      type: 'call',
      subject: 'مراجعة مستندات القضية',
      details: 'تمت مراجعة المستندات',
      follow_up_date: '2026-11-05',
    });

    expect(saved).toMatchObject({
      customer_id: 1,
      created_by: 7,
      created_by_name: 'lawyer',
      type: 'call',
      subject: 'مراجعة مستندات القضية',
    });
    expect(repository.getByCustomerId(1)).toHaveLength(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM crm_interactions').get().count).toBe(0);
    expect(db.prepare('SELECT last_interaction_at FROM customers WHERE id = 1').get().last_interaction_at).toBeNull();
  });
});

const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');

jest.mock('../../electron/database/db', () => ({ db: mockDb }));

const customersRepo = require('../../electron/repositories/customers.repository');

describe('customer credit balances', () => {
  beforeAll(() => {
    mockDb.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY, customer_id INTEGER, total_amount REAL, payment_method TEXT
      );
      CREATE TABLE customer_payments (id INTEGER PRIMARY KEY, customer_id INTEGER, amount REAL);
      INSERT INTO customers (id, name) VALUES (1, 'آجل وسداد'), (2, 'كاش فقط'), (3, 'بدون مشتريات'), (4, 'سداد كامل');
      INSERT INTO sales (customer_id, total_amount, payment_method) VALUES
        (1, 100.10, 'credit'), (1, 50.20, 'credit'), (1, 999, 'cash'), (1, 999, 'card'),
        (2, 300, 'cash'),
        (4, 80, 'credit'),
        (NULL, 70, 'credit');
      INSERT INTO customer_payments (customer_id, amount) VALUES (1, 30.05), (1, 20), (4, 80);
    `);
  });

  afterAll(() => mockDb.close());

  test('balance is credit sales minus payments, ignoring cash and card sales', () => {
    const balances = Object.fromEntries(customersRepo.getBalances().map((r) => [r.id, r.balance]));
    expect(balances).toEqual({ 1: 100.25, 2: 0, 3: 0, 4: 0 });
  });

  test('getRecentSales returns the newest sales of one customer and honours the limit', () => {
    // The shared fixture only has the columns the balance query needs.
    mockDb.exec('ALTER TABLE sales ADD COLUMN due_date TEXT; ALTER TABLE sales ADD COLUMN created_at TEXT;');
    const sales = customersRepo.getRecentSales(1, 3);
    expect(sales).toHaveLength(3);
    expect(sales[0].id).toBeGreaterThan(sales[1].id);
    expect(Object.keys(sales[0])).toEqual(['id', 'total_amount', 'payment_method', 'due_date', 'created_at']);
    expect(customersRepo.getRecentSales(3)).toEqual([]);
  });

  test('getBalance returns one customer balance without computing everyone', () => {
    expect(customersRepo.getBalance(1)).toBe(100.25);
    expect(customersRepo.getBalance(3)).toBe(0);
    expect(customersRepo.getBalance(999)).toBe(0);
  });
});

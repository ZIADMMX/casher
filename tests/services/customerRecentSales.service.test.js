const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: () => ({ id: 1 }),
  requireAdmin: () => ({ id: 1 }),
  getCurrentSession: () => ({ id: 1 }),
}));
const customers = require('../../electron/services/customers.service');

describe('getCustomerRecentSales limit (member profile shows the whole history)', () => {
  let customerId;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    customerId = db.prepare("INSERT INTO customers (name) VALUES ('عضو')").run().lastInsertRowid;
    const insert = db.prepare("INSERT INTO sales (customer_id, total_amount, payment_method) VALUES (?, 10, 'cash')");
    for (let i = 0; i < 30; i += 1) insert.run(customerId);
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('keeps 10 as the default so other screens are unchanged', () => {
    expect(customers.getCustomerRecentSales(customerId)).toHaveLength(10);
  });

  it('honours a larger limit and falls back to 10 for a bad one', () => {
    expect(customers.getCustomerRecentSales(customerId, 500)).toHaveLength(30);
    expect(customers.getCustomerRecentSales(customerId, 'abc')).toHaveLength(10);
    expect(customers.getCustomerRecentSales(customerId, 0)).toHaveLength(1);
  });
});

const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');

jest.mock('../../electron/database/db', () => ({ db: mockDb }));

const reportsRepo = require('../../electron/repositories/reports.repository');

function localDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

describe('Reports repository local date handling', () => {
  beforeAll(() => {
    mockDb.exec(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY,
        username TEXT,
        full_name TEXT,
        first_name TEXT,
        last_name TEXT
      );
      CREATE TABLE sales (
        id INTEGER PRIMARY KEY,
        user_id INTEGER,
        total_amount REAL NOT NULL,
        discount REAL DEFAULT 0,
        payment_method TEXT,
        customer_name TEXT,
        created_at DATETIME
      );
      CREATE TABLE sale_items (
        id INTEGER PRIMARY KEY,
        sale_id INTEGER NOT NULL
      );
      CREATE TABLE returns (
        id INTEGER PRIMARY KEY,
        sale_id INTEGER,
        user_id INTEGER,
        quantity INTEGER,
        refund_amount REAL,
        created_at DATETIME
      );
    `);
  });

  afterAll(() => {
    mockDb.close();
  });

  test('includes UTC timestamps in their local calendar day across report queries', () => {
    const localSaleTime = new Date(2026, 8, 30, 0, 30);
    const createdAtUtc = localSaleTime.toISOString().replace('T', ' ').slice(0, 19);
    const reportDate = localDateString(localSaleTime);
    const filter = { startDate: reportDate, endDate: reportDate };
    mockDb.prepare(`
      INSERT INTO sales (id, total_amount, payment_method, customer_name, created_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 125, 'cash', null, createdAtUtc);

    expect(reportsRepo.getSalesSummary(filter)).toEqual({
      invoiceCount: 1,
      grossSales: 125,
      discounts: 0,
    });
    expect(reportsRepo.getDailyTrend(filter)).toEqual([
      { day: reportDate, total: 125, invoiceCount: 1 },
    ]);
    expect(reportsRepo.getRecentInvoices(reportDate, reportDate)).toEqual([
      expect.objectContaining({ id: 1, created_at: expect.stringContaining(reportDate) }),
    ]);
    expect(reportsRepo.getLedgerPage(filter).rows).toEqual([
      expect.objectContaining({ kind: 'sale', code: 'INV-0001', amount: 125 }),
    ]);
  });
});

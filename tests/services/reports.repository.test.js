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

afterAll(() => {
  mockDb.close();
});

describe('Reports repository date range speed and boundaries', () => {
  const toUtcText = (date) => date.toISOString().replace('T', ' ').slice(0, 19);

  beforeEach(() => {
    mockDb.exec(`
      DELETE FROM sales; DELETE FROM returns;
      CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
      CREATE INDEX IF NOT EXISTS idx_returns_created_at ON returns(created_at);
    `);
  });

  const insertSale = (id, createdAt, total = 10) => mockDb.prepare(
    "INSERT INTO sales (id, total_amount, payment_method, created_at) VALUES (?, ?, 'cash', ?)",
  ).run(id, total, createdAt);

  test('a day includes sales up to local midnight and excludes the next local day', () => {
    const day = new Date(2026, 10, 6);
    insertSale(1, toUtcText(new Date(2026, 10, 5, 23, 30)), 1);   // day before
    insertSale(2, toUtcText(new Date(2026, 10, 6, 0, 0, 0)), 10); // first second of the day
    insertSale(3, toUtcText(new Date(2026, 10, 6, 23, 59, 59)), 100); // last second of the day
    insertSale(4, toUtcText(new Date(2026, 10, 7, 0, 30)), 1000); // next day

    const date = localDateString(day);
    expect(reportsRepo.getSalesSummary({ startDate: date, endDate: date })).toEqual({
      invoiceCount: 2,
      grossSales: 110,
      discounts: 0,
    });
  });

  test('ISO timestamps with T and Z are still counted on the right day', () => {
    const local = new Date(2026, 10, 6, 12, 0);
    insertSale(1, local.toISOString(), 55);

    const date = localDateString(local);
    expect(reportsRepo.getSalesSummary({ startDate: date, endDate: date }).grossSales).toBe(55);
  });

  test('a multi-day range covers every day in it', () => {
    insertSale(1, toUtcText(new Date(2026, 9, 1, 9, 0)), 1);
    insertSale(2, toUtcText(new Date(2026, 9, 15, 9, 0)), 2);
    insertSale(3, toUtcText(new Date(2026, 9, 31, 22, 0)), 4);
    insertSale(4, toUtcText(new Date(2026, 10, 1, 9, 0)), 8);

    expect(reportsRepo.getSalesSummary({ startDate: '2026-10-01', endDate: '2026-10-31' }).grossSales).toBe(7);
  });

  test('report queries use the created_at index instead of scanning all sales', () => {
    const sql = `SELECT COUNT(*) FROM sales s WHERE ${reportsRepo.SALE_IN_RANGE}`;
    const plan = mockDb.prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(reportsRepo.rangeParams({ startDate: '2026-11-06', endDate: '2026-11-06' }))
      .map((row) => row.detail)
      .join(' | ');
    expect(plan).toContain('idx_sales_created_at');
  });
});

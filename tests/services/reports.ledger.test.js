// Runs the real migrations on an in-memory database, then checks that report
// numbers come from a ledger nobody can edit after the fact.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

jest.mock('../../electron/services/auth.service', () => ({
  ...jest.requireActual('../../electron/services/auth.service'),
  requireAdmin: jest.fn(),
}));

const salesRepo = require('../../electron/repositories/sales.repository');
const reportsService = require('../../electron/services/reports.service');

const DAY = '2026-10-15';
const AT = `${DAY} 12:00:00`;

let cashierId;
let otherId;
let variantId;
let saleId;

function addSale({ userId, total, method, qty, price }) {
  const id = db.prepare(`
    INSERT INTO sales (user_id, customer_name, total_amount, discount, payment_method, created_at)
    VALUES (?, ?, ?, 0, ?, datetime(?, 'utc'))
  `).run(userId, method === 'credit' ? 'عميل آجل' : null, total, method, AT).lastInsertRowid;
  salesRepo.createSaleItem(id, { variantId, quantity: qty, unitPrice: price });
  return id;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  runAllMigrations();
  db.pragma('foreign_keys = ON');

  const addUser = db.prepare("INSERT INTO users (username, password_hash, role, full_name) VALUES (?, 'x', 'cashier', ?)");
  cashierId = addUser.run('sami', 'أحمد سامي').lastInsertRowid;
  otherId = addUser.run('mona', 'منى عادل').lastInsertRowid;
  const categoryId = db.prepare("INSERT INTO categories (name) VALUES ('تصنيف تجريبي')").run().lastInsertRowid;
  const productId = db.prepare('INSERT INTO products (name, category_id) VALUES (?, ?)').run('صنف تجريبي', categoryId).lastInsertRowid;
  variantId = db.prepare(`
    INSERT INTO product_variants (product_id, sku, purchase_price, selling_price, stock_quantity)
    VALUES (?, 'T-1', 60, 100, 0)
  `).run(productId).lastInsertRowid;

  saleId = addSale({ userId: cashierId, total: 300, method: 'cash', qty: 3, price: 100 });
  addSale({ userId: otherId, total: 100, method: 'credit', qty: 1, price: 100 });
  db.prepare(`
    INSERT INTO returns (sale_id, variant_id, quantity, refund_amount, user_id, created_at)
    VALUES (?, ?, 1, 100, ?, datetime(?, 'utc'))
  `).run(saleId, variantId, cashierId, AT);
});

afterAll(() => {
  console.log.mockRestore();
  closeDatabase();
});

describe('sales ledger is append-only', () => {
  test('a sale cannot be deleted', () => {
    expect(() => db.prepare('DELETE FROM sales WHERE id = ?').run(saleId)).toThrow(/append-only/);
  });

  test('the amount, payment method and date of a sale cannot be edited', () => {
    expect(() => db.prepare('UPDATE sales SET total_amount = 1 WHERE id = ?').run(saleId)).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE sales SET payment_method = 'card' WHERE id = ?").run(saleId)).toThrow(/append-only/);
    expect(() => db.prepare("UPDATE sales SET created_at = '2020-01-01' WHERE id = ?").run(saleId)).toThrow(/append-only/);
  });

  test('kitchen status and customer anonymization still work', () => {
    expect(() => db.prepare("UPDATE sales SET kitchen_status = 'ready', customer_name = 'محذوف' WHERE id = ?").run(saleId)).not.toThrow();
  });

  test('sale lines and returns cannot be edited or deleted', () => {
    expect(() => db.prepare('UPDATE sale_items SET unit_price = 1 WHERE sale_id = ?').run(saleId)).toThrow(/append-only/);
    expect(() => db.prepare('UPDATE sale_items SET unit_cost = 0 WHERE sale_id = ?').run(saleId)).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM sale_items WHERE sale_id = ?').run(saleId)).toThrow(/append-only/);
    expect(() => db.prepare('UPDATE returns SET refund_amount = 0').run()).toThrow(/append-only/);
    expect(() => db.prepare('DELETE FROM returns').run()).toThrow(/append-only/);
  });
});

describe('report numbers', () => {
  const period = { startDate: DAY, endDate: DAY };

  test('net sales and profit subtract returns, using the cost frozen at sale time', () => {
    // Raising the purchase price later must not change past profit.
    db.prepare('UPDATE product_variants SET purchase_price = 95 WHERE id = ?').run(variantId);
    const report = reportsService.getFullReport(period);
    expect(report.kpis.grossSales).toBe(400);
    expect(report.kpis.returnsTotal).toBe(100);
    expect(report.kpis.netSales).toBe(300);
    // cost 4 × 60 = 240, one unit back (60) → 180; profit 300 − 180 = 120
    expect(report.kpis.profit).toBe(120);
    expect(report.kpis.returnCount).toBe(1);
    expect(report.payments.find((p) => p.method === 'credit')).toMatchObject({ total: 100, share: 25 });
    expect(report.credit).toEqual({ total: 100, customers: 1 });
    expect(report.topSelling[0]).toMatchObject({ productName: 'صنف تجريبي', categoryName: 'تصنيف تجريبي', qtySold: 4 });
    expect(report.staff.map((s) => s.name)).toEqual(['أحمد سامي', 'منى عادل']);
  });

  test('the staff filter narrows every number to one person', () => {
    const report = reportsService.getFullReport({ ...period, userId: otherId });
    expect(report.kpis.grossSales).toBe(100);
    expect(report.kpis.returnsTotal).toBe(0);
  });

  test('the invoice list mixes sales and returns, with search and paging', () => {
    const all = reportsService.getInvoicesPage({ period, pageSize: 2 });
    expect(all.total).toBe(3);
    expect(all.rows).toHaveLength(2);
    expect(all.pageCount).toBe(2);
    expect(all.amountTotal).toBe(300);

    const returns = reportsService.getInvoicesPage({ period, method: 'return' });
    expect(returns.rows).toEqual([expect.objectContaining({ kind: 'return', amount: -100, code: 'RET-0001' })]);

    const search = reportsService.getInvoicesPage({ period, search: 'منى' });
    expect(search.total).toBe(1);
    expect(reportsService.getInvoicesPage({ period, search: '100%' }).total).toBe(0);
  });

  test('refuses impossible dates, reversed ranges, over a year, and unknown staff', () => {
    expect(() => reportsService.getFullReport({ startDate: '2026-02-30', endDate: '2026-03-01' })).toThrow('تاريخ فترة التقرير غير صالح');
    expect(() => reportsService.getFullReport({ startDate: '2026-11-03', endDate: '2026-11-02' })).toThrow('بداية فترة التقرير');
    expect(() => reportsService.getFullReport({ startDate: '2024-01-01', endDate: '2026-01-01' })).toThrow('سنة واحدة');
    expect(() => reportsService.getFullReport({ ...period, userId: 99999 })).toThrow('الموظف المحدد غير موجود');
    expect(() => reportsService.getFullReport('forever')).toThrow('الفترة الزمنية');
  });
});

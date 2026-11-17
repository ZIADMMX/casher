/**
 * @file workshopReports.test.js
 * @description تقارير الورشة: إيراد الأوامر المقفولة، المقارنة بالفترة السابقة، الفنيين والخدمات، وإنها للورش فقط.
 */

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({ requireAdmin: jest.fn(() => ({ id: null })) }));
const auth = require('../../electron/services/auth.service');
const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
require('../../electron/database/migrations/autoWorkshop').ensureAutoWorkshop(db);

const settings = require('../../electron/repositories/settings.repository');
const reports = require('../../electron/services/workshopReports.service');

let customerId;
let vehicleId;
const range = { startDate: '2026-11-01', endDate: '2026-11-15' };

// A delivered order closed on `day` (local noon) with the given labor / parts / mechanic.
function closed({ day, labor = 0, parts = 0, mechanic = null, service = 'تغيير زيت وفلتر', branch = null }) {
  const saleId = branch == null ? null : Number(db.prepare(
    "INSERT INTO sales (branch_id, total_amount, payment_method) VALUES (?, ?, 'cash')").run(branch, labor + parts).lastInsertRowid);
  const id = Number(db.prepare(`
    INSERT INTO work_orders (order_number, vehicle_id, customer_id, status, odometer_in, mechanic, sale_id, opened_at, closed_at)
    VALUES ('WO-T' || abs(random()), ?, ?, 'delivered', 1000, ?, ?, ?, ?)`).run(vehicleId, customerId, mechanic, saleId, `${day} 09:00:00`, `${day} 12:00:00`).lastInsertRowid);
  if (labor) db.prepare("INSERT INTO work_order_lines (work_order_id, kind, description, quantity, unit_price) VALUES (?, 'labor', ?, 1, ?)").run(id, service, labor);
  if (parts) {
    const p = Number(db.prepare("INSERT INTO products (name) VALUES ('قطعة')").run().lastInsertRowid);
    const v = Number(db.prepare('INSERT INTO product_variants (product_id, purchase_price, selling_price, stock_quantity) VALUES (?, 1, 1, 9)').run(p).lastInsertRowid);
    db.prepare("INSERT INTO work_order_lines (work_order_id, kind, variant_id, description, quantity, unit_price) VALUES (?, 'part', ?, 'قطعة', 2, ?)").run(id, v, parts / 2);
  }
  return id;
}

beforeAll(() => {
  customerId = Number(db.prepare("INSERT INTO customers (name, phone) VALUES ('عميل تقارير', '01012345678')").run().lastInsertRowid);
  db.prepare("INSERT OR IGNORE INTO branches (id, name) VALUES (1, 'الفرع الرئيسي'), (2, 'فرع المعادي')").run();
  db.prepare("INSERT OR IGNORE INTO vehicles (customer_id, plate) VALUES (?, 'RPT123')").run(customerId); // the test database file outlives a run
  vehicleId = db.prepare("SELECT id FROM vehicles WHERE plate = 'RPT123'").get().id;
});

beforeEach(() => {
  settings.set('business_type', 'auto_workshop');
  db.exec('DELETE FROM work_order_lines; DELETE FROM work_orders;'); // sales are append-only; orphaned ones are never reached
});

describe('تقارير الورشة', () => {
  test('بتجمّع العمالة والقطع والمتوسط من الأوامر المقفولة بس', () => {
    closed({ day: '2026-11-03', labor: 500, parts: 1000, mechanic: 'م. علاء' });
    closed({ day: '2026-11-03', labor: 300, mechanic: 'م. علاء' });
    db.prepare("INSERT INTO work_orders (order_number, vehicle_id, customer_id, status, odometer_in) VALUES ('WO-OPEN', ?, ?, 'in_progress', 1)").run(vehicleId, customerId);

    const r = reports.getReport(range);
    expect(r.totals).toEqual({ orders: 2, parts: 1000, labor: 800, revenue: 1800, avg: 900 });
    expect(r.range.days).toBe(15);
    expect(r.daily).toHaveLength(15);
    expect(r.daily.find((d) => d.day === '2026-11-03').orders).toBe(2);
  });

  test('بتقارن بالفترة السابقة بنفس الطول', () => {
    closed({ day: '2026-10-20', labor: 400 }); // before the 15 days that precede Nov 1 (Oct 17 – Oct 31)
    closed({ day: '2026-10-05', labor: 999 }); // older than the comparison window
    closed({ day: '2026-11-02', labor: 600 });
    const r = reports.getReport(range);
    expect(r.range.prevStart).toBe('2026-10-17');
    expect(r.range.prevEnd).toBe('2026-10-31');
    expect(r.prev.revenue).toBe(400);
    expect(r.totals.revenue).toBe(600);
  });

  test('الفنيين والخدمات مترتبين بالإيراد، وغير المُسند بيتجمّع لوحده', () => {
    closed({ day: '2026-11-04', labor: 800, mechanic: 'م. وليد', service: 'ضبط زوايا العجل' });
    closed({ day: '2026-11-05', labor: 200, mechanic: 'م. حسن', service: 'تغيير زيت وفلتر' });
    closed({ day: '2026-11-06', labor: 300, service: 'تغيير زيت وفلتر' });
    const r = reports.getReport(range);
    expect(r.mechanics.map((m) => m.name)).toEqual(['م. وليد', 'غير مُسند', 'م. حسن']);
    expect(r.services[0]).toMatchObject({ name: 'ضبط زوايا العجل', revenue: 800, orders: 1 });
    expect(r.services[1]).toMatchObject({ name: 'تغيير زيت وفلتر', revenue: 500, orders: 2 });
  });

  test('بيفلتر بالفرع ويرجّع أحدث 7 أوامر فقط', () => {
    closed({ day: '2026-11-02', labor: 100, branch: 1 });
    closed({ day: '2026-11-02', labor: 700, branch: 2 });
    expect(reports.getReport({ ...range, branchId: 2 }).totals.revenue).toBe(700);
    for (let i = 0; i < 9; i += 1) closed({ day: '2026-11-10', labor: 10 });
    const r = reports.getReport(range);
    expect(r.recent).toHaveLength(7);
    expect(r.totals.orders).toBe(11);
  });

  test('بيرفض فترة غلط أو أطول من سنة', () => {
    expect(() => reports.getReport({ startDate: '2026-11-15', endDate: '2026-11-01' })).toThrow();
    expect(() => reports.getReport({ startDate: '2025-01-01', endDate: '2026-11-01' })).toThrow('سنة');
    expect(() => reports.getReport({ startDate: 'x', endDate: '2026-11-01' })).toThrow();
    expect(() => reports.getReport({ ...range, branchId: -3 })).toThrow('الفرع');
  });

  test('مقفولة على قطاع الورش ولصاحب الصلاحية بس', () => {
    settings.set('business_type', 'retail');
    expect(() => reports.getReport(range)).toThrow('ورش السيارات');
    expect(() => reports.getExportRows(range)).toThrow('ورش السيارات');

    settings.set('business_type', 'auto_workshop');
    auth.requireAdmin.mockImplementationOnce(() => { throw new Error('غير مصرح'); });
    expect(() => reports.getReport(range)).toThrow('غير مصرح');
  });

  test('ملف Excel: صف لكل أمر بالأعمدة العربية', () => {
    closed({ day: '2026-11-07', labor: 250, parts: 500, mechanic: 'م. ياسر' });
    const { rows } = reports.getExportRows(range);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ 'الفني': 'م. ياسر', 'عمالة': 250, 'قطع': 500, 'الإجمالي': 750, 'اللوحة': 'RPT123' });
  });
});

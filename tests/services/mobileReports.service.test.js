// Mobile admin reports over synced shop rows. The SQL itself runs only against a
// real PostgreSQL (set PG_TEST_URL); the rest checks input handling and the math.
const { randomUUID } = require('node:crypto');
const reports = require('../../electron/services/mobileReports.service');
const syncIngest = require('../../electron/services/syncIngest.service');

const RANGE = { from: '2026-01-01T00:00:00Z', to: '2026-01-02T00:00:00Z' };

describe('parseRange', () => {
  test('normalizes the range and the optional branch', () => {
    expect(reports.parseRange({ ...RANGE, branch_id: '2' })).toEqual({
      from: '2026-01-01T00:00:00.000Z', to: '2026-01-02T00:00:00.000Z', branchId: 2,
    });
    expect(reports.parseRange(RANGE).branchId).toBeNull();
  });

  test.each([
    ['missing dates', {}],
    ['reversed range', { from: RANGE.to, to: RANGE.from }],
    ['more than a year', { from: '2024-01-01T00:00:00Z', to: '2026-01-01T00:00:00Z' }],
    ['bad branch', { ...RANGE, branch_id: '1 OR 1=1' }],
  ])('rejects %s with 400', (_name, query) => {
    expect(() => reports.parseRange(query)).toThrow(expect.objectContaining({ statusCode: 400 }));
  });
});

test('summary uses the desktop profit formula', async () => {
  const query = jest.fn()
    .mockResolvedValueOnce({ rows: [{
      invoice_count: '2', gross_sales: '300', discounts: '10', cost_of_sales: '120',
      return_count: '1', refunds: '50', returned_cost: '20',
    }] })
    .mockResolvedValueOnce({ rows: [{ method: 'cash', invoice_count: '2', total: '300' }] })
    .mockResolvedValueOnce({ rows: [{ branch_id: 1, invoice_count: '2', total: '300' }] });
  const summary = await reports.getSummary(query, reports.parseRange(RANGE));
  // net = 300 - 50 = 250; profit = 250 - (120 - 20) = 150
  expect(summary).toMatchObject({ invoiceCount: 2, netSales: 250, profit: 150, avgInvoice: 150 });
  expect(query.mock.calls[0][1]).toEqual(['2026-01-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z', null]);
});

test('sales page size is capped', async () => {
  const query = jest.fn().mockResolvedValue({ rows: [] });
  await reports.listSales(query, { ...RANGE, limit: '5000' });
  expect(query.mock.calls[0][1].slice(3)).toEqual([100, 0]);
});

const pgDescribe = process.env.PG_TEST_URL ? describe : describe.skip;

pgDescribe('against PostgreSQL', () => {
  const { Pool } = require('pg');
  let admin;
  let pool;
  let schema;
  const q = (sql, params) => pool.query(sql, params);

  beforeAll(async () => {
    schema = `mobile_reports_test_${randomUUID().replace(/-/g, '')}`;
    admin = new Pool({ connectionString: process.env.PG_TEST_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: process.env.PG_TEST_URL, options: `-c search_path=${schema}` });
    await q('CREATE TABLE branches (id SERIAL PRIMARY KEY)');
    await q('INSERT INTO branches DEFAULT VALUES');
    await q(syncIngest.SCHEMA_SQL);
    const key = syncIngest.newDeviceKey();
    await q("INSERT INTO sync_devices (branch_id, name, key_hash) VALUES (1, 'shop', $1)", [syncIngest.hashKey(key)]);
    const device = await syncIngest.findDevice(q, key);
    const rec = (table, data) => ({ table, uuid: randomUUID(), updated_at: '2026-01-01T12:00:00Z', data });
    await syncIngest.ingest(q, device, syncIngest.validateBatch({ records: [
      rec('products', { id: 1, name: 'قميص', is_active: 1, is_service: 0 }),
      rec('product_variants', { id: 1, product_id: 1, purchase_price: 40, stock_quantity: 2, low_stock_threshold: 5 }),
      rec('sales', { id: 1, total_amount: 100, discount: 0, payment_method: 'cash', created_at: '2026-01-01T10:00:00.000Z' }),
      rec('sales', { id: 2, total_amount: 200, discount: 10, payment_method: 'card', created_at: '2026-01-01T11:00:00.000Z' }),
      rec('sales', { id: 3, total_amount: 999, payment_method: 'cash', created_at: '2025-12-31T23:00:00.000Z' }),
      rec('sale_items', { id: 1, sale_id: 1, variant_id: 1, quantity: 1, unit_price: 100, unit_cost: 50 }),
      rec('sale_items', { id: 2, sale_id: 2, variant_id: 1, quantity: 2, unit_price: 100, unit_cost: null }),
      rec('returns', { id: 1, sale_id: 2, variant_id: 1, quantity: 1, refund_amount: 100, created_at: '2026-01-01T13:00:00.000Z' }),
      rec('shifts', { id: 1, status: 'open', opened_by_name: 'سارة', start_time: '2026-01-01T08:00:00.000Z', opening_cash: 500 }),
    ] }));
  });

  afterAll(async () => {
    await pool?.end();
    await admin?.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin?.end();
  });

  test('summary counts only the range and matches the desktop math', async () => {
    const summary = await reports.getSummary(q, reports.parseRange(RANGE));
    // cost = 1*50 + 2*40 = 130; returned cost = 1*40; profit = (300 - 100) - (130 - 40) = 110
    expect(summary).toMatchObject({
      invoiceCount: 2, grossSales: 300, discounts: 10, refunds: 100,
      netSales: 200, costOfSales: 130, profit: 110,
    });
    expect(summary.byPayment).toHaveLength(2);
  });

  test('lists sales, low stock and open shifts', async () => {
    expect((await reports.listSales(q, RANGE)).rows.map((r) => r.total_amount)).toEqual([200, 100]);
    expect(await reports.listLowStock(q, {})).toEqual([expect.objectContaining({ product_name: 'قميص', stock_quantity: 2 })]);
    expect(await reports.listOpenShifts(q, {})).toEqual([expect.objectContaining({ opened_by_name: 'سارة', opening_cash: 500 })]);
  });
});

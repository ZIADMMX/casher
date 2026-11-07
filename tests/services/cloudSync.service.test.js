// Cloud sync, desktop side: every syncable row reaches the server once, and a
// failed push is retried on the next run.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockUserDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'cloud-sync-test-'));
jest.mock('electron', () => ({ app: { getPath: () => mockUserDataPath } }));

const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const cloudSync = require('../../electron/services/cloudSync.service');

const KEY = `fsk_${'a'.repeat(43)}`;
const OLD = '2026-01-01 10:00:00';

function pushedRecords() {
  return global.fetch.mock.calls.flatMap(([, init]) => JSON.parse(init.body).records);
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  runAllMigrations();
  db.exec(`
    INSERT INTO users (id, username, password_hash, role) VALUES (1, 'owner', 'x', 'admin');
    INSERT INTO products (id, name) VALUES (1, 'قميص');
    INSERT INTO product_variants (id, product_id, sku, purchase_price, selling_price, stock_quantity)
      VALUES (1, 1, 'S-1', 50, 100, 10);
    INSERT INTO customers (id, name) VALUES (1, 'أحمد');
    INSERT INTO sales (id, user_id, total_amount, payment_method) VALUES (1, 1, 100, 'cash');
    INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, unit_cost) VALUES (1, 1, 1, 100, 50);
  `);
  // Rows written in the current second wait for the next run; date them in the past.
  for (const table of ['products', 'product_variants', 'customers', 'sales', 'sale_items']) {
    db.prepare(`UPDATE ${table} SET updated_at = ?`).run(OLD);
  }
});

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({ ok: true, json: async () => ({}) });
});

afterAll(() => {
  console.log.mockRestore();
  console.warn.mockRestore();
  closeDatabase();
  fs.rmSync(mockUserDataPath, { recursive: true, force: true });
});

test('does nothing until a device key is configured', async () => {
  await expect(cloudSync.syncOnce(db)).resolves.toEqual({ skipped: true });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('refuses plain http and malformed keys', () => {
  expect(() => cloudSync.configure({ baseUrl: 'http://cloud.example.com', deviceKey: KEY })).toThrow('HTTPS');
  expect(() => cloudSync.configure({ baseUrl: 'https://cloud.example.com', deviceKey: 'abc' })).toThrow('مفتاح');
});

test('stores the device key encrypted', () => {
  cloudSync.configure({ baseUrl: 'https://cloud.example.com/', deviceKey: KEY });
  const stored = fs.readFileSync(path.join(mockUserDataPath, 'cloud-sync.json'), 'utf8');
  expect(stored).not.toContain(KEY);
  expect(cloudSync.getStatus()).toMatchObject({ configured: true, baseUrl: 'https://cloud.example.com' });
});

test('first run pushes every row, ledgers included, with the device key', async () => {
  await expect(cloudSync.syncOnce(db)).resolves.toEqual({ pushed: 5 });
  const [url, init] = global.fetch.mock.calls[0];
  expect(url).toBe('https://cloud.example.com/api/sync/push');
  expect(init.headers.Authorization).toBe(`Bearer ${KEY}`);
  const records = pushedRecords();
  expect(records.map((r) => r.table).sort()).toEqual(
    ['customers', 'product_variants', 'products', 'sale_items', 'sales']
  );
  const sale = records.find((r) => r.table === 'sales');
  expect(sale).toMatchObject({ updated_at: '2026-01-01T10:00:00.000Z', data: { id: 1, total_amount: 100 } });
  expect(sale.data).not.toHaveProperty('is_synced');
  expect(sale.data.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.000Z$/);
});

test('a second run with no changes pushes nothing', async () => {
  await expect(cloudSync.syncOnce(db)).resolves.toEqual({ pushed: 0 });
  expect(global.fetch).not.toHaveBeenCalled();
});

test('a changed row is pushed again; a failed push is retried next run', async () => {
  db.prepare("UPDATE customers SET name = 'أحمد علي', updated_at = '2026-01-02 09:00:00' WHERE id = 1").run();
  global.fetch.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({ error: 'busy' }) });
  await expect(cloudSync.syncOnce(db)).rejects.toThrow('busy');
  expect(cloudSync.getStatus().lastError).toBe('busy');

  global.fetch.mockClear();
  await expect(cloudSync.syncOnce(db)).resolves.toEqual({ pushed: 1 });
  expect(pushedRecords()).toEqual([expect.objectContaining({ table: 'customers', data: expect.objectContaining({ name: 'أحمد علي' }) })]);
  expect(cloudSync.getStatus().lastError).toBeNull();
});

test('toIso reads SQLite UTC timestamps', () => {
  expect(cloudSync.toIso('2026-03-04 05:06:07')).toBe('2026-03-04T05:06:07.000Z');
  expect(cloudSync.toIso('garbage')).toBeNull();
});

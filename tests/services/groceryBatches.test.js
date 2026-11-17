/**
 * @file groceryBatches.test.js
 * @description شاشة التشغيلات: حالة الصلاحية، ترتيب الصرف FIFO، وإتلاف تشغيلة (من التشغيلة ومن المخزون).
 */
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/audit.service', () => ({ logAction: jest.fn() }));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const audit = require('../../electron/services/audit.service');
const grocery = require('../../electron/services/grocery.service');

const day = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
let variantA;
let variantB;
let warehouseId;

const addBatch = (variantId, number, expiryDays, quantity, price = 10) => Number(db.prepare(
  'INSERT INTO product_batches (variant_id, batch_number, expiry_date, quantity, purchase_price) VALUES (?, ?, ?, ?, ?)'
).run(variantId, number, day(expiryDays), quantity, price).lastInsertRowid);
const mine = (board) => board.batches.filter((b) => [variantA, variantB].includes(b.variant_id));
const stock = (variantId) => inventoryRepo.getStockQuantity(warehouseId, variantId);

// The shared test database keeps stock movements for good (they are append-only), so each run makes its own
// products with a unique SKU and only the batches are cleaned up.
const stamp = Date.now();
const wipeAll = () => db.exec("DELETE FROM product_batches WHERE batch_number LIKE 'TB-%'");

beforeAll(() => {
  wipeAll();
  warehouseId = inventoryRepo.getDefaultWarehouseId();
  const product = (name) => Number(db.prepare('INSERT INTO products (name) VALUES (?)').run(name).lastInsertRowid);
  const variant = (pid, sku) => Number(db.prepare('INSERT INTO product_variants (product_id, sku, purchase_price, selling_price, stock_quantity) VALUES (?, ?, 10, 15, 0)').run(pid, sku).lastInsertRowid);
  variantA = variant(product(`لبن اختبار تشغيلات ${stamp}`), `TBV-MILK-${stamp}`);
  variantB = variant(product(`جبنة اختبار تشغيلات ${stamp}`), `TBV-CHEESE-${stamp}`);
  if (warehouseId) {
    inventoryRepo.applyStockChange({ warehouseId, variantId: variantA, delta: 100, movementType: 'opening' });
    inventoryRepo.applyStockChange({ warehouseId, variantId: variantB, delta: 50, movementType: 'opening' });
  }
});
afterAll(() => {
  wipeAll();
});
beforeEach(() => {
  jest.clearAllMocks();
  db.exec("DELETE FROM product_batches WHERE batch_number LIKE 'TB-%'");
});

describe('the batch board', () => {
  test('marks each batch expired, soon or ok, and totals the money at risk', () => {
    addBatch(variantA, 'TB-1', -3, 10, 5); // expired: 50
    addBatch(variantA, 'TB-2', 10, 4, 5); // soon: 20
    addBatch(variantA, 'TB-3', 120, 6, 5); // ok
    const board = grocery.getBatchBoard('all');
    const rows = mine(board);
    expect(rows.map((b) => [b.batch_number, b.status])).toEqual([['TB-1', 'expired'], ['TB-2', 'soon'], ['TB-3', 'ok']]);
    expect(board.summary.expired).toBeGreaterThanOrEqual(1);
    expect(rows.find((b) => b.batch_number === 'TB-1').value).toBe(50);
  });

  test('the earliest batch that is not expired is the one sold first, per product', () => {
    addBatch(variantA, 'TB-1', -3, 10); // expired batches are never "next"
    addBatch(variantA, 'TB-2', 40, 4);
    addBatch(variantA, 'TB-3', 5, 4);
    addBatch(variantB, 'TB-4', 90, 2);
    const first = mine(grocery.getBatchBoard('all')).filter((b) => b.sells_first).map((b) => b.batch_number).sort();
    expect(first).toEqual(['TB-3', 'TB-4']);
  });

  test('a batch with nothing left is not listed, and the filter narrows the list', () => {
    addBatch(variantA, 'TB-1', -1, 0);
    addBatch(variantA, 'TB-2', -1, 3);
    addBatch(variantA, 'TB-3', 100, 3);
    expect(mine(grocery.getBatchBoard('all')).map((b) => b.batch_number)).toEqual(['TB-2', 'TB-3']);
    expect(mine(grocery.getBatchBoard('expired')).map((b) => b.batch_number)).toEqual(['TB-2']);
    expect(mine(grocery.getBatchBoard('ok')).map((b) => b.batch_number)).toEqual(['TB-3']);
  });
});

describe('writing a batch off', () => {
  test('takes the quantity out of the batch and the stock, and leaves an audit line', () => {
    if (!warehouseId) return;
    const id = addBatch(variantA, 'TB-1', -2, 10, 4);
    const before = stock(variantA);
    const board = grocery.writeOffBatch({ batchId: id, quantity: 6, reason: 'منتهي' });
    expect(db.prepare('SELECT quantity FROM product_batches WHERE id = ?').get(id).quantity).toBe(4);
    expect(stock(variantA)).toBe(before - 6);
    expect(db.prepare("SELECT notes FROM inventory_movements WHERE reference_type = 'batch_writeoff' AND reference_id = ?").get(id).notes).toContain('منتهي');
    expect(audit.logAction).toHaveBeenCalledWith(expect.objectContaining({ actionType: 'batch_writeoff', amount: 24 }));
    expect(mine(board).find((b) => b.batch_number === 'TB-1').quantity).toBe(4);
  });

  test('refuses a bad quantity, a missing reason, or more than what is left', () => {
    const id = addBatch(variantA, 'TB-1', -2, 3);
    expect(() => grocery.writeOffBatch({ batchId: id, quantity: 0, reason: 'x' })).toThrow('الكمية');
    expect(() => grocery.writeOffBatch({ batchId: id, quantity: 5, reason: 'x' })).toThrow('أكبر من المتبقي');
    expect(() => grocery.writeOffBatch({ batchId: id, quantity: 1, reason: ' ' })).toThrow('سبب');
    expect(() => grocery.writeOffBatch({ batchId: 99999999, quantity: 1, reason: 'x' })).toThrow('غير موجودة');
    expect(db.prepare('SELECT quantity FROM product_batches WHERE id = ?').get(id).quantity).toBe(3);
  });

  test('if the stock cannot cover it, nothing changes in the batch either', () => {
    if (!warehouseId) return;
    const id = addBatch(variantB, 'TB-1', -2, 500); // more in the batch than in stock (stock is 50)
    expect(() => grocery.writeOffBatch({ batchId: id, quantity: 400, reason: 'تالف' })).toThrow('كمية كافية');
    expect(db.prepare('SELECT quantity FROM product_batches WHERE id = ?').get(id).quantity).toBe(500);
  });
});

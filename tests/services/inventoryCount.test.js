/**
 * @file inventoryCount.test.js
 * @description الجرد الفعلي: الكمية المعدودة بتسوّي المخزون، الفرق بيتسجل، الجرد الكلي لازم يشمل كل الأصناف، والمدخلات الغلط بتترفض.
 */
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({
  requireAdmin: jest.fn(() => ({ id: null })),
  requireAuth: jest.fn(() => ({ id: null })),
  getCurrentSession: jest.fn(() => ({ id: null })),
}));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const inventory = require('../../electron/services/inventory.service');

// Movements are append-only in the shared test database, so every run uses its own warehouse and products.
const stamp = Date.now();
let warehouseId;
let a;
let b;

const stock = (variantId) => inventoryRepo.getStockQuantity(warehouseId, variantId);
const variant = (name) => {
  const productId = Number(db.prepare('INSERT INTO products (name) VALUES (?)').run(`${name} ${stamp}`).lastInsertRowid);
  return Number(db.prepare('INSERT INTO product_variants (product_id, sku, purchase_price, selling_price, stock_quantity) VALUES (?, ?, 5, 9, 0)').run(productId, `CNT-${name}-${stamp}`).lastInsertRowid);
};

beforeAll(() => {
  const branchId = inventoryRepo.getBranches?.()[0]?.id ?? Number(db.prepare("INSERT INTO branches (name) VALUES ('فرع جرد')").run().lastInsertRowid);
  warehouseId = Number(db.prepare('INSERT INTO warehouses (branch_id, name, is_default) VALUES (?, ?, 0)').run(branchId, `مخزن جرد ${stamp}`).lastInsertRowid);
  a = variant('A');
  b = variant('B');
  inventoryRepo.applyStockChange({ warehouseId, variantId: a, delta: 10, movementType: 'opening' });
  inventoryRepo.applyStockChange({ warehouseId, variantId: b, delta: 4, movementType: 'opening' });
});

describe('a partial count', () => {
  test('sets the stock to what was counted and records expected, counted and the movement', () => {
    const { countId } = inventory.countStock({ warehouseId, countType: 'partial', items: [{ variantId: a, countedQuantity: 7 }], notes: 'جرد الرف 1' });
    expect(stock(a)).toBe(7);
    expect(stock(b)).toBe(4); // not counted: untouched
    expect(db.prepare('SELECT expected_quantity, counted_quantity FROM inventory_count_items WHERE count_id = ? AND variant_id = ?').get(countId, a))
      .toEqual({ expected_quantity: 10, counted_quantity: 7 });
    const move = db.prepare("SELECT movement_type, quantity_change, quantity_after FROM inventory_movements WHERE reference_type = 'count' AND reference_id = ? AND variant_id = ?").get(countId, a);
    expect(move).toEqual({ movement_type: 'count', quantity_change: -3, quantity_after: 7 });
  });

  test('a matching count changes no stock and writes no movement', () => {
    const before = stock(b);
    const { countId } = inventory.countStock({ warehouseId, countType: 'partial', items: [{ variantId: b, countedQuantity: before }] });
    expect(stock(b)).toBe(before);
    expect(db.prepare("SELECT COUNT(*) AS n FROM inventory_movements WHERE reference_type = 'count' AND reference_id = ?").get(countId).n).toBe(0);
  });

  test('a count can raise the stock too (found more than expected)', () => {
    const now = stock(b);
    inventory.countStock({ warehouseId, countType: 'partial', items: [{ variantId: b, countedQuantity: now + 5 }] });
    expect(stock(b)).toBe(now + 5);
  });
});

describe('a full count', () => {
  // the warehouse lists every item in the system, so a full count must cover all of them
  const everyItem = (override = {}) => inventoryRepo.listStock({ warehouseId }).map((row) => ({
    variantId: row.variant_id, countedQuantity: override[row.variant_id] ?? Number(row.quantity ?? 0),
  }));

  test('must list every item of the warehouse', () => {
    expect(() => inventory.countStock({ warehouseId, countType: 'full', items: [{ variantId: a, countedQuantity: 1 }] })).toThrow('جميع الأصناف');
    const { countId } = inventory.countStock({ warehouseId, countType: 'full', items: everyItem({ [a]: 6, [b]: 2 }) });
    expect(countId).toBeGreaterThan(0);
    expect(stock(a)).toBe(6);
    expect(stock(b)).toBe(2);
  });
});

describe('what a count refuses', () => {
  test('a bad type, an empty list, negative or fractional counts, repeated items, unknown items', () => {
    const base = { warehouseId, countType: 'partial' };
    expect(() => inventory.countStock({ ...base, countType: 'weekly', items: [{ variantId: a, countedQuantity: 1 }] })).toThrow('نوع الجرد');
    expect(() => inventory.countStock({ ...base, items: [] })).toThrow('صنفًا واحدًا');
    expect(() => inventory.countStock({ ...base, items: [{ variantId: a, countedQuantity: -1 }] })).toThrow('غير سالب');
    expect(() => inventory.countStock({ ...base, items: [{ variantId: a, countedQuantity: 1.5 }] })).toThrow('غير سالب');
    expect(() => inventory.countStock({ ...base, items: [{ variantId: a, countedQuantity: 1 }, { variantId: a, countedQuantity: 2 }] })).toThrow('تكرار');
    expect(() => inventory.countStock({ ...base, items: [{ variantId: 99999999, countedQuantity: 1 }] })).toThrow('غير موجود');
    expect(() => inventory.countStock({ ...base, warehouseId: 99999999, items: [{ variantId: a, countedQuantity: 1 }] })).toThrow('المخزن');
  });

  test('nothing is saved when one line of the count is wrong', () => {
    const before = stock(a);
    expect(() => inventory.countStock({ warehouseId, countType: 'partial', items: [{ variantId: a, countedQuantity: 1 }, { variantId: 99999999, countedQuantity: 1 }] })).toThrow();
    expect(stock(a)).toBe(before);
  });
});

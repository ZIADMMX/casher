const fs = require('node:fs');
const path = require('node:path');

jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return { db };
});

const { db } = require('../../electron/database/db');
const channelsRepository = require('../../electron/repositories/channels.repository');

describe('Sales channels repository parameterized stock queries', () => {
  beforeAll(() => {
    const schema = fs.readFileSync(
      path.join(__dirname, '../../electron/database/schema.sql'),
      'utf8'
    );
    db.exec(schema);
  });

  beforeEach(() => {
    // Ledger tables are append-only while foreign keys are on; cleanup turns them off.
    db.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM inventory_movements;
      DELETE FROM channel_sync_logs;
      DELETE FROM channel_stock_allocations;
      DELETE FROM warehouse_stock;
      DELETE FROM product_variants;
      DELETE FROM products;
      DELETE FROM sales_channels;
      DELETE FROM warehouses;
      DELETE FROM branches;
    `);

    db.prepare('INSERT INTO branches (id, name) VALUES (?, ?)').run(1, 'الفرع');
    db.prepare('INSERT INTO warehouses (id, branch_id, name) VALUES (?, ?, ?)').run(1, 1, 'المخزن الأول');
    db.prepare('INSERT INTO warehouses (id, branch_id, name) VALUES (?, ?, ?)').run(2, 1, 'المخزن الثاني');
    db.prepare(
      'INSERT INTO sales_channels (id, name, channel_type, warehouse_id) VALUES (?, ?, ?, ?)'
    ).run(1, 'المتجر', 'online_store', 1);
    db.prepare('INSERT INTO products (id, name) VALUES (?, ?)').run(1, 'منتج');
    db.prepare(`
      INSERT INTO product_variants
        (id, product_id, purchase_price, selling_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?)
    `).run(1, 1, 10, 20, 99);
    db.prepare(
      'INSERT INTO warehouse_stock (warehouse_id, variant_id, quantity) VALUES (?, ?, ?)'
    ).run(1, 1, 5);
    db.prepare(
      'INSERT INTO warehouse_stock (warehouse_id, variant_id, quantity) VALUES (?, ?, ?)'
    ).run(2, 1, 500);
  });

  afterAll(() => {
    db.close();
  });

  test('limits allocation stock to its channel warehouse', () => {
    const allocations = channelsRepository.getChannelAllocations(1);

    expect(allocations).toHaveLength(1);
    expect(allocations[0].warehouse_stock).toBe(5);
  });

  test('treats SQL-like search text as a literal value', () => {
    const allocations = channelsRepository.getChannelAllocations(1, {
      search: "' OR 1=1 --",
    });

    expect(allocations).toEqual([]);
    expect(db.prepare('SELECT COUNT(*) AS count FROM sales_channels').get().count).toBe(1);
  });
  describe('external channel orders', () => {
    const channelsService = require('../../electron/services/channels.service');
    const stockOf = (warehouseId) => db.prepare(
      'SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND variant_id = 1'
    ).get(warehouseId).quantity;

    beforeEach(() => {
      db.prepare('UPDATE sales_channels SET auto_deduct_stock = 1 WHERE id = 1').run();
    });

    test('deducts through the ledger so movement and balance agree', () => {
      channelsService.processExternalChannelOrder(1, { orderNumber: 'A-1', items: [{ variantId: 1, quantity: 2 }] });

      expect(stockOf(1)).toBe(3);
      const movement = db.prepare('SELECT * FROM inventory_movements WHERE warehouse_id = 1').get();
      expect(movement).toMatchObject({
        movement_type: 'sale', quantity_change: -2, quantity_after: 3, reference_type: 'channel_order',
      });
    });

    test('rejects negative, fractional or zero quantities instead of adding stock', () => {
      for (const quantity of [-10, 1.5, 0, 'abc']) {
        expect(() => channelsService.processExternalChannelOrder(1, { items: [{ variantId: 1, quantity }] }))
          .toThrow('عددًا صحيحًا موجبًا');
      }
      expect(stockOf(1)).toBe(5);
    });

    test('refuses an order larger than the warehouse stock instead of clamping to zero', () => {
      expect(() => channelsService.processExternalChannelOrder(1, { items: [{ variantId: 1, quantity: 6 }] }))
        .toThrow('لا يكفي');
      expect(stockOf(1)).toBe(5);
      expect(db.prepare('SELECT COUNT(*) AS n FROM inventory_movements').get().n).toBe(0);
    });

    test('rolls back the whole order when one line fails', () => {
      db.prepare(`
        INSERT INTO product_variants (id, product_id, purchase_price, selling_price, stock_quantity)
        VALUES (2, 1, 10, 20, 0)
      `).run();
      expect(() => channelsService.processExternalChannelOrder(1, {
        items: [{ variantId: 1, quantity: 2 }, { variantId: 2, quantity: 1 }],
      })).toThrow('لا يكفي');
      expect(stockOf(1)).toBe(5);
    });

    test('the same order number cannot be deducted twice', () => {
      channelsService.processExternalChannelOrder(1, { orderNumber: 'A-7', items: [{ variantId: 1, quantity: 1 }] });
      expect(() => channelsService.processExternalChannelOrder(1, { orderNumber: 'A-7', items: [{ variantId: 1, quantity: 1 }] }))
        .toThrow('اتسجل قبل كده');
      expect(stockOf(1)).toBe(4);
    });
  });
});

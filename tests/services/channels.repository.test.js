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
    db.exec(`
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
});

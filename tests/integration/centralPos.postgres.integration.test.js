const { randomUUID } = require('node:crypto');
const { Pool } = require('pg');
const { createCentralSale } = require('../../electron/services/centralPos.service');

const postgresUrl = process.env.PG_TEST_URL;
const postgresDescribe = postgresUrl ? describe : describe.skip;

postgresDescribe('central POS PostgreSQL concurrency', () => {
  let adminPool;
  let testPool;
  let schemaName;

  beforeAll(async () => {
    schemaName = `central_pos_test_${randomUUID().replace(/-/g, '')}`;
    adminPool = new Pool({ connectionString: postgresUrl });
    await adminPool.query(`CREATE SCHEMA ${schemaName}`);
    testPool = new Pool({
      connectionString: postgresUrl,
      options: `-c search_path=${schemaName}`,
      max: 4,
    });
    await testPool.query(`
      CREATE TABLE branches (id SERIAL PRIMARY KEY);
      CREATE TABLE users (
        id SERIAL PRIMARY KEY, username TEXT, role TEXT,
        branch_id INTEGER REFERENCES branches(id), is_active BOOLEAN NOT NULL
      );
      CREATE TABLE warehouses (
        id SERIAL PRIMARY KEY, branch_id INTEGER REFERENCES branches(id), is_active BOOLEAN
      );
      CREATE TABLE products (id SERIAL PRIMARY KEY, name TEXT, is_active BOOLEAN);
      CREATE TABLE product_variants (
        id SERIAL PRIMARY KEY, product_id INTEGER REFERENCES products(id),
        selling_price NUMERIC(12, 2), purchase_price NUMERIC(12, 2),
        stock_quantity INTEGER, sku TEXT
      );
      CREATE TABLE warehouse_stock (
        warehouse_id INTEGER REFERENCES warehouses(id),
        variant_id INTEGER REFERENCES product_variants(id),
        quantity INTEGER NOT NULL CHECK (quantity >= 0), updated_at TIMESTAMPTZ,
        PRIMARY KEY (warehouse_id, variant_id)
      );
      CREATE TABLE shifts (
        id SERIAL PRIMARY KEY, user_id INTEGER REFERENCES users(id),
        warehouse_id INTEGER REFERENCES warehouses(id), status TEXT,
        total_cash_sales NUMERIC(12, 2) DEFAULT 0,
        total_card_sales NUMERIC(12, 2) DEFAULT 0,
        total_credit_sales NUMERIC(12, 2) DEFAULT 0
      );
      CREATE TABLE sales (
        id BIGSERIAL PRIMARY KEY, shift_id INTEGER, branch_id INTEGER, warehouse_id INTEGER,
        customer_name TEXT, customer_phone TEXT, user_id INTEGER,
        total_amount NUMERIC(12, 2), discount NUMERIC(12, 2),
        payment_method TEXT, due_date DATE
      );
      CREATE TABLE sale_items (
        id BIGSERIAL PRIMARY KEY, sale_id BIGINT, variant_id INTEGER,
        quantity INTEGER, unit_price NUMERIC(12, 2)
      );
      CREATE TABLE inventory_movements (
        id BIGSERIAL PRIMARY KEY, warehouse_id INTEGER, variant_id INTEGER,
        movement_type TEXT, quantity_change INTEGER, quantity_after INTEGER,
        reference_type TEXT, reference_id BIGINT, user_id INTEGER
      );
      INSERT INTO branches DEFAULT VALUES;
      INSERT INTO users (username, role, branch_id, is_active) VALUES ('cashier', 'cashier', 1, TRUE);
      INSERT INTO warehouses (branch_id, is_active) VALUES (1, TRUE);
      INSERT INTO products (name, is_active) VALUES ('Last item', TRUE);
      INSERT INTO product_variants (product_id, selling_price, purchase_price, stock_quantity, sku)
        VALUES (1, 25, 10, 1, 'LAST-ONE');
      INSERT INTO warehouse_stock (warehouse_id, variant_id, quantity) VALUES (1, 1, 1);
      INSERT INTO shifts (user_id, warehouse_id, status) VALUES (1, 1, 'open');
    `);
  });

  afterAll(async () => {
    await testPool?.end();
    if (schemaName) await adminPool.query(`DROP SCHEMA ${schemaName} CASCADE`);
    await adminPool?.end();
  });

  test('only one simultaneous checkout can sell the final unit', async () => {
    const attempt = () => createCentralSale({
      pool: testPool,
      userId: 1,
      warehouseId: 1,
      saleData: { items: [{ variantId: 1, quantity: 1 }], paymentMethod: 'cash' },
    });
    const results = await Promise.allSettled([attempt(), attempt()]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const state = await testPool.query(`
      SELECT (SELECT quantity FROM warehouse_stock WHERE warehouse_id = 1 AND variant_id = 1) AS quantity,
        (SELECT COUNT(*) FROM sales) AS sales_count,
        (SELECT COUNT(*) FROM sale_items) AS items_count,
        (SELECT COUNT(*) FROM inventory_movements) AS movement_count
    `);
    expect(state.rows[0]).toMatchObject({
      quantity: 0,
      sales_count: '1',
      items_count: '1',
      movement_count: '1',
    });
  });
});
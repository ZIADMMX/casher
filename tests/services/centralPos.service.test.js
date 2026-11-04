jest.mock('../../electron/database/dbPool', () => ({
  writePool: { connect: jest.fn() },
}));

const { writePool } = require('../../electron/database/dbPool');
const { createCentralSale } = require('../../electron/services/centralPos.service');

function setupClient({ stockAvailable = true } = {}) {
  const client = {
    query: jest.fn(async (sql) => {
      if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK') return { rows: [], rowCount: 0 };
      if (sql.includes('FROM users WHERE id = $1')) {
        return { rows: [{ id: 7, username: 'cashier', role: 'cashier', branch_id: 2, is_active: true }] };
      }
      if (sql.includes('FROM warehouses')) return { rows: [{ id: 4, branch_id: 2 }] };
      if (sql.includes('FROM shifts')) return { rows: [{ id: 3 }] };
      if (sql.includes('FROM product_variants pv')) {
        return { rows: [{ id: 12, selling_price: '20.00', purchase_price: '9.00', sku: 'SKU-12', product_name: 'Shirt' }] };
      }
      if (sql.includes('INSERT INTO sales')) return { rows: [{ id: '90' }], rowCount: 1 };
      if (sql.includes('UPDATE warehouse_stock')) {
        return stockAvailable
          ? { rows: [{ quantity: 2 }], rowCount: 1 }
          : { rows: [], rowCount: 0 };
      }
      return { rows: [], rowCount: 1 };
    }),
    release: jest.fn(),
  };
  writePool.connect.mockResolvedValue(client);
  return client;
}

describe('centralPos.createCentralSale', () => {
  beforeEach(() => writePool.connect.mockReset());

  test('uses the primary conditional stock update and database price', async () => {
    const client = setupClient();
    const result = await createCentralSale({
      userId: 7,
      warehouseId: 4,
      saleData: {
        items: [{ variantId: 12, quantity: 1, unitPrice: 0.01 }],
        discount: 5,
        paymentMethod: 'cash',
      },
    });

    expect(result).toEqual({ saleId: '90', totalAmount: 20 });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('quantity >= $1'),
      [1, 4, 12]
    );
    const saleInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sales'));
    expect(saleInsert[0]).not.toContain('discount');
    expect(saleInsert[1]).toContain(20);
    expect(client.query).toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('stores the restaurant order mode and starts it in the kitchen queue', async () => {
    const client = setupClient();
    await createCentralSale({
      userId: 7,
      warehouseId: 4,
      saleData: {
        items: [{ variantId: 12, quantity: 1 }],
        paymentMethod: 'cash',
        orderMode: 'dine_in',
      },
    });

    const saleInsert = client.query.mock.calls.find(([sql]) => sql.includes('INSERT INTO sales'));
    expect(saleInsert[0]).toContain('order_mode, kitchen_status');
    expect(saleInsert[1].slice(-2)).toEqual(['dine_in', 'new']);
  });

  test('rolls back the complete sale when stock changed before deduction', async () => {
    const client = setupClient({ stockAvailable: false });
    await expect(createCentralSale({
      userId: 7,
      warehouseId: 4,
      saleData: { items: [{ variantId: 12, quantity: 1 }], paymentMethod: 'cash' },
    })).rejects.toMatchObject({ statusCode: 409 });

    expect(client.query).toHaveBeenCalledWith('ROLLBACK');
    expect(client.query).not.toHaveBeenCalledWith('COMMIT');
    expect(client.release).toHaveBeenCalledTimes(1);
  });
});
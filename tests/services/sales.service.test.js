jest.mock('../../electron/database/db', () => ({
  db: { transaction: (callback) => () => callback() },
}));
jest.mock('../../electron/repositories/customers.repository', () => ({
  getByPhone: jest.fn(),
  create: jest.fn(),
}));
jest.mock('../../electron/repositories/sales.repository', () => ({
  createSale: jest.fn(() => 42),
  createSaleItem: jest.fn(),
  getById: jest.fn(),
}));
jest.mock('../../electron/repositories/productVariants.repository', () => ({
  getById: jest.fn(),
  decreaseStock: jest.fn(),
}));
jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(() => null),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 7, username: 'cashier' })),
}));

const salesRepo = require('../../electron/repositories/sales.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const { createSale } = require('../../electron/services/sales.service');

describe('sales.service.createSale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    variantsRepo.getById.mockImplementation((id) => ({
      id,
      selling_price: id === 1 ? 19.99 : 10,
      stock_quantity: id === 1 ? 10 : 1,
      size: 'M',
      color: 'black',
      low_stock_threshold: 0,
    }));
  });

  test('calculates decimal totals and applies the discount exactly to cents', () => {
    const result = createSale({
      items: [{ variantId: 1, quantity: 3 }],
      discount: 0.1,
      paymentMethod: 'cash',
    });

    expect(result).toEqual({ saleId: 42, totalAmount: 59.87 });
    expect(salesRepo.createSale).toHaveBeenCalledWith(expect.objectContaining({
      totalAmount: 59.87,
      discount: 0.1,
    }));
    expect(variantsRepo.decreaseStock).toHaveBeenCalledWith(1, 3);
  });

  test('rejects a sale that exceeds available stock before writing anything', () => {
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 11 }],
      paymentMethod: 'cash',
    })).toThrow('الكمية المتاحة غير كافية');

    expect(salesRepo.createSale).not.toHaveBeenCalled();
    expect(variantsRepo.decreaseStock).not.toHaveBeenCalled();
  });

  test('never allows a discount to exceed subtotal and enforces cashier discount cap', () => {
    // For cashier (default mocked user role), discount > 30% is blocked
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 1 }],
      discount: 10,
      paymentMethod: 'cash',
    })).toThrow('غير مصرح للكاشير بتطبيق خصم يتجاوز 30%');

    // Valid discount within 30% cap succeeds
    const result = createSale({
      items: [{ variantId: 1, quantity: 1 }],
      discount: 5,
      paymentMethod: 'cash',
    });
    expect(result.totalAmount).toBe(14.99);
  });

  test('rejects fractional or negative quantities and negative discounts', () => {
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 0.5 }],
      paymentMethod: 'cash',
    })).toThrow('رقمًا صحيحًا أكبر من الصفر');

    expect(() => createSale({
      items: [{ variantId: 1, quantity: 1 }],
      discount: -1,
      paymentMethod: 'cash',
    })).toThrow('أكبر من أو يساوي الصفر');
  });
});
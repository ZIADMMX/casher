const mockStockUpdateRun = jest.fn();

jest.mock('../../electron/database/db', () => ({
  db: {
    prepare: jest.fn(() => ({
      get: jest.fn(() => ({ quantity: 2, unit_price: 12.5 })),
      run: mockStockUpdateRun,
    })),
    transaction: (callback) => () => callback(),
  },
}));
jest.mock('../../electron/repositories/returns.repository', () => ({
  getReturnedQuantity: jest.fn(() => 1),
  create: jest.fn(() => 8),
  getRecent: jest.fn(),
}));
jest.mock('../../electron/repositories/sales.repository', () => ({
  getById: jest.fn(() => ({ id: 9, items: [] })),
}));
jest.mock('../../electron/repositories/productVariants.repository', () => ({
  getById: jest.fn(),
  decreaseStock: jest.fn(),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 7, username: 'cashier' })),
}));

const returnsRepo = require('../../electron/repositories/returns.repository');
const { processReturn } = require('../../electron/services/returns.service');

describe('returns.service.processReturn', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects returning more than the quantity sold minus previous returns', () => {
    expect(() => processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 2,
      reason: 'damaged',
    })).toThrow('المتاح للإرجاع: 1');

    expect(returnsRepo.create).not.toHaveBeenCalled();
  });

  test('returns the allowed remaining quantity and refunds the exact item value', () => {
    const result = processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 1,
      reason: 'size',
    });

    expect(result).toEqual({ returnId: 8, exchangeInfo: null, refundAmount: 12.5 });
    expect(returnsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      saleId: 9,
      variantId: 3,
      quantity: 1,
      refundAmount: 12.5,
    }));
    expect(mockStockUpdateRun).toHaveBeenCalledWith(1, 3);
  });

  test('rejects fractional return quantities', () => {
    expect(() => processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 0.5,
    })).toThrow('الكمية المرتجعة غير صحيحة');

    expect(returnsRepo.create).not.toHaveBeenCalled();
  });
});
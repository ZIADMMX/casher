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
  getReturnedRefundAmount: jest.fn(() => 12.5),
  create: jest.fn(() => 8),
  getRecent: jest.fn(),
}));
jest.mock('../../electron/repositories/sales.repository', () => ({
  // Sale lines still come from the mocked db, so each test's db stub decides the line.
  getSaleItem: jest.fn((saleId, variantId) => require('../../electron/database/db').db
    .prepare('SELECT * FROM sale_items WHERE sale_id = ? AND variant_id = ?').get(saleId, variantId)),
  getById: jest.fn(() => ({
    id: 9,
    discount: 0,
    items: [{ variant_id: 3, quantity: 2, unit_price: 12.5 }],
  })),
}));
jest.mock('../../electron/repositories/productVariants.repository', () => ({
  getById: jest.fn(),
  decreaseStock: jest.fn(),
}));
jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(() => ({ id: 1, status: 'open' })),
}));
jest.mock('../../electron/repositories/inventory.repository', () => ({
  getDefaultWarehouseId: jest.fn(() => 2),
  getStockQuantity: jest.fn(() => 5),
  applyStockChange: jest.fn(),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 7, username: 'cashier' })),
}));
jest.mock('../../electron/repositories/grocery.repository', () => ({
  restockBatchQuantity: jest.fn(),
  deductFifoBatchQuantity: jest.fn(),
}));

const returnsRepo = require('../../electron/repositories/returns.repository');
const database = require('../../electron/database/db');
const salesRepo = require('../../electron/repositories/sales.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const { processReturn } = require('../../electron/services/returns.service');

describe('returns.service.processReturn', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    database.db.prepare.mockImplementation(() => ({
      get: jest.fn(() => ({ quantity: 2, unit_price: 12.5 })),
      run: mockStockUpdateRun,
    }));
    salesRepo.getById.mockReturnValue({
      id: 9,
      discount: 0,
      items: [{ variant_id: 3, quantity: 2, unit_price: 12.5 }],
    });
    returnsRepo.getReturnedQuantity.mockReturnValue(1);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(12.5);
    shiftsRepo.getCurrentOpenShift.mockReturnValue({ id: 1, status: 'open' });
  });

  test('rejects return or exchange when there is no active open shift', () => {
    shiftsRepo.getCurrentOpenShift.mockReturnValue(null);
    expect(() => processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 1,
    })).toThrow('لا يمكن إتمام عملية المرتجع أو الاستبدال لعدم وجود وردية مفتوحة');
  });

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
    expect(inventoryRepo.applyStockChange).toHaveBeenCalledWith(expect.objectContaining({
      warehouseId: 2,
      variantId: 3,
      delta: 1,
      movementType: 'return',
    }));
  });

  test('allocates the invoice discount proportionally to the returned item', () => {
    returnsRepo.getReturnedQuantity.mockReturnValue(0);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(0);
    salesRepo.getById.mockReturnValue({
      id: 9,
      discount: 5,
      items: [{ variant_id: 3, quantity: 2, unit_price: 12.5 }],
    });

    const result = processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 1,
      reason: 'size',
    });

    expect(result.refundAmount).toBe(10);
    expect(returnsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      refundAmount: 10,
    }));
  });

  test('keeps split returns within the discounted line total', () => {
    returnsRepo.getReturnedQuantity.mockReturnValue(1);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(10);
    salesRepo.getById.mockReturnValue({
      id: 9,
      discount: 5,
      items: [{ variant_id: 3, quantity: 2, unit_price: 12.5 }],
    });

    const result = processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 1,
      reason: 'size',
    });

    expect(result.refundAmount).toBe(10);
  });

  test('allocates rounding cents across repeated partial returns without over-refunding', () => {
    database.db.prepare.mockReturnValue({
      get: jest.fn(() => ({ quantity: 3, unit_price: 1 })),
      run: mockStockUpdateRun,
    });
    returnsRepo.getReturnedQuantity.mockReturnValue(0);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(0);
    salesRepo.getById.mockReturnValue({
      id: 9,
      discount: 0.01,
      items: [{ variant_id: 3, quantity: 3, unit_price: 1 }],
    });

    const firstReturn = processReturn({ saleId: 9, variantId: 3, quantity: 1 });
    returnsRepo.getReturnedQuantity.mockReturnValue(1);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(firstReturn.refundAmount);
    const secondReturn = processReturn({ saleId: 9, variantId: 3, quantity: 1 });
    returnsRepo.getReturnedQuantity.mockReturnValue(2);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(
      firstReturn.refundAmount + secondReturn.refundAmount
    );
    const finalReturn = processReturn({ saleId: 9, variantId: 3, quantity: 1 });

    expect([
      firstReturn.refundAmount,
      secondReturn.refundAmount,
      finalReturn.refundAmount,
    ]).toEqual([1, 0.99, 1]);
    expect(
      firstReturn.refundAmount + secondReturn.refundAmount + finalReturn.refundAmount
    ).toBe(2.99);
  });

  test('rejects zero or negative return quantities', () => {
    expect(() => processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 0,
    })).toThrow('الكمية المرتجعة غير صحيحة');

    expect(() => processReturn({
      saleId: 9,
      variantId: 3,
      quantity: -0.5,
    })).toThrow('الكمية المرتجعة غير صحيحة');

    expect(returnsRepo.create).not.toHaveBeenCalled();
  });

  test('supports fractional return quantities for weighable grocery products', () => {
    const result = processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 0.5,
    });
    expect(result.returnId).toBe(8);
  });

  test('exchange mode: decrements replacement stock by full returned quantity and calculates price difference', () => {
    const variantsRepo = require('../../electron/repositories/productVariants.repository');
    inventoryRepo.getStockQuantity.mockReturnValue(5);
    variantsRepo.getById.mockReturnValue({
      id: 20,
      stock_quantity: 5,
      selling_price: 20.0,
    });

    const result = processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 1,
      reason: 'exchange',
      mode: 'exchange',
      exchangeVariantId: 20,
    });

    expect(result.exchangeInfo).toEqual({
      variantId: 20,
      quantity: 1,
      unitPriceDifference: 7.5,
      priceDifference: 7.5,
    });
    expect(inventoryRepo.applyStockChange).toHaveBeenCalledWith(expect.objectContaining({
      variantId: 20,
      delta: -1,
      movementType: 'sale',
    }));
    expect(returnsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      exchangePriceDifference: 7.5,
      exchangePaymentMethod: 'cash',
    }));
  });

  test('exchange mode: uses the requested returned quantity, not a fixed single unit', () => {
    const variantsRepo = require('../../electron/repositories/productVariants.repository');
    returnsRepo.getReturnedQuantity.mockReturnValue(0);
    returnsRepo.getReturnedRefundAmount.mockReturnValue(0);
    inventoryRepo.getStockQuantity.mockReturnValue(5);
    variantsRepo.getById.mockReturnValue({
      id: 20,
      stock_quantity: 5,
      selling_price: 20,
    });

    const result = processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 2,
      mode: 'exchange',
      exchangeVariantId: 20,
      exchangePaymentMethod: 'card',
    });

    expect(result.exchangeInfo).toEqual({
      variantId: 20,
      quantity: 2,
      unitPriceDifference: 7.5,
      priceDifference: 15,
    });
    expect(inventoryRepo.applyStockChange).toHaveBeenCalledWith(expect.objectContaining({
      variantId: 20,
      delta: -2,
    }));
    expect(returnsRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      exchangePriceDifference: 15,
      exchangePaymentMethod: 'card',
    }));
  });

  test('exchange mode: rejects exchange when replacement stock is less than returned quantity', () => {
    const variantsRepo = require('../../electron/repositories/productVariants.repository');
    inventoryRepo.getStockQuantity.mockReturnValue(0);
    variantsRepo.getById.mockReturnValue({
      id: 20,
      stock_quantity: 0,
      selling_price: 20.0,
    });

    expect(() => processReturn({
      saleId: 9,
      variantId: 3,
      quantity: 1,
      mode: 'exchange',
      exchangeVariantId: 20,
    })).toThrow('الصنف البديل غير متوفر بالكمية المطلوبة بالمخزون');
  });
});
jest.mock('../../electron/repositories/recipes.repository', () => ({ getRecipe: jest.fn(() => []), hasRecipe: jest.fn(() => false) }));
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
jest.mock('../../electron/repositories/inventory.repository', () => ({
  getDefaultWarehouseId: jest.fn(() => 2),
  getWarehouseBranchId: jest.fn(() => 1),
  getStockQuantity: jest.fn((warehouseId, variantId) => (variantId === 1 ? 10 : 1)),
  applyStockChange: jest.fn(),
}));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/bundlePromotions.service', () => ({
  getBestBundlePromotion: jest.fn(() => null),
}));
jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 7, username: 'cashier' })),
  // Discount right granted by default so the cap tests below keep their meaning.
  hasGrantedPermission: jest.fn(() => true),
}));

const salesRepo = require('../../electron/repositories/sales.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const authService = require('../../electron/services/auth.service');
const bundlePromotionsService = require('../../electron/services/bundlePromotions.service');
const { createSale } = require('../../electron/services/sales.service');

describe('sales.service.createSale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bundlePromotionsService.getBestBundlePromotion.mockReturnValue(null);
    authService.getCurrentSession.mockReturnValue({ id: 7, username: 'cashier', role: 'cashier' });
    shiftsRepo.getCurrentOpenShift.mockReturnValue({ id: 1, status: 'open' });
    variantsRepo.getById.mockImplementation((id) => ({
      id,
      selling_price: id === 1 ? 19.99 : 10,
      stock_quantity: id === 1 ? 10 : 1,
      size: 'M',
      color: 'black',
      low_stock_threshold: 0,
    }));
  });

  test('rejects sale when there is no active open shift', () => {
    shiftsRepo.getCurrentOpenShift.mockReturnValue(null);
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 1 }],
      paymentMethod: 'cash',
    })).toThrow('لا يمكن إتمام عملية البيع لعدم وجود وردية مفتوحة');
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
    expect(inventoryRepo.applyStockChange).toHaveBeenCalledWith(expect.objectContaining({
      warehouseId: 2,
      variantId: 1,
      delta: -3,
      movementType: 'sale',
    }));
  });

  test('sells services without checking or deducting inventory', () => {
    variantsRepo.getById.mockReturnValue({
      id: 2,
      selling_price: 10,
      stock_quantity: 0,
      is_service: 1,
      size: null,
      color: null,
      low_stock_threshold: 0,
    });

    const result = createSale({
      items: [{ variantId: 2, quantity: 1 }],
      paymentMethod: 'cash',
    });

    expect(result).toEqual({ saleId: 42, totalAmount: 10 });
    expect(inventoryRepo.getStockQuantity).not.toHaveBeenCalled();
    expect(inventoryRepo.applyStockChange).not.toHaveBeenCalled();
  });

  test('applies an eligible configured bundle offer without treating it as a cashier-entered discount', () => {
    bundlePromotionsService.getBestBundlePromotion.mockReturnValue({
      id: 'free-item',
      name: 'اشتر قطعتين والثالثة مجانًا',
      discount: 19.99,
    });

    const result = createSale({
      items: [{ variantId: 1, quantity: 3 }],
      discount: 0,
      paymentMethod: 'cash',
    });

    expect(result.totalAmount).toBe(39.98);
    expect(salesRepo.createSale).toHaveBeenCalledWith(expect.objectContaining({
      totalAmount: 39.98,
      discount: 19.99,
    }));
  });

  test('does not stack a bundle offer on top of a larger manual discount', () => {
    bundlePromotionsService.getBestBundlePromotion.mockReturnValue({
      id: 'free-item',
      name: 'اشتر قطعتين والثالثة مجانًا',
      discount: 10,
    });

    const result = createSale({
      items: [{ variantId: 1, quantity: 3 }],
      discount: 15,
      paymentMethod: 'cash',
    });

    expect(result.totalAmount).toBe(44.97);
    expect(salesRepo.createSale).toHaveBeenCalledWith(expect.objectContaining({
      totalAmount: 44.97,
      discount: 15,
    }));
  });

  test('rejects a sale that exceeds available stock before writing anything', () => {
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 11 }],
      paymentMethod: 'cash',
    })).toThrow('الكمية المتاحة غير كافية');

    expect(salesRepo.createSale).not.toHaveBeenCalled();
    expect(inventoryRepo.applyStockChange).not.toHaveBeenCalled();
  });

  test('requires an assigned central warehouse before accepting a remote sale', () => {
    authService.getCurrentSession.mockReturnValue({
      id: 7,
      username: 'cashier',
      role: 'cashier',
      centralRequest: true,
      warehouseId: null,
    });
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 1 }],
      paymentMethod: 'cash',
    })).toThrow('يجب تخصيص مخزن هذا الفرع');
    expect(salesRepo.createSale).not.toHaveBeenCalled();
  });

  test('a manual discount without the discount right is refused', () => {
    const { hasGrantedPermission } = require('../../electron/services/auth.service');
    hasGrantedPermission.mockImplementation((permission) => permission !== 'pos.discount');
    try {
      expect(() => createSale({
        items: [{ variantId: 1, quantity: 1 }],
        discount: 1,
        paymentMethod: 'cash',
      })).toThrow('الخصم اليدوي يحتاج صلاحية الخصم');
      expect(salesRepo.createSale).not.toHaveBeenCalled();
    } finally {
      hasGrantedPermission.mockImplementation(() => true);
    }
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

  test('rejects negative or zero quantities and negative discounts', () => {
    expect(() => createSale({
      items: [{ variantId: 1, quantity: 0 }],
      paymentMethod: 'cash',
    })).toThrow('أكبر من الصفر');

    expect(() => createSale({
      items: [{ variantId: 1, quantity: -1 }],
      paymentMethod: 'cash',
    })).toThrow('أكبر من الصفر');

    expect(() => createSale({
      items: [{ variantId: 1, quantity: 1 }],
      discount: -1,
      paymentMethod: 'cash',
    })).toThrow('أكبر من أو يساوي الصفر');
  });

  test('supports fractional scale quantities for grocery sales', () => {
    const result = createSale({
      items: [{ variantId: 1, quantity: 0.5 }],
      paymentMethod: 'cash',
    });
    expect(result.totalAmount).toBe(9.99);
  });
});
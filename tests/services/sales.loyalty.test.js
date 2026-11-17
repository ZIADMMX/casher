/**
 * @file sales.loyalty.test.js
 * @description createSale: النقاط المستبدلة بتتحول لخصم محسوب على السيرفر، والنقاط بتتكسب على الصافي المدفوع.
 */
jest.mock('../../electron/repositories/recipes.repository', () => ({ getRecipe: jest.fn(() => []), hasRecipe: jest.fn(() => false) }));
jest.mock('../../electron/database/db', () => ({ db: { transaction: (callback) => () => callback() } }));
jest.mock('../../electron/repositories/customers.repository', () => ({ getByPhone: jest.fn(), create: jest.fn() }));
jest.mock('../../electron/repositories/sales.repository', () => ({ createSale: jest.fn(() => 42), createSaleItem: jest.fn(), getById: jest.fn() }));
jest.mock('../../electron/repositories/productVariants.repository', () => ({ getById: jest.fn(), decreaseStock: jest.fn() }));
jest.mock('../../electron/repositories/shifts.repository', () => ({ getCurrentOpenShift: jest.fn(() => ({ id: 1, status: 'open' })) }));
jest.mock('../../electron/repositories/inventory.repository', () => ({
  getDefaultWarehouseId: jest.fn(() => 2), getWarehouseBranchId: jest.fn(() => 1), getStockQuantity: jest.fn(() => 100), applyStockChange: jest.fn(),
}));
jest.mock('../../electron/repositories/grocery.repository', () => ({ getUnitById: jest.fn() }));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));
jest.mock('../../electron/services/autoWorkshop.service', () => ({ getBilling: jest.fn(), settleOrder: jest.fn() }));
jest.mock('../../electron/services/subscriptions.service', () => ({ consumeCredit: jest.fn() }));
jest.mock('../../electron/services/commissions.service', () => ({ evaluateSaleCommissions: jest.fn() }));
jest.mock('../../electron/services/bundlePromotions.service', () => ({ getBestBundlePromotion: jest.fn(() => null) }));
jest.mock('../../electron/services/loyalty.service', () => ({
  planRedemption: jest.fn(() => ({ points: 0, discount: 0 })),
  recordSale: jest.fn(() => ({ earned: 0, redeemed: 0, balance: null })),
}));
jest.mock('../../electron/services/auth.service', () => ({
  getCurrentSession: jest.fn(() => ({ id: 7, username: 'cashier', role: 'cashier' })),
  hasGrantedPermission: jest.fn(() => true),
}));

const salesRepo = require('../../electron/repositories/sales.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const loyalty = require('../../electron/services/loyalty.service');
const { createSale } = require('../../electron/services/sales.service');

describe('createSale with loyalty points', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    loyalty.planRedemption.mockReset().mockReturnValue({ points: 0, discount: 0 });
    loyalty.recordSale.mockReset().mockReturnValue({ earned: 0, redeemed: 0, balance: null });
    variantsRepo.getById.mockImplementation((id) => ({ id, selling_price: 100, stock_quantity: 50, low_stock_threshold: 0 }));
  });

  test('redeemed points are asked from the server rules and become part of the discount', () => {
    loyalty.planRedemption.mockReturnValue({ points: 200, discount: 20 });
    loyalty.recordSale.mockReturnValue({ earned: 8, redeemed: 200, balance: 308 });

    const result = createSale({ items: [{ variantId: 1, quantity: 1 }], paymentMethod: 'cash', customerId: 5, loyaltyRedeemPoints: 200 });

    expect(loyalty.planRedemption).toHaveBeenCalledWith(5, 200, 100);
    expect(salesRepo.createSale).toHaveBeenCalledWith(expect.objectContaining({ discount: 20, totalAmount: 80 }));
    expect(loyalty.recordSale).toHaveBeenCalledWith(expect.objectContaining({ customerId: 5, saleId: 42, redeemPoints: 200, earnBase: 80, paymentMethod: 'cash' }));
    expect(result.loyalty).toMatchObject({ earned: 8, redeemed: 200, balance: 308, discount: 20 });
  });

  test('a rejected redemption stops the sale before anything is saved', () => {
    loyalty.planRedemption.mockImplementation(() => { throw new Error('رصيد النقاط مش كافي'); });
    expect(() => createSale({ items: [{ variantId: 1, quantity: 1 }], paymentMethod: 'cash', customerId: 5, loyaltyRedeemPoints: 9999 })).toThrow('رصيد');
    expect(salesRepo.createSale).not.toHaveBeenCalled();
  });

  test('a sale without points is unchanged and reports no loyalty block', () => {
    const result = createSale({ items: [{ variantId: 1, quantity: 2 }], paymentMethod: 'cash' });
    expect(salesRepo.createSale).toHaveBeenCalledWith(expect.objectContaining({ discount: 0, totalAmount: 200 }));
    expect(result.loyalty).toBeUndefined();
  });
});

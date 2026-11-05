const authService = require('../../electron/services/auth.service');
const productsService = require('../../electron/services/products.service');
const reportsService = require('../../electron/services/reports.service');
const customersService = require('../../electron/services/customers.service');
const suppliersService = require('../../electron/services/suppliers.service');
const purchasesService = require('../../electron/services/purchases.service');

// Mock dependencies
jest.mock('../../electron/repositories/users.repository', () => ({
  countAll: jest.fn(() => 2),
  create: jest.fn(),
  getByUsername: jest.fn(),
  getById: jest.fn(),
  getAdmin: jest.fn(),
  getAll: jest.fn(() => [
    { id: 1, username: 'admin', role: 'admin', is_active: 1 },
    { id: 2, username: 'cashier', role: 'cashier', is_active: 1 },
  ]),
  setActive: jest.fn(),
  remove: jest.fn(),
  clearForcePasswordChange: jest.fn(),
  updatePassword: jest.fn(),
  updateRecoveryKeyHash: jest.fn(),
}));

jest.mock('../../electron/repositories/products.repository', () => ({
  create: jest.fn(() => 1),
  update: jest.fn(),
  delete: jest.fn(),
  getById: jest.fn(),
  getAll: jest.fn(() => []),
}));

jest.mock('../../electron/repositories/productVariants.repository', () => ({
  create: jest.fn(() => 1),
  getById: jest.fn(() => ({ id: 1, product_id: 1, size: 'M', color: 'blue', selling_price: 100, stock_quantity: 10 })),
  getByProductId: jest.fn(() => [{ id: 1, product_id: 1 }]),
  update: jest.fn(),
  updateSku: jest.fn(),
  delete: jest.fn(),
}));

jest.mock('../../electron/repositories/categories.repository', () => ({
  getByName: jest.fn(() => ({ id: 1, name: 'General' })),
  create: jest.fn(() => 1),
}));

jest.mock('../../electron/repositories/reports.repository', () => ({
  getSalesSummary: jest.fn(() => ({ grossSales: 1000, invoiceCount: 10, discounts: 0 })),
  getCostOfSales: jest.fn(() => 700),
  getReturnsSummary: jest.fn(() => ({ returnCount: 0, refundTotal: 0, returnedCost: 0 })),
  getPaymentBreakdown: jest.fn(() => []),
  getCreditCustomerCount: jest.fn(() => 0),
  getDailyTrend: jest.fn(() => []),
  getTopProducts: jest.fn(() => []),
  getStaffPerformance: jest.fn(() => []),
  listSellingStaff: jest.fn(() => []),
  staffExists: jest.fn(() => true),
  getLedgerPage: jest.fn(() => ({ rows: [], total: 0, amountTotal: 0 })),
  getRecentInvoices: jest.fn(() => []),
}));

jest.mock('../../electron/repositories/customers.repository', () => ({
  create: jest.fn(() => 1),
  getById: jest.fn(() => ({ id: 1, name: 'Ahmed', phone: '01012345678', debt: 0 })),
  getByPhone: jest.fn(),
  getAll: jest.fn(() => [{ id: 1, name: 'Ahmed', phone: '01012345678' }]),
  updateDebt: jest.fn(),
  createDebtHistory: jest.fn(),
  getDebtHistory: jest.fn(() => []),
}));

jest.mock('../../electron/repositories/sales.repository', () => ({
  createSale: jest.fn(() => 42),
  createSaleItem: jest.fn(),
  getStatsByCustomer: jest.fn(() => []),
}));

jest.mock('../../electron/repositories/shifts.repository', () => ({
  getCurrentOpenShift: jest.fn(() => ({ id: 10 })),
}));

jest.mock('../../electron/repositories/suppliers.repository', () => ({
  create: jest.fn(() => 1),
  update: jest.fn(),
  deleteSupplier: jest.fn(),
  getById: jest.fn(() => ({ id: 1, name: 'Supplier A' })),
  getAllWithStats: jest.fn(() => [{ id: 1, name: 'Supplier A' }]),
  getSupplierLedger: jest.fn(() => []),
}));

jest.mock('../../electron/repositories/purchases.repository', () => ({
  createPurchase: jest.fn(() => ({ id: 1 })),
  createItem: jest.fn(),
  getAllPurchases: jest.fn(() => []),
  getPurchaseById: jest.fn(() => ({ id: 1, supplier_name: 'Supplier A', total_cost: 500 })),
  getItemsByPurchaseId: jest.fn(() => []),
  addPayment: jest.fn(() => ({ id: 1 })),
  getAllPayments: jest.fn(() => []),
  getPurchasesSummaryKPIs: jest.fn(() => ({ totalPurchases: 1000 })),
}));

jest.mock('../../electron/database/db', () => ({
  db: {
    transaction: (cb) => () => cb(),
    prepare: jest.fn(() => ({
      all: jest.fn(() => []),
      get: jest.fn(() => null),
      run: jest.fn(() => ({ changes: 1 })),
    })),
  },
}));

jest.mock('../../electron/services/session.service', () => {
  const sessions = new Map();
  return {
    generateToken: jest.fn((payload) => {
      const token = `token-${sessions.size + 1}`;
      sessions.set(token, payload);
      return token;
    }),
    verifyToken: jest.fn((token) => {
      if (!sessions.has(token)) throw new Error('InvalidSession');
      return sessions.get(token);
    }),
    invalidateToken: jest.fn((token) => sessions.delete(token)),
    refreshToken: jest.fn((token) => token),
    getTokenTTL: jest.fn(() => 1800),
  };
});

describe('Security & Permissions (RBAC Enforcement)', () => {
  const usersRepo = require('../../electron/repositories/users.repository');

  // Same hash from getByUsername and getById: tokens are bound to the password hash.
  const adminUser = {
    id: 1,
    username: 'admin',
    role: 'admin',
    is_active: 1,
    password_hash: require('bcryptjs').hashSync('admin123', 4),
  };

  const cashierUser = {
    id: 2,
    username: 'cashier',
    role: 'cashier',
    is_active: 1,
    password_hash: require('bcryptjs').hashSync('cashier123', 4),
  };

  beforeEach(() => {
    authService.logout();
    jest.clearAllMocks();
    usersRepo.getById.mockImplementation((id) => {
      if (id === 1) return adminUser;
      if (id === 2) return cashierUser;
      return null;
    });
  });

  describe('Unauthenticated Access Guards', () => {
    test('blocks all protected actions when no session is active', () => {
      expect(() => authService.requireAuth()).toThrow('يجب تسجيل الدخول أولاً');
      expect(() => authService.requireAdmin()).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => authService.getAllUsers()).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => productsService.addProductWithVariant({ name: 'Shirt', sellingPrice: 50, stockQuantity: 5 })).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => reportsService.getFullReport('today')).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => customersService.addCustomer({ name: 'Ali', phone: '01011111111' })).toThrow('يجب تسجيل الدخول أولاً');
      expect(() => customersService.getAllCustomersWithStats()).toThrow('يجب تسجيل الدخول أولاً');
      expect(() => purchasesService.createPurchase({ supplierId: 1, items: [] })).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });
  });

  describe('Cashier Role Restrictions (Forbidden Actions)', () => {
    beforeEach(() => {
      usersRepo.getByUsername.mockImplementation((name) => {
        if (name === 'cashier') {
          return {
            ...cashierUser,
          };
        }
        return undefined;
      });
      authService.login('cashier', 'cashier123');
    });

    test('Cashier CANNOT view all users list', () => {
      expect(() => authService.getAllUsers()).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT add new users or cashiers', () => {
      expect(() => authService.addCashier({ username: 'another', password: 'password123' })).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT delete or remove a user', () => {
      expect(() => authService.removeUser(1)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT toggle active status of any user', () => {
      expect(() => authService.toggleUserActive(1)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT create, update, or delete products and variants', () => {
      expect(() => productsService.addProductWithVariant({ name: 'Pants', sellingPrice: 100, stockQuantity: 10 }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => productsService.updateProduct(1, { name: 'Pants Updated' }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => productsService.deleteProduct(1))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => productsService.deleteVariant(1))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => productsService.updateVariant(1, { sellingPrice: 120, stockQuantity: 5 }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT view financial / profit reports', () => {
      expect(() => reportsService.getFullReport('today')).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => reportsService.getFullReport('month')).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT add manual customer debt', () => {
      expect(() => customersService.addManualDebt({ customerId: 1, amount: 200, notes: 'Manual' }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT manage suppliers (add/update/delete/ledger/stats)', () => {
      expect(() => suppliersService.addSupplier({ name: 'Supplier B' })).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => suppliersService.updateSupplier(1, { name: 'Supplier B Updated' })).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => suppliersService.deleteSupplier(1)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => suppliersService.getAllSuppliersWithStats()).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => suppliersService.getSupplierLedger(1)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('Cashier CANNOT manage purchases (create/view/pay)', () => {
      expect(() => purchasesService.createPurchase({ supplierId: 1, items: [{ variantId: 1, quantity: 5, purchasePrice: 50 }] }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => purchasesService.getAllPurchases({})).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => purchasesService.getPurchaseById(1)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => purchasesService.recordSupplierPayment({ supplierId: 1, amount: 100 })).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => purchasesService.getAllPayments(10)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
      expect(() => purchasesService.getPurchasesSummaryKPIs()).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });
  });

  describe('Cashier Role Allowed Actions (Operational Tasks)', () => {
    beforeEach(() => {
      usersRepo.getByUsername.mockImplementation((name) => {
        if (name === 'cashier') {
          return {
            ...cashierUser,
          };
        }
        return undefined;
      });
      authService.login('cashier', 'cashier123');
    });

    test('Cashier CAN register a new customer', () => {
      const result = customersService.addCustomer({ name: 'Customer Test', phone: '01099999999' });
      expect(result).toHaveProperty('id');
    });

    test('Cashier CAN view customer list with stats', () => {
      const customers = customersService.getAllCustomersWithStats();
      expect(Array.isArray(customers)).toBe(true);
    });
  });

  describe('Admin Protections & Safety Checks', () => {
    beforeEach(() => {
      usersRepo.getByUsername.mockImplementation((name) => {
        if (name === 'admin') {
          return {
            ...adminUser,
          };
        }
        return undefined;
      });
      authService.login('admin', 'admin123');
    });

    test('Admin CAN execute all privileged administrative operations', () => {
      expect(() => authService.getAllUsers()).not.toThrow();
      expect(() => authService.addCashier({ username: 'cashier2', password: 'password123' })).not.toThrow();
      expect(() => reportsService.getFullReport('today')).not.toThrow();
      expect(() => customersService.addManualDebt({ customerId: 1, amount: 50, notes: 'Debt' })).not.toThrow();
      expect(() => suppliersService.addSupplier({ name: 'New Supplier' })).not.toThrow();
    });

    test('Admin CANNOT delete their own active account', () => {
      expect(() => authService.removeUser(1))
        .toThrow('لا يمكنك حذف حسابك الخاص وأنت مسجل دخول به');
    });

    test('Admin CANNOT deactivate their own active account', () => {
      expect(() => authService.toggleUserActive(1))
        .toThrow('لا يمكنك تعطيل حسابك الخاص وأنت مسجل دخول به');
    });
  });
});

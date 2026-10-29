const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const bcrypt = require('bcryptjs');

// Create test database
const mockTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-purchases-test-'));
const mockTestDbFile = path.join(mockTempDir, 'purchases_test.db');

let mockCurrentDb = new Database(mockTestDbFile);
mockCurrentDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  get db() {
    return mockCurrentDb;
  },
  get dbPath() {
    return mockTestDbFile;
  },
  closeDatabase: () => {
    if (mockCurrentDb && mockCurrentDb.open) {
      mockCurrentDb.close();
    }
  },
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
  getAll: jest.fn(() => []),
}));

const authService = require('../../electron/services/auth.service');
const purchasesService = require('../../electron/services/purchases.service');
const purchasesRepo = require('../../electron/repositories/purchases.repository');
const suppliersRepo = require('../../electron/repositories/suppliers.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const usersRepo = require('../../electron/repositories/users.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');

describe('Purchases & Supplier Payments Service — Shift & Cash Drawer Integration', () => {
  let adminUser;
  let supplierId;
  let variantId;

  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockCurrentDb.exec(schema);
    inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });

    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });

    usersRepo.create({
      username: 'cashier',
      passwordHash: bcrypt.hashSync('cashier123', 4),
      role: 'cashier',
      forcePasswordChange: false,
    });

    adminUser = usersRepo.getByUsername('admin');

    // Create supplier
    supplierId = suppliersRepo.create({
      name: 'مصنع الأهرام للملابس الجاهزة',
      company: 'الأهرام تكستيل',
      phone: '01011112222',
    });

    // Create product & variant
    const prodId = productsRepo.create({ name: 'قميص قطن فاخر' });
    variantId = variantsRepo.create({
      productId: prodId,
      size: 'L',
      color: 'أبيض',
      purchasePrice: 200,
      sellingPrice: 350,
      stockQuantity: 10,
      barcode: 'SHIRT-L-WHT',
    });
    inventoryRepo.initializeVariantStock(
      inventoryRepo.getDefaultWarehouseId(),
      variantId,
      10
    );
  });

  beforeEach(() => {
    authService.logout();
    authService.login('admin', 'admin123');
  });

  afterAll(() => {
    if (mockCurrentDb && mockCurrentDb.open) mockCurrentDb.close();
    try {
      fs.rmSync(mockTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('1. Security & RBAC Guards', () => {
    test('blocks cashier from creating purchases or recording supplier payments', () => {
      authService.logout();
      authService.login('cashier', 'cashier123');

      expect(() => purchasesService.createPurchase({ supplierId, items: [] }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');

      expect(() => purchasesService.recordSupplierPayment({ supplierId, amount: 500 }))
        .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('validates required fields and supplier existence', () => {
      expect(() => purchasesService.createPurchase({ supplierId: null }))
        .toThrow('يجب اختيار المورد أو المصنع');

      expect(() => purchasesService.createPurchase({ supplierId: 99999 }))
        .toThrow('المورد المحدد غير مسجل في النظام');

      expect(() => purchasesService.createPurchase({ supplierId, items: [] }))
        .toThrow('يجب إضافة صنف واحد على الأقل في فاتورة الشراء');
    });
  });

  describe('2. Cash Down Payment & Shift Gate (الدفع النقدي أثناء إنشاء الفاتورة)', () => {
    test('rejects cash down payment when no shift is open', () => {
      // Ensure no active shift
      const openShift = shiftsRepo.getCurrentOpenShift();
      if (openShift) {
        shiftsRepo.closeShift({ shiftId: openShift.id, actualCash: openShift.opening_cash });
      }

      expect(() => purchasesService.createPurchase({
        supplierId,
        invoiceNumber: 'INV-101',
        items: [{
          variant_id: variantId,
          product_name: 'قميص قطن فاخر',
          quantity: 5,
          purchase_price: 200,
          selling_price: 350,
        }],
        totalAmount: 1000,
        paidAmount: 400,
        paymentMethod: 'cash',
      })).toThrow('لا يمكن دفع مبلغ نقدي للمورد لعدم وجود وردية مفتوحة');
    });

    test('allows non-cash (bank_transfer / cheque) purchase down payment even without active shift', () => {
      const res = purchasesService.createPurchase({
        supplierId,
        invoiceNumber: 'INV-BANK-1',
        items: [{
          variant_id: variantId,
          product_name: 'قميص قطن فاخر',
          quantity: 5,
          purchase_price: 200,
          selling_price: 350,
        }],
        totalAmount: 1000,
        paidAmount: 600,
        paymentMethod: 'bank_transfer',
      });

      expect(res.purchaseId).toBeDefined();
      expect(res.paid).toBe(600);
      expect(res.remaining).toBe(400);
      expect(res.paymentStatus).toBe('partial');
    });

    test('deducts cash down payment from active shift drawer and updates stock', () => {
      // Open a shift with 2000 cash
      const shift = shiftsRepo.openShift({
        openingCash: 2000,
        userId: adminUser.id,
        openedByName: 'admin',
      });

      const initialStock = variantsRepo.getById(variantId).stock_quantity;

      const res = purchasesService.createPurchase({
        supplierId,
        invoiceNumber: 'INV-CASH-1',
        items: [{
          variant_id: variantId,
          product_name: 'قميص قطن فاخر',
          quantity: 10,
          purchase_price: 200,
          selling_price: 350,
        }],
        totalAmount: 2000,
        paidAmount: 800,
        paymentMethod: 'cash',
      });

      expect(res.purchaseId).toBeDefined();
      expect(res.paid).toBe(800);
      expect(res.remaining).toBe(1200);

      // Verify stock was incremented
      expect(variantsRepo.getById(variantId).stock_quantity).toBe(initialStock + 10);

      // Verify shift totals: 2000 opening - 800 supplier payout = 1200 expected cash in drawer
      const liveTotals = shiftsRepo.getShiftLiveTotals(shift.id);
      expect(liveTotals.totalExpenses).toBe(800);
      expect(liveTotals.expectedCash).toBe(1200);

      // Verify shift expense list includes the supplier payment
      const shiftDetails = shiftsRepo.getShiftDetails(shift.id);
      expect(shiftDetails.expenses).toHaveLength(1);
      expect(shiftDetails.expenses[0].category).toBe('سداد مورد');
      expect(shiftDetails.expenses[0].amount).toBe(800);
    });
  });

  describe('3. Supplier Payments & Shift Reconciliation (سداد دفعات الموردين وربطها بالدرج)', () => {
    test('rejects recording cash supplier payment when no shift is open', () => {
      // Close active shift
      const openShift = shiftsRepo.getCurrentOpenShift();
      if (openShift) {
        shiftsRepo.closeShift({ shiftId: openShift.id, actualCash: 1200 });
      }

      expect(() => purchasesService.recordSupplierPayment({
        supplierId,
        amount: 500,
        paymentMethod: 'cash',
      })).toThrow('لا يمكن تسجيل سداد نقدي للمورد لعدم وجود وردية مفتوحة');
    });

    test('records cash supplier payment, reduces shift drawer cash, and reconciles Z-Report', () => {
      // Open fresh shift with 3000 EGP
      const shift = shiftsRepo.openShift({
        openingCash: 3000,
        userId: adminUser.id,
        openedByName: 'admin',
      });

      // Pay 500 EGP cash to supplier
      const payRes = purchasesService.recordSupplierPayment({
        supplierId,
        amount: 500,
        paymentMethod: 'cash',
        notes: 'دفعة نقدية مسحوبة من الدرج',
      });

      expect(payRes.paymentId).toBeDefined();

      // Check shift live drawer calculations: 3000 - 500 = 2500
      const liveTotals = shiftsRepo.getShiftLiveTotals(shift.id);
      expect(liveTotals.totalExpenses).toBe(500);
      expect(liveTotals.expectedCash).toBe(2500);

      // Close shift with actual 2500 in drawer -> zero difference!
      const closedShift = shiftsRepo.closeShift({
        shiftId: shift.id,
        actualCash: 2500,
        closedByUserId: adminUser.id,
      });

      expect(closedShift.status).toBe('closed');
      expect(closedShift.actual_cash).toBe(2500);
      expect(closedShift.expected_cash).toBe(2500);
      expect(closedShift.cash_difference).toBe(0);
    });
  });

  test('returns supplier ledger purchases, purchase items, and payments', () => {
    const purchaseId = mockCurrentDb.prepare(`
      INSERT INTO purchases (supplier_id, invoice_number, total_amount, paid_amount, remaining_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(supplierId, 'LEDGER-TEST', 1000, 500, 500).lastInsertRowid;

    mockCurrentDb.prepare(`
      INSERT INTO purchase_items (purchase_id, product_name, quantity, purchase_price)
      VALUES (?, ?, ?, ?)
    `).run(purchaseId, 'منتج اختبار كشف الحساب', 2, 500);

    mockCurrentDb.prepare(`
      INSERT INTO supplier_payments (supplier_id, purchase_id, amount, payment_method)
      VALUES (?, ?, ?, ?)
    `).run(supplierId, purchaseId, 500, 'bank_transfer');

    const ledger = suppliersRepo.getSupplierLedger(supplierId);
    const ledgerPurchase = ledger.purchases.find((purchase) => purchase.id === purchaseId);

    expect(ledger.supplier.id).toBe(supplierId);
    expect(ledgerPurchase.items).toHaveLength(1);
    expect(ledger.payments.some((payment) => payment.purchase_id === purchaseId)).toBe(true);
    expect(ledger.stats.totalPurchased).toBe(
      ledger.purchases.reduce((sum, purchase) => sum + purchase.total_amount, 0),
    );
    expect(ledger.stats.totalPaid).toBe(
      ledger.purchases.reduce((sum, purchase) => sum + purchase.paid_amount, 0),
    );
    expect(ledger.stats.totalRemaining).toBe(
      ledger.purchases.reduce((sum, purchase) => sum + purchase.remaining_amount, 0),
    );
  });

  test('returns purchase details with only that invoice items and payments', () => {
    const purchaseId = mockCurrentDb.prepare(`
      INSERT INTO purchases (supplier_id, invoice_number, total_amount, paid_amount, remaining_amount)
      VALUES (?, ?, ?, ?, ?)
    `).run(supplierId, 'DETAILS-TEST', 750, 250, 500).lastInsertRowid;

    mockCurrentDb.prepare(`
      INSERT INTO purchase_items (purchase_id, product_name, quantity, purchase_price)
      VALUES (?, ?, ?, ?)
    `).run(purchaseId, 'منتج تفاصيل الفاتورة', 3, 250);

    mockCurrentDb.prepare(`
      INSERT INTO supplier_payments (supplier_id, purchase_id, amount, payment_method)
      VALUES (?, ?, ?, ?)
    `).run(supplierId, purchaseId, 250, 'cash');

    const purchase = purchasesRepo.getPurchaseById(purchaseId);

    expect(purchase.invoice_number).toBe('DETAILS-TEST');
    expect(purchase.items).toHaveLength(1);
    expect(purchase.items[0].product_name).toBe('منتج تفاصيل الفاتورة');
    expect(purchase.payments).toHaveLength(1);
    expect(purchase.payments[0].amount).toBe(250);
  });
});

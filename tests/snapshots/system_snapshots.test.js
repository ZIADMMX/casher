/**
 * Kashiear POS — System Snapshot Test Suite (اختبارات اللقطات ومطابقة المخرجات والقوالب)
 * 
 * Verifies that critical rendered templates, financial reports, and data contracts
 * match their exact expected snapshot signatures:
 * 1. Thermal Receipt HTML Template (فاتورة المبيعات الحرارية)
 * 2. Barcode Label HTML Template (ملصق الباركود الحراري)
 * 3. Z-Report & Shift Live Totals Contract (التقرير المالي للوردية)
 * 4. Customer Financial Ledger Contract (كشف حساب العميل والمديونيات)
 * 5. Commissions & Sales Evaluation Contract (هيكل حساب العمولات والحوافز)
 * 6. Database Schema Master Contract (مطابقة هيكل الجداول والفهارس)
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const bcrypt = require('bcryptjs');

// Create isolated test database
const mockTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-snapshot-test-'));
const mockTestDbFile = path.join(mockTempDir, 'snapshot_test.db');

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

const printService = require('../../electron/services/print.service');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const customersService = require('../../electron/services/customers.service');
const commissionsService = require('../../electron/services/commissions.service');
const commissionsRepo = require('../../electron/repositories/commissions.repository');
const usersRepo = require('../../electron/repositories/users.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const salesRepo = require('../../electron/repositories/sales.repository');
const authService = require('../../electron/services/auth.service');

describe('System Snapshot Tests (اختبارات اللقطات والقوالب والعقود البيانية)', () => {
  let adminUser;

  beforeAll(() => {
    // Freeze time for deterministic receipt timestamps
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-09-28T12:00:00.000Z'));

    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockCurrentDb.exec(schema);

    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });

    adminUser = usersRepo.getByUsername('admin');
  });

  afterAll(() => {
    jest.useRealTimers();
    if (mockCurrentDb && mockCurrentDb.open) mockCurrentDb.close();
    try {
      fs.rmSync(mockTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // 1. Thermal POS Receipt Template Snapshot
  // =========================================================================
  describe('1. Thermal Receipt HTML Template Snapshot', () => {
    test('renders deterministic thermal receipt HTML for multi-item sale', () => {
      const mockSale = {
        saleId: 1042,
        customerName: 'أحمد محمود',
        items: [
          { productName: 'بدلة رجالي كلاسيك', size: '52', color: 'كحلي', quantity: 1, unitPrice: 1800 },
          { productName: 'قميص قطن إيطالي', size: 'L', color: 'أبيض', quantity: 2, unitPrice: 350 },
          { productName: 'كرافتة حرير', size: null, color: 'نبيتي', quantity: 1, unitPrice: 150 },
        ],
        subtotal: 2650,
        discount: 150,
        total: 2500,
        paymentMethod: 'cash',
      };

      const html = printService.buildReceiptHtml(mockSale);
      expect(html).toMatchSnapshot();
    });
  });

  // =========================================================================
  // 2. Barcode Label Template Snapshot
  // =========================================================================
  describe('2. Barcode Thermal Label HTML Template Snapshot', () => {
    test('renders barcode label template matching standard snapshot structure', () => {
      const mockVariant = {
        productName: 'بنطلون جينز سليم فيت',
        size: '34',
        color: 'أزرق غامق',
        barcode: 'JEANS-34-BLU',
        selling_price: 450,
      };

      const html = printService.buildBarcodeLabelHtml(mockVariant);
      expect(html).toMatchSnapshot();
    });
  });

  // =========================================================================
  // 3. Shift Z-Report Live Summary Structure Snapshot
  // =========================================================================
  describe('3. Shift Z-Report & Financial Totals Contract Snapshot', () => {
    test('generates exact structured financial totals contract for an active shift', () => {
      // Open a shift
      const shift = shiftsRepo.openShift({
        openingCash: 2500,
        userId: adminUser.id,
        openedByName: 'admin',
        shiftType: 'morning',
        posStation: 'POS 1',
      });

      // Record dummy sale
      const prodId = productsRepo.create({ name: 'صنف اختبار اللقطة' });
      const varId = variantsRepo.create({
        productId: prodId,
        size: 'M',
        color: 'أسود',
        purchasePrice: 100,
        sellingPrice: 200,
        stockQuantity: 20,
        barcode: 'SNAP-VAR-01',
      });

      salesRepo.createSale({
        shiftId: shift.id,
        items: [{ variantId: varId, quantity: 2, unitPrice: 200 }],
        paymentMethod: 'cash',
        totalAmount: 400,
        userId: adminUser.id,
      });

      // Add dummy expense
      shiftsRepo.addShiftExpense({
        shiftId: shift.id,
        userId: adminUser.id,
        amount: 50,
        category: 'مصروفات نظافة وضيافة',
        notes: 'شاي وسكر',
      });

      const liveTotals = shiftsRepo.getShiftLiveTotals(shift.id);

      expect(liveTotals).toMatchSnapshot({
        shiftId: expect.any(Number),
      });
    });
  });

  // =========================================================================
  // 4. Customer Financial Ledger Contract Snapshot
  // =========================================================================
  describe('4. Customer Financial Ledger Contract Snapshot', () => {
    test('produces consistent customer financial ledger and transaction history', () => {
      authService.logout();
      authService.login('admin', 'admin123');

      const custRes = customersService.addCustomer({
        name: 'كريم الدسوقي',
        phone: '01123456789',
        email: 'karim@example.com',
      });

      const customerId = custRes.id;

      // Add credit debt
      customersService.addManualDebt({
        customerId,
        amount: 1500,
        notes: 'بضاعة آجلة سابقة',
      });

      // Record partial payment
      customersService.recordCustomerPayment({
        customerId,
        amount: 500,
        paymentMethod: 'cash',
        notes: 'دفعة سداد نقدية',
      });

      const ledger = customersService.getCustomerLedger(customerId);

      expect(ledger).toMatchSnapshot({
        customer: {
          id: expect.any(Number),
          created_at: expect.any(String),
        },
        payments: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(Number),
            customer_id: customerId,
            amount: 500,
            payment_method: 'cash',
          }),
        ]),
        sales: expect.arrayContaining([
          expect.objectContaining({
            id: expect.any(Number),
            total_amount: 1500,
            created_at: expect.any(String),
          }),
        ]),
      });
    });
  });

  // =========================================================================
  // 5. Commissions & Sales Evaluation Contract Snapshot
  // =========================================================================
  describe('5. Commissions & Incentive Evaluation Contract Snapshot', () => {
    test('calculates tiered employee commissions matching structured snapshot', () => {
      authService.logout();
      authService.login('admin', 'admin123');

      // Create commission rule: 5% on sales over 1000 EGP
      commissionsRepo.createRule({
        title: 'عمولة المبيعات الكبرى 5%',
        target_type: 'all_sales',
        calculation_type: 'percentage',
        rate_value: 5,
        min_sales_threshold: 1000,
        is_active: 1,
        description: 'حافز 5% عند تجاوز الفاتورة 1000 ج.م',
      });

      const shift = shiftsRepo.getCurrentOpenShift() || shiftsRepo.openShift({ openingCash: 1000, userId: adminUser.id, openedByName: 'admin' });
      const saleId = salesRepo.createSale({
        shiftId: shift.id,
        totalAmount: 3000,
        paymentMethod: 'cash',
        userId: adminUser.id,
      });

      commissionsService.evaluateSaleCommissions(
        { totalAmount: 3000, items: [{ variantId: 1, quantity: 3, unitPrice: 1000 }] },
        saleId,
        adminUser.id
      );

      const earnings = commissionsRepo.getAllEarnings({ user_id: adminUser.id });

      expect(earnings).toMatchSnapshot([
        {
          id: expect.any(Number),
          user_id: adminUser.id,
          sale_id: saleId,
          commission_amount: 150, // 5% of 3000
          created_at: expect.any(String),
        },
      ]);
    });
  });

  // =========================================================================
  // 6. Database Schema Master Table Names Contract Snapshot
  // =========================================================================
  describe('6. Database Schema Master Structure Snapshot', () => {
    test('verifies all expected core tables and indices exist in schema', () => {
      const tables = mockCurrentDb
        .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name ASC")
        .all()
        .map((t) => t.name);

      expect(tables).toMatchSnapshot();
    });
  });
});

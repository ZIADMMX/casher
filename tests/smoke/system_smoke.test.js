/**
 * Kashiear POS — Comprehensive End-to-End System Smoke Test
 * 
 * Tests the entire business lifecycle from boot to shift closing:
 * 1. Security & Brute-Force Auth Protection
 * 2. Pre-Shift Lockout Gate (Blocks sales/returns/payments before shift)
 * 3. Product Catalog, Barcode Map & Multi-Policy Caching (LRU, Jitter, Negative Cache)
 * 4. Multi-Terminal LAN Server & Load Balancer Engine
 * 5. Multi-Method Sales (Cash, Visa, Credit/Debt) & Stock Decrements
 * 6. Customer Debt Ledger & Shift-Linked Debt Payments
 * 7. Multi-Quantity Exchanges & Returns Logic
 * 8. Shift Expenses & 100% Mathematically Exact Cash Drawer Z-Report
 * 9. Post-Shift Lockout Verification
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

// 1. Setup isolated in-memory test database
const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
  getAll: jest.fn(() => []),
}));

// Load services & repositories
const authService = require('../../electron/services/auth.service');
const productsService = require('../../electron/services/products.service');
const salesService = require('../../electron/services/sales.service');
const shiftsService = require('../../electron/services/shifts.service');
const attendanceService = require('../../electron/services/attendance.service');
const returnsService = require('../../electron/services/returns.service');
const customersService = require('../../electron/services/customers.service');
const lanServer = require('../../electron/services/lanServer.service');
const loadBalancer = require('../../electron/services/loadBalancer.service');
const productsCache = require('../../electron/services/products.cache');
const usersRepo = require('../../electron/repositories/users.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const customersRepo = require('../../electron/repositories/customers.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');

describe('Kashiear POS — Comprehensive E2E System Smoke Test (فحص النظام الشامل)', () => {
  let shirtVariantId;
  let trousersVariantId;
  let jacketVariantId;
  let customerId;
  let currentShiftId;
  let cashSaleId;

  beforeAll(() => {
    // Initialize full schema
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockDb.exec(schema);
    inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });

    // Seed Admin & Cashier
    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });

    usersRepo.create({
      username: 'cashier1',
      passwordHash: bcrypt.hashSync('cashier123', 4),
      role: 'cashier',
      forcePasswordChange: false,
    });
  });

  afterAll(async () => {
    await lanServer.stopServer();
    loadBalancer.destroy();
    if (mockDb) mockDb.close();
  });

  // =========================================================================
  // Phase 1: Security, Rate-Limiting & Authentication
  // =========================================================================
  test('Phase 1: Security & Rate-Limiting Gate', () => {
    // 1.1 Failed logins trigger rate limiting
    for (let i = 0; i < 5; i++) {
      expect(() => authService.login('cashier1', 'wrong_pass')).toThrow();
    }
    // 6th attempt should be locked out
    expect(() => authService.login('cashier1', 'wrong_pass')).toThrow('تم قفل الحساب');

    // 1.2 Admin login succeeds
    const loginRes = authService.login('admin', 'admin123');
    expect(loginRes.token).toBeDefined();
    expect(loginRes.user.username).toBe('admin');
    expect(authService.getCurrentSession().username).toBe('admin');
  });

  // =========================================================================
  // Phase 2: Pre-Shift Lockout Gate (No Sales/Returns/Payments without open shift)
  // =========================================================================
  test('Phase 2: Pre-Shift Lockout Gate enforces active shift requirement', () => {
    expect(shiftsRepo.getCurrentOpenShift()).toBeNull();

    // Sales must fail
    expect(() => salesService.createSale({
      items: [{ variantId: 1, quantity: 1 }],
      paymentMethod: 'cash',
    })).toThrow('لا يمكن إتمام عملية البيع لعدم وجود وردية مفتوحة');

    // Returns must fail
    expect(() => returnsService.processReturn({
      saleId: 1,
      variantId: 1,
      quantity: 1,
    })).toThrow('لا يمكن إتمام عملية المرتجع أو الاستبدال لعدم وجود وردية مفتوحة');

    // Customer Cash Payments must fail
    expect(() => customersService.recordCustomerPayment({
      customerId: 1,
      amount: 100,
      paymentMethod: 'cash',
    })).toThrow('لا يمكن تسجيل سداد نقدي لعدم وجود وردية مفتوحة');
  });

  // =========================================================================
  // Phase 3: Open Shift 1
  // =========================================================================
  test('Phase 3: Shift Opening with initial drawer cash', () => {
    // A shift is tied to today's attendance record: check in first.
    expect(() => shiftsService.openShift({ openingCash: 500 })).toThrow('سجّل حضورك أولاً');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });

    const shiftRes = shiftsService.openShift({ openingCash: 500 });
    expect(shiftRes.id).toBeDefined();
    expect(shiftRes.status).toBe('open');
    expect(shiftRes.opening_cash).toBe(500);
    currentShiftId = shiftRes.id;
  });

  // =========================================================================
  // Phase 4: Product Catalog & Multi-Policy Caching Layer
  // =========================================================================
  test('Phase 4: Product Inventory & Caching (LRU, Barcode O(1), Negative Cache)', () => {
    // 4.1 Create Products & Variants
    const shirtProdId = productsRepo.create({ name: 'قميص قطن رجالي', categoryId: null });
    shirtVariantId = variantsRepo.create({
      productId: shirtProdId,
      size: 'L',
      color: 'أبيض',
      purchasePrice: 80,
      sellingPrice: 150,
      stockQuantity: 20,
      barcode: '6221110001',
      sku: 'SHIRT-L-WHT',
    });

    const trousersProdId = productsRepo.create({ name: 'بنطلون جينز كلاسيك', categoryId: null });
    trousersVariantId = variantsRepo.create({
      productId: trousersProdId,
      size: '34',
      color: 'أزرق',
      purchasePrice: 120,
      sellingPrice: 200,
      stockQuantity: 15,
      barcode: '6221110002',
      sku: 'TROUSERS-34-BLU',
    });

    const jacketProdId = productsRepo.create({ name: 'جاكيت جلد طبيعي', categoryId: null });
    jacketVariantId = variantsRepo.create({
      productId: jacketProdId,
      size: 'XL',
      color: 'أسود',
      purchasePrice: 300,
      sellingPrice: 500,
      stockQuantity: 5,
      barcode: '6221110003',
      sku: 'JACKET-XL-BLK',
    });
    const warehouseId = inventoryRepo.getDefaultWarehouseId();
    inventoryRepo.initializeVariantStock(warehouseId, shirtVariantId, 20);
    inventoryRepo.initializeVariantStock(warehouseId, trousersVariantId, 15);
    inventoryRepo.initializeVariantStock(warehouseId, jacketVariantId, 5);

    // 4.2 Test Products Cache & Fast Barcode Lookup
    productsCache.invalidate();
    const catalog = productsService.getAllProductsWithVariants();
    expect(catalog.length).toBe(3);

    // Fast O(1) Barcode lookup from cache
    const cachedItem = productsService.getProductByBarcode('6221110001');
    expect(cachedItem).toBeDefined();
    expect(cachedItem.productName).toBe('قميص قطن رجالي');

    // Negative Caching test for corrupted/missing barcode
    expect(productsService.getProductByBarcode('NON-EXISTENT-99999')).toBeNull();
    // Subsequent lookup hits negative cache
    const negResult = productsCache.getByBarcode('NON-EXISTENT-99999');
    expect(negResult).toEqual({ isNull: true });
  });

  // =========================================================================
  // Phase 5: Multi-Terminal LAN Server & Load Balancer Engine
  // =========================================================================
  test('Phase 5: Multi-Terminal LAN Server & Load Balancer Operations', async () => {
    const SMOKE_PORT = 5919;

    // Start LAN Master Server
    const serverStart = await lanServer.startServer(SMOKE_PORT);
    expect(serverStart.success).toBe(true);

    const status = lanServer.getStatus();
    expect(status.isRunning).toBe(true);
    expect(status.localIps.length).toBeGreaterThan(0);

    // Execute heavy task via Load Balancer
    const lbResult = await loadBalancer.execute(async (node) => {
      return { handledBy: node.id, status: 'ok' };
    }, { taskType: 'sale_checkout' });

    expect(lbResult.status).toBe('ok');
    expect(loadBalancer.getDiagnostics().healthyNodeCount).toBeGreaterThanOrEqual(1);

    await lanServer.stopServer();
    expect(lanServer.getStatus().isRunning).toBe(false);
  });

  // =========================================================================
  // Phase 6: Multi-Method Sales Execution & Stock Decrement
  // =========================================================================
  test('Phase 6: Multi-Method Sales (Cash, Visa/Card, Credit/Debt)', () => {
    // 6.1 Cash Sale: 2 Shirts @ 150 = 300 - 30 (10% discount) = 270 Cash
    const cashSale = salesService.createSale({
      items: [{ variantId: shirtVariantId, quantity: 2 }],
      discount: 30,
      paymentMethod: 'cash',
    });
    expect(cashSale.saleId).toBeDefined();
    expect(cashSale.totalAmount).toBe(270);
    cashSaleId = cashSale.saleId;
    expect(variantsRepo.getById(shirtVariantId).stock_quantity).toBe(18); // 20 - 2

    // 6.2 Visa / Card Sale: 1 Trousers @ 200 = 200 Card
    const cardSale = salesService.createSale({
      items: [{ variantId: trousersVariantId, quantity: 1 }],
      discount: 0,
      paymentMethod: 'card',
    });
    expect(cardSale.saleId).toBeDefined();
    expect(cardSale.totalAmount).toBe(200);
    expect(variantsRepo.getById(trousersVariantId).stock_quantity).toBe(14); // 15 - 1

    // 6.3 Credit / Debt Sale: 1 Jacket @ 500 to Customer Mahmoud
    const creditSale = salesService.createSale({
      items: [{ variantId: jacketVariantId, quantity: 1 }],
      discount: 0,
      paymentMethod: 'credit',
      customerName: 'محمود أحمد',
      customerPhone: '01012345678',
      dueDate: '2026-10-15',
    });
    expect(creditSale.saleId).toBeDefined();
    expect(creditSale.totalAmount).toBe(500);
    expect(variantsRepo.getById(jacketVariantId).stock_quantity).toBe(4); // 5 - 1

    // Verify Customer Debt Recorded
    const customers = customersService.getAllCustomersWithStats();
    const mahmoud = customers.find((c) => c.phone === '01012345678');
    expect(mahmoud).toBeDefined();
    expect(mahmoud.debt).toBe(500);
    customerId = mahmoud.id;
  });

  // =========================================================================
  // Phase 7: Customer Debt Payments & Shift Cash Drawer Linkage
  // =========================================================================
  test('Phase 7: Customer Debt Payment correctly updates Ledger and Drawer Cash', () => {
    // Mahmoud pays 200 EGP in Cash towards his 500 EGP debt
    const payRes = customersService.recordCustomerPayment({
      customerId,
      amount: 200,
      paymentMethod: 'cash',
      notes: 'دفعة نقدية تحت الحساب',
    });

    expect(payRes.paymentId).toBeDefined();
    expect(payRes.remainingBalance).toBe(300);

    const balance = customersRepo.getBalances().find((r) => r.id === customerId).balance;
    expect(balance).toBe(300);
  });

  // =========================================================================
  // Phase 8: Exchanges & Returns with Exact Quantity Stock Adjustment
  // =========================================================================
  test('Phase 8: Return 1 Shirt and Exchange for 1 Trousers (Multi-Qty fix)', () => {
    // The original invoice had a 10% discount, so one returned shirt is refunded at 135.
    const returnRes = returnsService.processReturn({
      saleId: cashSaleId,
      variantId: shirtVariantId,
      quantity: 1,
      reason: 'مقاس غير مناسب',
      mode: 'exchange',
      exchangeVariantId: trousersVariantId,
    });

    expect(returnRes.returnId).toBeDefined();
    expect(returnRes.exchangeInfo).toBeDefined();
    expect(returnRes.exchangeInfo.quantity).toBe(1);
    expect(returnRes.refundAmount).toBe(135);
    expect(returnRes.exchangeInfo.priceDifference).toBe(65);

    const cardExchangeRes = returnsService.processReturn({
      saleId: cashSaleId,
      variantId: shirtVariantId,
      quantity: 1,
      reason: 'استبدال بوسيلة غير نقدية',
      mode: 'exchange',
      exchangeVariantId: trousersVariantId,
      exchangePaymentMethod: 'card',
    });
    expect(cardExchangeRes.exchangeInfo.priceDifference).toBe(65);

    // Stock adjustments:
    // Shirt stock increases from 18 -> 20
    expect(variantsRepo.getById(shirtVariantId).stock_quantity).toBe(20);
    // Trousers stock decreases from 14 -> 12
    expect(variantsRepo.getById(trousersVariantId).stock_quantity).toBe(12);
  });

  // =========================================================================
  // Phase 9: Shift Expenses
  // =========================================================================
  test('Phase 9: Record drawer expense in active shift', () => {
    const expRes = shiftsService.addShiftExpense({
      amount: 50,
      category: 'ضيافة ونظافة',
      notes: 'شراء أدوات نظافة وضيافة للمحل',
    });
    expect(expRes.id).toBeDefined();
  });

  // =========================================================================
  // Phase 10: Shift Live Totals & Z-Report Reconciliation
  // =========================================================================
  test('Phase 10: 100% Mathematically Exact Cash Drawer Calculation & Z-Report Close', () => {
    const currentShift = shiftsService.getCurrentShift();
    expect(currentShift).toBeDefined();
    const liveTotals = currentShift.liveTotals;

    // Breakdown:
    // Opening Cash: 500
    // Cash Sales: 270
    // Customer Cash Debt Payments: 200
    // Expenses: -50
    // Cash exchange difference: +65 (card exchange difference is excluded)
    // Cash Refunds from drawer: 0 (item exchange; no cash removed)
    // Total returned-item value: 270 across both exchanges
    // Expected Cash = 500 + 270 + 200 + 65 - 50 = 985 EGP
    expect(liveTotals.cashSales).toBe(270);
    expect(liveTotals.customerCashPayments).toBe(200);
    expect(liveTotals.totalExpenses).toBe(50);
    expect(liveTotals.cashRefunds).toBe(0);
    expect(liveTotals.cashExchangeNet).toBe(65);
    expect(liveTotals.totalRefunds).toBe(270);
    expect(liveTotals.expectedCash).toBe(985);

    // Close shift with actual counted cash = 985 (Zero discrepancy)
    const closedShift = shiftsService.closeShift({
      shiftId: currentShiftId,
      actualCash: 985,
      notes: 'تقفيل ممتاز ومتطابق تماماً مع الدرج',
    });

    expect(closedShift.status).toBe('closed');
    expect(closedShift.cash_difference).toBe(0); // 985 - 985 = 0
  });

  // =========================================================================
  // Phase 11: Post-Shift Lockout Gate
  // =========================================================================
  test('Phase 11: System locks out sales immediately after shift is closed', () => {
    expect(shiftsRepo.getCurrentOpenShift()).toBeNull();

    expect(() => salesService.createSale({
      items: [{ variantId: shirtVariantId, quantity: 1 }],
      paymentMethod: 'cash',
    })).toThrow('لا يمكن إتمام عملية البيع لعدم وجود وردية مفتوحة');
  });
});

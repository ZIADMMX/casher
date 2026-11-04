const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const bcrypt = require('bcryptjs');

// 1. Setup In-Memory Database
const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

// 2. Mock Electron Printing
const mockPrint = jest.fn((options, callback) => {
  if (callback) callback(true);
});
const mockClose = jest.fn();
const mockLoadURL = jest.fn();

jest.mock('electron', () => ({
  BrowserWindow: jest.fn().mockImplementation(() => {
    const listeners = {};
    return {
      loadURL: mockLoadURL.mockImplementation(() => {
        setImmediate(() => {
          if (listeners['did-finish-load']) {
            listeners['did-finish-load']();
          }
        });
      }),
      close: mockClose,
      webContents: {
        on: jest.fn((event, cb) => {
          listeners[event] = cb;
        }),
        print: mockPrint,
      },
    };
  }),
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
}));

const authService = require('../../electron/services/auth.service');
const attendanceService = require('../../electron/services/attendance.service');
const shiftsService = require('../../electron/services/shifts.service');
const productsService = require('../../electron/services/products.service');
const salesService = require('../../electron/services/sales.service');
const returnsService = require('../../electron/services/returns.service');
const customersService = require('../../electron/services/customers.service');
const bundlePromotionsService = require('../../electron/services/bundlePromotions.service');
const kitchenService = require('../../electron/services/kitchen.service');
const printService = require('../../electron/services/print.service');
const usersRepo = require('../../electron/repositories/users.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const salesRepo = require('../../electron/repositories/sales.repository');
const customersRepo = require('../../electron/repositories/customers.repository');
const SettingsRepository = require('../../electron/repositories/settings.repository');
const returnsRepo = require('../../electron/repositories/returns.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const ordersRepo = require('../../electron/repositories/orders.repository');
const ordersService = require('../../electron/services/orders.service');

describe('End-to-End Sales Integration Test (من إضافة منتج للسلة حتى الدفع والطباعة)', () => {
  let variant1Id;
  let variant2Id;

  beforeAll(() => {
    // Initialize DB Schema
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockDb.exec(schema);
    inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });
  });

  beforeEach(() => {
    mockDb.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM returns;
      DELETE FROM sale_items;
      DELETE FROM sales;
      DELETE FROM shift_expenses;
      DELETE FROM shifts;
      DELETE FROM attendance_records;
      DELETE FROM product_variants;
      DELETE FROM products;
      DELETE FROM customers;
      DELETE FROM users;
      PRAGMA foreign_keys = ON;
    `);

    jest.clearAllMocks();

    // 1. Seed Cashier User
    usersRepo.create({
      username: 'cashier_samir',
      passwordHash: bcrypt.hashSync('pass123', 4),
      role: 'cashier',
      forcePasswordChange: false,
    });

    // 2. Seed Products and Variants
    const prodId = productsRepo.create({
      name: 'تيشيرت بولو كلاسيك',
      categoryId: null,
      description: 'قطن ممتاز',
    });

    variant1Id = variantsRepo.create({
      productId: prodId,
      size: 'M',
      color: 'أسود',
      purchasePrice: 90,
      sellingPrice: 150,
      stockQuantity: 20,
      lowStockThreshold: 3,
      barcode: '6221110001',
      sku: 'POLO-M-BLK',
    });

    variant2Id = variantsRepo.create({
      productId: prodId,
      size: 'L',
      color: 'أحمر',
      purchasePrice: 100,
      sellingPrice: 160,
      stockQuantity: 15,
      lowStockThreshold: 3,
      barcode: '6221110002',
      sku: 'POLO-L-RED',
    });
    const warehouseId = inventoryRepo.getDefaultWarehouseId();
    inventoryRepo.initializeVariantStock(warehouseId, variant1Id, 20);
    inventoryRepo.initializeVariantStock(warehouseId, variant2Id, 15);
  });

  afterAll(() => {
    if (mockDb) mockDb.close();
  });

  test('requires an active attendance record for every shift and links it through checkout', () => {
    const cashierLogin = authService.login('cashier_samir', 'pass123');
    const cashierId = cashierLogin.user.id;
    const today = attendanceService.getTodayDate();

    expect(() => shiftsService.openShift({ openingCash: 100 }))
      .toThrow('سجّل حضورك أولاً قبل فتح الوردية');

    attendanceService.checkIn({ date: today });
    const attendance = attendanceService.getMyTodayStatus();
    const shift = shiftsService.openShift({ openingCash: 100 });
    expect(shift.attendance_record_id).toBe(attendance.id);

    expect(() => attendanceService.checkOut({ date: today }))
      .toThrow('أغلق ورديتك أولاً قبل تسجيل الانصراف');

    shiftsService.closeShift({ shiftId: shift.id, actualCash: 100 });
    expect(attendanceService.checkOut({ date: today })).toEqual({ success: true });
    expect(() => shiftsService.openShift({ openingCash: 100 }))
      .toThrow('سجّل حضورك أولاً قبل فتح الوردية');

    usersRepo.create({
      username: 'admin_shift_test',
      passwordHash: bcrypt.hashSync('pass123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });
    authService.login('admin_shift_test', 'pass123');
    expect(() => shiftsService.openShift({ openingCash: 100 }))
      .toThrow('سجّل حضورك أولاً قبل فتح الوردية');

    attendanceService.checkIn({ date: today });
    const adminAttendance = attendanceService.getMyTodayStatus();
    const adminShift = shiftsService.openShift({ openingCash: 100 });
    expect(adminShift.user_id).not.toBe(cashierId);
    expect(adminShift.attendance_record_id).toBe(adminAttendance.id);
  });

  test('tracks mixed sales, debt collection, promotion, returns, exchange, and shift cash totals', () => {
    const previousPromotions = SettingsRepository.get('bundle_promotions');
    try {
      authService.login('cashier_samir', 'pass123');
      attendanceService.checkIn({ date: attendanceService.getTodayDate() });
      const shift = shiftsService.openShift({ openingCash: 200 });

      const cashSale = salesService.createSale({
        items: [{ variantId: variant1Id, quantity: 2 }],
        discount: 30,
        paymentMethod: 'cash',
      });
      expect(cashSale.totalAmount).toBe(270);

      const cardSale = salesService.createSale({
        items: [{ variantId: variant2Id, quantity: 1 }],
        paymentMethod: 'card',
      });
      expect(cardSale.totalAmount).toBe(160);

      const creditSale = salesService.createSale({
        items: [{ variantId: variant1Id, quantity: 1 }],
        paymentMethod: 'credit',
        customerName: 'عميل آجل',
        customerPhone: '01000000000',
        dueDate: '2099-12-31',
      });
      expect(creditSale.totalAmount).toBe(150);

      bundlePromotionsService.saveBundlePromotions([{
        name: 'اشترِ قطعتين واحصل على الثالثة مجانًا',
        type: 'buy_x_get_y',
        buyQuantity: 2,
        freeQuantity: 1,
        eligibleVariantIds: [variant1Id, variant2Id],
      }]);
      const promotionSale = salesService.createSale({
        items: [
          { variantId: variant1Id, quantity: 2 },
          { variantId: variant2Id, quantity: 1 },
        ],
        paymentMethod: 'card',
      });
      expect(promotionSale.totalAmount).toBe(310);
      expect(salesRepo.getById(promotionSale.saleId).discount).toBe(150);

      const customer = customersRepo.getByPhone('01000000000');
      expect(customer).toBeDefined();
      expect(customersService.recordCustomerPayment({
        customerId: customer.id,
        amount: 50,
        paymentMethod: 'cash',
      }).remainingBalance).toBe(100);

      returnsService.processReturn({
        saleId: cashSale.saleId,
        variantId: variant1Id,
        quantity: 1,
        mode: 'refund',
        reason: 'مرتجع جزئي',
      });
      returnsService.processReturn({
        saleId: cardSale.saleId,
        variantId: variant2Id,
        quantity: 1,
        mode: 'exchange',
        exchangeVariantId: variant1Id,
        exchangePaymentMethod: 'cash',
        reason: 'استبدال',
      });

      const xReport = shiftsService.getShiftXReport(shift.id);
      expect(xReport.liveTotals).toEqual(expect.objectContaining({
        cashSales: 270,
        cardSales: 470,
        creditSales: 150,
        totalSales: 890,
        customerCashPayments: 50,
        cashRefunds: 135,
        cashExchangeNet: -10,
        expectedCash: 375,
      }));
      expect(customersService.getCustomerLedger(customer.id).balance).toBe(100);
      expect(variantsRepo.getById(variant1Id).stock_quantity).toBe(15);
      expect(variantsRepo.getById(variant2Id).stock_quantity).toBe(14);

      const closedShift = shiftsService.closeShift({
        shiftId: shift.id,
        actualCash: xReport.liveTotals.expectedCash,
      });
      expect(closedShift.status).toBe('closed');
      expect(closedShift.expected_cash).toBe(375);
      expect(closedShift.actual_cash).toBe(375);
      expect(closedShift.cash_difference).toBe(0);
    } finally {
      SettingsRepository.set('bundle_promotions', previousPromotions || '');
    }
  });

  test('persists restaurant fulfillment mode and moves its sale through the kitchen display', () => {
    authService.login('cashier_samir', 'pass123');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });
    shiftsService.openShift({ openingCash: 100 });

    const sale = salesService.createSale({
      items: [{ variantId: variant1Id, quantity: 1 }],
      paymentMethod: 'cash',
      orderMode: 'dine_in',
    });

    const savedSale = salesRepo.getById(sale.saleId);
    expect(savedSale.order_mode).toBe('dine_in');
    expect(savedSale.kitchen_status).toBe('new');
    expect(kitchenService.getKitchenOrders()).toEqual([
      expect.objectContaining({
        id: sale.saleId,
        order_mode: 'dine_in',
        kitchen_status: 'new',
        items: [expect.objectContaining({ product_name: 'تيشيرت بولو كلاسيك', quantity: 1 })],
      }),
    ]);

    expect(kitchenService.updateKitchenOrderStatus({
      saleId: sale.saleId,
      status: 'preparing',
    }).kitchen_status).toBe('preparing');
    expect(() => kitchenService.updateKitchenOrderStatus({
      saleId: sale.saleId,
      status: 'invalid',
    })).toThrow('حالة طلب المطبخ غير صالحة');
  });

  test('Full Journey: Login -> Open Shift -> Scan Barcodes -> Cart -> Discount -> Checkout -> Deduct Stock -> Print Receipt', async () => {
    // ========================================================
    // خطوة 1: تسجيل دخول الكاشير
    // ========================================================
    const loginResult = authService.login('cashier_samir', 'pass123');
    expect(loginResult).toHaveProperty('token');
    expect(loginResult.user.username).toBe('cashier_samir');
    expect(loginResult.user.role).toBe('cashier');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });

    // ========================================================
    // خطوة 2: بدء الوردية (Open Shift) مع عهدة نقدية
    // ========================================================
    const openShift = shiftsService.openShift({
      openingCash: 200,
      shiftType: 'morning',
      posStation: 'الدرج الرئيسي - POS 1',
    });
    expect(openShift).toHaveProperty('id');
    expect(openShift.status).toBe('open');

    // ========================================================
    // خطوة 3: مسح الباركود وإضافة المنتجات للسلة (Scan & Cart)
    // ========================================================
    const scannedItem1 = productsService.getProductByBarcode('6221110001');
    expect(scannedItem1).toBeDefined();
    expect(scannedItem1.id).toBe(variant1Id);
    expect(scannedItem1.productName).toBe('تيشيرت بولو كلاسيك');
    expect(scannedItem1.selling_price).toBe(150);
    expect(scannedItem1.stock_quantity).toBe(20);

    const scannedItem2 = productsService.getProductByBarcode('6221110002');
    expect(scannedItem2).toBeDefined();
    expect(scannedItem2.id).toBe(variant2Id);
    expect(scannedItem2.selling_price).toBe(160);
    expect(scannedItem2.stock_quantity).toBe(15);

    // تجهيز عناصر السلة (Cart Items): 2 قطع من الصنف الأول + 1 قطعة من الصنف الثاني
    const cart = [
      { variantId: scannedItem1.id, quantity: 2, unitPrice: scannedItem1.selling_price, productName: scannedItem1.productName, size: scannedItem1.size, color: scannedItem1.color },
      { variantId: scannedItem2.id, quantity: 1, unitPrice: scannedItem2.selling_price, productName: scannedItem2.productName, size: scannedItem2.size, color: scannedItem2.color },
    ];

    const subtotal = cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
    expect(subtotal).toBe(460); // (2 * 150) + (1 * 160) = 300 + 160 = 460

    // ========================================================
    // خطوة 4: تطبيق الخصم واحتساب الصافي المستحق
    // ========================================================
    const discount = 30; // خصم 30 ج.م (أقل من سقف الكاشير 30% الذي يساوي 138 ج.م)
    const expectedTotal = subtotal - discount; // 430 ج.م

    // ========================================================
    // خطوة 5: تنفيذ الدفع كاش وإنشاء الفاتورة (Checkout)
    // ========================================================
    const checkoutResult = salesService.createSale({
      items: cart.map((item) => ({ variantId: item.variantId, quantity: item.quantity })),
      discount,
      paymentMethod: 'cash',
    });

    expect(checkoutResult).toHaveProperty('saleId');
    expect(checkoutResult.totalAmount).toBe(expectedTotal);

    // ========================================================
    // خطوة 6: التحقق من نزول كميات المخزون في الداتابيز بدقة
    // ========================================================
    const updatedVariant1 = variantsRepo.getById(variant1Id);
    expect(updatedVariant1.stock_quantity).toBe(18); // 20 - 2 = 18

    const updatedVariant2 = variantsRepo.getById(variant2Id);
    expect(updatedVariant2.stock_quantity).toBe(14); // 15 - 1 = 14

    // التحقق من بيانات الفاتورة المحفوظة في قاعدة البيانات
    const savedSale = salesRepo.getById(checkoutResult.saleId);
    expect(savedSale).toBeDefined();
    expect(savedSale.total_amount).toBe(430);
    expect(savedSale.discount).toBe(30);
    expect(savedSale.payment_method).toBe('cash');
    expect(savedSale.items.length).toBe(2);

    // التحقق من أن مبيعات الوردية الحالية تم تحديثها
    const currentShift = shiftsService.getCurrentShift();
    expect(currentShift.liveTotals.cashSales).toBe(430);

    // ========================================================
    // خطوة 7: تجهيز وطباعة إيصال الفاتورة (Receipt Printing)
    // ========================================================
    const receiptData = {
      saleId: checkoutResult.saleId,
      customerName: 'عميل نقدي سريع',
      items: cart,
      subtotal,
      discount,
      total: expectedTotal,
    };

    // توليد كود الـ HTML للفاتورة والتأكد من احتوائه على كافة التفاصيل
    const receiptHtml = printService.buildReceiptHtml ? printService.buildReceiptHtml(receiptData) : null;
    if (receiptHtml) {
      expect(receiptHtml).toContain(`رقم ${checkoutResult.saleId}`);
      expect(receiptHtml).toContain('تيشيرت بولو كلاسيك');
      expect(receiptHtml).toContain('460 ج.م');
      expect(receiptHtml).toContain('30 ج.م');
      expect(receiptHtml).toContain('430 ج.م');
    }

    // استدعاء خدمة الطباعة المباشرة
    const printPromise = printService.printReceipt(receiptData);
    await expect(printPromise).resolves.toBe(true);

    // التأكد من استدعاء نوافذ Electron للطباعة بالباراميترات الصحيحة
    expect(mockLoadURL).toHaveBeenCalledTimes(1);
    expect(mockPrint).toHaveBeenCalledTimes(1);
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  test('repair work order records parts without stock deduction and invoices them once at delivery', () => {
    authService.login('cashier_samir', 'pass123');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });
    shiftsService.openShift({
      openingCash: 200,
      shiftType: 'morning',
      posStation: 'الدرج الرئيسي - POS 1',
    });

    const order = ordersService.createOrder({
      order_type: 'maintenance',
      customer_name: 'عميل الورشة',
      customer_phone: '01000000000',
      vehicle_plate: 'س ص ع 1234',
      vehicle_make: 'تويوتا',
      vehicle_model: 'كورولا',
      vehicle_year: 2020,
      odometer: 80000,
      fault_description: 'صوت في الفرامل',
    });
    ordersService.addOrderItem(order.id, { variantId: variant1Id, quantity: 1 });

    expect(inventoryRepo.getStockQuantity(inventoryRepo.getDefaultWarehouseId(), variant1Id)).toBe(20);
    ordersService.updateOrderStatus(order.id, 'ready');

    const result = salesService.createSale({
      orderId: order.id,
      items: [{ variantId: variant1Id, quantity: 1, unitPrice: 150 }],
      paymentMethod: 'cash',
    });
    const completedOrder = ordersRepo.getOrderById(order.id);

    expect(completedOrder.status).toBe('delivered');
    expect(completedOrder.sale_id).toBe(result.saleId);
    expect(completedOrder.vehicle_plate).toBe('س ص ع 1234');
    expect(completedOrder.items).toHaveLength(1);
    expect(inventoryRepo.getStockQuantity(inventoryRepo.getDefaultWarehouseId(), variant1Id)).toBe(19);
    expect(() => salesService.createSale({
      orderId: order.id,
      items: [{ variantId: variant1Id, quantity: 1, unitPrice: 150 }],
      paymentMethod: 'cash',
    })).toThrow('يجب أن يكون أمر الشغل جاهزًا وغير مفوتر');
    expect(inventoryRepo.getStockQuantity(inventoryRepo.getDefaultWarehouseId(), variant1Id)).toBe(19);
  });

  test('local offline sales keep unique increasing invoice IDs without a network connection', () => {
    authService.login('cashier_samir', 'pass123');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });
    shiftsService.openShift({ openingCash: 100 });

    const firstSale = salesService.createSale({
      items: [{ variantId: variant1Id, quantity: 1 }],
      paymentMethod: 'cash',
    });
    const secondSale = salesService.createSale({
      items: [{ variantId: variant2Id, quantity: 1 }],
      paymentMethod: 'cash',
    });

    expect(secondSale.saleId).toBeGreaterThan(firstSale.saleId);
    expect(salesRepo.getById(firstSale.saleId).total_amount).toBe(150);
    expect(salesRepo.getById(secondSale.saleId).total_amount).toBe(160);
    expect(shiftsService.getCurrentShift().liveTotals.expectedCash).toBe(410);
  });

  test('partial return of one item from five updates stock, refund, and expected drawer cash', () => {
    authService.login('cashier_samir', 'pass123');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });
    const shift = shiftsService.openShift({ openingCash: 200 });
    const sale = salesService.createSale({
      items: [{ variantId: variant1Id, quantity: 5 }],
      paymentMethod: 'cash',
    });

    const returned = returnsService.processReturn({
      saleId: sale.saleId,
      variantId: variant1Id,
      quantity: 1,
      reason: 'اختبار إرجاع جزئي',
    });

    expect(returned.refundAmount).toBe(150);
    expect(returnsRepo.getReturnedQuantity(sale.saleId, variant1Id)).toBe(1);
    expect(inventoryRepo.getStockQuantity(inventoryRepo.getDefaultWarehouseId(), variant1Id)).toBe(16);
    expect(shiftsService.getCurrentShift().liveTotals.expectedCash).toBe(800);

    const closedShift = shiftsService.closeShift({
      shiftId: shift.id,
      actualCash: 800,
    });
    expect(closedShift.expected_cash).toBe(800);
    expect(closedShift.cash_difference).toBe(0);
  });

  test('petty cash expenses are deducted and shift closing reports exact shortage and overage', () => {
    authService.login('cashier_samir', 'pass123');
    attendanceService.checkIn({ date: attendanceService.getTodayDate() });

    const shortageShift = shiftsService.openShift({ openingCash: 100 });
    shiftsService.addShiftExpense({ amount: 25, category: 'مصروف نثري', notes: 'اختبار' });
    expect(shiftsService.getCurrentShift().liveTotals.expectedCash).toBe(75);
    const shortage = shiftsService.closeShift({ shiftId: shortageShift.id, actualCash: 65 });
    expect(shortage.expected_cash).toBe(75);
    expect(shortage.cash_difference).toBe(-10);
    expect(shortage.total_expenses).toBe(25);

    const overageShift = shiftsService.openShift({ openingCash: 100 });
    shiftsService.addShiftExpense({ amount: 25, category: 'مصروف نثري', notes: 'اختبار' });
    const overage = shiftsService.closeShift({ shiftId: overageShift.id, actualCash: 85 });
    expect(overage.expected_cash).toBe(75);
    expect(overage.cash_difference).toBe(10);
    expect(overage.total_expenses).toBe(25);
  });
});

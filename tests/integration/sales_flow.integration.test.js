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
const shiftsService = require('../../electron/services/shifts.service');
const productsService = require('../../electron/services/products.service');
const salesService = require('../../electron/services/sales.service');
const printService = require('../../electron/services/print.service');
const usersRepo = require('../../electron/repositories/users.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const salesRepo = require('../../electron/repositories/sales.repository');
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

  test('Full Journey: Login -> Open Shift -> Scan Barcodes -> Cart -> Discount -> Checkout -> Deduct Stock -> Print Receipt', async () => {
    // ========================================================
    // خطوة 1: تسجيل دخول الكاشير
    // ========================================================
    const loginResult = authService.login('cashier_samir', 'pass123');
    expect(loginResult).toHaveProperty('token');
    expect(loginResult.user.username).toBe('cashier_samir');
    expect(loginResult.user.role).toBe('cashier');

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
});

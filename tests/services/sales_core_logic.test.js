const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
}));

const authService = require('../../electron/services/auth.service');
const salesService = require('../../electron/services/sales.service');
const returnsService = require('../../electron/services/returns.service');
const customersService = require('../../electron/services/customers.service');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const customersRepo = require('../../electron/repositories/customers.repository');
const salesRepo = require('../../electron/repositories/sales.repository');
const usersRepo = require('../../electron/repositories/users.repository');

describe('Week 2: Core Sales Logic Tests (اختبار منطق البيع الأساسي)', () => {
  let testVariantId;
  let testProductId;

  beforeAll(() => {
    // Initialize DB Schema
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockDb.exec(schema);
  });

  beforeEach(() => {
    // Reset data
    mockDb.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM returns;
      DELETE FROM sale_items;
      DELETE FROM sales;
      DELETE FROM product_variants;
      DELETE FROM products;
      DELETE FROM customer_payments;
      DELETE FROM customers;
      DELETE FROM users;
      PRAGMA foreign_keys = ON;
    `);

    // Create Admin user for session
    const bcrypt = require('bcryptjs');
    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('admin123', 4),
      role: 'admin',
      forcePasswordChange: false,
    });

    authService.login('admin', 'admin123');

    // Seed product and variant
    testProductId = productsRepo.create({
      name: 'قميص كاجوال رجالي',
      categoryId: null,
      description: 'قطن 100%',
    });

    testVariantId = variantsRepo.create({
      productId: testProductId,
      size: 'L',
      color: 'أزرق',
      purchasePrice: 60,
      sellingPrice: 100,
      stockQuantity: 10,
      lowStockThreshold: 2,
      barcode: '622000111222',
      sku: 'SHIRT-L-BLUE',
    });
  });

  afterAll(() => {
    if (mockDb) mockDb.close();
  });

  // 1. بيع منتج بكمية متوفرة → ينجح ويقلل المخزون
  test('1. بيع منتج بكمية متوفرة → ينجح ويقلل المخزون بالكمية المباعة بالضبط', () => {
    const initialVariant = variantsRepo.getById(testVariantId);
    expect(initialVariant.stock_quantity).toBe(10);

    const saleResult = salesService.createSale({
      items: [{ variantId: testVariantId, quantity: 3 }],
      discount: 0,
      paymentMethod: 'cash',
    });

    expect(saleResult).toHaveProperty('saleId');
    expect(saleResult.totalAmount).toBe(300);

    // Verify stock decreased by 3 (10 - 3 = 7)
    const updatedVariant = variantsRepo.getById(testVariantId);
    expect(updatedVariant.stock_quantity).toBe(7);

    // Verify invoice and sale items created in DB
    const savedSale = salesRepo.getById(saleResult.saleId);
    expect(savedSale).toBeDefined();
    expect(savedSale.total_amount).toBe(300);
    expect(savedSale.items.length).toBe(1);
    expect(savedSale.items[0].quantity).toBe(3);
    expect(savedSale.items[0].unit_price).toBe(100);
  });

  // 2. بيع منتج بكمية أكبر من المتاح → يترفض
  test('2. بيع منتج بكمية أكبر من المتاح → يترفض ولا يتم إنشاء فاتورة ولا خصم مخزون', () => {
    const currentStock = variantsRepo.getById(testVariantId).stock_quantity; // 10

    // Try to sell 11 items when only 10 are available
    expect(() => {
      salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 11 }],
        paymentMethod: 'cash',
      });
    }).toThrow('الكمية المتاحة غير كافية');

    // Verify stock was NOT changed
    const unchangedVariant = variantsRepo.getById(testVariantId);
    expect(unchangedVariant.stock_quantity).toBe(currentStock);

    // Verify no sales records were created
    const allSales = mockDb.prepare('SELECT COUNT(*) as count FROM sales').get();
    expect(allSales.count).toBe(0);
  });

  // 3. خصم أكبر من السعر → يترفض
  test('3. خصم أكبر من السعر → يترفض ولا يسمح بخصومات تتجاوز إجمالي الفاتورة أو خصومات سالبة', () => {
    // Selling 1 item (100 EGP) with discount 150 EGP
    expect(() => {
      salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 1 }],
        discount: 150,
        paymentMethod: 'cash',
      });
    }).toThrow('قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة');

    // Negative discount should also be rejected
    expect(() => {
      salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 1 }],
        discount: -20,
        paymentMethod: 'cash',
      });
    }).toThrow('الخصم يجب أن يكون رقمًا أكبر من أو يساوي الصفر');
  });

  // 4. استرجاع منتج → المخزون يزيد بنفس الكمية
  test('4. استرجاع منتج → المخزون يزيد بنفس الكمية المرتجعة ويتم رد القيمة المالية بدقة', () => {
    // First: Sell 4 items (Stock becomes 10 - 4 = 6)
    const sale = salesService.createSale({
      items: [{ variantId: testVariantId, quantity: 4 }],
      paymentMethod: 'cash',
    });

    expect(variantsRepo.getById(testVariantId).stock_quantity).toBe(6);

    // Second: Return 2 items
    const returnResult = returnsService.processReturn({
      saleId: sale.saleId,
      variantId: testVariantId,
      quantity: 2,
      reason: 'مقاس غير مناسب',
    });

    expect(returnResult).toHaveProperty('returnId');
    expect(returnResult.refundAmount).toBe(200); // 2 * 100

    // Verify stock increased by 2 (6 + 2 = 8)
    expect(variantsRepo.getById(testVariantId).stock_quantity).toBe(8);

    // Third: Attempt to return 3 more items (when only 2 remaining from original 4) -> Rejected!
    expect(() => {
      returnsService.processReturn({
        saleId: sale.saleId,
        variantId: testVariantId,
        quantity: 3,
        reason: 'تالف',
      });
    }).toThrow('لا يمكن إرجاع أكثر من الكمية المباعة');
  });

  // 5. فاتورة نقدي/بطاقة/آجل → كل نوع يتسجل صح
  describe('5. تسجيل طرق الدفع المختلفة (نقدي / بطاقة / آجل)', () => {
    test('أ. فاتورة نقدي (cash) → تُسجل بطريقة الدفع كاش مع الخصم إن وجد', () => {
      const result = salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 2 }],
        discount: 20,
        paymentMethod: 'cash',
      });

      const sale = salesRepo.getById(result.saleId);
      expect(sale.payment_method).toBe('cash');
      expect(sale.discount).toBe(20);
      expect(sale.total_amount).toBe(180); // 200 - 20
      expect(sale.customer_name).toBeNull();
    });

    test('ب. فاتورة بطاقة (card) → تُسجل بطريقة الدفع بطاقة إلكترونية (فيزا)', () => {
      const result = salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 1 }],
        paymentMethod: 'card',
      });

      const sale = salesRepo.getById(result.saleId);
      expect(sale.payment_method).toBe('card');
      expect(sale.total_amount).toBe(100);
    });

    test('ج. فاتورة آجل (credit) → تتطلب اسم العميل وتاريخ الاستحقاق وتُسجل مديونية العميل بدقة', () => {
      // 1. Trying to make a credit sale without customer name -> Rejected
      expect(() => {
        salesService.createSale({
          items: [{ variantId: testVariantId, quantity: 1 }],
          paymentMethod: 'credit',
          dueDate: '2026-10-15',
        });
      }).toThrow('اسم العميل مطلوب في حالة البيع الآجل');

      // 2. Trying to make a credit sale without due date -> Rejected
      expect(() => {
        salesService.createSale({
          items: [{ variantId: testVariantId, quantity: 1 }],
          paymentMethod: 'credit',
          customerName: 'عميل آجل',
        });
      }).toThrow('تاريخ الاستحقاق مطلوب في حالة البيع الآجل');

      // 3. Valid credit sale with name and due date -> Success
      const creditSale = salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 2 }],
        paymentMethod: 'credit',
        customerName: 'طارق عبد الله',
        customerPhone: '01011223344',
        dueDate: '2026-10-20',
      });

      const sale = salesRepo.getById(creditSale.saleId);
      expect(sale.payment_method).toBe('credit');
      expect(sale.customer_name).toBe('طارق عبد الله');
      expect(sale.customer_phone).toBe('01011223344');
      expect(sale.due_date).toBe('2026-10-20');
      expect(sale.total_amount).toBe(200);

      // Verify customer record was created in database
      const customer = customersRepo.getByPhone('01011223344');
      expect(customer).toBeDefined();
      expect(customer.name).toBe('طارق عبد الله');
    });

    test('دورة المديونية: بيع آجل ثم سداد جزئي وكامل', () => {
      const creditSale = salesService.createSale({
        items: [{ variantId: testVariantId, quantity: 2 }],
        paymentMethod: 'credit',
        customerName: 'عميل السداد',
        customerPhone: '01000000000',
        dueDate: '2026-10-20',
      });
      const customer = customersRepo.getByPhone('01000000000');
      expect(customersService.getAllCustomersWithStats().find((item) => item.id === customer.id).debt).toBe(200);

      const partial = customersService.recordCustomerPayment({
        customerId: customer.id,
        amount: 75,
        paymentMethod: 'cash',
      });
      expect(partial.remainingBalance).toBe(125);

      const settled = customersService.recordCustomerPayment({
        customerId: customer.id,
        amount: 125,
        paymentMethod: 'card',
      });
      expect(settled.remainingBalance).toBe(0);
      expect(customersService.getCustomerLedger(customer.id).balance).toBe(0);
      expect(customersService.getCustomerLedger(customer.id).sales[0].id).toBe(creditSale.saleId);
    });
  });
});

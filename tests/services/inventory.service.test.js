/**
 * @file inventory.service.test.js
 * @description Comprehensive Unit & Integration Tests for Inventory, Products, Variants,
 * Barcode Parsing, Stock Constraints, and RBAC Permissions (100% UI-independent).
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

const authService = require('../../electron/services/auth.service');
const productsService = require('../../electron/services/products.service');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const categoriesRepo = require('../../electron/repositories/categories.repository');
const usersRepo = require('../../electron/repositories/users.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const bcrypt = require('bcryptjs');

describe('Inventory & Products Management (اختبارات المخزون والمنتجات)', () => {
  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockDb.exec(schema);
    inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });
  });

  beforeEach(() => {
    mockDb.exec(`
      PRAGMA foreign_keys = OFF;
      DELETE FROM sale_items;
      DELETE FROM sales;
      DELETE FROM product_variants;
      DELETE FROM products;
      DELETE FROM categories;
      DELETE FROM users;
      PRAGMA foreign_keys = ON;
    `);

    // Create Admin user and login
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

    authService.login('admin', 'admin123');
  });

  afterAll(() => {
    if (mockDb.open) mockDb.close();
  });

  // ── 1. التحقق من المدخلات وصحة البيانات ──────────────────────────────────
  describe('1. Input Validation & Defaults (التحقق من صحة المدخلات)', () => {
    test('يمنع إضافة منتج بدون اسم', () => {
      expect(() => {
        productsService.addProductWithVariant({
          name: '',
          sellingPrice: 150,
          stockQuantity: 10,
        });
      }).toThrow('اسم المنتج مطلوب');

      expect(() => {
        productsService.addProductWithVariant({
          name: '   ',
          sellingPrice: 150,
          stockQuantity: 10,
        });
      }).toThrow('اسم المنتج مطلوب');
    });

    test('يمنع إضافة منتج بسعر بيع غير صالح أو سالب', () => {
      expect(() => {
        productsService.addProductWithVariant({
          name: 'قميص كاجوال',
          sellingPrice: -10,
          stockQuantity: 5,
        });
      }).toThrow('سعر المنتج غير صحيح');

      expect(() => {
        productsService.addProductWithVariant({
          name: 'قميص كاجوال',
          sellingPrice: 0,
          stockQuantity: 5,
        });
      }).toThrow('سعر المنتج غير صحيح');
    });

    test('يمنع كمية مخزون سالبة', () => {
      expect(() => {
        productsService.addProductWithVariant({
          name: 'بنطلون جينز',
          sellingPrice: 250,
          stockQuantity: -1,
        });
      }).toThrow('الكمية غير صحيحة');
    });

    test('يقبل سعر الشراء كـ 0 إذا كان غير محدد أو غير صالح', () => {
      const res = productsService.addProductWithVariant({
        name: 'تيشيرت سادة',
        purchasePrice: undefined,
        sellingPrice: 120,
        stockQuantity: 15,
        size: 'L',
        color: 'أبيض',
      });

      const variant = variantsRepo.getById(res.variantId);
      expect(variant.purchase_price).toBe(0);
      expect(variant.selling_price).toBe(120);
      expect(variant.stock_quantity).toBe(15);
    });
  });

  // ── 2. إدارة التصنيفات والأكواد التلقائية ──────────────────────────────────
  describe('2. Categories & Auto-Generated SKUs / Barcodes (التصنيفات والأكواد)', () => {
    test('ينشئ تصنيف جديد تلقائياً إذا لم يكن موجوداً ويعيد استخدامه', () => {
      const res1 = productsService.addProductWithVariant({
        name: 'بدلة رجالي',
        categoryName: 'ملابس رسمية',
        sellingPrice: 1200,
        stockQuantity: 3,
      });

      const res2 = productsService.addProductWithVariant({
        name: 'قميص بدلة',
        categoryName: 'ملابس رسمية',
        sellingPrice: 350,
        stockQuantity: 8,
      });

      const categories = categoriesRepo.getAll();
      expect(categories.length).toBe(1);
      expect(categories[0].name).toBe('ملابس رسمية');

      const p1 = productsRepo.getById(res1.productId);
      const p2 = productsRepo.getById(res2.productId);
      expect(p1.category_id).toBe(categories[0].id);
      expect(p2.category_id).toBe(categories[0].id);
    });

    test('يولد SKU و Barcode فريد ومتسق مع معرّف الصنف والمقاس', () => {
      const res = productsService.addProductWithVariant({
        name: 'حذاء كلاسيك',
        sellingPrice: 450,
        stockQuantity: 4,
        size: '42',
        color: 'بني',
      });

      expect(res.sku).toBe(`P${res.productId}-V${res.variantId}-42`);

      const variant = variantsRepo.getById(res.variantId);
      expect(variant.sku).toBe(res.sku);
      expect(variant.barcode).toBe(res.sku);
    });
  });

  // ── 3. إضافة وتعديل وحذف المتغيرات (Variants) ─────────────────────────────
  describe('3. Multi-Variant Operations (إدارة المقاسات والألوان)', () => {
    test('يسمح بإضافة مقاسات وألوان متعددة لنفس المنتج وتجميعها بدقة', () => {
      const created = productsService.addProductWithVariant({
        name: 'هودي شتوي',
        categoryName: 'شتوي',
        sellingPrice: 500,
        purchasePrice: 300,
        stockQuantity: 10,
        size: 'M',
        color: 'أسود',
      });

      const v2 = productsService.addVariantToProduct(created.productId, {
        sellingPrice: 500,
        purchasePrice: 300,
        stockQuantity: 5,
        size: 'L',
        color: 'رمادي',
      });

      const v3 = productsService.addVariantToProduct(created.productId, {
        sellingPrice: 520, // سعر مختلف للمقاس الأكبر
        purchasePrice: 310,
        stockQuantity: 3,
        size: 'XL',
        color: 'أسود',
      });

      expect(v2.variantId).toBeDefined();
      expect(v3.variantId).toBeDefined();

      const all = productsService.getAllProductsWithVariants();
      expect(all.length).toBe(1);
      expect(all[0].variants.length).toBe(3);

      const totalStock = all[0].variants.reduce((sum, v) => sum + v.stock_quantity, 0);
      expect(totalStock).toBe(18); // 10 + 5 + 3
    });

    test('يمنع حذف آخر متغير للمنتج لحماية بنية البيانات', () => {
      const p = productsService.addProductWithVariant({
        name: 'كاب قطن',
        sellingPrice: 80,
        stockQuantity: 20,
      });

      expect(() => {
        productsService.deleteVariant(p.variantId);
      }).toThrow('لا يمكن حذف آخر متغير');
    });

    test('يمنع حذف متغير له رصيد وحركة افتتاحية لحماية سجل المخزون', () => {
      const p = productsService.addProductWithVariant({
        name: 'جاكيت جينز',
        sellingPrice: 700,
        stockQuantity: 4,
        size: 'M',
      });

      const v2 = productsService.addVariantToProduct(p.productId, {
        sellingPrice: 700,
        stockQuantity: 2,
        size: 'L',
      });

      expect(() => productsService.deleteVariant(v2.variantId))
        .toThrow('لا يمكن حذف صنف له رصيد أو حركات مخزون');

      const remaining = variantsRepo.getByProductId(p.productId);
      expect(remaining).toHaveLength(2);
    });

    test('تعديل متغير يحدث السعر والمخزون والـ SKU عند تغيير المقاس', () => {
      const p = productsService.addProductWithVariant({
        name: 'تيشيرت رياضي',
        sellingPrice: 200,
        stockQuantity: 10,
        size: 'S',
      });

      productsService.updateVariant(p.variantId, {
        size: 'XXL',
        color: 'أزرق',
        purchasePrice: 140,
        sellingPrice: 220,
        stockQuantity: 12,
        lowStockThreshold: 3,
        reason: 'تحديث قائمة الأسعار',
      });

      const updated = variantsRepo.getById(p.variantId);
      expect(updated.size).toBe('XXL');
      expect(updated.color).toBe('أزرق');
      expect(updated.selling_price).toBe(220);
      expect(updated.stock_quantity).toBe(12);
      expect(updated.sku).toBe(`P${p.productId}-V${p.variantId}-XXL`);
    });
  });

  // ── 4. البحث بالباركود ومعالجة أخطاء الكيبورد واللغة العربية ──────────────
  describe('4. Smart Barcode Resolution (فحص الباركود الذكي)', () => {
    test('يجلب المنتج الصحيح بالباركود المباشر مع اسم المنتج الأب', () => {
      const p = productsService.addProductWithVariant({
        name: 'شورت سباحة',
        sellingPrice: 150,
        stockQuantity: 7,
        size: 'M',
      });

      const item = productsService.getProductByBarcode(p.sku);
      expect(item).not.toBeNull();
      expect(item.id).toBe(p.variantId);
      expect(item.productName).toBe('شورت سباحة');
      expect(item.selling_price).toBe(150);
    });

    test('يحول الأرقام الهندية/العربية (١٢٣٤٥) إلى أرقام قياسية تلقائياً', () => {
      const p = productsService.addProductWithVariant({
        name: 'حزام جلد',
        sellingPrice: 90,
        stockQuantity: 15,
      });

      // تعيين باركود يدوي بأرقام عربية
      variantsRepo.update(p.variantId, {
        size: null,
        color: null,
        purchasePrice: 50,
        sellingPrice: 90,
        stockQuantity: 15,
        lowStockThreshold: 2,
        barcode: '12345678',
      });

      // البحث باستخدام أرقام لوحة المفاتيح العربية: ١٢٣٤٥٦٧٨
      const found = productsService.getProductByBarcode('١٢٣٤٥٦٧٨');
      expect(found).not.toBeNull();
      expect(found.id).toBe(p.variantId);
    });

    test('يعالج خطأ لغة لوحة المفاتيح إذا قرأ الباركود بحروف عربية (Mapping)', () => {
      const p = productsService.addProductWithVariant({
        name: 'كوتشي أبيض',
        sellingPrice: 600,
        stockQuantity: 6,
      });

      variantsRepo.update(p.variantId, {
        size: null,
        color: null,
        purchasePrice: 400,
        sellingPrice: 600,
        stockQuantity: 6,
        lowStockThreshold: 2,
        barcode: 'qrst',
      });

      // على الكيبورد العربي: q=ض, r=ق, s=س, t=ف -> "ضقف"
      const found = productsService.getProductByBarcode('ضقسف');
      expect(found).not.toBeNull();
      expect(found.id).toBe(p.variantId);
    });
  });

  // ── 5. الخصم والحماية من المخزون السالب على مستوى الاستعلام ─────────────────
  describe('5. Stock Deductions & Strict Zero-Floor (حماية المخزون من السالب)', () => {
    test('يخصم الكمية المحددة بدقة عند توفر الرصيد', () => {
      const p = productsService.addProductWithVariant({
        name: 'جورب قطن',
        sellingPrice: 25,
        stockQuantity: 10,
      });

      inventoryRepo.adjustStock({
        warehouseId: inventoryRepo.getDefaultWarehouseId(),
        variantId: p.variantId,
        delta: -3,
        notes: 'اختبار خصم المخزون',
      });
      const after = variantsRepo.getById(p.variantId);
      expect(after.stock_quantity).toBe(7);

      inventoryRepo.adjustStock({
        warehouseId: inventoryRepo.getDefaultWarehouseId(),
        variantId: p.variantId,
        delta: -7,
        notes: 'اختبار استنفاد المخزون',
      });
      const zero = variantsRepo.getById(p.variantId);
      expect(zero.stock_quantity).toBe(0);
    });

    test('يرمي خطأ صريح ويمنع خصم المخزون إذا كانت الكمية المطلوبة تتجاوز المتاح', () => {
      const p = productsService.addProductWithVariant({
        name: 'نظارة شمسية',
        sellingPrice: 300,
        stockQuantity: 2,
      });

      expect(() => {
        inventoryRepo.adjustStock({
          warehouseId: inventoryRepo.getDefaultWarehouseId(),
          variantId: p.variantId,
          delta: -3,
          notes: 'اختبار منع المخزون السالب',
        });
      }).toThrow('لا توجد كمية كافية في المخزن');

      // تأكد أن المخزون لم يتغير ولم يصبح سالباً
      const check = variantsRepo.getById(p.variantId);
      expect(check.stock_quantity).toBe(2);
    });

    test('سجل حركة المخزون للإضافة فقط: لا تعديل ولا حذف', () => {
      const p = productsService.addProductWithVariant({
        name: 'حزام جلد',
        sellingPrice: 90,
        stockQuantity: 4,
      });
      const movement = mockDb.prepare(
        'SELECT id FROM inventory_movements WHERE variant_id = ? ORDER BY id DESC LIMIT 1'
      ).get(p.variantId);

      expect(() => mockDb.prepare('UPDATE inventory_movements SET quantity_change = 400 WHERE id = ?')
        .run(movement.id)).toThrow('append-only');
      expect(() => mockDb.prepare('DELETE FROM inventory_movements WHERE id = ?')
        .run(movement.id)).toThrow('append-only');
    });

    test('التسوية اليدوية تقبل أسبابًا محددة فقط وتسجل السبب', () => {
      const inventoryService = require('../../electron/services/inventory.service');
      const p = productsService.addProductWithVariant({
        name: 'محفظة',
        sellingPrice: 120,
        stockQuantity: 5,
      });
      const warehouseId = inventoryRepo.getDefaultWarehouseId();
      const base = { warehouseId, variantId: p.variantId, delta: -1 };

      expect(() => inventoryService.adjustStock({ ...base, reason: 'free-stock' }))
        .toThrow('سبب التسوية غير صالح');
      expect(() => inventoryService.adjustStock({ ...base, reason: 'other' }))
        .toThrow('أخرى');
      expect(() => inventoryService.adjustStock({ ...base, delta: 1000000, reason: 'damaged' }))
        .toThrow('لا يمكن أن تتجاوز');

      inventoryService.adjustStock({ ...base, reason: 'damaged' });
      const last = mockDb.prepare(
        'SELECT notes, quantity_after FROM inventory_movements WHERE variant_id = ? ORDER BY id DESC LIMIT 1'
      ).get(p.variantId);
      expect(last).toEqual({ notes: 'تالف', quantity_after: 4 });
    });
  });

  // ── 6. قيود الصلاحيات (RBAC Permissions) ─────────────────────────────────
  describe('6. RBAC Permissions (صلاحيات مدير النظام فقط)', () => {
    test('يمنع الكاشير غير المصرح له من إضافة منتجات أو تعديلها', () => {
      // تغيير الجلسة لكاشير
      authService.login('cashier1', 'cashier123');

      expect(() => {
        productsService.addProductWithVariant({
          name: 'منتج غير مصرح',
          sellingPrice: 100,
          stockQuantity: 10,
        });
      }).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');

      expect(() => {
        productsService.updateProduct(1, { name: 'محاولة تعديل' });
      }).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');

      expect(() => {
        productsService.deleteProduct(1);
      }).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('يمنع المستخدم غير المسجل (No Session) تماماً', () => {
      authService.logout();

      expect(() => {
        productsService.addProductWithVariant({
          name: 'بدون تسجيل',
          sellingPrice: 100,
          stockQuantity: 5,
        });
      }).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });
  });
});

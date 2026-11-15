/**
 * Money paths: scale barcodes, multi-unit barcodes, and stock transfer between warehouses.
 * These move money or stock, so a wrong number here is a wrong invoice or a wrong count.
 */
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb, dbPath: ':memory:' }));

const authService = require('../../electron/services/auth.service');
const groceryService = require('../../electron/services/grocery.service');
const inventoryService = require('../../electron/services/inventory.service');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');
const usersRepo = require('../../electron/repositories/users.repository');
const bcrypt = require('bcryptjs');

function addVariant({ name, price, sku, barcode, stock = 0 }) {
  const productId = productsRepo.create({ name });
  const variantId = variantsRepo.create({
    productId, sku, barcode, purchasePrice: 1, sellingPrice: price, stockQuantity: stock,
  });
  return variantId;
}

// 13 digits: prefix(2) + PLU(5) + data(5) + check(1)
const scaleCode = (plu, data) => `20${plu}${data}0`;

describe('Money paths (مسارات الفلوس)', () => {
  let mainWarehouse;
  let secondWarehouse;

  beforeAll(() => {
    mockDb.exec(fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf-8'));
    const mainBranch = inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });
    const otherBranch = inventoryRepo.createBranch({ name: 'فرع 2' });
    mainWarehouse = inventoryRepo.getWarehouses(mainBranch)[0].id;
    secondWarehouse = inventoryRepo.getWarehouses(otherBranch)[0].id;
    usersRepo.create({
      username: 'admin', passwordHash: bcrypt.hashSync('admin123', 4), role: 'admin', forcePasswordChange: false,
    });
    authService.login('admin', 'admin123');
  });

  afterAll(() => { if (mockDb.open) mockDb.close(); });

  beforeEach(() => {
    mockDb.exec('PRAGMA foreign_keys = OFF; DELETE FROM product_units; DELETE FROM warehouse_stock; DELETE FROM product_variants; DELETE FROM products; DELETE FROM scale_barcode_configs; PRAGMA foreign_keys = ON;');
  });

  describe('1. باركود الميزان', () => {
    test('الوزن بالجرام: 1500 جم × 100 ج/كجم = 150 ج', () => {
      addVariant({ name: 'جبنة رومي', price: 100, sku: '00123' });
      const r = groceryService.resolveBarcode(scaleCode('00123', '01500'));
      expect(r).toMatchObject({ resolved: true, type: 'scale_item', quantity: 1.5, unitPrice: 100, totalAmount: 150 });
    });

    test('التشفير بالسعر: 35.50 ج على صنف 100 ج/كجم = 0.355 كجم', () => {
      addVariant({ name: 'لانشون', price: 100, sku: '00200' });
      groceryService.saveScaleConfig({ prefix: '20', encoding_type: 'total_price' });
      const r = groceryService.resolveBarcode(scaleCode('00200', '03550'));
      expect(r.totalAmount).toBe(35.5);
      expect(r.quantity).toBe(0.355);
    });

    test('وزن صفري يترفض ولا يتحول لبيعة بصفر جنيه', () => {
      addVariant({ name: 'جبنة', price: 100, sku: '00123' });
      const r = groceryService.resolveBarcode(scaleCode('00123', '00000'));
      expect(r.resolved).toBe(false);
    });

    test('بادئة غير بادئة الميزان أو طول غير 13 مش باركود ميزان', () => {
      expect(groceryService.parseScaleBarcode('3000123015000')).toBeNull();
      expect(groceryService.parseScaleBarcode('200012301500')).toBeNull();
      expect(groceryService.parseScaleBarcode('20001230150AB')).toBeNull();
    });

    test('PLU غير مسجل ما يتحولش لصنف ولا يتباع', () => {
      addVariant({ name: 'صنف', price: 10, sku: '00001' });
      const r = groceryService.resolveBarcode(scaleCode('09999', '01000'));
      expect(r.type).not.toBe('scale_item');
    });

    test('PLU غير مسجل ما يتطابقش بالغلط مع معرّف صنف داخلي (id)', () => {
      const variantId = addVariant({ name: 'صنف تاني', price: 10, sku: 'ZZ-1' });
      const plu = String(variantId).padStart(5, '0');
      const r = groceryService.resolveBarcode(scaleCode(plu, '01000'));
      expect(r.type).not.toBe('scale_item');
    });

    test('الضرب السريع بيضاعف الكمية والإجمالي: 2*باركود 500 جم = 1 كجم', () => {
      addVariant({ name: 'جبنة', price: 80, sku: '00123' });
      const r = groceryService.resolveBarcode(`2*${scaleCode('00123', '00500')}`);
      expect(r.quantity).toBe(1);
      expect(r.totalAmount).toBe(80);
    });

    // Known weakness: the check digit is parsed but never verified, so a misread code is accepted.
    test('رقم التحقق (checksum) لا يتم التحقق منه حاليًا', () => {
      addVariant({ name: 'جبنة', price: 100, sku: '00123' });
      const wrongCheck = '2000123015009';
      expect(groceryService.resolveBarcode(wrongCheck).resolved).toBe(true);
    });
  });

  describe('2. الوحدات المتعددة (كرتونة/علبة)', () => {
    test('باركود الكرتونة يخصم معامل التحويل × الكمية من الوحدة الأساسية', () => {
      const variantId = addVariant({ name: 'مياه', price: 5, sku: 'W1', stock: 100 });
      groceryService.createUnit({ variant_id: variantId, unit_name: 'كرتونة', conversion_factor: 12, barcode: 'CART-1', selling_price: 55 });
      const one = groceryService.resolveBarcode('CART-1');
      expect(one).toMatchObject({ type: 'unit_item', baseQuantityDeduction: 12, unitPrice: 55, totalAmount: 55 });
      const three = groceryService.resolveBarcode('3*CART-1');
      expect(three).toMatchObject({ baseQuantityDeduction: 36, totalAmount: 165 });
    });

    test('يرفض معامل تحويل صفر أو سالب، وسعر سالب', () => {
      const variantId = addVariant({ name: 'مياه', price: 5, sku: 'W1' });
      const base = { variant_id: variantId, unit_name: 'كرتونة', selling_price: 55 };
      expect(() => groceryService.createUnit({ ...base, conversion_factor: 0 })).toThrow();
      expect(() => groceryService.createUnit({ ...base, conversion_factor: -2 })).toThrow();
      expect(() => groceryService.createUnit({ ...base, conversion_factor: 12, selling_price: -1 })).toThrow();
    });

    test('يمنع تكرار باركود الوحدة لصنف تاني', () => {
      const a = addVariant({ name: 'أ', price: 5, sku: 'A' });
      const b = addVariant({ name: 'ب', price: 5, sku: 'B' });
      groceryService.createUnit({ variant_id: a, unit_name: 'كرتونة', conversion_factor: 6, barcode: 'DUP', selling_price: 30 });
      expect(() => groceryService.createUnit({ variant_id: b, unit_name: 'كرتونة', conversion_factor: 6, barcode: 'DUP', selling_price: 30 })).toThrow('مسجل مسبقاً');
    });
  });

  describe('3. التحويل بين المخازن', () => {
    const stockOf = (warehouseId, variantId) => inventoryRepo.getStockQuantity(warehouseId, variantId);

    test('التحويل بينقص المصدر ويزوّد المستلم بنفس الكمية والإجمالي ثابت', () => {
      const variantId = addVariant({ name: 'صنف', price: 10, sku: 'T1' });
      inventoryRepo.initializeVariantStock(mainWarehouse, variantId, 50);
      inventoryService.transferStock({ sourceWarehouseId: mainWarehouse, destinationWarehouseId: secondWarehouse, items: [{ variantId, quantity: 20 }] });
      expect(stockOf(mainWarehouse, variantId)).toBe(30);
      expect(stockOf(secondWarehouse, variantId)).toBe(20);
    });

    test('تحويل أكبر من المتاح يترفض ومفيش مخزن يتغير', () => {
      const variantId = addVariant({ name: 'صنف', price: 10, sku: 'T2' });
      inventoryRepo.initializeVariantStock(mainWarehouse, variantId, 5);
      expect(() => inventoryService.transferStock({
        sourceWarehouseId: mainWarehouse, destinationWarehouseId: secondWarehouse, items: [{ variantId, quantity: 9 }],
      })).toThrow();
      expect(stockOf(mainWarehouse, variantId)).toBe(5);
      expect(stockOf(secondWarehouse, variantId)).toBe(0);
    });

    test('فشل صنف في النص يلغي التحويل كله (معاملة واحدة)', () => {
      const ok = addVariant({ name: 'كافي', price: 10, sku: 'T3' });
      const short = addVariant({ name: 'ناقص', price: 10, sku: 'T4' });
      inventoryRepo.initializeVariantStock(mainWarehouse, ok, 10);
      inventoryRepo.initializeVariantStock(mainWarehouse, short, 1);
      expect(() => inventoryService.transferStock({
        sourceWarehouseId: mainWarehouse, destinationWarehouseId: secondWarehouse,
        items: [{ variantId: ok, quantity: 5 }, { variantId: short, quantity: 3 }],
      })).toThrow();
      expect(stockOf(mainWarehouse, ok)).toBe(10);
      expect(stockOf(secondWarehouse, ok)).toBe(0);
    });

    test('نفس الصنف مكرر في الطلب بيتجمّع، ومخزن مصدر = مستلم يترفض', () => {
      const variantId = addVariant({ name: 'صنف', price: 10, sku: 'T5' });
      inventoryRepo.initializeVariantStock(mainWarehouse, variantId, 10);
      inventoryService.transferStock({ sourceWarehouseId: mainWarehouse, destinationWarehouseId: secondWarehouse, items: [{ variantId, quantity: 2 }, { variantId, quantity: 3 }] });
      expect(stockOf(secondWarehouse, variantId)).toBe(5);
      expect(() => inventoryService.transferStock({ sourceWarehouseId: mainWarehouse, destinationWarehouseId: mainWarehouse, items: [{ variantId, quantity: 1 }] })).toThrow('مخزنين مختلفين');
    });

    test('كمية صفر أو كسرية أو سالبة تترفض', () => {
      const variantId = addVariant({ name: 'صنف', price: 10, sku: 'T6' });
      inventoryRepo.initializeVariantStock(mainWarehouse, variantId, 10);
      for (const quantity of [0, -1, 1.5]) {
        expect(() => inventoryService.transferStock({ sourceWarehouseId: mainWarehouse, destinationWarehouseId: secondWarehouse, items: [{ variantId, quantity }] })).toThrow();
      }
    });
  });
});

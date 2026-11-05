/**
 * Products can't be changed behind the owner's back: cashiers are read-only,
 * a manager's code unlocks editing for a few minutes, price changes need a
 * reason, and every change lands in an append-only history.
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

const bcrypt = require('bcryptjs');
const authService = require('../../electron/services/auth.service');
const productsService = require('../../electron/services/products.service');
const editUnlock = require('../../electron/services/productEditUnlock.service');
const usersRepo = require('../../electron/repositories/users.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');

const { DEFAULT_ROLES } = require('../../electron/services/enterprise/defaults');
const { getPermissionForChannel } = require('../../electron/security/permissions');

const DENIED = 'غير مصرح لك بتنفيذ هذا الإجراء';

function logRows() {
  return mockDb.prepare('SELECT * FROM product_change_log ORDER BY id').all();
}

describe('Products protection', () => {
  let product;

  beforeAll(() => {
    mockDb.exec(fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf-8'));
    inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });
    usersRepo.create({ username: 'owner', passwordHash: bcrypt.hashSync('owner-pass', 4), role: 'admin', forcePasswordChange: false });
    usersRepo.create({ username: 'cashier1', passwordHash: bcrypt.hashSync('cashier-pass', 4), role: 'cashier', forcePasswordChange: false });
    usersRepo.create({ username: 'branch1', passwordHash: bcrypt.hashSync('branch-pass', 4), role: 'cashier', systemRoleKey: 'manager', forcePasswordChange: false });
    const enterpriseRepo = require('../../electron/repositories/enterprise.repository');
    for (const role of DEFAULT_ROLES) {
      enterpriseRepo.createRole(role.role_key, role.role_name, role.description, role.is_system);
      enterpriseRepo.setRolePermissions(role.role_key, role.permissions);
    }
  });

  beforeEach(() => {
    editUnlock._resetForTesting();
    authService._resetMemoryForTesting?.();
    authService.login('owner', 'owner-pass');
    product = productsService.addProductWithVariant({ name: `شيش طاووق ${Date.now()}`, sellingPrice: 150, stockQuantity: 0 });
    authService.logout();
    authService.login('cashier1', 'cashier-pass');
  });

  afterAll(() => {
    if (mockDb.open) mockDb.close();
  });

  test('a cashier can read the catalog but cannot change a price', () => {
    expect(productsService.getAllProductsWithVariants().length).toBeGreaterThan(0);
    expect(() => productsService.updateVariant(product.variantId, { sellingPrice: 1, reason: 'تخفيض' })).toThrow(DENIED);
    expect(() => productsService.deleteProduct(product.productId)).toThrow(DENIED);
    expect(variantsRepo.getById(product.variantId).selling_price).toBe(150);
  });

  test('a wrong manager code is refused and recorded', () => {
    expect(() => editUnlock.unlock({ username: 'owner', password: 'guess' })).toThrow('اسم المدير أو كلمة السر غير صحيحة');
    expect(logRows().at(-1)).toMatchObject({ action: 'unlock_denied', username: 'cashier1', reason: 'كود غلط' });
    expect(productsService.getEditAccess().canEdit).toBe(false);
  });

  test('three wrong codes lock the unlock form', () => {
    expect(() => editUnlock.unlock({ username: 'owner', password: 'a' })).toThrow();
    expect(() => editUnlock.unlock({ username: 'owner', password: 'b' })).toThrow();
    expect(() => editUnlock.unlock({ username: 'owner', password: 'c' })).toThrow('5 دقائق');
    expect(() => editUnlock.unlock({ username: 'owner', password: 'owner-pass' })).toThrow('محاولات خاطئة كثيرة');
  });

  test('the manager code unlocks editing; price changes need a reason and record both names', () => {
    editUnlock.unlock({ username: 'owner', password: 'owner-pass' });
    expect(productsService.getEditAccess()).toMatchObject({ canEdit: true, canAdjustStock: false });

    expect(() => productsService.updateVariant(product.variantId, { sellingPrice: 155 }))
      .toThrow('اكتب سبب تغيير السعر');

    productsService.updateVariant(product.variantId, { sellingPrice: 155, reason: 'زيادة سعر الفراخ' });
    expect(variantsRepo.getById(product.variantId).selling_price).toBe(155);
    expect(logRows().at(-1)).toMatchObject({
      action: 'price', field: 'selling_price', old_value: '150', new_value: '155',
      reason: 'زيادة سعر الفراخ', username: 'cashier1', approved_by_name: 'owner',
    });
  });

  test('an unlocked cashier still cannot touch stock or cost', () => {
    authService.logout();
    authService.login('owner', 'owner-pass');
    productsService.updateVariant(product.variantId, { sellingPrice: 150, purchasePrice: 90, reason: 'تكلفة المورد' });
    authService.logout();
    authService.login('cashier1', 'cashier-pass');
    editUnlock.unlock({ username: 'owner', password: 'owner-pass' });

    expect(() => productsService.updateVariant(product.variantId, { sellingPrice: 150, stockQuantity: 50 }))
      .toThrow('صلاحية تسوية المخزون');
    expect(() => productsService.addProductWithVariant({ name: 'كفتة', sellingPrice: 165, stockQuantity: 10 }))
      .toThrow('رصيد افتتاحي');

    productsService.updateVariant(product.variantId, { sellingPrice: 150, purchasePrice: 1 });
    expect(variantsRepo.getById(product.variantId).purchase_price).toBe(90);
  });

  test('the unlock is lent only to this device, never to LAN requests', () => {
    editUnlock.unlock({ username: 'owner', password: 'owner-pass' });
    const session = authService.getCurrentSession();
    expect(editUnlock.isGranted(session, 'products.edit')).toBe(true);
    expect(editUnlock.isGranted({ ...session, centralRequest: true }, 'products.edit')).toBe(false);
    expect(editUnlock.isGranted(session, 'inventory.adjust')).toBe(false);
  });

  test('the history cannot be edited or deleted', () => {
    expect(logRows().length).toBeGreaterThan(0);
    expect(() => mockDb.prepare("UPDATE product_change_log SET reason = 'x'").run()).toThrow('append-only');
    expect(() => mockDb.prepare('DELETE FROM product_change_log').run()).toThrow('append-only');
  });

  test('the database refuses text or negative prices', () => {
    expect(() => mockDb.prepare("UPDATE product_variants SET selling_price = 'free' WHERE id = ?").run(product.variantId))
      .toThrow('Invalid product price');
    expect(() => mockDb.prepare('UPDATE product_variants SET selling_price = -5 WHERE id = ?').run(product.variantId))
      .toThrow('Invalid product price');
  });

  test('an image path outside the app images folder is refused', () => {
    authService.logout();
    authService.login('owner', 'owner-pass');
    expect(() => productsService.updateProduct(product.productId, { name: 'x', imagePath: 'C:\\Windows\\win.ini' }))
      .toThrow('مسار الصورة غير صالح');
  });

  test('a branch manager edits products directly, with a reason for prices', () => {
    authService.logout();
    authService.login('branch1', 'branch-pass');
    expect(productsService.getEditAccess()).toMatchObject({ canEdit: true, canCreate: true, canDelete: true, canAdjustStock: false });
    productsService.updateVariant(product.variantId, { sellingPrice: 160, reason: 'قائمة أسعار جديدة' });
    expect(logRows().at(-1)).toMatchObject({ action: 'price', username: 'branch1', approved_by_name: null });
  });

  test("a branch manager's password unlocks a cashier", () => {
    editUnlock.unlock({ username: 'branch1', password: 'branch-pass' });
    productsService.updateVariant(product.variantId, { sellingPrice: 151, reason: 'تقريب السعر' });
    expect(logRows().at(-1)).toMatchObject({ username: 'cashier1', approved_by_name: 'branch1' });
  });

  test('a cashier account cannot unlock another cashier', () => {
    usersRepo.create({ username: `cashier-${Date.now()}`, passwordHash: bcrypt.hashSync('other-pass', 4), role: 'cashier', forcePasswordChange: false });
    const other = mockDb.prepare("SELECT username FROM users WHERE username LIKE 'cashier-%' ORDER BY id DESC").get();
    expect(() => editUnlock.unlock({ username: other.username, password: 'other-pass' })).toThrow('مش مدير ولا مدير فرع');
  });

  test('the unlock stays open (no timer) and ends at logout', () => {
    editUnlock.unlock({ username: 'owner', password: 'owner-pass' });
    const session = authService.getCurrentSession();
    const realNow = Date.now;
    Date.now = () => realNow() + 8 * 60 * 60 * 1000;
    try {
      expect(editUnlock.isGranted(session, 'products.edit')).toBe(true);
    } finally {
      Date.now = realNow;
    }
    authService.logout();
    expect(editUnlock.isGranted(session, 'products.edit')).toBe(false);
  });

  test('a cashier without a job role follows the cashier role and can run their own shift', () => {
    const permissions = authService.getCurrentSession().permissions;
    expect(permissions).toEqual(expect.arrayContaining(['pos.sell', 'shifts.manage', 'products.view']));
    expect(permissions).not.toEqual(expect.arrayContaining(['pos.refund']));
    expect(permissions).not.toContain('products.edit');
    expect(permissions).not.toContain('pos.discount');
  });

  test('salon prices and coupons follow product and promotion rights, not the sale right', () => {
    expect(getPermissionForChannel('salon:createService')).toBe('products.edit');
    expect(getPermissionForChannel('salon:updatePackage')).toBe('products.edit');
    expect(getPermissionForChannel('salon:deleteService')).toBe('products.delete');
    expect(getPermissionForChannel('salon:createCoupon')).toBe('promotions.manage');
    expect(getPermissionForChannel('salon:applyCoupon')).toBe('pos.sell');
    expect(getPermissionForChannel('sales:previewBundlePromotion')).toBe('pos.view');
  });
});

const path = require('node:path');
const productsRepo = require('../repositories/products.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const changeLog = require('../repositories/productChangeLog.repository');
const productsCache = require('./products.cache');
const editUnlock = require('./productEditUnlock.service');
const { getCurrentSession, hasGrantedPermission } = require('./auth.service');
const { findOrCreateByName } = require('./categories.service');
const { db } = require('../database/db');
const inventoryRepo = require('../repositories/inventory.repository');
const {
  addProductVariantSchema,
  addProductWithVariantSchema,
  updateProductSchema,
  updateVariantSchema,
} = require('../validators/schema');

const DENIED = 'غير مصرح لك بتنفيذ هذا الإجراء';
const MIN_REASON_LENGTH = 3;

function getEnterpriseService() {
  return require('./enterprise.service');
}

function getCurrentWarehouseId() {
  const session = getCurrentSession();
  return session?.centralRequest && session.warehouseId
    ? session.warehouseId
    : inventoryRepo.getDefaultWarehouseId();
}

/**
 * Every product write passes here first. The IPC/LAN layer already checked the
 * channel permission; this repeats the check inside the service so no other
 * caller can skip it. A manager unlock (local device only) also counts.
 */
function requireProductAccess(permission) {
  const session = getCurrentSession();
  if (!session) throw new Error(DENIED);
  if (hasGrantedPermission(permission)) return { session, grant: null };
  const grant = editUnlock.getGrant(session, permission);
  if (grant) return { session, grant };
  throw new Error(DENIED);
}

function actor({ session, grant }) {
  return {
    userId: session.id ?? null,
    username: session.username || 'النظام',
    approvedById: grant?.managerId ?? null,
    approvedByName: grant?.managerName ?? null,
  };
}

function canSeeCost(session) {
  return Boolean(session) && (session.role === 'admin' || hasGrantedPermission('purchases.manage'));
}

function generateSku(productId, variantId, size) {
  const sizePart = size ? `-${size.trim().toUpperCase().replace(/\s+/g, '')}` : '';
  return `P${productId}-V${variantId}${sizePart}`;
}

function generateBarcode(productId, variantId) {
  return `P${productId}-V${variantId}`;
}

// Kept for its messages; the schema below then enforces types and caps.
function validateVariant(variant) {
  if (variant.purchasePrice === undefined || variant.purchasePrice === null || isNaN(variant.purchasePrice)) {
    variant.purchasePrice = 0;
  }
  if (!Number.isFinite(Number(variant.purchasePrice)) || variant.purchasePrice < 0) {
    variant.purchasePrice = 0;
  }
  if (variant.price !== undefined && (!variant.sellingPrice || variant.sellingPrice <= 0)) {
    variant.sellingPrice = parseFloat(variant.price);
  }
  if (!variant.sellingPrice || !(Number(variant.sellingPrice) > 0)) {
    throw new Error('سعر المنتج غير صحيح');
  }
  if (variant.stockQuantity == null || !(Number(variant.stockQuantity) >= 0)) {
    throw new Error('الكمية غير صحيحة');
  }
}

function requireName(data) {
  if (!data || typeof data.name !== 'string' || !data.name.trim()) {
    throw new Error('اسم المنتج مطلوب');
  }
}

function cleanReason(reason) {
  return typeof reason === 'string' ? reason.trim().slice(0, 200) : '';
}

function getImagesDir() {
  try {
    const { app } = require('electron');
    if (app?.getPath) return path.join(app.getPath('userData'), 'images');
  } catch {
    // Not running inside Electron (tests).
  }
  return null;
}

/**
 * Images are copied into userData/images by products:selectImage. Any other
 * path (e.g. a system file sent by a crafted request) is refused.
 */
function safeImagePath(imagePath, currentPath = null) {
  if (!imagePath) return null;
  if (currentPath && imagePath === currentPath) return currentPath;
  const dir = getImagesDir();
  const resolved = path.resolve(String(imagePath));
  const relative = dir ? path.relative(dir, resolved) : '';
  if (!dir || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('مسار الصورة غير صالح. اختر الصورة من زر اختيار الصورة');
  }
  return resolved;
}

/** Opening stock is a stock change, so it needs the stock-adjust permission. */
function requireOpeningStockRight(quantity) {
  if (Number(quantity) > 0 && !hasGrantedPermission('inventory.adjust')) {
    throw new Error('إضافة رصيد افتتاحي تحتاج صلاحية تسوية المخزون. أضف الكمية من شاشة المخزون');
  }
}

function addProductWithVariant(data) {
  const access = requireProductAccess('products.create');
  requireName(data);
  validateVariant(data);
  const input = addProductWithVariantSchema.validate(data);
  requireOpeningStockRight(input.stockQuantity);
  const imagePath = safeImagePath(input.imagePath);
  const purchasePrice = canSeeCost(access.session) ? Number(input.purchasePrice || 0) : 0;

  const categoryId = findOrCreateByName(input.categoryName);

  const result = db.transaction(() => {
    const productId = productsRepo.create({
      name: input.name,
      description: input.description,
      categoryId,
      imagePath,
    });

    const variantId = variantsRepo.create({
      productId,
      size: input.size,
      color: input.color,
      purchasePrice,
      sellingPrice: input.sellingPrice,
      stockQuantity: input.stockQuantity,
    });
    inventoryRepo.initializeVariantStock(
      getCurrentWarehouseId(),
      variantId,
      Number(input.stockQuantity || 0),
      access.session.id || null
    );

    const sku = generateSku(productId, variantId, input.size);
    variantsRepo.updateSku(variantId, sku);
    if (input.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, input.attributeValues);
    }

    changeLog.record({
      ...actor(access),
      productId,
      variantId,
      action: 'create',
      field: 'selling_price',
      newValue: input.sellingPrice,
    });

    return { productId, variantId, sku };
  })();

  productsCache.invalidate();
  return result;
}

function addVariantToProduct(productId, variantData) {
  const access = requireProductAccess('products.create');
  validateVariant(variantData);
  const input = addProductVariantSchema.validate({ productId, variant: variantData });
  const variant = input.variant;
  requireOpeningStockRight(variant.stockQuantity);
  const purchasePrice = canSeeCost(access.session) ? Number(variant.purchasePrice || 0) : 0;

  const product = productsRepo.getById(input.productId);
  if (!product || product.is_active === 0) {
    throw new Error('المنتج غير موجود');
  }

  const result = db.transaction(() => {
    const variantId = variantsRepo.create({
      productId: product.id,
      size: variant.size,
      color: variant.color,
      purchasePrice,
      sellingPrice: variant.sellingPrice,
      stockQuantity: variant.stockQuantity,
    });
    inventoryRepo.initializeVariantStock(
      getCurrentWarehouseId(),
      variantId,
      Number(variant.stockQuantity || 0),
      access.session.id || null
    );

    const sku = generateSku(product.id, variantId, variant.size);
    variantsRepo.updateSku(variantId, sku);
    if (variant.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, variant.attributeValues);
    }

    changeLog.record({
      ...actor(access),
      productId: product.id,
      variantId,
      action: 'variant_add',
      field: 'option',
      newValue: [variant.size, variant.color].filter(Boolean).join(' / ') || `${variant.sellingPrice}`,
    });

    return { variantId, sku };
  })();

  productsCache.invalidate();
  return result;
}

function updateProduct(productId, data) {
  const access = requireProductAccess('products.edit');
  requireName(data);
  const input = updateProductSchema.validate({ productId, data });

  const product = productsRepo.getById(input.productId);
  if (!product || product.is_active === 0) {
    throw new Error('المنتج غير موجود');
  }

  const next = input.data;
  const imagePath = safeImagePath(
    next.imagePath === undefined ? product.image_path : next.imagePath,
    product.image_path
  );
  const description = next.description === undefined ? product.description : next.description;
  const categoryId = findOrCreateByName(next.categoryName);
  const reason = cleanReason(next.reason);

  db.transaction(() => {
    productsRepo.update(product.id, {
      name: next.name,
      description,
      categoryId,
      imagePath,
    });

    const oldCategory = product.category_id
      ? db.prepare('SELECT name FROM categories WHERE id = ?').get(product.category_id)?.name
      : null;
    const newCategory = categoryId
      ? db.prepare('SELECT name FROM categories WHERE id = ?').get(categoryId)?.name
      : null;
    const changes = [
      ['name', product.name, next.name],
      ['category', oldCategory, newCategory],
      ['description', product.description, description],
      ['image', product.image_path ? 'صورة' : null, imagePath ? 'صورة' : null],
    ].filter(([field, before, after]) => (
      (before || null) !== (after || null) || (field === 'image' && product.image_path !== imagePath)
    ));
    for (const [field, before, after] of changes) {
      changeLog.record({
        ...actor(access),
        productId: product.id,
        action: 'update',
        field,
        oldValue: before,
        newValue: after,
        reason,
      });
    }
  })();

  productsCache.invalidate();
  return { success: true };
}

function deleteProduct(productId) {
  const access = requireProductAccess('products.delete');

  const product = productsRepo.getById(Number(productId));
  if (!product) {
    throw new Error('المنتج غير موجود');
  }
  if (product.is_active === 0) return { success: true };

  db.transaction(() => {
    productsRepo.archive(product.id);
    changeLog.record({
      ...actor(access),
      productId: product.id,
      action: 'archive',
      oldValue: product.name,
    });
  })();
  productsCache.invalidate();
  return { success: true };
}

function updateVariant(variantId, data) {
  const access = requireProductAccess('products.edit');
  if (data && data.stockQuantity == null) {
    const existing = variantsRepo.getById(Number(variantId));
    if (existing) data = { ...data, stockQuantity: existing.stock_quantity };
  }
  validateVariant(data);
  const input = updateVariantSchema.validate({ variantId, data });
  const next = input.data;

  const variant = variantsRepo.getById(input.variantId);
  if (!variant) {
    throw new Error('المتغير غير موجود');
  }

  // Cost is hidden from users who can't see it, so they can't overwrite it either.
  const purchasePrice = canSeeCost(access.session) && next.purchasePrice != null
    ? Number(next.purchasePrice)
    : Number(variant.purchase_price || 0);
  const sellingPrice = Number(next.sellingPrice);
  const reason = cleanReason(next.reason);
  const priceChanged = sellingPrice !== Number(variant.selling_price);
  const costChanged = purchasePrice !== Number(variant.purchase_price || 0);
  if ((priceChanged || costChanged) && reason.length < MIN_REASON_LENGTH) {
    throw new Error('اكتب سبب تغيير السعر (3 حروف على الأقل)');
  }

  const barcode = next.barcode?.trim() || variant.barcode || generateBarcode(variant.product_id, variant.id);

  db.transaction(() => {
    variantsRepo.update(variant.id, {
      size: next.size,
      color: next.color,
      purchasePrice,
      sellingPrice,
      stockQuantity: variant.stock_quantity,
      lowStockThreshold: next.lowStockThreshold ?? variant.low_stock_threshold,
      barcode,
    });
    const warehouseId = getCurrentWarehouseId();
    const currentStock = access.session.centralRequest
      ? inventoryRepo.getStockQuantity(warehouseId, variant.id)
      : Number(variant.stock_quantity);
    const stockDelta = Number(next.stockQuantity) - currentStock;
    if (stockDelta !== 0) {
      if (!hasGrantedPermission('inventory.adjust')) {
        throw new Error('تعديل الرصيد يحتاج صلاحية تسوية المخزون. استخدم شاشة الفروع والمخازن');
      }
      inventoryRepo.applyStockChange({
        warehouseId,
        variantId: variant.id,
        delta: stockDelta,
        movementType: 'adjustment',
        userId: access.session.id || null,
        notes: 'تعديل الرصيد من بيانات الصنف',
      });
    }

    if ((next.size || null) !== (variant.size || null)) {
      const sku = generateSku(variant.product_id, variant.id, next.size);
      variantsRepo.updateSku(variant.id, sku);
    }
    if (next.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variant.id, next.attributeValues);
    }

    const base = { ...actor(access), productId: variant.product_id, variantId: variant.id, reason };
    if (priceChanged) {
      changeLog.record({ ...base, action: 'price', field: 'selling_price', oldValue: variant.selling_price, newValue: sellingPrice });
    }
    if (costChanged) {
      changeLog.record({ ...base, action: 'price', field: 'purchase_price', oldValue: variant.purchase_price, newValue: purchasePrice });
    }
    const optionChanges = [
      ['size', variant.size, next.size],
      ['color', variant.color, next.color],
      ['barcode', variant.barcode, barcode],
    ].filter(([, before, after]) => (before || null) !== (after || null));
    for (const [field, before, after] of optionChanges) {
      changeLog.record({ ...base, action: 'variant_update', field, oldValue: before, newValue: after });
    }
  })();

  productsCache.invalidate();
  return { success: true };
}

function deleteVariant(variantId) {
  const access = requireProductAccess('products.delete');

  const variant = variantsRepo.getById(Number(variantId));
  if (!variant) {
    throw new Error('المتغير غير موجود');
  }

  const siblings = variantsRepo.getByProductId(variant.product_id);
  if (siblings.length <= 1) {
    throw new Error('لا يمكن حذف آخر متغير — احذف المنتج بالكامل بدلاً من ذلك');
  }
  if (
    variant.stock_quantity > 0
    || inventoryRepo.hasInventoryHistory(variant.id)
    || variantsRepo.hasTransactionHistory(variant.id)
  ) {
    throw new Error('لا يمكن حذف صنف له رصيد أو حركات مخزون أو معاملات مالية؛ احتفظ به للحفاظ على السجل');
  }

  db.transaction(() => {
    variantsRepo.remove(variant.id);
    changeLog.record({
      ...actor(access),
      productId: variant.product_id,
      variantId: variant.id,
      action: 'variant_delete',
      oldValue: [variant.size, variant.color].filter(Boolean).join(' / ') || variant.sku,
    });
  })();
  productsCache.invalidate();
  return { success: true };
}

const ACTION_LABELS = {
  create: 'إضافة منتج',
  update: 'تعديل بيانات',
  price: 'تعديل سعر',
  archive: 'أرشفة منتج',
  variant_add: 'إضافة خيار',
  variant_update: 'تعديل خيار',
  variant_delete: 'حذف خيار',
  unlock: 'فتح التعديل بكود المدير',
  unlock_denied: 'محاولة فتح تعديل مرفوضة',
  denied: 'محاولة تعديل مرفوضة',
};

/** Recent product history. Cost values are hidden from users who can't see cost. */
function getChangeLog({ productId = null, limit = 30 } = {}) {
  const session = getCurrentSession();
  if (!session) throw new Error(DENIED);
  const showCost = canSeeCost(session);
  return changeLog.list({ productId: productId ? Number(productId) : null, limit }).map((row) => {
    const hidden = row.field === 'purchase_price' && !showCost;
    return {
      id: row.id,
      productId: row.product_id,
      productName: row.product_name,
      variantId: row.variant_id,
      action: row.action,
      actionLabel: ACTION_LABELS[row.action] || row.action,
      field: row.field,
      oldValue: hidden ? null : row.old_value,
      newValue: hidden ? null : row.new_value,
      reason: row.reason,
      username: row.username,
      approvedByName: row.approved_by_name,
      createdAt: row.created_at,
    };
  });
}

/** What the current user may do on the products screen (the UI only mirrors this). */
function getEditAccess() {
  const session = getCurrentSession();
  if (!session) throw new Error(DENIED);
  const can = (permission) => hasGrantedPermission(permission) || editUnlock.isGranted(session, permission);
  return {
    canCreate: can('products.create'),
    canEdit: can('products.edit'),
    canDelete: can('products.delete'),
    canAdjustStock: hasGrantedPermission('inventory.adjust'),
    canSeeCost: canSeeCost(session),
    ownEdit: hasGrantedPermission('products.edit'),
    unlock: editUnlock.describe(session),
  };
}

function getAllProductsWithVariants() {
  let catalog = productsCache.getCatalog();
  if (!catalog) {
    const products = productsRepo.getAllActiveWithCategory();
    const allVariants = variantsRepo.getAll();

    const variantsByProduct = new Map();
    for (const v of allVariants) {
      if (!variantsByProduct.has(v.product_id)) {
        variantsByProduct.set(v.product_id, []);
      }
      variantsByProduct.get(v.product_id).push(v);
    }

    const attributeValues = new Map();
    for (const value of getEnterpriseService().getAllVariantAttributeValues()) {
      if (!attributeValues.has(value.variant_id)) attributeValues.set(value.variant_id, []);
      attributeValues.get(value.variant_id).push(value);
    }

    const lastChanged = new Map();
    try {
      for (const row of changeLog.lastChangeByProduct()) lastChanged.set(row.product_id, row.last_changed_at);
    } catch {
      // History table missing on a very old database: fall back to created_at.
    }

    catalog = products.map((product) => ({
      ...product,
      categoryName: product.category_name,
      lastChangedAt: lastChanged.get(product.id) || product.created_at,
      variants: (variantsByProduct.get(product.id) || []).map((variant) => ({
        ...variant,
        attributes: attributeValues.get(variant.id) || [],
      })),
    }));

    productsCache.setCatalog(catalog);
  }

  // إذا كان المستخدم الحالي ليس مديراً (كاشير)، نحجب سعر الشراء والتكلفة
  let session = null;
  try {
    session = getCurrentSession();
  } catch {}

  if (session && session.role !== 'admin') {
    return catalog.map((p) => ({
      ...p,
      variants: (p.variants || []).map((v) => ({
        ...v,
        purchase_price: 0,
        purchasePrice: 0,
      })),
    }));
  }

  return catalog;
}

function normalizeBarcodeDigits(code) {
  if (!code) return '';
  return String(code)
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776));
}

function convertArabicLayoutToEnglish(text) {
  if (!text) return '';
  const map = {
    'ض': 'q', 'ص': 'w', 'ث': 'e', 'ق': 'r', 'ف': 't', 'غ': 'y', 'ع': 'u', 'ه': 'i', 'خ': 'o', 'ح': 'p',
    'ش': 'a', 'س': 's', 'ي': 'd', 'ب': 'f', 'ل': 'g', 'ا': 'h', 'ت': 'j', 'ن': 'k', 'م': 'l',
    'ئ': 'z', 'ء': 'x', 'ؤ': 'c', 'ر': 'v', 'ى': 'n', 'ة': 'm'
  };
  return text.split('').map((ch) => map[ch] || ch).join('');
}

function getProductByBarcode(barcode) {
  if (!barcode) return null;
  const cleanCode = normalizeBarcodeDigits(barcode);

  let session = null;
  try {
    session = getCurrentSession();
  } catch {}
  const isAdmin = !session || session.role === 'admin';

  // Fast memory index lookup & Cache Penetration Guard
  const cached = productsCache.getByBarcode(cleanCode);
  if (cached) {
    if (cached.isNull) return null;
    const res = { ...cached, productName: cached.product_name || '' };
    if (!isAdmin) {
      delete res.purchase_price;
      delete res.purchasePrice;
      res.purchase_price = 0;
      res.purchasePrice = 0;
    }
    return res;
  }

  let variant = variantsRepo.getByBarcode(cleanCode);

  if (!variant && /[\u0600-\u06FF]/.test(cleanCode)) {
    const converted = convertArabicLayoutToEnglish(cleanCode);
    if (converted !== cleanCode) {
      variant = variantsRepo.getByBarcode(converted);
    }
  }

  if (!variant) {
    // Record negative cache to prevent Cache Penetration
    productsCache.recordNegativeBarcode(cleanCode);
    return null;
  }

  const product = productsRepo.getById(variant.product_id);
  const result = { ...variant, productName: product?.name || '' };
  if (!isAdmin) {
    delete result.purchase_price;
    delete result.purchasePrice;
    result.purchase_price = 0;
    result.purchasePrice = 0;
  }
  return result;
}

module.exports = {
  addProductWithVariant,
  addVariantToProduct,
  updateProduct,
  deleteProduct,
  updateVariant,
  deleteVariant,
  getAllProductsWithVariants,
  getProductByBarcode,
  getChangeLog,
  getEditAccess,
};
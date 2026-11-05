const productsRepo = require('../repositories/products.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const productsCache = require('./products.cache');
const { requireAdmin, getCurrentSession } = require('./auth.service');
const { findOrCreateByName } = require('./categories.service');
const { db } = require('../database/db');
const inventoryRepo = require('../repositories/inventory.repository');

function getEnterpriseService() {
  return require('./enterprise.service');
}

function getCurrentWarehouseId() {
  const session = getCurrentSession();
  return session?.centralRequest && session.warehouseId
    ? session.warehouseId
    : inventoryRepo.getDefaultWarehouseId();
}

function generateSku(productId, variantId, size) {
  const sizePart = size ? `-${size.trim().toUpperCase().replace(/\s+/g, '')}` : '';
  return `P${productId}-V${variantId}${sizePart}`;
}

function generateBarcode(productId, variantId) {
  return `P${productId}-V${variantId}`;
}

function validateVariant(variant) {
  if (variant.purchasePrice === undefined || variant.purchasePrice === null || isNaN(variant.purchasePrice)) {
    variant.purchasePrice = 0;
  }
  if (!Number.isFinite(variant.purchasePrice) || variant.purchasePrice < 0) {
    variant.purchasePrice = 0;
  }
  if (variant.price !== undefined && (!variant.sellingPrice || variant.sellingPrice <= 0)) {
    variant.sellingPrice = parseFloat(variant.price);
  }
  if (!variant.sellingPrice || variant.sellingPrice < 0) {
    throw new Error('سعر المنتج غير صحيح');
  }
  if (variant.stockQuantity == null || variant.stockQuantity < 0) {
    throw new Error('الكمية غير صحيحة');
  }
}

function addProductWithVariant(data) {
  requireAdmin();

  if (!data.name || !data.name.trim()) {
    throw new Error('اسم المنتج مطلوب');
  }

  validateVariant(data);

  const categoryId = findOrCreateByName(data.categoryName);

  const result = db.transaction(() => {
    const productId = productsRepo.create({
      name: data.name.trim(),
      description: data.description,
      categoryId,
      imagePath: data.imagePath,
    });

    const variantId = variantsRepo.create({
      productId,
      size: data.size,
      color: data.color,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      stockQuantity: data.stockQuantity,
    });
    inventoryRepo.initializeVariantStock(
      getCurrentWarehouseId(),
      variantId,
      Number(data.stockQuantity || 0),
      getCurrentSession()?.id || null
    );

    const sku = generateSku(productId, variantId, data.size);
    variantsRepo.updateSku(variantId, sku);
    if (data.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, data.attributeValues);
    }

    return { productId, variantId, sku };
  })();

  productsCache.invalidate();
  return result;
}

function addVariantToProduct(productId, variantData) {
  requireAdmin();
  validateVariant(variantData);

  const product = productsRepo.getById(productId);
  if (!product) {
    throw new Error('المنتج غير موجود');
  }

  const result = db.transaction(() => {
    const variantId = variantsRepo.create({
      productId,
      size: variantData.size,
      color: variantData.color,
      purchasePrice: variantData.purchasePrice,
      sellingPrice: variantData.sellingPrice,
      stockQuantity: variantData.stockQuantity,
    });
    inventoryRepo.initializeVariantStock(
      getCurrentWarehouseId(),
      variantId,
      Number(variantData.stockQuantity || 0),
      getCurrentSession()?.id || null
    );

    const sku = generateSku(productId, variantId, variantData.size);
    variantsRepo.updateSku(variantId, sku);
    if (variantData.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, variantData.attributeValues);
    }

    return { variantId, sku };
  })();

  productsCache.invalidate();
  return result;
}

function updateProduct(productId, data) {
  requireAdmin();

  if (!data.name || !data.name.trim()) {
    throw new Error('اسم المنتج مطلوب');
  }

  const product = productsRepo.getById(productId);
  if (!product) {
    throw new Error('المنتج غير موجود');
  }

  const categoryId = findOrCreateByName(data.categoryName);

  productsRepo.update(productId, {
    name: data.name.trim(),
    description: data.description,
    categoryId,
    imagePath: data.imagePath,
  });

  productsCache.invalidate();
  return { success: true };
}

function deleteProduct(productId) {
  requireAdmin();

  const product = productsRepo.getById(productId);
  if (!product) {
    throw new Error('المنتج غير موجود');
  }
  productsRepo.archive(productId);
  productsCache.invalidate();
  return { success: true };
}

function updateVariant(variantId, data) {
  requireAdmin();
  validateVariant(data);

  const variant = variantsRepo.getById(variantId);
  if (!variant) {
    throw new Error('المتغير غير موجود');
  }

  const barcode = data.barcode?.trim() || variant.barcode || generateBarcode(variant.product_id, variantId);

  db.transaction(() => {
    variantsRepo.update(variantId, {
      size: data.size,
      color: data.color,
      purchasePrice: data.purchasePrice,
      sellingPrice: data.sellingPrice,
      stockQuantity: variant.stock_quantity,
      lowStockThreshold: data.lowStockThreshold,
      barcode,
    });
    const warehouseId = getCurrentWarehouseId();
    const currentStock = getCurrentSession()?.centralRequest
      ? inventoryRepo.getStockQuantity(warehouseId, variantId)
      : Number(variant.stock_quantity);
    const stockDelta = Number(data.stockQuantity) - currentStock;
    if (stockDelta !== 0) {
      inventoryRepo.applyStockChange({
        warehouseId,
        variantId,
        delta: stockDelta,
        movementType: 'adjustment',
        userId: getCurrentSession()?.id || null,
        notes: 'تعديل الرصيد من بيانات الصنف',
      });
    }

    if (data.size !== variant.size) {
      const sku = generateSku(variant.product_id, variantId, data.size);
      variantsRepo.updateSku(variantId, sku);
    }
    if (data.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, data.attributeValues);
    }
  })();

  productsCache.invalidate();
  return { success: true };
}

function deleteVariant(variantId) {
  requireAdmin();

  const variant = variantsRepo.getById(variantId);
  if (!variant) {
    throw new Error('المتغير غير موجود');
  }

  const siblings = variantsRepo.getByProductId(variant.product_id);
  if (siblings.length <= 1) {
    throw new Error('لا يمكن حذف آخر متغير — احذف المنتج بالكامل بدلاً من ذلك');
  }
  if (
    variant.stock_quantity > 0
    || inventoryRepo.hasInventoryHistory(variantId)
    || variantsRepo.hasTransactionHistory(variantId)
  ) {
    throw new Error('لا يمكن حذف صنف له رصيد أو حركات مخزون أو معاملات مالية؛ احتفظ به للحفاظ على السجل');
  }

  variantsRepo.remove(variantId);
  productsCache.invalidate();
  return { success: true };
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

    catalog = products.map((product) => ({
      ...product,
      categoryName: product.category_name,
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
};
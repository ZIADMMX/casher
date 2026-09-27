const productsRepo = require('../repositories/products.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const { requireAdmin } = require('./auth.service');
const { findOrCreateByName } = require('./categories.service');
const { db } = require('../database/db');

function getEnterpriseService() {
  return require('./enterprise.service');
}

let getAllWithVariantsStmt = null;

function getStmt() {
  if (!getAllWithVariantsStmt) {
    getAllWithVariantsStmt = db.prepare(`
      SELECT
        p.id, p.name, p.description, p.category_id, p.image_path, p.created_at,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ORDER BY p.created_at DESC
    `);
  }
  return getAllWithVariantsStmt;
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

  return db.transaction(() => {
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

    const sku = generateSku(productId, variantId, data.size);
    variantsRepo.updateSku(variantId, sku);
    if (data.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, data.attributeValues);
    }

    return { productId, variantId, sku };
  })();
}

function addVariantToProduct(productId, variantData) {
  requireAdmin();
  validateVariant(variantData);

  const product = productsRepo.getById(productId);
  if (!product) {
    throw new Error('المنتج غير موجود');
  }

  return db.transaction(() => {
    const variantId = variantsRepo.create({
      productId,
      size: variantData.size,
      color: variantData.color,
      purchasePrice: variantData.purchasePrice,
      sellingPrice: variantData.sellingPrice,
      stockQuantity: variantData.stockQuantity,
    });

    const sku = generateSku(productId, variantId, variantData.size);
    variantsRepo.updateSku(variantId, sku);
    if (variantData.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, variantData.attributeValues);
    }

    return { variantId, sku };
  })();
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

  return { success: true };
}

function deleteProduct(productId) {
  requireAdmin();

  const product = productsRepo.getById(productId);
  if (!product) {
    throw new Error('المنتج غير موجود');
  }

  productsRepo.remove(productId);
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
      stockQuantity: data.stockQuantity,
      lowStockThreshold: data.lowStockThreshold,
      barcode,
    });

    if (data.size !== variant.size) {
      const sku = generateSku(variant.product_id, variantId, data.size);
      variantsRepo.updateSku(variantId, sku);
    }
    if (data.attributeValues) {
      getEnterpriseService().saveVariantAttributeValues(variantId, data.attributeValues);
    }
  })();

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

  variantsRepo.remove(variantId);
  return { success: true };
}

function getAllProductsWithVariants() {
  const products = getStmt().all();
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

  return products.map((product) => ({
    ...product,
    categoryName: product.category_name,
    variants: (variantsByProduct.get(product.id) || []).map((variant) => ({
      ...variant,
      attributes: attributeValues.get(variant.id) || [],
    })),
  }));
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
  let variant = variantsRepo.getByBarcode(cleanCode);

  if (!variant && /[\u0600-\u06FF]/.test(cleanCode)) {
    const converted = convertArabicLayoutToEnglish(cleanCode);
    if (converted !== cleanCode) {
      variant = variantsRepo.getByBarcode(converted);
    }
  }

  if (!variant) return null;

  const product = productsRepo.getById(variant.product_id);
  return { ...variant, productName: product?.name || '' };
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
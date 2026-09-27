const { dialog, app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const productsService = require('../services/products.service');
const { getAllCategories } = require('../services/categories.service');
const { safeHandle } = require('./safeHandle');
const {
  addProductVariantSchema,
  addProductWithVariantSchema,
  updateProductSchema,
  updateVariantSchema,
  positiveIdSchema,
} = require('../validators/schema');

// مجلد حفظ الصور داخل userData (آمن ولا يتأثر بحذف الملفات الأصلية)
const imagesDir = path.join(app.getPath('userData'), 'images');
if (!fs.existsSync(imagesDir)) {
  fs.mkdirSync(imagesDir, { recursive: true });
}

/**
 * نسخ صورة من مسارها الأصلي إلى userData/images/
 * بيرجع المسار الجديد الآمن
 */
function copyImageToSafe(originalPath) {
  const ext = path.extname(originalPath);
  const uniqueName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
  const destPath = path.join(imagesDir, uniqueName);
  fs.copyFileSync(originalPath, destPath);
  return destPath;
}

function registerProductHandlers() {
  safeHandle('products:addWithVariant', addProductWithVariantSchema, (event, data) => {
    return productsService.addProductWithVariant(data);
  });

  safeHandle('products:addVariant', addProductVariantSchema, (event, { productId, variant }) => {
    return productsService.addVariantToProduct(productId, variant);
  });

  safeHandle('products:getAllWithVariants', () => {
    return productsService.getAllProductsWithVariants();
  });

  safeHandle('products:getByBarcode', (event, barcode) => {
    if (typeof barcode !== 'string' || barcode.trim().length === 0 || barcode.length > 100) {
      throw new Error('الباركود غير صالح');
    }
    return productsService.getProductByBarcode(barcode);
  });

  safeHandle('products:update', updateProductSchema, (event, { productId, data }) => {
    return productsService.updateProduct(productId, data);
  });

  safeHandle('products:delete', positiveIdSchema, (event, productId) => {
    return productsService.deleteProduct(productId);
  });

  safeHandle('variants:update', updateVariantSchema, (event, { variantId, data }) => {
    return productsService.updateVariant(variantId, data);
  });

  safeHandle('variants:delete', positiveIdSchema, (event, variantId) => {
    return productsService.deleteVariant(variantId);
  });

  safeHandle('categories:getAll', () => {
    return getAllCategories();
  });

  safeHandle('products:selectImage', async () => {
    const result = await dialog.showOpenDialog({
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'webp'] }],
    });
    if (result.canceled) return null;

    // نسخ الصورة لمسار آمن داخل userData
    const safePath = copyImageToSafe(result.filePaths[0]);
    return safePath;
  });
}

module.exports = { registerProductHandlers };
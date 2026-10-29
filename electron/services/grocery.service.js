const groceryRepo = require('../repositories/grocery.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const productsRepo = require('../repositories/products.repository');

/**
 * Supermarket & Grocery Core Service
 * محرك السوبر ماركت والبقالة المتقدم:
 * 1. موازين الباركود الإلكترونية (EAN-13 Scale Barcode Parser)
 * 2. تعدد وحدات القياس للسلعة (Multi-UOM)
 * 3. تشغيلات وتواريخ انتهاء الصلاحية وتنبيهات الهالك (Batches & Expiry Dates)
 * 4. الضرب السريع بالأعداد العشرية (5*باركود أو 0.350*باركود)
 * 5. أزرار السلع السريعة بدون باركود (Speed PLU Keys)
 */

// ==========================================
// 1. محلل الضرب السريع (Quick Multiplier Parser)
// ==========================================

/**
 * يحلل المدخلات السريعة مثل "5*622100012345" أو "0.5*200145200350"
 * @param {string} input 
 * @returns {{ multiplier: number, rawCode: string }}
 */
function parseQuickMultiplier(input) {
  if (!input || typeof input !== 'string') {
    return { multiplier: 1, rawCode: '' };
  }

  const trimmed = input.trim();
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*[*xX]\s*(.+)$/);

  if (match) {
    const mult = parseFloat(match[1]);
    const code = match[2].trim();
    return {
      multiplier: isNaN(mult) || mult <= 0 ? 1 : mult,
      rawCode: code,
    };
  }

  return {
    multiplier: 1,
    rawCode: trimmed,
  };
}

// ==========================================
// 2. محلل باركود الميزان الإلكتروني (Scale Barcode Parser)
// ==========================================

/**
 * يحلل باركود ميزان الأجبان واللحوم والخضار بنظام EAN-13
 * الشائع دولياً ومحلياً:
 * البادئة (20 أو 21 أو 99) [2 أرقام]
 * كود الصنف PLU [5 أرقام]
 * الوزن بالجرام أو السعر بالقروش [5 أرقام]
 * رقم التحقق Checksum [رقم واحد]
 * الإجمالي: 13 رقماً
 */
function parseScaleBarcode(rawBarcode) {
  if (!rawBarcode || typeof rawBarcode !== 'string') return null;

  const barcode = rawBarcode.trim();
  if (barcode.length !== 13 || !/^\d{13}$/.test(barcode)) {
    return null;
  }

  const config = groceryRepo.getScaleConfig();
  const prefix = config ? config.prefix : '20';
  const pluLength = config ? Number(config.plu_length) : 5;
  const encodingType = config ? config.encoding_type : 'weight_grams';

  // التحقق من أن الباركود يبدأ ببادئة الميزان المعتمدة
  if (!barcode.startsWith(prefix)) {
    return null;
  }

  const prefixLen = prefix.length;
  const pluCode = barcode.substring(prefixLen, prefixLen + pluLength);
  const dataPart = barcode.substring(prefixLen + pluLength, 12);
  const checksum = barcode.substring(12, 13);

  const dataVal = parseInt(dataPart, 10);
  if (isNaN(dataVal)) return null;

  // البحث عن الصنف المرتبط بكود الـ PLU
  const variant = groceryRepo.findVariantByPlu(pluCode);

  let weightKg = 0;
  let totalPrice = 0;

  if (encodingType === 'weight_grams') {
    // تشفير الوزن بالجرام: 500 جرام = 0.500 كجم
    weightKg = Math.round((dataVal / 1000) * 1000) / 1000;
    if (variant && variant.selling_price) {
      totalPrice = Math.round(weightKg * Number(variant.selling_price) * 100) / 100;
    }
  } else {
    // تشفير السعر بالقروش/السنتات: 3550 = 35.50 ج.م
    totalPrice = Math.round((dataVal / 100) * 100) / 100;
    if (variant && variant.selling_price && Number(variant.selling_price) > 0) {
      weightKg = Math.round((totalPrice / Number(variant.selling_price)) * 1000) / 1000;
    }
  }

  return {
    isScaleBarcode: true,
    rawBarcode: barcode,
    prefix,
    pluCode,
    encodingType,
    weightKg,
    weightGrams: Math.round(weightKg * 1000),
    totalPrice,
    checksum,
    variant: variant || null,
  };
}

// ==========================================
// 3. المحلل الشامل الذكي للباركود (Unified Resolver)
// ==========================================

/**
 * يحلل أي كود يدخله الكاشير أو يمرره الماسح الضوئي:
 * يدعم: الكميات المضروبة + باركود الميزان + باركود الوحدات المتعددة + باركود الأصناف العادي + مفاتيح السلع السريعة
 */
function resolveBarcode(input) {
  if (!input) {
    return { resolved: false, error: 'المدخل فارغ' };
  }

  const { multiplier, rawCode } = parseQuickMultiplier(input);
  if (!rawCode) {
    return { resolved: false, error: 'كود الباركود غير صحيح' };
  }

  // 1. فحص باركود الميزان الإلكتروني
  const scaleData = parseScaleBarcode(rawCode);
  if (scaleData && scaleData.isScaleBarcode && scaleData.variant) {
    if (scaleData.weightKg <= 0 || (scaleData.encodingType === 'total_price' && scaleData.totalPrice <= 0)) {
      return {
        resolved: false,
        error: 'تنبيه: باركود الميزان يحتوي على وزن أو سعر صفري غير صالح (Tare Weight)',
      };
    }

    let finalQuantity = Math.round(scaleData.weightKg * multiplier * 1000) / 1000;
    let unitPrice = Number(scaleData.variant.selling_price);
    let finalTotal = Math.round(finalQuantity * unitPrice * 100) / 100;

    if (scaleData.encodingType === 'total_price' && scaleData.totalPrice > 0) {
      finalTotal = Math.round(scaleData.totalPrice * multiplier * 100) / 100;
      if (finalQuantity > 0) {
        unitPrice = Math.round((finalTotal / finalQuantity) * 100) / 100;
      }
    }

    const batchWarning = groceryRepo.getExpiredBatchWarning(scaleData.variant.id);

    return {
      resolved: true,
      type: 'scale_item',
      multiplier,
      rawCode,
      quantity: finalQuantity,
      unitPrice,
      totalAmount: finalTotal,
      scaleData,
      variant: scaleData.variant,
      variantId: scaleData.variant.id,
      productName: scaleData.variant.product_name,
      unitName: 'كجم',
      batchWarning: batchWarning || null,
    };
  }

  // 2. فحص باركود الوحدات المتعددة (كرتونة / باكت / علبة)
  const unitItem = groceryRepo.getUnitByBarcode(rawCode);
  if (unitItem) {
    const finalQuantity = multiplier;
    const baseQuantityDeduction = multiplier * Number(unitItem.conversion_factor);
    const unitPrice = Number(unitItem.selling_price);
    const totalAmount = Math.round(finalQuantity * unitPrice * 100) / 100;
    const batchWarning = groceryRepo.getExpiredBatchWarning(unitItem.variant_id);

    return {
      resolved: true,
      type: 'unit_item',
      multiplier,
      rawCode,
      quantity: finalQuantity,
      unitPrice,
      totalAmount,
      unit: unitItem,
      conversionFactor: Number(unitItem.conversion_factor),
      baseQuantityDeduction,
      variantId: unitItem.variant_id,
      productName: `${unitItem.product_name} (${unitItem.unit_name})`,
      unitName: unitItem.unit_name,
      batchWarning: batchWarning || null,
      variant: {
        id: unitItem.variant_id,
        product_id: unitItem.product_id,
        sku: unitItem.sku,
        selling_price: unitPrice,
        stock_quantity: unitItem.base_stock_quantity,
        product_name: unitItem.product_name,
      },
    };
  }

  // 3. فحص باركود الصنف الأساسي (Standard Product Variant)
  const variant = variantsRepo.getByBarcode(rawCode);
  if (variant) {
    const product = productsRepo.getById(variant.product_id);
    const unitPrice = Number(variant.selling_price);
    const finalQuantity = multiplier;
    const totalAmount = Math.round(finalQuantity * unitPrice * 100) / 100;
    const batchWarning = groceryRepo.getExpiredBatchWarning(variant.id);

    return {
      resolved: true,
      type: 'variant_item',
      multiplier,
      rawCode,
      quantity: finalQuantity,
      unitPrice,
      totalAmount,
      variantId: variant.id,
      productName: product ? product.name : variant.sku,
      unitName: 'قطعة',
      batchWarning: batchWarning || null,
      variant: {
        ...variant,
        product_name: product ? product.name : variant.sku,
      },
    };
  }

  // 4. فحص اختصارات السلع السريعة (Speed PLU Keys)
  const speedKeys = groceryRepo.getAllSpeedKeys();
  const matchedKey = speedKeys.find(
    (k) => k.shortcut_code && k.shortcut_code.toLowerCase() === rawCode.toLowerCase()
  );
  if (matchedKey) {
    const unitPrice = Number(matchedKey.selling_price);
    const finalQuantity = multiplier;
    const totalAmount = Math.round(finalQuantity * unitPrice * 100) / 100;
    const batchWarning = groceryRepo.getExpiredBatchWarning(matchedKey.variant_id);

    return {
      resolved: true,
      type: 'speed_key_item',
      multiplier,
      rawCode,
      quantity: finalQuantity,
      unitPrice,
      totalAmount,
      speedKey: matchedKey,
      variantId: matchedKey.variant_id,
      productName: matchedKey.label,
      unitName: 'قطعة',
      batchWarning: batchWarning || null,
      variant: {
        id: matchedKey.variant_id,
        sku: matchedKey.sku,
        barcode: matchedKey.barcode,
        selling_price: unitPrice,
        stock_quantity: matchedKey.stock_quantity,
        product_name: matchedKey.product_name,
      },
    };
  }

  return {
    resolved: false,
    rawCode,
    multiplier,
    error: `لم يتم العثور على أي صنف بالباركود أو الكود: ${rawCode}`,
  };
}

// ==========================================
// 4. إدارة تعدد وحدات القياس (Multi-UOM)
// ==========================================

function getUnitsByVariant(variantId) {
  if (!variantId) throw new Error('معرف الصنف مطلوب');
  return groceryRepo.getUnitsByVariant(variantId);
}

function getUnitByBarcode(barcode) {
  return groceryRepo.getUnitByBarcode(barcode);
}

function createUnit(data) {
  if (!data.variant_id) throw new Error('معرف الصنف مطلوب');
  if (!data.unit_name || !data.unit_name.trim()) throw new Error('اسم الوحدة مطلوب (مثال: كرتونة، علبة، دستة)');
  
  const factor = Number(data.conversion_factor);
  if (isNaN(factor) || factor <= 0) throw new Error('معامل التحويل يجب أن يكون أكبر من صفر');

  const price = Number(data.selling_price);
  if (isNaN(price) || price < 0) throw new Error('سعر بيع الوحدة غير صحيح');

  // التحقق من عدم تكرار الباركود
  if (data.barcode && data.barcode.trim()) {
    const existing = groceryRepo.getUnitByBarcode(data.barcode.trim());
    if (existing) throw new Error(`باركود الوحدة (${data.barcode}) مسجل مسبقاً لصنف آخر`);
  }

  return groceryRepo.createUnit(data);
}

function updateUnit(id, data) {
  if (!id) throw new Error('معرف الوحدة مطلوب');
  if (data.conversion_factor !== undefined && (isNaN(Number(data.conversion_factor)) || Number(data.conversion_factor) <= 0)) {
    throw new Error('معامل التحويل يجب أن يكون أكبر من صفر');
  }
  if (data.selling_price !== undefined && (isNaN(Number(data.selling_price)) || Number(data.selling_price) < 0)) {
    throw new Error('سعر البيع غير صحيح');
  }

  return groceryRepo.updateUnit(id, data);
}

function deleteUnit(id) {
  if (!id) throw new Error('معرف الوحدة مطلوب');
  return groceryRepo.deleteUnit(id);
}

// ==========================================
// 5. إدارة التشغيلات والصلاحيات (Batches & Expiry)
// ==========================================

function getBatchesByVariant(variantId) {
  if (!variantId) throw new Error('معرف الصنف مطلوب');
  return groceryRepo.getBatchesByVariant(variantId);
}

function createBatch(data) {
  if (!data.variant_id) throw new Error('معرف الصنف مطلوب');
  if (!data.expiry_date) throw new Error('تاريخ انتهاء الصلاحية مطلوب');
  
  const qty = Number(data.quantity);
  if (isNaN(qty) || qty < 0) throw new Error('الكمية يجب أن تكون صفر أو أكثر');

  return groceryRepo.createBatch(data);
}

function getExpiringBatches(daysAhead = 30) {
  const days = Math.max(1, parseInt(daysAhead, 10) || 30);
  return groceryRepo.getExpiringBatches(days);
}

function getExpiredBatches() {
  return groceryRepo.getExpiredBatches();
}

/**
 * ملخص أمان المخزون الغذائي والصلاحيات
 */
function getExpirySummary(daysAhead = 30) {
  const expiring = getExpiringBatches(daysAhead);
  const expired = getExpiredBatches();

  const expiringCount = expiring.length;
  const expiredCount = expired.length;

  const expiringValue = expiring.reduce((sum, b) => sum + (Number(b.quantity) * Number(b.purchase_price || 0)), 0);
  const expiredValue = expired.reduce((sum, b) => sum + (Number(b.quantity) * Number(b.purchase_price || 0)), 0);

  return {
    daysAhead,
    expiringCount,
    expiredCount,
    expiringValue: Math.round(expiringValue * 100) / 100,
    expiredValue: Math.round(expiredValue * 100) / 100,
    expiringBatches: expiring,
    expiredBatches: expired,
  };
}

function deductFifoBatchQuantity(variantId, quantity) {
  if (!variantId || !quantity || quantity <= 0) return;
  return groceryRepo.deductFifoBatchQuantity(variantId, quantity);
}

// ==========================================
// 6. إعدادات ميزان الباركود
// ==========================================

function getScaleConfig() {
  return groceryRepo.getScaleConfig();
}

function saveScaleConfig(data) {
  if (!data.prefix || !data.prefix.trim()) throw new Error('بادئة باركود الميزان مطلوبة (مثل 20 أو 21)');
  return groceryRepo.saveScaleConfig(data);
}

// ==========================================
// 7. أزرار السلع السريعة (Speed PLU Keys)
// ==========================================

function getAllSpeedKeys() {
  return groceryRepo.getAllSpeedKeys();
}

function createSpeedKey(data) {
  if (!data.variant_id) throw new Error('معرف الصنف مطلوب لربط الزر');
  if (!data.label || !data.label.trim()) throw new Error('تسمية الزر السريع مطلوبة');
  return groceryRepo.createSpeedKey(data);
}

function deleteSpeedKey(id) {
  if (!id) throw new Error('معرف الزر مطلوب');
  return groceryRepo.deleteSpeedKey(id);
}

module.exports = {
  parseQuickMultiplier,
  parseScaleBarcode,
  resolveBarcode,
  getUnitsByVariant,
  getUnitByBarcode,
  createUnit,
  updateUnit,
  deleteUnit,
  getBatchesByVariant,
  createBatch,
  getExpiringBatches,
  getExpiredBatches,
  getExpirySummary,
  deductFifoBatchQuantity,
  getScaleConfig,
  saveScaleConfig,
  getAllSpeedKeys,
  createSpeedKey,
  deleteSpeedKey,
};

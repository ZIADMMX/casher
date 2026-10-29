const { db } = require('../database/db');

/**
 * Grocery & Supermarket Repository
 * مستودع بيانات السوبر ماركت: تعدد الوحدات، الصلاحيات، ميزان الباركود، والسلع السريعة
 */

// ==========================================
// 1. تعدد وحدات القياس (Multi-UOM)
// ==========================================

function getUnitsByVariant(variantId) {
  return db.prepare(`
    SELECT * FROM product_units
    WHERE variant_id = ?
    ORDER BY conversion_factor ASC
  `).all(variantId);
}

function getUnitByBarcode(barcode) {
  if (!barcode) return null;
  return db.prepare(`
    SELECT 
      pu.*,
      pv.product_id,
      p.name as product_name,
      pv.sku,
      pv.selling_price as base_selling_price,
      pv.stock_quantity as base_stock_quantity
    FROM product_units pu
    JOIN product_variants pv ON pu.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    WHERE pu.barcode = ?
  `).get(barcode);
}

function createUnit(data) {
  const stmt = db.prepare(`
    INSERT INTO product_units (
      variant_id, unit_name, conversion_factor, barcode, selling_price, purchase_price, is_base_unit
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.variant_id,
    data.unit_name.trim(),
    Number(data.conversion_factor) || 1,
    data.barcode ? data.barcode.trim() : null,
    Number(data.selling_price),
    Number(data.purchase_price) || 0,
    data.is_base_unit ? 1 : 0
  );

  return db.prepare('SELECT * FROM product_units WHERE id = ?').get(res.lastInsertRowid);
}

function updateUnit(id, data) {
  db.prepare(`
    UPDATE product_units
    SET unit_name = COALESCE(?, unit_name),
        conversion_factor = COALESCE(?, conversion_factor),
        barcode = COALESCE(?, barcode),
        selling_price = COALESCE(?, selling_price),
        purchase_price = COALESCE(?, purchase_price),
        is_base_unit = COALESCE(?, is_base_unit)
    WHERE id = ?
  `).run(
    data.unit_name,
    data.conversion_factor,
    data.barcode,
    data.selling_price,
    data.purchase_price,
    data.is_base_unit,
    id
  );

  return db.prepare('SELECT * FROM product_units WHERE id = ?').get(id);
}

function deleteUnit(id) {
  return db.prepare('DELETE FROM product_units WHERE id = ?').run(id);
}

// ==========================================
// 2. تشغيلات وتواريخ الصلاحية (Batches & Expiry)
// ==========================================

function getBatchesByVariant(variantId) {
  return db.prepare(`
    SELECT b.*, s.name as supplier_name
    FROM product_batches b
    LEFT JOIN suppliers s ON b.supplier_id = s.id
    WHERE b.variant_id = ?
    ORDER BY b.expiry_date ASC
  `).all(variantId);
}

function createBatch(data) {
  const stmt = db.prepare(`
    INSERT INTO product_batches (
      variant_id, batch_number, expiry_date, production_date, quantity, purchase_price, supplier_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.variant_id,
    data.batch_number || null,
    data.expiry_date,
    data.production_date || null,
    Number(data.quantity) || 0,
    Number(data.purchase_price) || 0,
    data.supplier_id || null,
    data.notes || null
  );

  return db.prepare('SELECT * FROM product_batches WHERE id = ?').get(res.lastInsertRowid);
}

function getExpiringBatches(daysAhead = 30) {
  return db.prepare(`
    SELECT 
      b.*,
      p.name as product_name,
      pv.sku,
      pv.barcode,
      CAST((julianday(b.expiry_date) - julianday('now', 'localtime')) AS INTEGER) as days_remaining
    FROM product_batches b
    JOIN product_variants pv ON b.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    WHERE b.quantity > 0
      AND date(b.expiry_date) >= date('now', 'localtime')
      AND date(b.expiry_date) <= date('now', 'localtime', '+' || ? || ' days')
    ORDER BY b.expiry_date ASC
  `).all(daysAhead);
}

function getExpiredBatches() {
  return db.prepare(`
    SELECT 
      b.*,
      p.name as product_name,
      pv.sku,
      pv.barcode,
      CAST((julianday('now', 'localtime') - julianday(b.expiry_date)) AS INTEGER) as days_expired
    FROM product_batches b
    JOIN product_variants pv ON b.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    WHERE b.quantity > 0
      AND date(b.expiry_date) < date('now', 'localtime')
    ORDER BY b.expiry_date ASC
  `).all();
}

function getExpiredBatchWarning(variantId) {
  if (!variantId) return null;
  const expired = db.prepare(`
    SELECT batch_number, expiry_date, quantity
    FROM product_batches
    WHERE variant_id = ? AND quantity > 0 AND date(expiry_date) < date('now', 'localtime')
    ORDER BY expiry_date ASC
    LIMIT 1
  `).get(variantId);

  if (expired) {
    return {
      hasExpiredBatch: true,
      batchNumber: expired.batch_number,
      expiryDate: expired.expiry_date,
      quantity: expired.quantity,
      warning: `تحذير: هذا الصنف به دفعة منتهية الصلاحية بالمخزون بتاريخ (${expired.expiry_date})!`,
    };
  }
  return null;
}

function deductFifoBatchQuantity(variantId, quantityToDeduct) {
  return db.transaction(() => {
    // 1. نبدأ أولاً بصرف التشغيلات السارية غير المنتهية الصلاحية
    let batches = db.prepare(`
      SELECT id, quantity
      FROM product_batches
      WHERE variant_id = ? AND quantity > 0
        AND date(expiry_date) >= date('now', 'localtime')
      ORDER BY expiry_date ASC
    `).all(variantId);

    // إذا لم تكفِ، نأخذ ما تبقى من أي تشغيلات أخرى مسجلة
    let remaining = Number(quantityToDeduct);
    for (const batch of batches) {
      if (remaining <= 0) break;
      const take = Math.min(batch.quantity, remaining);
      db.prepare('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?').run(take, batch.id);
      remaining -= take;
    }

    if (remaining > 0) {
      const leftoverBatches = db.prepare(`
        SELECT id, quantity
        FROM product_batches
        WHERE variant_id = ? AND quantity > 0
        ORDER BY expiry_date ASC
      `).all(variantId);

      for (const batch of leftoverBatches) {
        if (remaining <= 0) break;
        const take = Math.min(batch.quantity, remaining);
        db.prepare('UPDATE product_batches SET quantity = quantity - ? WHERE id = ?').run(take, batch.id);
        remaining -= take;
      }
    }
  })();
}

function restockBatchQuantity(variantId, quantityToRestock) {
  const qty = Number(quantityToRestock);
  if (!qty || qty <= 0) return;
  let targetBatch = db.prepare(`
    SELECT id FROM product_batches
    WHERE variant_id = ? AND date(expiry_date) >= date('now', 'localtime')
    ORDER BY expiry_date DESC, id DESC
    LIMIT 1
  `).get(variantId);

  if (!targetBatch) {
    targetBatch = db.prepare(`
      SELECT id FROM product_batches
      WHERE variant_id = ?
      ORDER BY id DESC
      LIMIT 1
    `).get(variantId);
  }

  if (targetBatch) {
    db.prepare('UPDATE product_batches SET quantity = quantity + ? WHERE id = ?').run(qty, targetBatch.id);
  }
}

// ==========================================
// 3. إعدادات ميزان الباركود والبحث بـ PLU
// ==========================================

function getScaleConfig() {
  let config = db.prepare('SELECT * FROM scale_barcode_configs WHERE is_active = 1 LIMIT 1').get();
  if (!config) {
    db.prepare(`
      INSERT INTO scale_barcode_configs (name, prefix, plu_length, encoding_type, is_active)
      VALUES ('ميزان الأجبان واللحوم الافتراضي', '20', 5, 'weight_grams', 1)
    `).run();
    config = db.prepare('SELECT * FROM scale_barcode_configs WHERE is_active = 1 LIMIT 1').get();
  }
  return config;
}

function saveScaleConfig(data) {
  const current = getScaleConfig();
  db.prepare(`
    UPDATE scale_barcode_configs
    SET prefix = COALESCE(?, prefix),
        plu_length = COALESCE(?, plu_length),
        encoding_type = COALESCE(?, encoding_type),
        name = COALESCE(?, name)
    WHERE id = ?
  `).run(
    data.prefix,
    data.plu_length ? Number(data.plu_length) : undefined,
    data.encoding_type,
    data.name,
    current.id
  );
  return getScaleConfig();
}

function findVariantByPlu(pluCode) {
  // مطابقة الـ PLU كـ كود في أول الباركود أو الـ SKU أو معرف الـ Variant
  const numPlu = String(parseInt(pluCode, 10)); // إزالة الأصفار على الشمال
  const paddedPlu = pluCode.padStart(5, '0');

  return db.prepare(`
    SELECT 
      pv.*,
      p.name as product_name,
      p.description as product_description,
      c.name as category_name
    FROM product_variants pv
    JOIN products p ON pv.product_id = p.id
    LEFT JOIN categories c ON p.category_id = c.id
    WHERE pv.sku = ?
       OR pv.barcode = ?
       OR pv.sku = ?
       OR pv.barcode LIKE ?
       OR pv.id = ?
    LIMIT 1
  `).get(paddedPlu, paddedPlu, numPlu, `%${paddedPlu}%`, parseInt(numPlu, 10) || -1);
}

// ==========================================
// 4. أزرار السلع السريعة بدون باركود (Speed PLU Keys)
// ==========================================

function getAllSpeedKeys() {
  return db.prepare(`
    SELECT 
      k.*,
      p.name as product_name,
      pv.selling_price,
      pv.stock_quantity,
      pv.sku,
      pv.barcode
    FROM grocery_speed_keys k
    JOIN product_variants pv ON k.variant_id = pv.id
    JOIN products p ON pv.product_id = p.id
    ORDER BY k.display_order ASC, k.id ASC
  `).all();
}

function createSpeedKey(data) {
  const stmt = db.prepare(`
    INSERT INTO grocery_speed_keys (variant_id, label, shortcut_code, color, icon, display_order)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.variant_id,
    data.label.trim(),
    data.shortcut_code || null,
    data.color || '#10B981',
    data.icon || '🛒',
    Number(data.display_order) || 0
  );

  return db.prepare('SELECT * FROM grocery_speed_keys WHERE id = ?').get(res.lastInsertRowid);
}

function deleteSpeedKey(id) {
  return db.prepare('DELETE FROM grocery_speed_keys WHERE id = ?').run(id);
}

module.exports = {
  getUnitsByVariant,
  getUnitByBarcode,
  createUnit,
  updateUnit,
  deleteUnit,
  getBatchesByVariant,
  createBatch,
  getExpiringBatches,
  getExpiredBatches,
  getExpiredBatchWarning,
  deductFifoBatchQuantity,
  restockBatchQuantity,
  getScaleConfig,
  saveScaleConfig,
  findVariantByPlu,
  getAllSpeedKeys,
  createSpeedKey,
  deleteSpeedKey,
};

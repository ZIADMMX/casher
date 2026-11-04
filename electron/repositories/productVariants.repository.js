const { db } = require('../database/db');

let stmts = null;

function getStmts() {
  if (!stmts) {
    stmts = {
      create: db.prepare(`
        INSERT INTO product_variants
          (product_id, size, color, sku, barcode, purchase_price, selling_price, stock_quantity, low_stock_threshold)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `),
      getAll: db.prepare('SELECT * FROM product_variants'),
      getByProductId: db.prepare('SELECT * FROM product_variants WHERE product_id = ?'),
      getById: db.prepare(`
        SELECT pv.*, p.is_service
        FROM product_variants pv
        JOIN products p ON p.id = pv.product_id
        WHERE pv.id = ?
      `),
      getByBarcode: db.prepare(`
        SELECT pv.* FROM product_variants pv
        JOIN products p ON p.id = pv.product_id AND p.is_active = 1
        WHERE pv.barcode = ? OR pv.sku = ?
        LIMIT 1
      `),
      getByTrimmedBarcode: db.prepare(`
        SELECT pv.* FROM product_variants pv
        JOIN products p ON p.id = pv.product_id AND p.is_active = 1
        WHERE TRIM(pv.barcode) = ? OR TRIM(pv.sku) = ?
        LIMIT 1
      `),
      decreaseStock: db.prepare('UPDATE product_variants SET stock_quantity = stock_quantity - ? WHERE id = ? AND stock_quantity >= ?'),
      updateSku: db.prepare('UPDATE product_variants SET sku = ?, barcode = ? WHERE id = ?'),
      update: db.prepare(`
        UPDATE product_variants
        SET size = ?, color = ?, purchase_price = ?, selling_price = ?, stock_quantity = ?, low_stock_threshold = ?, barcode = ?
        WHERE id = ?
      `),
      delete: db.prepare('DELETE FROM product_variants WHERE id = ?'),
    };
  }
  return stmts;
}

function create(variant) {
  const result = getStmts().create.run(
    variant.productId,
    variant.size || null,
    variant.color || null,
    variant.sku || null,
    variant.barcode || null,
    variant.purchasePrice,
    variant.sellingPrice,
    variant.stockQuantity || 0,
    variant.lowStockThreshold || 5
  );
  return result.lastInsertRowid;
}

function getAll() {
  return getStmts().getAll.all();
}

function getByProductId(productId) {
  return getStmts().getByProductId.all(productId);
}

function getById(id) {
  return getStmts().getById.get(id);
}

function getByBarcode(barcode) {
  if (!barcode) return null;
  const clean = String(barcode).trim();
  const stmts = getStmts();
  return stmts.getByBarcode.get(clean, clean) || stmts.getByTrimmedBarcode.get(clean, clean);
}

function hasTransactionHistory(id) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM sale_items
    WHERE variant_id = ?
    UNION ALL
    SELECT 1
    FROM purchase_items
    WHERE variant_id = ?
    UNION ALL
    SELECT 1
    FROM returns
    WHERE variant_id = ?
    LIMIT 1
  `).get(id, id, id));
}

function decreaseStock(id, quantity) {
  const result = getStmts().decreaseStock.run(quantity, id, quantity);
  if (result.changes === 0) {
    throw new Error('الكمية المتاحة غير كافية');
  }
}

// بنحدث الـ SKU والباركود مع بعض بنفس القيمة (الباركود = SKU)
function updateSku(id, code) {
  getStmts().updateSku.run(code, code, id);
}

function update(id, data) {
  return getStmts().update.run(
    data.size || null,
    data.color || null,
    data.purchasePrice,
    data.sellingPrice,
    data.stockQuantity,
    data.lowStockThreshold || 5,
    data.barcode || null,
    id
  );
}

function remove(id) {
  return getStmts().delete.run(id);
}

module.exports = {
  create, getAll, getByProductId, getById, getByBarcode, hasTransactionHistory,
  decreaseStock, updateSku, update, remove,
};
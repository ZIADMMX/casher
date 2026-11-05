const { db } = require('../database/db');

// Append-only history of product changes (the table refuses UPDATE/DELETE).
let insertStmt = null;

function text(value, max = 300) {
  if (value === undefined || value === null) return null;
  return String(value).slice(0, max);
}

function record({
  productId = null,
  variantId = null,
  action,
  field = null,
  oldValue = null,
  newValue = null,
  reason = null,
  userId = null,
  username = 'النظام',
  approvedById = null,
  approvedByName = null,
}) {
  if (!insertStmt) {
    insertStmt = db.prepare(`
      INSERT INTO product_change_log (
        product_id, variant_id, action, field, old_value, new_value, reason,
        user_id, username, approved_by_id, approved_by_name
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }
  return insertStmt.run(
    productId,
    variantId,
    action,
    text(field, 60),
    text(oldValue),
    text(newValue),
    text(reason, 200),
    userId,
    text(username, 100) || 'النظام',
    approvedById,
    text(approvedByName, 100)
  );
}

function list({ productId = null, limit = 30 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 30, 1), 200);
  return db.prepare(`
    SELECT l.*, p.name AS product_name
    FROM product_change_log l
    LEFT JOIN products p ON p.id = l.product_id
    WHERE (? IS NULL OR l.product_id = ?)
    ORDER BY l.id DESC
    LIMIT ?
  `).all(productId, productId, safeLimit);
}

function lastChangeByProduct() {
  return db.prepare(`
    SELECT product_id, MAX(created_at) AS last_changed_at
    FROM product_change_log
    WHERE product_id IS NOT NULL
      AND action IN ('create', 'update', 'price', 'variant_add', 'variant_update', 'variant_delete')
    GROUP BY product_id
  `).all();
}

module.exports = { record, list, lastChangeByProduct };

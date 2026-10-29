const { db } = require('../database/db');

function create({
  saleId,
  variantId,
  quantity,
  reason,
  refundAmount,
  exchangeVariantId,
  exchangePriceDifference = 0,
  exchangePaymentMethod = null,
  userId,
  shiftId,
}) {
  const stmt = db.prepare(`
    INSERT INTO returns (
      sale_id, variant_id, quantity, reason, refund_amount, exchange_variant_id,
      exchange_price_difference, exchange_payment_method, user_id, shift_id
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    saleId,
    variantId,
    quantity,
    reason || null,
    refundAmount,
    exchangeVariantId || null,
    Number(exchangePriceDifference || 0),
    exchangePaymentMethod || null,
    userId,
    shiftId || null
  );
  return result.lastInsertRowid;
}

// إجمالي الكمية المرتجعة فعليًا من صنف معين في فاتورة معينة (عشان منسمحش يرجع أكتر من اللي اتباع)
function getReturnedQuantity(saleId, variantId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(quantity), 0) as total
    FROM returns
    WHERE sale_id = ? AND variant_id = ?
  `).get(saleId, variantId);
  return row.total;
}

function getReturnedRefundAmount(saleId, variantId) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(refund_amount), 0) as total
    FROM returns
    WHERE sale_id = ? AND variant_id = ?
  `).get(saleId, variantId);
  return Number(row.total || 0);
}

function getBySaleId(saleId) {
  return db.prepare(`
    SELECT r.*, pv.size, pv.color, p.name as productName
    FROM returns r
    LEFT JOIN product_variants pv ON pv.id = r.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE r.sale_id = ?
    ORDER BY r.created_at DESC
  `).all(saleId);
}

function getRecent(limit) {
  return db.prepare(`
    SELECT r.*, pv.size, pv.color, p.name as productName, r.sale_id
    FROM returns r
    LEFT JOIN product_variants pv ON pv.id = r.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(limit);
}

module.exports = { create, getReturnedQuantity, getReturnedRefundAmount, getBySaleId, getRecent };
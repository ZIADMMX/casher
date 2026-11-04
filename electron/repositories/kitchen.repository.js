const { db } = require('../database/db');

function getOrders() {
  const orders = db.prepare(`
    SELECT s.id, s.order_mode, s.kitchen_status, s.total_amount, s.customer_name,
      s.customer_phone, s.created_at, u.username AS cashier_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE s.order_mode IS NOT NULL
      AND date(s.created_at, 'localtime') = date('now', 'localtime')
    ORDER BY s.created_at ASC, s.id ASC
  `).all();
  if (!orders.length) return [];

  const items = db.prepare(`
    SELECT si.sale_id, si.quantity, si.unit_price, p.name AS product_name,
      pv.size, pv.color
    FROM sale_items si
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE si.sale_id = ?
  `);
  return orders.map((order) => ({
    ...order,
    items: items.all(order.id),
  }));
}

function updateOrderStatus(saleId, status) {
  const result = db.prepare(`
    UPDATE sales
    SET kitchen_status = ?
    WHERE id = ? AND order_mode IS NOT NULL
  `).run(status, saleId);
  if (!result.changes) throw new Error('طلب المطبخ غير موجود');
  return db.prepare(`
    SELECT id, order_mode, kitchen_status
    FROM sales
    WHERE id = ?
  `).get(saleId);
}

module.exports = { getOrders, updateOrderStatus };

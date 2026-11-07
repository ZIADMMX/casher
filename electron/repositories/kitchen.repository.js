const { db } = require('../database/db');
const { parseModifiers } = require('../services/modifiers.service');

// Delivered orders stay on the board for a while, then drop off.
const SERVED_ON_BOARD = 12;

// Today's kitchen orders with their items, in two queries (not one per order).
function getOrders() {
  const orders = db.prepare(`
    WITH today AS (
      SELECT s.id, s.order_mode, COALESCE(s.kitchen_status, 'new') AS kitchen_status,
        s.customer_name, s.customer_phone, s.delivery_address, s.notes, s.created_at,
        COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS cashier_name,
        (SELECT e.created_at FROM kitchen_status_events e WHERE e.sale_id = s.id ORDER BY e.id DESC LIMIT 1) AS status_changed_at
      FROM sales s
      LEFT JOIN users u ON u.id = s.user_id
      WHERE s.order_mode IS NOT NULL
        AND date(s.created_at, 'localtime') = date('now', 'localtime')
        -- A paid table check: its rounds are on the board instead.
        AND NOT EXISTS (SELECT 1 FROM table_tabs tab WHERE tab.sale_id = s.id)
        AND NOT EXISTS (SELECT 1 FROM table_tab_items i WHERE i.paid_sale_id = s.id)
    )
    SELECT * FROM today WHERE kitchen_status != 'served'
    UNION ALL
    SELECT * FROM (
      SELECT * FROM today WHERE kitchen_status = 'served'
      ORDER BY COALESCE(status_changed_at, created_at) DESC LIMIT ${SERVED_ON_BOARD}
    )
    ORDER BY created_at ASC, id ASC
  `).all();
  if (!orders.length) return [];

  const ids = orders.map((order) => order.id);
  const items = db.prepare(`
    SELECT si.sale_id, si.quantity, si.modifiers, si.note, p.name AS product_name, p.category_id, pv.size, pv.color
    FROM sale_items si
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE si.sale_id IN (SELECT value FROM json_each(?))
    ORDER BY si.sale_id, si.id
  `).all(JSON.stringify(ids));

  const bySale = new Map(ids.map((id) => [id, []]));
  for (const item of items) bySale.get(item.sale_id)?.push({ ...item, modifiers: parseModifiers(item.modifiers) });
  return orders.map((order) => ({ ...order, items: bySale.get(order.id) || [] }));
}

function getOrderState(saleId) {
  return db.prepare(`
    SELECT s.id, COALESCE(s.kitchen_status, 'new') AS kitchen_status
    FROM sales s
    WHERE s.id = ? AND s.order_mode IS NOT NULL
      AND date(s.created_at, 'localtime') = date('now', 'localtime')
  `).get(saleId);
}

function getLastChange(saleId) {
  return db.prepare(`
    SELECT from_status AS fromStatus, to_status AS toStatus,
      CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) AS ageSeconds
    FROM kitchen_status_events
    WHERE sale_id = ?
    ORDER BY id DESC
    LIMIT 1
  `).get(saleId) || null;
}

// Moves one order and records the move, all or nothing. The update only
// applies if the order is still in `fromStatus`, so two screens can't both win.
function moveOrder(saleId, fromStatus, toStatus, userId) {
  return db.transaction(() => {
    const result = db.prepare(`
      UPDATE sales SET kitchen_status = ?
      WHERE id = ? AND order_mode IS NOT NULL AND COALESCE(kitchen_status, 'new') = ?
    `).run(toStatus, saleId, fromStatus);
    if (!result.changes) throw new Error('الطلب اتحدث بالفعل من شاشة تانية');
    db.prepare(`
      INSERT INTO kitchen_status_events (sale_id, from_status, to_status, user_id)
      VALUES (?, ?, ?, ?)
    `).run(saleId, fromStatus, toStatus, userId ?? null);
    return db.prepare('SELECT id, order_mode, kitchen_status FROM sales WHERE id = ?').get(saleId);
  })();
}

// One kitchen order with what the cook needs (no prices), for its printed ticket.
function getSaleTicket(saleId) {
  const sale = db.prepare(`
    SELECT s.id, s.order_mode, s.customer_name, s.customer_phone, s.delivery_address, s.notes, s.created_at,
      COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS cashier_name
    FROM sales s LEFT JOIN users u ON u.id = s.user_id
    WHERE s.id = ? AND s.order_mode IS NOT NULL
  `).get(saleId);
  if (!sale) return null;
  const items = db.prepare(`
    SELECT si.quantity, si.modifiers, si.note, p.name AS product_name, p.category_id, pv.size, pv.color
    FROM sale_items si
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE si.sale_id = ? ORDER BY si.id
  `).all(saleId).map((item) => ({ ...item, modifiers: parseModifiers(item.modifiers) }));
  return { ...sale, items };
}

module.exports = { getOrders, getOrderState, getLastChange, moveOrder, getSaleTicket };

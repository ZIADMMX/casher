const { db } = require('../database/db');
const { parseModifiers, serializeModifiers } = require('../services/modifiers.service');

const withModifiers = (rows) => rows.map((row) => ({ ...row, modifiers: parseModifiers(row.modifiers) }));

// Active tables with their open check (if any) and what is still unpaid on it.
function getTables() {
  return db.prepare(`
    SELECT t.id, t.name, tab.id AS tab_id, tab.opened_at,
      COALESCE((SELECT SUM(i.quantity * i.unit_price) FROM table_tab_items i WHERE i.tab_id = tab.id AND i.paid_sale_id IS NULL), 0) AS tab_total,
      (SELECT COUNT(*) FROM table_tab_items i WHERE i.tab_id = tab.id AND i.paid_sale_id IS NULL) AS item_count
    FROM dining_tables t
    LEFT JOIN table_tabs tab ON tab.table_id = t.id AND tab.status = 'open'
    WHERE t.is_active = 1
    ORDER BY t.id
  `).all();
}

function getTable(id) {
  return db.prepare('SELECT * FROM dining_tables WHERE id = ? AND is_active = 1').get(id);
}

function addTable(name) {
  return db.prepare('INSERT INTO dining_tables (name) VALUES (?)').run(name).lastInsertRowid;
}

// Tables are retired, not deleted: paid checks keep pointing at them.
function retireTable(id) {
  return db.prepare('UPDATE dining_tables SET is_active = 0 WHERE id = ?').run(id);
}

function getOpenTabForTable(tableId) {
  return db.prepare("SELECT * FROM table_tabs WHERE table_id = ? AND status = 'open'").get(tableId);
}

function getTab(tabId) {
  return db.prepare(`
    SELECT tab.*, t.name AS table_name
    FROM table_tabs tab JOIN dining_tables t ON t.id = tab.table_id
    WHERE tab.id = ?
  `).get(tabId);
}

function openTab(tableId, userId) {
  return db.prepare('INSERT INTO table_tabs (table_id, opened_by) VALUES (?, ?)').run(tableId, userId ?? null).lastInsertRowid;
}

function getTabItems(tabId) {
  return withModifiers(db.prepare(`
    SELECT i.id, i.round_id, i.variant_id, i.quantity, i.unit_price, i.modifiers, i.note, i.paid_sale_id,
      p.name AS product_name, pv.size, pv.color
    FROM table_tab_items i
    LEFT JOIN product_variants pv ON pv.id = i.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE i.tab_id = ?
    ORDER BY i.id
  `).all(tabId));
}

// One kitchen round with its items, all or nothing.
function addRound(tabId, items, userId) {
  return db.transaction(() => {
    const roundId = db.prepare('INSERT INTO table_tab_rounds (tab_id, created_by) VALUES (?, ?)')
      .run(tabId, userId ?? null).lastInsertRowid;
    const insert = db.prepare(`
      INSERT INTO table_tab_items (tab_id, round_id, variant_id, quantity, unit_price, modifiers, note) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insert.run(tabId, roundId, item.variantId, item.quantity, item.unitPrice, serializeModifiers(item.modifiers), item.note ?? null);
    }
    return roundId;
  })();
}

// Marks lines as paid by one sale. Returns how many were still unpaid, so a
// caller can tell when another till paid some of them first.
function markItemsPaid(tabId, itemIds, saleId) {
  return db.prepare(`
    UPDATE table_tab_items SET paid_sale_id = ?
    WHERE tab_id = ? AND paid_sale_id IS NULL AND id IN (SELECT value FROM json_each(?))
  `).run(saleId, tabId, JSON.stringify(itemIds)).changes;
}

function countUnpaidItems(tabId) {
  return db.prepare('SELECT COUNT(*) AS n FROM table_tab_items WHERE tab_id = ? AND paid_sale_id IS NULL').get(tabId).n;
}

// Only succeeds while the check is still open, so two tills can't both close it.
function closeTab(tabId, status, saleId = null) {
  return db.prepare(`
    UPDATE table_tabs SET status = ?, sale_id = ?, closed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'open'
  `).run(status, saleId, tabId);
}

// --- kitchen ---

// Today's rounds of every table, shaped like sale orders for the kitchen board.
function getKitchenRounds(servedLimit) {
  const rounds = db.prepare(`
    WITH today AS (
      SELECT r.id AS round_id, r.kitchen_status, r.created_at, t.name AS table_name,
        (SELECT COUNT(*) FROM table_tab_rounds r2 WHERE r2.tab_id = r.tab_id AND r2.id <= r.id) AS round_no,
        COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS cashier_name,
        (SELECT e.created_at FROM table_round_events e WHERE e.round_id = r.id ORDER BY e.id DESC LIMIT 1) AS status_changed_at
      FROM table_tab_rounds r
      JOIN table_tabs tab ON tab.id = r.tab_id
      JOIN dining_tables t ON t.id = tab.table_id
      LEFT JOIN users u ON u.id = r.created_by
      WHERE tab.status != 'cancelled'
        AND date(r.created_at, 'localtime') = date('now', 'localtime')
    )
    SELECT * FROM today WHERE kitchen_status != 'served'
    UNION ALL
    SELECT * FROM (
      SELECT * FROM today WHERE kitchen_status = 'served'
      ORDER BY COALESCE(status_changed_at, created_at) DESC LIMIT ${Number(servedLimit) || 0}
    )
  `).all();
  if (!rounds.length) return [];

  const items = withModifiers(db.prepare(`
    SELECT i.round_id, i.quantity, i.modifiers, i.note, p.name AS product_name, p.category_id, pv.size, pv.color
    FROM table_tab_items i
    LEFT JOIN product_variants pv ON pv.id = i.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE i.round_id IN (SELECT value FROM json_each(?))
    ORDER BY i.round_id, i.id
  `).all(JSON.stringify(rounds.map((round) => round.round_id))));
  const byRound = new Map(rounds.map((round) => [round.round_id, []]));
  for (const item of items) byRound.get(item.round_id)?.push(item);
  return rounds.map((round) => ({ ...round, items: byRound.get(round.round_id) || [] }));
}

function getRoundState(roundId) {
  return db.prepare(`
    SELECT r.id, r.kitchen_status FROM table_tab_rounds r
    JOIN table_tabs tab ON tab.id = r.tab_id
    WHERE r.id = ? AND tab.status != 'cancelled'
      AND date(r.created_at, 'localtime') = date('now', 'localtime')
  `).get(roundId);
}

function getRoundLastChange(roundId) {
  return db.prepare(`
    SELECT from_status AS fromStatus, to_status AS toStatus,
      CAST((julianday('now') - julianday(created_at)) * 86400 AS INTEGER) AS ageSeconds
    FROM table_round_events WHERE round_id = ? ORDER BY id DESC LIMIT 1
  `).get(roundId) || null;
}

function moveRound(roundId, fromStatus, toStatus, userId) {
  return db.transaction(() => {
    const result = db.prepare('UPDATE table_tab_rounds SET kitchen_status = ? WHERE id = ? AND kitchen_status = ?')
      .run(toStatus, roundId, fromStatus);
    if (!result.changes) throw new Error('الطلب اتحدث بالفعل من شاشة تانية');
    db.prepare('INSERT INTO table_round_events (round_id, from_status, to_status, user_id) VALUES (?, ?, ?, ?)')
      .run(roundId, fromStatus, toStatus, userId ?? null);
    return db.prepare('SELECT id, kitchen_status FROM table_tab_rounds WHERE id = ?').get(roundId);
  })();
}

// One round with what the cook needs (no prices), for its printed ticket.
function getRoundTicket(roundId) {
  const round = db.prepare(`
    SELECT r.id, r.created_at, t.name AS table_name,
      (SELECT COUNT(*) FROM table_tab_rounds r2 WHERE r2.tab_id = r.tab_id AND r2.id <= r.id) AS round_no,
      COALESCE(NULLIF(TRIM(u.full_name), ''), u.username) AS cashier_name
    FROM table_tab_rounds r
    JOIN table_tabs tab ON tab.id = r.tab_id
    JOIN dining_tables t ON t.id = tab.table_id
    LEFT JOIN users u ON u.id = r.created_by
    WHERE r.id = ?
  `).get(roundId);
  if (!round) return null;
  const items = withModifiers(db.prepare(`
    SELECT i.quantity, i.modifiers, i.note, p.name AS product_name, p.category_id, pv.size, pv.color
    FROM table_tab_items i
    LEFT JOIN product_variants pv ON pv.id = i.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE i.round_id = ? ORDER BY i.id
  `).all(roundId));
  return { ...round, order_mode: 'dine_in', items };
}

module.exports = {
  getRoundTicket,
  getTables,
  getTable,
  addTable,
  retireTable,
  getOpenTabForTable,
  getTab,
  openTab,
  getTabItems,
  addRound,
  closeTab,
  markItemsPaid,
  countUnpaidItems,
  getKitchenRounds,
  getRoundState,
  getRoundLastChange,
  moveRound,
};

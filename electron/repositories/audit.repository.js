const { db } = require('../database/db');

/**
 * تسجيل حركة في سجل تدقيق الكاشير
 */
function log({
  userId,
  username,
  shiftId = null,
  actionType,
  title,
  details = null,
  amount = 0,
  severity = 'info',
}) {
  try {
    let validUserId = null;
    if (userId) {
      const u = db.prepare('SELECT id FROM users WHERE id = ?').get(userId);
      if (u) validUserId = userId;
    }

    let validShiftId = null;
    if (shiftId) {
      const s = db.prepare('SELECT id FROM shifts WHERE id = ?').get(shiftId);
      if (s) validShiftId = shiftId;
    }

    const stmt = db.prepare(`
      INSERT INTO cashier_audit_logs (
        user_id, username, shift_id, action_type, title, details, amount, severity
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const detailsStr = details && typeof details === 'object' ? JSON.stringify(details) : details;

    const result = stmt.run(
      validUserId,
      username || 'مستخدم',
      validShiftId,
      actionType,
      title,
      detailsStr || null,
      Number(amount) || 0,
      ['info', 'warning', 'danger', 'success'].includes(severity) ? severity : 'info'
    );

    return result ? result.lastInsertRowid : null;
  } catch (err) {
    console.error('فشل تسجيل حركة في سجل التدقيق:', err.message);
    return null;
  }
}

/**
 * جلب سجل الحركات مع الفلترة والتقسيم لصفحات
 */
function getLogs({
  userId = null,
  shiftId = null,
  actionType = null,
  startDate = null,
  endDate = null,
  limit = 50,
  offset = 0,
} = {}) {
  let query = 'SELECT * FROM cashier_audit_logs WHERE 1=1';
  const params = [];

  if (userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  if (shiftId) {
    query += ' AND shift_id = ?';
    params.push(shiftId);
  }

  if (actionType && actionType !== 'all') {
    query += ' AND action_type = ?';
    params.push(actionType);
  }

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  query += ' ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

/**
 * جلب إجمالي عدد الحركات المطابقة للفلتر
 */
function countLogs({
  userId = null,
  shiftId = null,
  actionType = null,
  startDate = null,
  endDate = null,
} = {}) {
  let query = 'SELECT COUNT(*) as count FROM cashier_audit_logs WHERE 1=1';
  const params = [];

  if (userId) {
    query += ' AND user_id = ?';
    params.push(userId);
  }

  if (shiftId) {
    query += ' AND shift_id = ?';
    params.push(shiftId);
  }

  if (actionType && actionType !== 'all') {
    query += ' AND action_type = ?';
    params.push(actionType);
  }

  if (startDate) {
    query += ' AND created_at >= ?';
    params.push(startDate);
  }

  if (endDate) {
    query += ' AND created_at <= ?';
    params.push(endDate);
  }

  const res = db.prepare(query).get(...params);
  return res ? res.count : 0;
}

/**
 * جلب ملخص إحصائي سريع لحركات الكاشير
 */
function getCashierSummary(userId) {
  const stats = db.prepare(`
    SELECT
      COUNT(*) as total_actions,
      COUNT(CASE WHEN action_type = 'sale_created' THEN 1 END) as sales_count,
      COUNT(CASE WHEN action_type = 'item_removed' THEN 1 END) as voided_items_count,
      COUNT(CASE WHEN action_type = 'cart_cleared' THEN 1 END) as cleared_carts_count,
      COUNT(CASE WHEN action_type = 'discount_applied' THEN 1 END) as discounts_count,
      COUNT(CASE WHEN action_type = 'expense_added' THEN 1 END) as expenses_count,
      COUNT(CASE WHEN action_type = 'return_processed' THEN 1 END) as returns_count,
      COALESCE(SUM(CASE WHEN action_type = 'discount_applied' THEN amount ELSE 0 END), 0) as total_discounts_amount,
      MAX(created_at) as last_action_at
    FROM cashier_audit_logs
    WHERE user_id = ?
  `).get(userId);

  return stats || {
    total_actions: 0,
    sales_count: 0,
    voided_items_count: 0,
    cleared_carts_count: 0,
    discounts_count: 0,
    expenses_count: 0,
    returns_count: 0,
    total_discounts_amount: 0,
    last_action_at: null,
  };
}

module.exports = {
  log,
  getLogs,
  countLogs,
  getCashierSummary,
};

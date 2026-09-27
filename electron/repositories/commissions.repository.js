const { db } = require('../database/db');

/**
 * Commissions & Incentives Repository
 * SQL Queries for Commission Rules, Employee Earnings, and Payout Settlements
 */

// --- COMMISSION RULES ---

function createRule(data) {
  const { title, target_type, target_id, calculation_type, rate_value = 0, min_sales_threshold = 0, is_active = 1, description } = data;
  const result = db.prepare(`
    INSERT INTO commission_rules (title, target_type, target_id, calculation_type, rate_value, min_sales_threshold, is_active, description)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(title, target_type, target_id || null, calculation_type, rate_value, min_sales_threshold, is_active ? 1 : 0, description || null);

  return result.lastInsertRowid;
}

function getAllRules() {
  return db.prepare(`
    SELECT 
      r.*,
      p.name AS product_name,
      cat.name AS category_name,
      u.username AS employee_name
    FROM commission_rules r
    LEFT JOIN products p ON r.target_type = 'product' AND r.target_id = p.id
    LEFT JOIN categories cat ON r.target_type = 'category' AND r.target_id = cat.id
    LEFT JOIN users u ON r.target_type = 'employee' AND r.target_id = u.id
    ORDER BY r.created_at DESC
  `).all();
}

function getActiveRules() {
  return db.prepare("SELECT * FROM commission_rules WHERE is_active = 1").all();
}

function getRuleById(id) {
  return db.prepare("SELECT * FROM commission_rules WHERE id = ?").get(id);
}

function updateRule(id, data) {
  const { title, target_type, target_id, calculation_type, rate_value, min_sales_threshold, is_active, description } = data;
  db.prepare(`
    UPDATE commission_rules 
    SET title = ?, target_type = ?, target_id = ?, calculation_type = ?, rate_value = ?, min_sales_threshold = ?, is_active = ?, description = ?
    WHERE id = ?
  `).run(title, target_type, target_id || null, calculation_type, rate_value, min_sales_threshold, is_active ? 1 : 0, description || null, id);

  return getRuleById(id);
}

function toggleRuleActive(id) {
  db.prepare("UPDATE commission_rules SET is_active = CASE WHEN is_active = 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
  return getRuleById(id);
}

function deleteRule(id) {
  db.prepare("DELETE FROM commission_rules WHERE id = ?").run(id);
  return true;
}

// --- COMMISSION EARNINGS ---

function recordEarning(data) {
  const { user_id, rule_id, sale_id, payment_id, base_amount, commission_amount, status = 'pending' } = data;
  if (!user_id || commission_amount <= 0) return null;

  const result = db.prepare(`
    INSERT INTO commission_earnings (user_id, rule_id, sale_id, payment_id, base_amount, commission_amount, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(user_id, rule_id || null, sale_id || null, payment_id || null, base_amount || 0, commission_amount, status);

  return result.lastInsertRowid;
}

function cancelEarningsBySaleId(saleId) {
  db.prepare("UPDATE commission_earnings SET status = 'cancelled' WHERE sale_id = ?").run(saleId);
}

function getAllEarnings(filters = {}) {
  const { user_id, status, limit = 100, offset = 0 } = filters;

  let query = `
    SELECT 
      e.*,
      u.username,
      r.title AS rule_title,
      r.target_type AS rule_target_type
    FROM commission_earnings e
    JOIN users u ON e.user_id = u.id
    LEFT JOIN commission_rules r ON e.rule_id = r.id
    WHERE 1=1
  `;

  const params = [];

  if (user_id) {
    query += ` AND e.user_id = ?`;
    params.push(user_id);
  }
  if (status) {
    query += ` AND e.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY e.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

// --- PAYOUT SETTLEMENTS ---

function createPayout(userId, amount, paymentMethod = 'cash', notes = null, paidByUserId = null) {
  const pendingEarnings = db.prepare(`
    SELECT id, commission_amount 
    FROM commission_earnings 
    WHERE user_id = ? AND status = 'pending'
  `).all(userId);

  if (!pendingEarnings || pendingEarnings.length === 0) {
    throw new Error('لا توجد عمولات معلقة مستحقة للصرف لهذا الموظف');
  }

  const payoutTx = db.transaction(() => {
    const totalPending = pendingEarnings.reduce((acc, curr) => acc + curr.commission_amount, 0);
    const payoutAmount = amount || totalPending;

    const payoutRes = db.prepare(`
      INSERT INTO commission_payouts (user_id, total_amount, payment_method, notes, paid_by_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(userId, payoutAmount, paymentMethod, notes || null, paidByUserId || null);

    const payoutId = payoutRes.lastInsertRowid;

    // Mark pending earnings as paid
    db.prepare(`
      UPDATE commission_earnings 
      SET status = 'paid', payout_id = ? 
      WHERE user_id = ? AND status = 'pending'
    `).run(payoutId, userId);

    return payoutId;
  });

  return payoutTx();
}

function getSummaryKPIs() {
  const summary = db.prepare(`
    SELECT 
      COUNT(DISTINCT e.user_id) AS employees_count,
      SUM(CASE WHEN e.status = 'pending' THEN e.commission_amount ELSE 0 END) AS pending_total,
      SUM(CASE WHEN e.status = 'paid' THEN e.commission_amount ELSE 0 END) AS paid_total,
      (SELECT COUNT(*) FROM commission_rules WHERE is_active = 1) AS active_rules_count
    FROM commission_earnings e
  `).get();

  const employeeSummaries = db.prepare(`
    SELECT 
      u.id AS user_id,
      u.username,
      SUM(CASE WHEN e.status = 'pending' THEN e.commission_amount ELSE 0 END) AS pending_amount,
      SUM(CASE WHEN e.status = 'paid' THEN e.commission_amount ELSE 0 END) AS paid_amount,
      COUNT(e.id) AS total_commission_entries
    FROM users u
    LEFT JOIN commission_earnings e ON u.id = e.user_id
    GROUP BY u.id, u.username
    HAVING pending_amount > 0 OR paid_amount > 0
  `).all();

  return {
    ...summary,
    employees: employeeSummaries || []
  };
}

module.exports = {
  createRule,
  getAllRules,
  getActiveRules,
  getRuleById,
  updateRule,
  toggleRuleActive,
  deleteRule,
  recordEarning,
  cancelEarningsBySaleId,
  getAllEarnings,
  createPayout,
  getSummaryKPIs
};

const { db } = require('../database/db');

/**
 * Payroll Repository
 * التعامل مع جداول مسيرات الرواتب، بنود رواتب الموظفين، والسلف
 */

function getAllPayrollPeriods() {
  return db.prepare(`
    SELECT 
      p.*,
      u.full_name as created_by_name,
      COUNT(i.id) as employee_count,
      SUM(CASE WHEN i.payment_status = 'paid' THEN 1 ELSE 0 END) as paid_count
    FROM payroll_periods p
    LEFT JOIN users u ON p.created_by = u.id
    LEFT JOIN payroll_items i ON p.id = i.payroll_period_id
    GROUP BY p.id
    ORDER BY p.year DESC, p.month DESC, p.id DESC
  `).all();
}

function getPayrollPeriodById(id) {
  return db.prepare(`
    SELECT p.*, u.full_name as created_by_name
    FROM payroll_periods p
    LEFT JOIN users u ON p.created_by = u.id
    WHERE p.id = ?
  `).get(id);
}

function getPayrollItems(payrollPeriodId) {
  return db.prepare(`
    SELECT 
      i.*,
      u.username,
      u.full_name,
      u.job_title,
      u.phone,
      u.pay_type
    FROM payroll_items i
    JOIN users u ON i.user_id = u.id
    WHERE i.payroll_period_id = ?
    ORDER BY u.full_name ASC
  `).all(payrollPeriodId);
}

function getPayrollItemById(itemId) {
  return db.prepare(`
    SELECT 
      i.*,
      p.period_name,
      p.month,
      p.year,
      u.username,
      u.full_name,
      u.job_title,
      u.phone,
      u.pay_type
    FROM payroll_items i
    JOIN payroll_periods p ON i.payroll_period_id = p.id
    JOIN users u ON i.user_id = u.id
    WHERE i.id = ?
  `).get(itemId);
}

function createPayrollPeriod({ period_name, month, year, start_date, end_date, created_by, notes }) {
  const stmt = db.prepare(`
    INSERT INTO payroll_periods (period_name, month, year, start_date, end_date, created_by, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(period_name, month, year, start_date, end_date, created_by || null, notes || '');
  return result.lastInsertRowid;
}

function insertPayrollItem(item) {
  const stmt = db.prepare(`
    INSERT INTO payroll_items (
      payroll_period_id, user_id, basic_salary, housing_allowance, transport_allowance,
      other_allowances, commissions_amount, overtime_amount, bonus_amount,
      deductions_amount, absent_days, absent_deduction, advances_deducted, net_salary
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return stmt.run(
    item.payroll_period_id,
    item.user_id,
    item.basic_salary || 0,
    item.housing_allowance || 0,
    item.transport_allowance || 0,
    item.other_allowances || 0,
    item.commissions_amount || 0,
    item.overtime_amount || 0,
    item.bonus_amount || 0,
    item.deductions_amount || 0,
    item.absent_days || 0,
    item.absent_deduction || 0,
    item.advances_deducted || 0,
    item.net_salary || 0
  );
}

function updatePayrollPeriodTotals(payrollPeriodId) {
  const totals = db.prepare(`
    SELECT 
      COALESCE(SUM(basic_salary), 0) as total_basic,
      COALESCE(SUM(housing_allowance + transport_allowance + other_allowances + overtime_amount + bonus_amount), 0) as total_allowances,
      COALESCE(SUM(commissions_amount), 0) as total_commissions,
      COALESCE(SUM(deductions_amount + absent_deduction + advances_deducted), 0) as total_deductions,
      COALESCE(SUM(net_salary), 0) as total_net
    FROM payroll_items
    WHERE payroll_period_id = ?
  `).get(payrollPeriodId);

  db.prepare(`
    UPDATE payroll_periods
    SET total_basic = ?, total_allowances = ?, total_commissions = ?, total_deductions = ?, total_net = ?
    WHERE id = ?
  `).run(
    totals.total_basic,
    totals.total_allowances,
    totals.total_commissions,
    totals.total_deductions,
    totals.total_net,
    payrollPeriodId
  );
}

function updatePayrollItemPayment(itemId, { payment_status, payment_method, paid_amount, payment_notes }) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE payroll_items
    SET payment_status = ?, payment_method = ?, paid_amount = ?, paid_at = ?, payment_notes = ?
    WHERE id = ?
  `).run(payment_status, payment_method, paid_amount, now, payment_notes || '', itemId);

  // تحديث حالة المسير العام إذا تم صرف كل البنود
  const item = getPayrollItemById(itemId);
  if (item) {
    const unpaids = db.prepare(`
      SELECT COUNT(*) as count FROM payroll_items 
      WHERE payroll_period_id = ? AND payment_status != 'paid'
    `).get(item.payroll_period_id);

    if (unpaids.count === 0) {
      db.prepare(`UPDATE payroll_periods SET status = 'paid' WHERE id = ?`).run(item.payroll_period_id);
    }
  }
}

function updatePayrollPeriodStatus(id, status) {
  const approvedAt = status === 'approved' ? new Date().toISOString() : null;
  db.prepare(`
    UPDATE payroll_periods
    SET status = ?, approved_at = COALESCE(?, approved_at)
    WHERE id = ?
  `).run(status, approvedAt, id);
}

function deletePayrollPeriod(id) {
  return db.prepare('DELETE FROM payroll_periods WHERE id = ?').run(id);
}

// --- سلف الموظفين ---
function getAllAdvances(userId = null) {
  if (userId) {
    return db.prepare(`
      SELECT a.*, u.full_name, u.username
      FROM salary_advances a
      JOIN users u ON a.user_id = u.id
      WHERE a.user_id = ?
      ORDER BY a.request_date DESC
    `).all(userId);
  }
  return db.prepare(`
    SELECT a.*, u.full_name, u.username
    FROM salary_advances a
    JOIN users u ON a.user_id = u.id
    ORDER BY a.request_date DESC
  `).all();
}

function createAdvance({ user_id, amount, request_date, reason }) {
  const stmt = db.prepare(`
    INSERT INTO salary_advances (user_id, amount, request_date, reason)
    VALUES (?, ?, ?, ?)
  `);
  return stmt.run(user_id, amount, request_date, reason || '');
}

function updateAdvanceStatus(advanceId, status, deductedPayrollId = null) {
  db.prepare(`
    UPDATE salary_advances
    SET status = ?, deducted_in_payroll_id = COALESCE(?, deducted_in_payroll_id)
    WHERE id = ?
  `).run(status, deductedPayrollId, advanceId);
}

module.exports = {
  getAllPayrollPeriods,
  getPayrollPeriodById,
  getPayrollItems,
  getPayrollItemById,
  createPayrollPeriod,
  insertPayrollItem,
  updatePayrollPeriodTotals,
  updatePayrollItemPayment,
  updatePayrollPeriodStatus,
  deletePayrollPeriod,
  getAllAdvances,
  createAdvance,
  updateAdvanceStatus,
};

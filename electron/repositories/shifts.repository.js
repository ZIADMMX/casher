const { db } = require('../database/db');

function getCurrentOpenShift() {
  return db.prepare(`
    SELECT s.*, u.username as cashier_username
    FROM shifts s
    JOIN users u ON u.id = s.user_id
    WHERE s.status = 'open'
    ORDER BY s.id DESC
    LIMIT 1
  `).get() || null;
}

function getLastClosedShift() {
  return db.prepare(`
    SELECT s.*, u.username as cashier_username, cu.username as closed_by_username
    FROM shifts s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users cu ON cu.id = s.closed_by_user_id
    WHERE s.status = 'closed'
    ORDER BY s.id DESC
    LIMIT 1
  `).get() || null;
}

function openShift({ userId, openedByName, openingCash, shiftType = 'morning', posStation = 'الدرج الرئيسي - POS 1', notes, openingCashBreakdown }) {
  const stmt = db.prepare(`
    INSERT INTO shifts (user_id, opened_by_name, opening_cash, shift_type, pos_station, status, opening_notes, opening_cash_breakdown)
    VALUES (?, ?, ?, ?, ?, 'open', ?, ?)
  `);
  const result = stmt.run(
    userId,
    openedByName || null,
    Number(openingCash || 0),
    shiftType || 'morning',
    posStation || 'الدرج الرئيسي - POS 1',
    notes || null,
    openingCashBreakdown ? JSON.stringify(openingCashBreakdown) : null
  );
  return getShiftDetails(result.lastInsertRowid);
}

function getShiftLiveTotals(shiftId) {
  const shift = db.prepare('SELECT * FROM shifts WHERE id = ?').get(shiftId);
  if (!shift) return null;

  const salesStats = db.prepare(`
    SELECT 
      COUNT(id) as sales_count,
      COALESCE(SUM(CASE WHEN payment_method = 'cash' THEN total_amount ELSE 0 END), 0) as cash_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'card' THEN total_amount ELSE 0 END), 0) as card_sales,
      COALESCE(SUM(CASE WHEN payment_method = 'credit' THEN total_amount ELSE 0 END), 0) as credit_sales,
      COALESCE(SUM(total_amount), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discount
    FROM sales
    WHERE shift_id = ?
  `).get(shiftId);

  const expenseStats = db.prepare(`
    SELECT 
      COUNT(id) as expense_count,
      COALESCE(SUM(amount), 0) as total_expenses
    FROM shift_expenses
    WHERE shift_id = ?
  `).get(shiftId);

  const openingCash = Number(shift.opening_cash || 0);
  const cashSales = Number(salesStats?.cash_sales || 0);
  const cardSales = Number(salesStats?.card_sales || 0);
  const creditSales = Number(salesStats?.credit_sales || 0);
  const totalSales = Number(salesStats?.total_sales || 0);
  const totalExpenses = Number(expenseStats?.total_expenses || 0);
  const salesCount = Number(salesStats?.sales_count || 0);
  const expectedCash = Math.round((openingCash + cashSales - totalExpenses) * 100) / 100;

  return {
    shiftId,
    openingCash,
    cashSales,
    cardSales,
    creditSales,
    totalSales,
    totalExpenses,
    salesCount,
    expenseCount: Number(expenseStats?.expense_count || 0),
    expectedCash,
    status: shift.status,
  };
}

function closeShift({ shiftId, actualCash, cashBreakdown, notes, closedByUserId }) {
  const liveTotals = getShiftLiveTotals(shiftId);
  if (!liveTotals) throw new Error('الوردية غير موجودة');

  const actual = Number(actualCash || 0);
  const expected = liveTotals.expectedCash;
  const difference = Math.round((actual - expected) * 100) / 100;

  const runTx = db.transaction(() => {
    db.prepare(`
      UPDATE shifts
      SET 
        end_time = CURRENT_TIMESTAMP,
        status = 'closed',
        total_cash_sales = ?,
        total_card_sales = ?,
        total_credit_sales = ?,
        total_expenses = ?,
        expected_cash = ?,
        actual_cash = ?,
        cash_difference = ?,
        cash_breakdown = ?,
        closing_notes = ?,
        closed_by_user_id = ?
      WHERE id = ?
    `).run(
      liveTotals.cashSales,
      liveTotals.cardSales,
      liveTotals.creditSales,
      liveTotals.totalExpenses,
      expected,
      actual,
      difference,
      cashBreakdown ? JSON.stringify(cashBreakdown) : null,
      notes || null,
      closedByUserId || null,
      shiftId
    );
  });

  runTx();
  return getShiftDetails(shiftId);
}

function addShiftExpense({ shiftId, userId, amount, category, notes }) {
  const stmt = db.prepare(`
    INSERT INTO shift_expenses (shift_id, user_id, amount, category, notes)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(shiftId, userId, Number(amount), category, notes || null);
  return result.lastInsertRowid;
}

function getShiftExpenses(shiftId) {
  return db.prepare(`
    SELECT se.*, u.username as user_name
    FROM shift_expenses se
    JOIN users u ON u.id = se.user_id
    WHERE se.shift_id = ?
    ORDER BY se.id DESC
  `).all(shiftId);
}

function getAllShifts({ limit = 50, offset = 0, status, userId, startDate, endDate } = {}) {
  const clauses = [];
  const params = [];
  const baseQuery = `
    SELECT 
      s.*, 
      u.username as cashier_username,
      cu.username as closed_by_username,
      (SELECT COUNT(id) FROM sales WHERE shift_id = s.id) as sales_count,
      (SELECT COUNT(id) FROM shift_expenses WHERE shift_id = s.id) as expense_count
    FROM shifts s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users cu ON cu.id = s.closed_by_user_id
  `;

  if (status) {
    clauses.push('s.status = ?');
    params.push(status);
  }
  if (userId) {
    clauses.push('s.user_id = ?');
    params.push(userId);
  }
  if (startDate) {
    clauses.push('DATE(s.start_time) >= DATE(?)');
    params.push(startDate);
  }
  if (endDate) {
    clauses.push('DATE(s.start_time) <= DATE(?)');
    params.push(endDate);
  }

  const query = [
    baseQuery,
    clauses.length ? `WHERE ${clauses.join(' AND ')}` : '',
    'ORDER BY s.id DESC LIMIT ? OFFSET ?',
  ].filter(Boolean).join(' ');
  params.push(Number(limit), Number(offset));

  return db.prepare(query).all(...params);
}

function getShiftDetails(shiftId) {
  const shift = db.prepare(`
    SELECT 
      s.*, 
      u.username as cashier_username,
      cu.username as closed_by_username
    FROM shifts s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN users cu ON cu.id = s.closed_by_user_id
    WHERE s.id = ?
  `).get(shiftId);

  if (!shift) return null;

  const liveTotals = getShiftLiveTotals(shiftId);
  const expenses = getShiftExpenses(shiftId);
  const sales = db.prepare(`
    SELECT id, customer_name, total_amount, payment_method, discount, created_at
    FROM sales
    WHERE shift_id = ?
    ORDER BY id DESC
  `).all(shiftId);

  return {
    ...shift,
    liveTotals,
    expenses,
    sales,
    cashBreakdownParsed: shift.cash_breakdown ? JSON.parse(shift.cash_breakdown) : null,
    openingCashBreakdownParsed: shift.opening_cash_breakdown ? JSON.parse(shift.opening_cash_breakdown) : null,
  };
}

function getShiftsKPIs() {
  const stats = db.prepare(`
    SELECT 
      COUNT(CASE WHEN status = 'closed' THEN 1 END) as closed_shifts_count,
      COALESCE(SUM(CASE WHEN status = 'closed' THEN total_cash_sales + total_card_sales + total_credit_sales ELSE 0 END), 0) as total_sales_volume,
      COALESCE(SUM(CASE WHEN status = 'closed' AND cash_difference < 0 THEN ABS(cash_difference) ELSE 0 END), 0) as total_shortage,
      COALESCE(SUM(CASE WHEN status = 'closed' AND cash_difference > 0 THEN cash_difference ELSE 0 END), 0) as total_overage,
      COALESCE(SUM(CASE WHEN status = 'closed' THEN total_expenses ELSE 0 END), 0) as total_expenses_amount
    FROM shifts
  `).get();

  const activeShift = getCurrentOpenShift();

  return {
    closedShiftsCount: stats?.closed_shifts_count || 0,
    totalSalesVolume: Math.round((stats?.total_sales_volume || 0) * 100) / 100,
    totalShortage: Math.round((stats?.total_shortage || 0) * 100) / 100,
    totalOverage: Math.round((stats?.total_overage || 0) * 100) / 100,
    totalExpensesAmount: Math.round((stats?.total_expenses_amount || 0) * 100) / 100,
    hasActiveShift: !!activeShift,
    activeShift,
  };
}

module.exports = {
  getCurrentOpenShift,
  getLastClosedShift,
  openShift,
  getShiftLiveTotals,
  closeShift,
  addShiftExpense,
  getShiftExpenses,
  getAllShifts,
  getShiftDetails,
  getShiftsKPIs,
};

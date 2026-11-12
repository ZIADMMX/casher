// Daily docket, law-firm dashboard and reports, per-case financial breakdown.
const { db } = require('../../database/db');
const { getAllUpcomingSessions } = require('./sessions');
const { getUpcomingDeadlines } = require('./tasks');

function getDailyDocket(targetDate = null) {
  const d = targetDate || new Date().toISOString().split('T')[0];
  return db.prepare(`
    SELECT 
      s.*,
      c.case_number,
      c.court_name,
      c.circuit_name,
      c.subject as case_subject,
      cust.name as client_name,
      c.opponent_name,
      u.full_name as assigned_lawyer_name
    FROM court_sessions s
    JOIN legal_cases c ON s.case_id = c.id
    LEFT JOIN customers cust ON c.client_id = cust.id
    LEFT JOIN users u ON s.assigned_lawyer_id = u.id
    WHERE date(s.session_date) = date(?)
    ORDER BY c.court_name ASC, s.session_date ASC
  `).all(d);
}

function getLawFirmDashboard(targetDate, nextWeekEndDate) {
  const caseStats = db.prepare(`
    SELECT
      SUM(CASE WHEN status IN ('active', 'adjourned') THEN 1 ELSE 0 END) AS active_cases,
      COALESCE(SUM(CASE WHEN status IN ('active', 'adjourned')
        THEN MAX(contract_amount - paid_amount, 0) ELSE 0 END), 0) AS outstanding_fees
    FROM legal_cases
  `).get();
  const sessionStats = db.prepare(`
    SELECT
      SUM(CASE WHEN date(session_date, 'localtime') = date(?) THEN 1 ELSE 0 END) AS today_sessions,
      SUM(CASE WHEN status = 'scheduled' AND date(session_date, 'localtime') = date(?) THEN 1 ELSE 0 END) AS scheduled_today,
      SUM(CASE WHEN status = 'scheduled' AND date(session_date, 'localtime') BETWEEN date(?) AND date(?) THEN 1 ELSE 0 END) AS upcoming_week,
      SUM(CASE WHEN status = 'scheduled' AND date(session_date, 'localtime') < date(?) THEN 1 ELSE 0 END) AS overdue_sessions
    FROM court_sessions
  `).get(targetDate, targetDate, targetDate, nextWeekEndDate, targetDate);
  const financialStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'fee_payment' THEN amount ELSE 0 END), 0) AS fees_collected,
      COALESCE(SUM(CASE WHEN type = 'retainer_deposit' THEN amount ELSE 0 END), 0) AS client_deposits,
      COALESCE(SUM(CASE WHEN type NOT IN ('fee_payment', 'retainer_deposit') THEN amount ELSE 0 END), 0) AS court_expenses,
      COUNT(*) AS movement_count
    FROM case_financials
    WHERE date(date, 'localtime') = date(?)
  `).get(targetDate);
  const financialMovements = db.prepare(`
    SELECT f.id, f.case_id, f.type, f.amount, f.date, f.description, f.receipt_number,
      c.case_number, c.court_name, cust.name AS client_name
    FROM case_financials f
    JOIN legal_cases c ON c.id = f.case_id
    LEFT JOIN customers cust ON cust.id = c.client_id
    WHERE date(f.date, 'localtime') = date(?)
    ORDER BY f.date DESC, f.id DESC
    LIMIT 20
  `).all(targetDate);

  return {
    date: targetDate,
    caseStats,
    sessionStats,
    financialStats,
    todaySessions: getDailyDocket(targetDate),
    upcomingSessions: getAllUpcomingSessions({
      startDate: targetDate,
      endDate: nextWeekEndDate,
      status: 'scheduled',
    }),
    financialMovements,
    criticalDeadlines: getUpcomingDeadlines(targetDate, 8),
  };
}

function getLawFirmReport(startDate, endDate) {
  const caseStats = db.prepare(`
    SELECT
      COUNT(*) AS total_cases,
      SUM(CASE WHEN status IN ('active', 'adjourned') THEN 1 ELSE 0 END) AS active_cases,
      SUM(CASE WHEN status = 'judged' THEN 1 ELSE 0 END) AS judged_cases,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) AS closed_cases,
      COALESCE(SUM(contract_amount), 0) AS contract_value,
      COALESCE((SELECT SUM(amount) FROM case_financials WHERE type = 'fee_payment'), 0) AS fees_collected_total
    FROM legal_cases
  `).get();
  const periodStats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM legal_cases
        WHERE date(created_at, 'localtime') BETWEEN date(?) AND date(?)) AS new_cases,
      (SELECT COUNT(*) FROM court_sessions
        WHERE date(session_date, 'localtime') BETWEEN date(?) AND date(?)) AS total_sessions,
      (SELECT COUNT(*) FROM court_sessions
        WHERE status = 'scheduled'
          AND date(session_date, 'localtime') BETWEEN date(?) AND date(?)) AS scheduled_sessions,
      (SELECT COUNT(*) FROM court_sessions
        WHERE status = 'postponed'
          AND date(session_date, 'localtime') BETWEEN date(?) AND date(?)) AS postponed_sessions,
      (SELECT COUNT(*) FROM court_sessions
        WHERE status = 'judged'
          AND date(session_date, 'localtime') BETWEEN date(?) AND date(?)) AS judged_sessions
  `).get(startDate, endDate, startDate, endDate, startDate, endDate,
    startDate, endDate, startDate, endDate);
  const financialStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN type = 'fee_payment' THEN amount ELSE 0 END), 0) AS fees_collected,
      COALESCE(SUM(CASE WHEN type = 'retainer_deposit' THEN amount ELSE 0 END), 0) AS client_deposits,
      COALESCE(SUM(CASE WHEN type NOT IN ('fee_payment', 'retainer_deposit') THEN amount ELSE 0 END), 0) AS court_expenses,
      COALESCE(SUM(CASE WHEN type NOT IN ('fee_payment', 'retainer_deposit')
        AND paid_by_client = 1 THEN amount ELSE 0 END), 0) AS expenses_paid_from_retainer,
      COALESCE(SUM(CASE WHEN type NOT IN ('fee_payment', 'retainer_deposit')
        AND paid_by_client = 0 THEN amount ELSE 0 END), 0) AS expenses_paid_by_office,
      COUNT(*) AS movement_count
    FROM case_financials
    WHERE date(date, 'localtime') BETWEEN date(?) AND date(?)
  `).get(startDate, endDate);
  const courtBreakdown = db.prepare(`
    SELECT c.court_name, COUNT(s.id) AS sessions_count,
      SUM(CASE WHEN s.status = 'scheduled' THEN 1 ELSE 0 END) AS scheduled_count,
      SUM(CASE WHEN s.status = 'postponed' THEN 1 ELSE 0 END) AS postponed_count,
      SUM(CASE WHEN s.status = 'judged' THEN 1 ELSE 0 END) AS judged_count
    FROM court_sessions s
    JOIN legal_cases c ON c.id = s.case_id
    WHERE date(s.session_date, 'localtime') BETWEEN date(?) AND date(?)
    GROUP BY c.court_name
    ORDER BY sessions_count DESC, c.court_name COLLATE NOCASE
  `).all(startDate, endDate);
  const financialMovements = db.prepare(`
    SELECT f.id, f.type, f.amount, f.date, f.description, f.receipt_number,
      f.paid_by_client,
      c.case_number, c.court_name, cust.name AS client_name,
      u.full_name AS recorded_by_name
    FROM case_financials f
    LEFT JOIN legal_cases c ON c.id = f.case_id
    LEFT JOIN customers cust ON cust.id = c.client_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE date(f.date, 'localtime') BETWEEN date(?) AND date(?)
    ORDER BY f.date DESC, f.id DESC
  `).all(startDate, endDate);

  return {
    startDate,
    endDate,
    caseStats,
    periodStats,
    financialStats,
    courtBreakdown,
    financialMovements,
  };
}

function getCaseFinancialBreakdown(caseId) {
  const c = db.prepare(`
    SELECT id, contract_amount, paid_amount, billing_type, hourly_rate
    FROM legal_cases
    WHERE id = ?
  `).get(caseId);

  if (!c) return null;

  const finStats = db.prepare(`
    SELECT 
      COALESCE(SUM(CASE WHEN type = 'retainer_deposit' THEN amount ELSE 0 END), 0) as total_retainers,
      COALESCE(SUM(CASE WHEN type = 'fee_payment' THEN amount ELSE 0 END), 0) as total_fee_payments,
      COALESCE(SUM(CASE WHEN type NOT IN ('retainer_deposit', 'fee_payment') THEN amount ELSE 0 END), 0) as total_court_expenses,
      COALESCE(SUM(CASE WHEN type NOT IN ('retainer_deposit', 'fee_payment') AND paid_by_client = 1 THEN amount ELSE 0 END), 0) as expenses_paid_from_retainer,
      COALESCE(SUM(CASE WHEN type NOT IN ('retainer_deposit', 'fee_payment') AND paid_by_client = 0 THEN amount ELSE 0 END), 0) as expenses_paid_by_office
    FROM case_financials
    WHERE case_id = ?
  `).get(caseId);

  const timeStats = db.prepare(`
    SELECT 
      COALESCE(SUM(hours), 0) as total_hours,
      COALESCE(SUM(total_amount), 0) as total_time_amount,
      COUNT(*) as logs_count
    FROM lawyer_time_logs
    WHERE case_id = ?
  `).get(caseId);

  const contractAmount = Number(c.contract_amount || 0);
  const recordedPaidAmount = Number(c.paid_amount || 0);
  const paidAmount = Number(finStats.total_fee_payments || 0);
  const remainingFees = Math.max(0, contractAmount - paidAmount);
  const totalRetainers = Number(finStats.total_retainers || 0);
  const totalExpenses = Number(finStats.total_court_expenses || 0);
  const expensesPaidFromRetainer = Number(finStats.expenses_paid_from_retainer || 0);
  const retainerBalance = totalRetainers - expensesPaidFromRetainer;

  return {
    contract_amount: contractAmount,
    paid_amount: paidAmount,
    recorded_paid_amount: recordedPaidAmount,
    fee_payment_discrepancy: recordedPaidAmount - paidAmount,
    remaining_fees: remainingFees,
    total_retainers: totalRetainers,
    total_court_expenses: totalExpenses,
    expenses_paid_from_retainer: expensesPaidFromRetainer,
    expenses_paid_by_office: Number(finStats.expenses_paid_by_office || 0),
    retainer_balance: retainerBalance,
    total_logged_hours: Number(timeStats.total_hours || 0),
    total_time_billing: Number(timeStats.total_time_amount || 0),
    time_logs_count: timeStats.logs_count,
  };
}

module.exports = {
  getDailyDocket,
  getLawFirmDashboard,
  getLawFirmReport,
  getCaseFinancialBreakdown,
};

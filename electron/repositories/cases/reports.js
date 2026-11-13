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
      c.case_type,
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
    // Open work due by this day (overdue included) plus what was already ticked off for it.
    todayTasks: db.prepare(`
      SELECT t.id, t.case_id, t.title, t.due_at, t.status, t.priority,
        s.session_date, c.case_number,
        CAST(julianday(date(t.due_at)) - julianday(date(?)) AS INTEGER) AS days_offset
      FROM legal_case_tasks t
      JOIN legal_cases c ON c.id = t.case_id
      LEFT JOIN court_sessions s ON s.id = t.session_id
      WHERE t.kind != 'deadline'
        AND c.status != 'closed'
        AND ((t.status IN ('pending', 'in_progress') AND date(t.due_at) <= date(?))
          OR (t.status = 'completed' AND date(t.due_at) = date(?)))
      ORDER BY t.status = 'completed', t.due_at ASC, t.id ASC
      LIMIT 12
    `).all(targetDate, targetDate, targetDate),
  };
}

const EXPENSE = "f.type NOT IN ('fee_payment', 'retainer_deposit')";

// "AND ..." fragment narrowing rows of legal_cases (alias c) to one court and/or client.
function caseFilter({ courtName, clientId } = {}) {
  const parts = [];
  const args = [];
  if (courtName) { parts.push('c.court_name = ?'); args.push(courtName); }
  if (clientId) { parts.push('c.client_id = ?'); args.push(clientId); }
  return { sql: parts.map((part) => ` AND ${part}`).join(''), args };
}

// The same-length window right before the report period, for the "+N / +x%" deltas.
function previousRange(startDate, endDate) {
  const day = 86400000;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const length = Math.round((Date.parse(`${endDate}T00:00:00Z`) - start) / day) + 1;
  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);
  return { startDate: iso(start - length * day), endDate: iso(start - day), days: length };
}

function getPeriodFigures(startDate, endDate, filter) {
  const range = [startDate, endDate, ...filter.args];
  const periodStats = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM legal_cases c
        WHERE date(c.created_at, 'localtime') BETWEEN date(?) AND date(?)${filter.sql}) AS new_cases,
      s.total_sessions, s.scheduled_sessions, s.postponed_sessions, s.attended_sessions,
      s.judged_sessions, s.favorable_verdicts
    FROM (
      SELECT
        COUNT(*) AS total_sessions,
        COALESCE(SUM(s.status = 'scheduled'), 0) AS scheduled_sessions,
        COALESCE(SUM(s.status = 'postponed'), 0) AS postponed_sessions,
        COALESCE(SUM(s.status = 'attended'), 0) AS attended_sessions,
        COALESCE(SUM(s.status = 'judged'), 0) AS judged_sessions,
        COALESCE(SUM(s.status = 'judged' AND c.verdict_result = 'favorable'), 0) AS favorable_verdicts
      FROM court_sessions s
      JOIN legal_cases c ON c.id = s.case_id
      WHERE date(s.session_date, 'localtime') BETWEEN date(?) AND date(?)${filter.sql}
    ) s
  `).get(...range, ...range);
  const financialStats = db.prepare(`
    SELECT
      COALESCE(SUM(CASE WHEN f.type = 'fee_payment' THEN f.amount ELSE 0 END), 0) AS fees_collected,
      COALESCE(SUM(CASE WHEN f.type = 'retainer_deposit' THEN f.amount ELSE 0 END), 0) AS client_deposits,
      COALESCE(SUM(CASE WHEN ${EXPENSE} THEN f.amount ELSE 0 END), 0) AS court_expenses,
      COALESCE(SUM(CASE WHEN ${EXPENSE} AND f.paid_by_client = 1 THEN f.amount ELSE 0 END), 0) AS expenses_paid_from_retainer,
      COALESCE(SUM(CASE WHEN ${EXPENSE} AND f.paid_by_client = 0 THEN f.amount ELSE 0 END), 0) AS expenses_paid_by_office,
      COUNT(DISTINCT CASE WHEN f.type = 'retainer_deposit' THEN c.client_id END) AS deposit_clients,
      COUNT(*) AS movement_count
    FROM case_financials f
    LEFT JOIN legal_cases c ON c.id = f.case_id
    WHERE date(f.date, 'localtime') BETWEEN date(?) AND date(?)${filter.sql}
  `).get(...range);
  // Client retainers are the client's money, so only office-paid expenses come out of the office's income.
  financialStats.office_net = financialStats.fees_collected - financialStats.expenses_paid_by_office;
  return { periodStats, financialStats };
}

function getLawFirmReport(startDate, endDate, filters = {}, today = endDate) {
  const filter = caseFilter(filters);
  const range = [startDate, endDate, ...filter.args];
  const { periodStats, financialStats } = getPeriodFigures(startDate, endDate, filter);
  const previous = previousRange(startDate, endDate);

  const caseStats = db.prepare(`
    SELECT
      COUNT(*) AS total_cases,
      COALESCE(SUM(c.status IN ('active', 'adjourned')), 0) AS active_cases,
      COALESCE(SUM(c.status = 'judged'), 0) AS judged_cases,
      COALESCE(SUM(c.status = 'closed'), 0) AS closed_cases,
      COALESCE(SUM(c.contract_amount), 0) AS contract_value,
      COALESCE((SELECT SUM(f.amount) FROM case_financials f JOIN legal_cases c ON c.id = f.case_id
        WHERE f.type = 'fee_payment'${filter.sql}), 0) AS fees_collected_total
    FROM legal_cases c
    WHERE 1 = 1${filter.sql}
  `).get(...filter.args, ...filter.args);

  // Office-wide position today, not limited to the period.
  const office = db.prepare(`
    SELECT
      COALESCE((SELECT SUM(CASE WHEN f.type = 'retainer_deposit' THEN f.amount
          WHEN ${EXPENSE} AND f.paid_by_client = 1 THEN -f.amount ELSE 0 END)
        FROM case_financials f JOIN legal_cases c ON c.id = f.case_id WHERE 1 = 1${filter.sql}), 0) AS retainer_balance,
      COALESCE((SELECT SUM(MAX(c.contract_amount - c.paid_amount, 0)) FROM legal_cases c
        WHERE c.status IN ('active', 'adjourned')${filter.sql}), 0) AS overdue_fees,
      (SELECT COUNT(DISTINCT c.client_id) FROM legal_cases c
        WHERE c.status IN ('active', 'adjourned') AND c.contract_amount > c.paid_amount${filter.sql}) AS overdue_clients,
      (SELECT COUNT(DISTINCT cust.id) FROM legal_cases c JOIN customers cust ON cust.id = c.client_id
        WHERE COALESCE(CASE WHEN json_valid(cust.legal_profile)
          THEN json_extract(cust.legal_profile, '$.national_id') END, '') = ''${filter.sql}) AS missing_national_id,
      (SELECT COUNT(*) FROM customer_power_of_attorneys p
        WHERE p.expires_at IS NOT NULL AND date(p.expires_at) BETWEEN date(?) AND date(?, '+30 days')
          AND p.customer_id IN (SELECT c.client_id FROM legal_cases c WHERE 1 = 1${filter.sql})) AS poa_expiring,
      (SELECT COUNT(*) FROM legal_case_tasks t JOIN legal_cases c ON c.id = t.case_id
        WHERE t.kind = 'deadline' AND t.status IN ('pending', 'in_progress') AND c.status != 'closed'
          AND date(t.due_at) <= date(?, '+30 days')${filter.sql}) AS appeal_deadlines
  `).get(
    ...filter.args, ...filter.args, ...filter.args, ...filter.args,
    today, today, ...filter.args, today, ...filter.args,
  );

  const courtBreakdown = db.prepare(`
    SELECT c.court_name, COUNT(s.id) AS sessions_count,
      COALESCE(SUM(s.status = 'scheduled'), 0) AS scheduled_count,
      COALESCE(SUM(s.status = 'postponed'), 0) AS postponed_count,
      COALESCE(SUM(s.status = 'judged'), 0) AS judged_count,
      COALESCE(SUM(s.status IN ('attended', 'judged')), 0) AS held_count
    FROM court_sessions s
    JOIN legal_cases c ON c.id = s.case_id
    WHERE date(s.session_date, 'localtime') BETWEEN date(?) AND date(?)${filter.sql}
    GROUP BY c.court_name
    ORDER BY sessions_count DESC, c.court_name COLLATE NOCASE
  `).all(...range);

  const topClients = db.prepare(`
    SELECT cust.id, cust.name, SUM(f.amount) AS collected,
      (SELECT COUNT(*) FROM legal_cases x WHERE x.client_id = cust.id) AS cases_count
    FROM case_financials f
    JOIN legal_cases c ON c.id = f.case_id
    JOIN customers cust ON cust.id = c.client_id
    WHERE f.type = 'fee_payment' AND date(f.date, 'localtime') BETWEEN date(?) AND date(?)${filter.sql}
    GROUP BY cust.id
    ORDER BY collected DESC, cust.name COLLATE NOCASE
    LIMIT 5
  `).all(...range);

  const financialMovements = db.prepare(`
    SELECT f.id, f.case_id, f.type, f.amount, f.date, f.description, f.receipt_number,
      f.paid_by_client,
      c.case_number, c.court_name, c.subject AS case_subject, c.client_id, cust.name AS client_name,
      u.full_name AS recorded_by_name
    FROM case_financials f
    LEFT JOIN legal_cases c ON c.id = f.case_id
    LEFT JOIN customers cust ON cust.id = c.client_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE date(f.date, 'localtime') BETWEEN date(?) AND date(?)${filter.sql}
    ORDER BY f.date DESC, f.id DESC
  `).all(...range);

  const filterOptions = {
    courts: db.prepare(`
      SELECT DISTINCT court_name FROM legal_cases
      WHERE TRIM(COALESCE(court_name, '')) != '' ORDER BY court_name COLLATE NOCASE
    `).pluck().all(),
    clients: db.prepare(`
      SELECT DISTINCT cust.id, cust.name FROM legal_cases c
      JOIN customers cust ON cust.id = c.client_id ORDER BY cust.name COLLATE NOCASE
    `).all(),
  };

  return {
    startDate,
    endDate,
    filters: { courtName: filters.courtName || null, clientId: filters.clientId || null },
    caseStats,
    periodStats,
    financialStats,
    previous: { ...previous, ...getPeriodFigures(previous.startDate, previous.endDate, filter) },
    office,
    courtBreakdown,
    topClients,
    financialMovements,
    filterOptions,
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

// One row per law-firm client: cases, fees, latest power of attorney and last contact.
function getLegalClientsOverview(targetDate) {
  const clients = db.prepare(`
    SELECT
      c.id, c.name, c.phone, c.email, c.created_at, c.legal_profile,
      (SELECT COUNT(*) FROM legal_cases lc WHERE lc.client_id = c.id) AS cases_count,
      (SELECT COUNT(*) FROM legal_cases lc WHERE lc.client_id = c.id
        AND lc.status IN ('active', 'adjourned')) AS active_cases,
      (SELECT lc.case_type FROM legal_cases lc WHERE lc.client_id = c.id
        GROUP BY lc.case_type ORDER BY COUNT(*) DESC LIMIT 1) AS main_case_type,
      (SELECT COALESCE(SUM(lc.contract_amount), 0) FROM legal_cases lc
        WHERE lc.client_id = c.id) AS contract_total,
      (SELECT COALESCE(SUM(lc.paid_amount), 0) FROM legal_cases lc
        WHERE lc.client_id = c.id) AS paid_total,
      (SELECT COALESCE(SUM(MAX(lc.contract_amount - lc.paid_amount, 0)), 0) FROM legal_cases lc
        WHERE lc.client_id = c.id AND lc.status IN ('active', 'adjourned')) AS outstanding_fees,
      (SELECT MAX(i.created_at) FROM legal_client_interactions i
        WHERE i.customer_id = c.id) AS last_contact_at,
      (SELECT COUNT(*) FROM customer_power_of_attorneys p WHERE p.customer_id = c.id) AS powers_count,
      (SELECT p.number FROM customer_power_of_attorneys p WHERE p.customer_id = c.id
        ORDER BY (p.expires_at IS NULL) DESC, p.expires_at DESC, p.id DESC LIMIT 1) AS poa_number,
      (SELECT p.scope FROM customer_power_of_attorneys p WHERE p.customer_id = c.id
        ORDER BY (p.expires_at IS NULL) DESC, p.expires_at DESC, p.id DESC LIMIT 1) AS poa_scope,
      (SELECT p.expires_at FROM customer_power_of_attorneys p WHERE p.customer_id = c.id
        ORDER BY (p.expires_at IS NULL) DESC, p.expires_at DESC, p.id DESC LIMIT 1) AS poa_expires_at
    FROM customers c
    WHERE c.is_active = 1
    ORDER BY c.created_at DESC, c.id DESC
  `).all();

  const followUps = db.prepare(`
    SELECT i.id, i.customer_id, i.type, i.subject, i.follow_up_date, c.name AS client_name
    FROM legal_client_interactions i
    JOIN customers c ON c.id = i.customer_id
    WHERE date(i.follow_up_date) = date(?) AND c.is_active = 1
    ORDER BY i.id ASC
  `).all(targetDate);

  return { date: targetDate, clients, followUps };
}

module.exports = {
  getDailyDocket,
  getLawFirmDashboard,
  getLegalClientsOverview,
  getLawFirmReport,
  getCaseFinancialBreakdown,
};

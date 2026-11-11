// Case files: list, filter, create, update, delete and summary counts.
const { db } = require('../../database/db');
const { getSessionsByCaseId } = require('./sessions');
const { getTasksByCaseId } = require('./tasks');
const { getDocumentsByCaseId } = require('./documents');
const { getFinancialsByCaseId } = require('./financials');
const { getTimeLogsByCaseId } = require('./timeLogs');

function getCaseLawyers() {
  return db.prepare(`
    SELECT id, username, full_name, first_name, last_name, job_title
    FROM users
    WHERE is_active = 1
    ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE
  `).all();
}

// Session dates are saved as local "YYYY-MM-DDTHH:mm", so they are compared with local now.
const NEXT_SESSION_WHERE = `s.case_id = c.id AND s.status = 'scheduled'
        AND datetime(s.session_date) >= datetime('now', 'localtime')`;

function caseFilterSql({ search, status, case_type, lawyer_id, client_id } = {}, { withStatus = true } = {}) {
  let sql = '';
  const params = [];
  if (search) {
    sql += ` AND (
      c.case_number LIKE ? OR
      c.court_name LIKE ? OR
      c.subject LIKE ? OR
      c.opponent_name LIKE ? OR
      cust.name LIKE ?
    )`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }
  if (withStatus && status && status !== 'all') {
    sql += ' AND c.status = ?';
    params.push(status);
  }
  if (case_type && case_type !== 'all') {
    sql += ' AND c.case_type = ?';
    params.push(case_type);
  }
  if (lawyer_id) {
    sql += ' AND c.assigned_lawyer_id = ?';
    params.push(lawyer_id);
  }
  if (client_id) {
    sql += ' AND c.client_id = ?';
    params.push(client_id);
  }
  return { sql, params };
}

function getAllCases(filters = {}) {
  const { limit = 100, offset = 0 } = filters;
  const where = caseFilterSql(filters);
  return db.prepare(`
    SELECT
      c.*,
      cust.name as client_name,
      cust.phone as client_phone,
      u.full_name as assigned_lawyer_name,
      (SELECT COUNT(*) FROM court_sessions s WHERE s.case_id = c.id) as sessions_count,
      (SELECT s.session_date FROM court_sessions s WHERE ${NEXT_SESSION_WHERE}
        ORDER BY datetime(s.session_date) ASC LIMIT 1) as next_session_date,
      (SELECT s.session_reason FROM court_sessions s WHERE ${NEXT_SESSION_WHERE}
        ORDER BY datetime(s.session_date) ASC LIMIT 1) as next_session_reason,
      (SELECT COUNT(*) FROM case_documents d WHERE d.case_id = c.id) as documents_count,
      (SELECT COALESCE(SUM(f.amount), 0) FROM case_financials f WHERE f.case_id = c.id AND f.type = 'retainer_deposit') as total_retainers,
      (SELECT COALESCE(SUM(f.amount), 0) FROM case_financials f WHERE f.case_id = c.id AND f.type NOT IN ('retainer_deposit', 'fee_payment')) as total_expenses
    FROM legal_cases c
    LEFT JOIN customers cust ON c.client_id = cust.id
    LEFT JOIN users u ON c.assigned_lawyer_id = u.id
    WHERE 1=1 ${where.sql}
    ORDER BY c.updated_at DESC LIMIT ? OFFSET ?
  `).all(...where.params, limit, offset);
}

/** Case count per status for the same search/type filters as the list (the status filter itself is ignored). */
function getCaseStatusCounts(filters = {}) {
  const where = caseFilterSql(filters, { withStatus: false });
  const rows = db.prepare(`
    SELECT c.status, COUNT(*) AS total
    FROM legal_cases c
    LEFT JOIN customers cust ON c.client_id = cust.id
    WHERE 1=1 ${where.sql}
    GROUP BY c.status
  `).all(...where.params);
  const counts = { all: 0, active: 0, adjourned: 0, judged: 0, appealed: 0, closed: 0 };
  for (const row of rows) {
    counts[row.status] = row.total;
    counts.all += row.total;
  }
  return counts;
}

function getCasesByClientId(clientId) {
  return db.prepare(`
    SELECT c.id, c.case_number, c.court_name, c.circuit_name, c.subject,
      c.case_type, c.status, c.contract_amount, c.paid_amount,
      c.power_of_attorney_num, c.created_at, c.updated_at,
      u.full_name AS assigned_lawyer_name,
      (SELECT COUNT(*) FROM court_sessions s WHERE s.case_id = c.id) AS sessions_count,
      (SELECT s.session_date FROM court_sessions s
        WHERE ${NEXT_SESSION_WHERE}
        ORDER BY datetime(s.session_date) ASC LIMIT 1) AS next_session_date
    FROM legal_cases c
    LEFT JOIN users u ON u.id = c.assigned_lawyer_id
    WHERE c.client_id = ?
    ORDER BY c.updated_at DESC, c.id DESC
  `).all(clientId);
}

function getCaseById(id) {
  const c = db.prepare(`
    SELECT 
      c.*,
      cust.name as client_name,
      cust.phone as client_phone,
      cust.email as client_email,
      u.full_name as assigned_lawyer_name
    FROM legal_cases c
    LEFT JOIN customers cust ON c.client_id = cust.id
    LEFT JOIN users u ON c.assigned_lawyer_id = u.id
    WHERE c.id = ?
  `).get(id);

  if (!c) return null;

  c.sessions = getSessionsByCaseId(id);
  c.documents = getDocumentsByCaseId(id);
  c.financials = getFinancialsByCaseId(id);
  c.time_logs = getTimeLogsByCaseId(id);
  c.tasks = getTasksByCaseId(id);

  return c;
}

function createCase(data) {
  const create = db.transaction(() => {
    const paidAmount = Number(data.paid_amount || 0);
    const res = db.prepare(`
      INSERT INTO legal_cases (
        case_number, court_name, court_id, circuit_name, client_id, client_role,
        opponent_name, opponent_lawyer, subject, case_type, assigned_lawyer_id,
        billing_type, contract_amount, paid_amount, hourly_rate, power_of_attorney_num,
        status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.case_number,
      data.court_name,
      data.court_id || null,
      data.circuit_name || null,
      data.client_id,
      data.client_role || 'plaintiff',
      data.opponent_name,
      data.opponent_lawyer || null,
      data.subject,
      data.case_type || 'civil',
      data.assigned_lawyer_id || null,
      data.billing_type || 'fixed',
      Number(data.contract_amount || 0),
      paidAmount,
      Number(data.hourly_rate || 0),
      data.power_of_attorney_num || null,
      data.status || 'active',
      data.notes || null
    );

    if (paidAmount > 0) {
      db.prepare(`
        INSERT INTO case_financials
          (case_id, type, amount, date, description, paid_by_client, receipt_number, user_id)
        VALUES (?, 'fee_payment', ?, CURRENT_TIMESTAMP, 'دفعة أتعاب مقدمة عند إنشاء القضية', 1, NULL, ?)
      `).run(res.lastInsertRowid, paidAmount, data.user_id || null);
    }

    return res.lastInsertRowid;
  });
  return getCaseById(create());
}

function updateCase(id, data) {
  const columns = {
    case_number: 'case_number',
    court_name: 'court_name',
    court_id: 'court_id',
    circuit_name: 'circuit_name',
    client_id: 'client_id',
    client_role: 'client_role',
    opponent_name: 'opponent_name',
    opponent_lawyer: 'opponent_lawyer',
    subject: 'subject',
    case_type: 'case_type',
    assigned_lawyer_id: 'assigned_lawyer_id',
    billing_type: 'billing_type',
    contract_amount: 'contract_amount',
    hourly_rate: 'hourly_rate',
    power_of_attorney_num: 'power_of_attorney_num',
    status: 'status',
    notes: 'notes',
  };
  const entries = Object.entries(columns).filter(([key]) => Object.hasOwn(data, key));
  if (entries.length) {
    const assignments = entries.map(([, column]) => `${column} = ?`);
    assignments.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE legal_cases SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...entries.map(([key]) => data[key]), id);
  }

  return getCaseById(id);
}

function deleteCase(id) {
  return db.prepare(`
    UPDATE legal_cases
    SET status = 'closed', updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(id);
}

function getCasesSummaryStats() {
  const row = db.prepare(`
    SELECT 
      COUNT(*) as total_cases,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_cases,
      SUM(CASE WHEN status = 'adjourned' THEN 1 ELSE 0 END) as adjourned_cases,
      SUM(CASE WHEN status = 'judged' THEN 1 ELSE 0 END) as judged_cases,
      SUM(CASE WHEN status = 'appealed' THEN 1 ELSE 0 END) as appealed_cases,
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_cases,
      COALESCE(SUM(contract_amount), 0) as total_contracts_value,
      COALESCE(SUM(paid_amount), 0) as total_paid_fees
    FROM legal_cases
  `).get();

  // Scheduled sessions from now until 30 days ahead, the same rule as each case's next session.
  const nextHearingsCount = db.prepare(`
    SELECT COUNT(*) as count
    FROM court_sessions
    WHERE status = 'scheduled'
      AND datetime(session_date) >= datetime('now', 'localtime')
      AND datetime(session_date) < datetime('now', 'localtime', '+30 days')
  `).get().count;

  return {
    ...row,
    next_hearings_count: nextHearingsCount,
  };
}

module.exports = {
  getCaseLawyers,
  getAllCases,
  getCaseStatusCounts,
  getCasesByClientId,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
  getCasesSummaryStats,
};

const { db } = require('../database/db');

/**
 * Legal Cases Repository
 * مستودع بيانات مكاتب المحاماة: القضايا، الجلسات، المستندات، والماليات
 */

// ==========================================
// 1. ملفات القضايا (Legal Cases)
// ==========================================

function getAllCases(filters = {}) {
  const { search, status, case_type, lawyer_id, client_id, limit = 100, offset = 0 } = filters;
  
  let query = `
    SELECT 
      c.*,
      cust.name as client_name,
      cust.phone as client_phone,
      u.full_name as assigned_lawyer_name,
      (SELECT COUNT(*) FROM court_sessions s WHERE s.case_id = c.id) as sessions_count,
      (SELECT session_date FROM court_sessions s WHERE s.case_id = c.id AND s.session_date >= date('now') ORDER BY s.session_date ASC LIMIT 1) as next_session_date,
      (SELECT COUNT(*) FROM case_documents d WHERE d.case_id = c.id) as documents_count,
      (SELECT COALESCE(SUM(f.amount), 0) FROM case_financials f WHERE f.case_id = c.id AND f.type = 'retainer_deposit') as total_retainers,
      (SELECT COALESCE(SUM(f.amount), 0) FROM case_financials f WHERE f.case_id = c.id AND f.type NOT IN ('retainer_deposit', 'fee_payment')) as total_expenses
    FROM legal_cases c
    LEFT JOIN customers cust ON c.client_id = cust.id
    LEFT JOIN users u ON c.assigned_lawyer_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (search) {
    query += ` AND (
      c.case_number LIKE ? OR 
      c.court_name LIKE ? OR 
      c.subject LIKE ? OR 
      c.opponent_name LIKE ? OR 
      cust.name LIKE ?
    )`;
    const s = `%${search}%`;
    params.push(s, s, s, s, s);
  }

  if (status && status !== 'all') {
    query += ` AND c.status = ?`;
    params.push(status);
  }

  if (case_type && case_type !== 'all') {
    query += ` AND c.case_type = ?`;
    params.push(case_type);
  }

  if (lawyer_id) {
    query += ` AND c.assigned_lawyer_id = ?`;
    params.push(lawyer_id);
  }

  if (client_id) {
    query += ` AND c.client_id = ?`;
    params.push(client_id);
  }

  query += ` ORDER BY c.updated_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
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

  return c;
}

function createCase(data) {
  const stmt = db.prepare(`
    INSERT INTO legal_cases (
      case_number, court_name, circuit_name, client_id, client_role,
      opponent_name, opponent_lawyer, subject, case_type, assigned_lawyer_id,
      billing_type, contract_amount, paid_amount, hourly_rate, power_of_attorney_num,
      status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.case_number,
    data.court_name,
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
    Number(data.paid_amount || 0),
    Number(data.hourly_rate || 0),
    data.power_of_attorney_num || null,
    data.status || 'active',
    data.notes || null
  );

  return getCaseById(res.lastInsertRowid);
}

function updateCase(id, data) {
  db.prepare(`
    UPDATE legal_cases
    SET case_number = COALESCE(?, case_number),
        court_name = COALESCE(?, court_name),
        circuit_name = COALESCE(?, circuit_name),
        client_id = COALESCE(?, client_id),
        client_role = COALESCE(?, client_role),
        opponent_name = COALESCE(?, opponent_name),
        opponent_lawyer = COALESCE(?, opponent_lawyer),
        subject = COALESCE(?, subject),
        case_type = COALESCE(?, case_type),
        assigned_lawyer_id = COALESCE(?, assigned_lawyer_id),
        billing_type = COALESCE(?, billing_type),
        contract_amount = COALESCE(?, contract_amount),
        paid_amount = COALESCE(?, paid_amount),
        hourly_rate = COALESCE(?, hourly_rate),
        power_of_attorney_num = COALESCE(?, power_of_attorney_num),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.case_number,
    data.court_name,
    data.circuit_name,
    data.client_id,
    data.client_role,
    data.opponent_name,
    data.opponent_lawyer,
    data.subject,
    data.case_type,
    data.assigned_lawyer_id,
    data.billing_type,
    data.contract_amount,
    data.paid_amount,
    data.hourly_rate,
    data.power_of_attorney_num,
    data.status,
    data.notes,
    id
  );

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
      SUM(CASE WHEN status = 'closed' THEN 1 ELSE 0 END) as closed_cases,
      COALESCE(SUM(contract_amount), 0) as total_contracts_value,
      COALESCE(SUM(paid_amount), 0) as total_paid_fees
    FROM legal_cases
  `).get();

  const nextHearingsCount = db.prepare(`
    SELECT COUNT(*) as count 
    FROM court_sessions 
    WHERE date(session_date) >= date('now')
  `).get().count;

  return {
    ...row,
    next_hearings_count: nextHearingsCount,
  };
}

// ==========================================
// 2. جلسات المحاكم (Court Sessions)
// ==========================================

function getSessionsByCaseId(caseId) {
  return db.prepare(`
    SELECT 
      s.*,
      u.full_name as assigned_lawyer_name
    FROM court_sessions s
    LEFT JOIN users u ON s.assigned_lawyer_id = u.id
    WHERE s.case_id = ?
    ORDER BY s.session_date DESC
  `).all(caseId);
}

function getAllUpcomingSessions(filters = {}) {
  const { startDate, endDate, lawyerId, status } = filters;
  let query = `
    SELECT 
      s.*,
      c.case_number,
      c.court_name,
      c.circuit_name,
      c.subject as case_subject,
      cust.name as client_name,
      cust.phone as client_phone,
      c.opponent_name,
      u.full_name as assigned_lawyer_name
    FROM court_sessions s
    JOIN legal_cases c ON s.case_id = c.id
    LEFT JOIN customers cust ON c.client_id = cust.id
    LEFT JOIN users u ON s.assigned_lawyer_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (startDate) {
    query += ` AND date(s.session_date) >= date(?)`;
    params.push(startDate);
  } else {
    query += ` AND date(s.session_date) >= date('now')`;
  }

  if (endDate) {
    query += ` AND date(s.session_date) <= date(?)`;
    params.push(endDate);
  }

  if (lawyerId) {
    query += ` AND s.assigned_lawyer_id = ?`;
    params.push(lawyerId);
  }

  if (status && status !== 'all') {
    query += ` AND s.status = ?`;
    params.push(status);
  }

  query += ` ORDER BY s.session_date ASC`;

  return db.prepare(query).all(...params);
}

function getSessionById(id) {
  return db.prepare(`
    SELECT 
      s.*,
      c.case_number,
      c.court_name,
      c.circuit_name,
      c.subject as case_subject,
      c.opponent_name,
      cust.name as client_name,
      cust.phone as client_phone,
      u.full_name as assigned_lawyer_name
    FROM court_sessions s
    JOIN legal_cases c ON s.case_id = c.id
    LEFT JOIN customers cust ON c.client_id = cust.id
    LEFT JOIN users u ON s.assigned_lawyer_id = u.id
    WHERE s.id = ?
  `).get(id);
}

function createSession(data) {
  const stmt = db.prepare(`
    INSERT INTO court_sessions (
      case_id, session_date, court_room, assigned_lawyer_id,
      session_reason, decision, next_session_date, status, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.case_id,
    data.session_date,
    data.court_room || null,
    data.assigned_lawyer_id || null,
    data.session_reason || null,
    data.decision || null,
    data.next_session_date || null,
    data.status || 'scheduled',
    data.notes || null
  );

  // تحديث وقت تعديل القضية وحالتها
  if (data.status === 'adjourned') {
    db.prepare(`UPDATE legal_cases SET status = 'adjourned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(data.case_id);
  } else if (data.status === 'judged') {
    db.prepare(`UPDATE legal_cases SET status = 'judged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(data.case_id);
  } else {
    db.prepare(`UPDATE legal_cases SET updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(data.case_id);
  }

  return getSessionById(res.lastInsertRowid);
}

function updateSession(id, data) {
  db.prepare(`
    UPDATE court_sessions
    SET session_date = COALESCE(?, session_date),
        court_room = COALESCE(?, court_room),
        assigned_lawyer_id = COALESCE(?, assigned_lawyer_id),
        session_reason = COALESCE(?, session_reason),
        decision = COALESCE(?, decision),
        next_session_date = COALESCE(?, next_session_date),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    data.session_date,
    data.court_room,
    data.assigned_lawyer_id,
    data.session_reason,
    data.decision,
    data.next_session_date,
    data.status,
    data.notes,
    id
  );

  const session = getSessionById(id);
  if (session && data.status) {
    if (data.status === 'judged') {
      db.prepare(`UPDATE legal_cases SET status = 'judged', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(session.case_id);
    } else if (data.status === 'postponed') {
      db.prepare(`UPDATE legal_cases SET status = 'adjourned', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(session.case_id);
    }
  }

  return session;
}

function deleteSession(id) {
  return db.prepare(`DELETE FROM court_sessions WHERE id = ?`).run(id);
}

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

function getDueCourtSessionReminders(hoursAhead = 48) {
  return db.prepare(`
    SELECT 
      s.*,
      c.case_number,
      c.court_name,
      c.circuit_name,
      c.subject as case_subject,
      c.assigned_lawyer_id as case_lawyer_id,
      cust.name as client_name,
      cust.phone as client_phone
    FROM court_sessions s
    JOIN legal_cases c ON s.case_id = c.id
    LEFT JOIN customers cust ON c.client_id = cust.id
    WHERE s.reminder_sent = 0
      AND s.status = 'scheduled'
      AND datetime(s.session_date) >= datetime('now', 'localtime')
      AND datetime(s.session_date) <= datetime('now', 'localtime', '+' || ? || ' hours')
  `).all(hoursAhead);
}

function markSessionReminderSent(sessionId) {
  return db.prepare(`
    UPDATE court_sessions
    SET reminder_sent = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(sessionId);
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
      COALESCE(SUM(CASE WHEN type NOT IN ('retainer_deposit', 'fee_payment') THEN amount ELSE 0 END), 0) as total_court_expenses
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
  const paidAmount = Number(c.paid_amount || 0);
  const remainingFees = Math.max(0, contractAmount - paidAmount);
  const totalRetainers = Number(finStats.total_retainers || 0);
  const totalExpenses = Number(finStats.total_court_expenses || 0);
  const retainerBalance = totalRetainers - totalExpenses;

  return {
    contract_amount: contractAmount,
    paid_amount: paidAmount,
    remaining_fees: remainingFees,
    total_retainers: totalRetainers,
    total_court_expenses: totalExpenses,
    retainer_balance: retainerBalance,
    total_logged_hours: Number(timeStats.total_hours || 0),
    total_time_billing: Number(timeStats.total_time_amount || 0),
    time_logs_count: timeStats.logs_count,
  };
}

// ==========================================
// 3. مستندات وأرشيف القضية (Case Documents)
// ==========================================

function getDocumentsByCaseId(caseId) {
  return db.prepare(`
    SELECT 
      d.*,
      u.full_name as uploaded_by_name
    FROM case_documents d
    LEFT JOIN users u ON d.uploaded_by = u.id
    WHERE d.case_id = ?
    ORDER BY d.created_at DESC
  `).all(caseId);
}

function createDocument(data) {
  const stmt = db.prepare(`
    INSERT INTO case_documents (
      case_id, title, doc_type, file_path, file_size, version, uploaded_by, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.case_id,
    data.title,
    data.doc_type || 'pleading',
    data.file_path,
    data.file_size || null,
    data.version || 1,
    data.uploaded_by || null,
    data.notes || null
  );

  return db.prepare(`SELECT * FROM case_documents WHERE id = ?`).get(res.lastInsertRowid);
}

function deleteDocument(id) {
  return db.prepare(`DELETE FROM case_documents WHERE id = ?`).run(id);
}

// ==========================================
// 4. أمانات ومصاريف القضية (Case Financials)
// ==========================================

function getFinancialsByCaseId(caseId) {
  return db.prepare(`
    SELECT 
      f.*,
      u.full_name as recorded_by_name
    FROM case_financials f
    LEFT JOIN users u ON f.user_id = u.id
    WHERE f.case_id = ?
    ORDER BY f.date DESC
  `).all(caseId);
}

function createFinancial(data) {
  const stmt = db.prepare(`
    INSERT INTO case_financials (
      case_id, type, amount, date, description, paid_by_client, receipt_number, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.case_id,
    data.type,
    Number(data.amount),
    data.date || new Date().toISOString(),
    data.description || null,
    data.paid_by_client !== undefined ? (data.paid_by_client ? 1 : 0) : 1,
    data.receipt_number || null,
    data.user_id || null
  );

  // إذا كانت الدفعة سداد أتعاب (fee_payment)، نحدث paid_amount في القضية تلقائياً
  if (data.type === 'fee_payment') {
    db.prepare(`
      UPDATE legal_cases 
      SET paid_amount = paid_amount + ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Number(data.amount), data.case_id);
  }

  return db.prepare(`SELECT * FROM case_financials WHERE id = ?`).get(res.lastInsertRowid);
}

function deleteFinancial(id) {
  const record = db.prepare(`SELECT * FROM case_financials WHERE id = ?`).get(id);
  if (record && record.type === 'fee_payment') {
    db.prepare(`
      UPDATE legal_cases 
      SET paid_amount = MAX(0, paid_amount - ?),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(record.amount, record.case_id);
  }
  return db.prepare(`DELETE FROM case_financials WHERE id = ?`).run(id);
}

// ==========================================
// 5. سجل ساعات المحامين (Time Logs)
// ==========================================

function getTimeLogsByCaseId(caseId) {
  return db.prepare(`
    SELECT 
      t.*,
      u.full_name as lawyer_name
    FROM lawyer_time_logs t
    LEFT JOIN users u ON t.lawyer_id = u.id
    WHERE t.case_id = ?
    ORDER BY t.date DESC
  `).all(caseId);
}

function createTimeLog(data) {
  const hours = Number(data.hours || 0);
  const hourlyRate = Number(data.hourly_rate || 0);
  const totalAmount = Number(data.total_amount || (hours * hourlyRate));

  const stmt = db.prepare(`
    INSERT INTO lawyer_time_logs (
      case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date, is_billed
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    data.case_id,
    data.lawyer_id,
    hours,
    hourlyRate,
    totalAmount,
    data.activity_description,
    data.date || new Date().toISOString().split('T')[0],
    data.is_billed ? 1 : 0
  );

  return db.prepare(`SELECT * FROM lawyer_time_logs WHERE id = ?`).get(res.lastInsertRowid);
}

function deleteTimeLog(id) {
  return db.prepare(`DELETE FROM lawyer_time_logs WHERE id = ?`).run(id);
}

module.exports = {
  getAllCases,
  getCaseById,
  createCase,
  updateCase,
  deleteCase,
  getCasesSummaryStats,
  getSessionsByCaseId,
  getAllUpcomingSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  getDailyDocket,
  getDueCourtSessionReminders,
  markSessionReminderSent,
  getCaseFinancialBreakdown,
  getDocumentsByCaseId,
  createDocument,
  deleteDocument,
  getFinancialsByCaseId,
  createFinancial,
  deleteFinancial,
  getTimeLogsByCaseId,
  createTimeLog,
  deleteTimeLog,
};

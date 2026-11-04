const { db } = require('../database/db');

function getCaseLawyers() {
  return db.prepare(`
    SELECT id, username, full_name, first_name, last_name, job_title
    FROM users
    WHERE is_active = 1
    ORDER BY full_name COLLATE NOCASE, username COLLATE NOCASE
  `).all();
}

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

function getCasesByClientId(clientId) {
  return db.prepare(`
    SELECT c.id, c.case_number, c.court_name, c.circuit_name, c.subject,
      c.case_type, c.status, c.contract_amount, c.paid_amount,
      c.power_of_attorney_num, c.created_at, c.updated_at,
      u.full_name AS assigned_lawyer_name,
      (SELECT COUNT(*) FROM court_sessions s WHERE s.case_id = c.id) AS sessions_count,
      (SELECT s.session_date FROM court_sessions s
        WHERE s.case_id = c.id AND datetime(s.session_date) >= datetime('now', 'localtime')
          AND s.status = 'scheduled'
        ORDER BY s.session_date ASC LIMIT 1) AS next_session_date
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
  const columns = {
    session_date: 'session_date',
    court_room: 'court_room',
    assigned_lawyer_id: 'assigned_lawyer_id',
    session_reason: 'session_reason',
    decision: 'decision',
    next_session_date: 'next_session_date',
    status: 'status',
    notes: 'notes',
  };
  const entries = Object.entries(columns).filter(([key]) => Object.hasOwn(data, key));
  if (entries.length) {
    const assignments = entries.map(([, column]) => `${column} = ?`);
    if (Object.hasOwn(data, 'session_date') || Object.hasOwn(data, 'assigned_lawyer_id')
      || data.status === 'scheduled') {
      assignments.push('reminder_sent = 0');
    }
    assignments.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE court_sessions SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...entries.map(([key]) => data[key]), id);
  }

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

function getTasksByCaseId(caseId) {
  return db.prepare(`
    SELECT t.*,
      COALESCE(assigned.full_name, assigned.username) AS assigned_lawyer_name,
      s.session_date,
      s.decision AS session_decision
    FROM legal_case_tasks t
    LEFT JOIN users assigned ON assigned.id = t.assigned_lawyer_id
    LEFT JOIN court_sessions s ON s.id = t.session_id
    WHERE t.case_id = ?
    ORDER BY
      CASE t.status WHEN 'pending' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
      t.due_at ASC, t.id DESC
  `).all(caseId);
}

function getTaskById(id) {
  return db.prepare(`
    SELECT t.*,
      COALESCE(assigned.full_name, assigned.username) AS assigned_lawyer_name,
      s.session_date,
      s.decision AS session_decision,
      c.case_number,
      c.court_name
    FROM legal_case_tasks t
    JOIN legal_cases c ON c.id = t.case_id
    LEFT JOIN users assigned ON assigned.id = t.assigned_lawyer_id
    LEFT JOIN court_sessions s ON s.id = t.session_id
    WHERE t.id = ?
  `).get(id);
}

function createTask(data) {
  const result = db.prepare(`
    INSERT INTO legal_case_tasks (
      case_id, session_id, title, description, due_at, reminder_at,
      assigned_lawyer_id, priority, created_by
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.case_id,
    data.session_id || null,
    data.title,
    data.description || null,
    data.due_at,
    data.reminder_at || null,
    data.assigned_lawyer_id || null,
    data.priority || 'normal',
    data.created_by || null
  );
  return getTaskById(result.lastInsertRowid);
}

function updateTask(id, data) {
  const columns = {
    session_id: 'session_id',
    title: 'title',
    description: 'description',
    due_at: 'due_at',
    reminder_at: 'reminder_at',
    assigned_lawyer_id: 'assigned_lawyer_id',
    priority: 'priority',
    status: 'status',
  };
  const entries = Object.entries(columns).filter(([key]) => Object.hasOwn(data, key));
  if (entries.length) {
    const assignments = entries.map(([, column]) => `${column} = ?`);
    if (['due_at', 'reminder_at', 'assigned_lawyer_id'].some((key) => Object.hasOwn(data, key))) {
      assignments.push('reminder_sent = 0');
    }
    if (['pending', 'in_progress'].includes(data.status)) {
      assignments.push('reminder_sent = 0');
    }
    assignments.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`UPDATE legal_case_tasks SET ${assignments.join(', ')} WHERE id = ?`)
      .run(...entries.map(([key]) => data[key]), id);
  }
  return getTaskById(id);
}

function deleteTask(id) {
  return db.prepare('DELETE FROM legal_case_tasks WHERE id = ?').run(id);
}

function getDueCaseTaskReminders() {
  return db.prepare(`
    SELECT t.id, t.case_id, t.title, t.due_at, t.reminder_at,
      COALESCE(t.assigned_lawyer_id, c.assigned_lawyer_id) AS reminder_lawyer_id,
      c.case_number, c.court_name
    FROM legal_case_tasks t
    JOIN legal_cases c ON c.id = t.case_id
    WHERE t.status IN ('pending', 'in_progress')
      AND c.status != 'closed'
      AND t.reminder_sent = 0
      AND t.reminder_at IS NOT NULL
      AND datetime(t.reminder_at) <= datetime('now', 'localtime')
      AND COALESCE(t.assigned_lawyer_id, c.assigned_lawyer_id) IS NOT NULL
    ORDER BY t.reminder_at ASC, t.id ASC
  `).all();
}

function claimCaseTaskReminder(id) {
  return db.prepare(`
    UPDATE legal_case_tasks
    SET reminder_sent = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent = 0 AND status IN ('pending', 'in_progress')
  `).run(id);
}

function releaseCaseTaskReminder(id) {
  return db.prepare(`
    UPDATE legal_case_tasks
    SET reminder_sent = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent = 1 AND status IN ('pending', 'in_progress')
  `).run(id);
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

function getDueCourtSessionReminders(hoursAhead = 48) {
  return db.prepare(`
    SELECT 
      s.*,
      c.case_number,
      c.court_name,
      c.circuit_name,
      c.subject as case_subject,
      c.assigned_lawyer_id as case_lawyer_id,
      COALESCE(s.assigned_lawyer_id, c.assigned_lawyer_id) as reminder_lawyer_id,
      cust.name as client_name,
      cust.phone as client_phone
    FROM court_sessions s
    JOIN legal_cases c ON s.case_id = c.id
    LEFT JOIN customers cust ON c.client_id = cust.id
    WHERE s.reminder_sent = 0
      AND s.status = 'scheduled'
      AND COALESCE(s.assigned_lawyer_id, c.assigned_lawyer_id) IS NOT NULL
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

function claimSessionReminder(sessionId) {
  return db.prepare(`
    UPDATE court_sessions
    SET reminder_sent = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent = 0 AND status = 'scheduled'
  `).run(sessionId);
}

function releaseSessionReminder(sessionId) {
  return db.prepare(`
    UPDATE court_sessions
    SET reminder_sent = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent = 1 AND status = 'scheduled'
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
  const create = db.transaction(() => {
    const res = db.prepare(`
      INSERT INTO case_documents (
        case_id, title, doc_type, file_path, file_size, version, uploaded_by, notes
      ) VALUES (?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      data.case_id,
      data.title,
      data.doc_type || 'pleading',
      data.file_path,
      data.file_size || null,
      data.uploaded_by || null,
      data.notes || null
    );
    db.prepare(`
      INSERT INTO case_document_versions (document_id, version, file_path, file_size, uploaded_by)
      VALUES (?, 1, ?, ?, ?)
    `).run(res.lastInsertRowid, data.file_path, data.file_size || null, data.uploaded_by || null);
    return res.lastInsertRowid;
  });
  return db.prepare('SELECT * FROM case_documents WHERE id = ?').get(create());
}

function updateDocument(id, data) {
  const columns = {
    title: 'title',
    doc_type: 'doc_type',
    notes: 'notes',
  };
  const update = db.transaction(() => {
    const entries = Object.entries(columns).filter(([key]) => Object.hasOwn(data, key));
    if (entries.length) {
      db.prepare(`UPDATE case_documents SET ${entries.map(([, column]) => `${column} = ?`).join(', ')} WHERE id = ?`)
        .run(...entries.map(([key]) => data[key]), id);
    }
    if (data.versionFile) {
      const current = getDocumentById(id);
      if (!current) return null;
      const version = current.version + 1;
      db.prepare(`
        INSERT INTO case_document_versions (document_id, version, file_path, file_size, uploaded_by)
        VALUES (?, ?, ?, ?, ?)
      `).run(id, version, data.versionFile.file_path, data.versionFile.file_size, data.versionFile.uploaded_by || null);
      db.prepare(`
        UPDATE case_documents
        SET file_path = ?, file_size = ?, version = ?, uploaded_by = ?
        WHERE id = ?
      `).run(data.versionFile.file_path, data.versionFile.file_size, version,
        data.versionFile.uploaded_by || null, id);
    }
    return getDocumentById(id);
  });
  return update();
}

function deleteDocument(id) {
  const document = db.prepare('SELECT * FROM case_documents WHERE id = ?').get(id);
  if (!document) return { changes: 0, files: [] };
  const files = db.prepare('SELECT file_path FROM case_document_versions WHERE document_id = ?')
    .all(id).map((version) => version.file_path);
  const result = db.prepare('DELETE FROM case_documents WHERE id = ?').run(id);
  return { changes: result.changes, files: files.length ? files : [document.file_path] };
}

function getDocumentById(id) {
  return db.prepare('SELECT * FROM case_documents WHERE id = ?').get(id) || null;
}

function getDocumentVersion(documentId, version) {
  return db.prepare(`
    SELECT * FROM case_document_versions WHERE document_id = ? AND version = ?
  `).get(documentId, version) || null;
}

function getDocumentVersions(documentId) {
  return db.prepare(`
    SELECT * FROM case_document_versions WHERE document_id = ? ORDER BY version DESC
  `).all(documentId);
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

function getFinancialReceipt(financialId) {
  return db.prepare(`
    SELECT f.*, c.case_number, c.court_name, cust.name AS client_name,
           u.full_name AS recorded_by_name
    FROM case_financials f
    JOIN legal_cases c ON c.id = f.case_id
    LEFT JOIN customers cust ON cust.id = c.client_id
    LEFT JOIN users u ON u.id = f.user_id
    WHERE f.id = ?
  `).get(financialId) || null;
}

function createFinancial(data) {
  const stmt = db.prepare(`
    INSERT INTO case_financials (
      case_id, type, amount, date, description, paid_by_client, receipt_number, user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const create = db.transaction(() => {
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

    if (data.type === 'fee_payment') {
      db.prepare(`
        UPDATE legal_cases
        SET paid_amount = paid_amount + ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(Number(data.amount), data.case_id);
    }

    return db.prepare('SELECT * FROM case_financials WHERE id = ?').get(res.lastInsertRowid);
  });
  return create();
}

function updateFinancial(id, data) {
  const update = db.transaction(() => {
    const previous = db.prepare('SELECT * FROM case_financials WHERE id = ?').get(id);
    if (!previous) return null;

    const nextType = data.type ?? previous.type;
    const nextAmount = data.amount == null ? previous.amount : Number(data.amount);
    db.prepare(`
      UPDATE case_financials
      SET type = ?, amount = ?, date = ?, description = ?, paid_by_client = ?, receipt_number = ?
      WHERE id = ?
    `).run(
      nextType,
      nextAmount,
      data.date ?? previous.date,
      Object.hasOwn(data, 'description') ? data.description : previous.description,
      data.paid_by_client === undefined ? previous.paid_by_client : (data.paid_by_client ? 1 : 0),
      Object.hasOwn(data, 'receipt_number') ? data.receipt_number : previous.receipt_number,
      id
    );

    const previousFee = previous.type === 'fee_payment' ? Number(previous.amount) : 0;
    const nextFee = nextType === 'fee_payment' ? nextAmount : 0;
    const feeDifference = nextFee - previousFee;
    if (feeDifference) {
      db.prepare(`
        UPDATE legal_cases
        SET paid_amount = MAX(0, paid_amount + ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(feeDifference, previous.case_id);
    }

    return db.prepare('SELECT * FROM case_financials WHERE id = ?').get(id);
  });
  return update();
}

function deleteFinancial(id) {
  const remove = db.transaction(() => {
    const record = db.prepare('SELECT * FROM case_financials WHERE id = ?').get(id);
    if (!record) return { changes: 0 };
    if (record.type === 'fee_payment') {
      db.prepare(`
        UPDATE legal_cases
        SET paid_amount = MAX(0, paid_amount - ?),
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(record.amount, record.case_id);
    }
    return db.prepare('DELETE FROM case_financials WHERE id = ?').run(id);
  });
  return remove();
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

function updateTimeLog(id, data) {
  const previous = db.prepare('SELECT * FROM lawyer_time_logs WHERE id = ?').get(id);
  if (!previous) return null;
  const hours = data.hours == null ? previous.hours : Number(data.hours);
  const hourlyRate = data.hourly_rate == null ? previous.hourly_rate : Number(data.hourly_rate);
  const totalAmount = data.total_amount == null ? hours * hourlyRate : Number(data.total_amount);
  db.prepare(`
    UPDATE lawyer_time_logs
    SET lawyer_id = ?, hours = ?, hourly_rate = ?, total_amount = ?,
        activity_description = ?, date = ?, is_billed = ?
    WHERE id = ?
  `).run(
    data.lawyer_id ?? previous.lawyer_id,
    hours,
    hourlyRate,
    totalAmount,
    data.activity_description ?? previous.activity_description,
    data.date ?? previous.date,
    data.is_billed === undefined ? previous.is_billed : (data.is_billed ? 1 : 0),
    id
  );
  return db.prepare('SELECT * FROM lawyer_time_logs WHERE id = ?').get(id);
}

function deleteTimeLog(id) {
  return db.prepare(`DELETE FROM lawyer_time_logs WHERE id = ?`).run(id);
}

module.exports = {
  getCaseLawyers,
  getAllCases,
  getCasesByClientId,
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
  getTasksByCaseId,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getDueCaseTaskReminders,
  claimCaseTaskReminder,
  releaseCaseTaskReminder,
  getDailyDocket,
  getLawFirmDashboard,
  getLawFirmReport,
  getDueCourtSessionReminders,
  markSessionReminderSent,
  claimSessionReminder,
  releaseSessionReminder,
  getCaseFinancialBreakdown,
  getDocumentsByCaseId,
  createDocument,
  updateDocument,
  deleteDocument,
  getDocumentById,
  getDocumentVersion,
  getDocumentVersions,
  getFinancialsByCaseId,
  getFinancialReceipt,
  createFinancial,
  updateFinancial,
  deleteFinancial,
  getTimeLogsByCaseId,
  createTimeLog,
  updateTimeLog,
  deleteTimeLog,
};

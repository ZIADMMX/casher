// Court sessions and their reminders.
const { db } = require('../../database/db');
const { createTask } = require('./tasks');
const { createFinancial } = require('./financials');
const legalClientInteractionsRepo = require('../legalClientInteractions.repository');

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

// Records what happened in one hearing: the outcome itself, the next hearing it was
// adjourned to, the task to prepare for it and the expenses paid in court - all or nothing.
function recordOutcome(sessionId, data) {
  const run = db.transaction(() => {
    const session = getSessionById(sessionId);
    if (!session) throw new Error('الجلسة غير موجودة');

    updateSession(sessionId, {
      status: data.status,
      // the six outcomes do not fit the four session statuses, so the label leads the decision text
      decision: data.decision,
      next_session_date: data.next_session_date || null,
    });

    let nextSession = null;
    if (data.next_session_date) {
      nextSession = createSession({
        case_id: session.case_id,
        session_date: data.next_session_date,
        court_room: session.court_room,
        assigned_lawyer_id: session.assigned_lawyer_id,
        session_reason: data.next_session_reason || null,
        status: 'scheduled',
      });
    }

    if (data.preparation) {
      createTask({
        case_id: session.case_id,
        session_id: nextSession ? nextSession.id : sessionId,
        title: data.preparation,
        due_at: data.preparation_due_at,
        assigned_lawyer_id: session.assigned_lawyer_id,
        priority: 'high',
        created_by: data.user_id || null,
      });
    }

    for (const expense of data.expenses || []) {
      createFinancial({
        case_id: session.case_id,
        type: expense.type,
        amount: expense.amount,
        description: expense.description || null,
        paid_by_client: expense.paid_by_client,
        user_id: data.user_id || null,
      });
    }

    const clientId = db.prepare('SELECT client_id FROM legal_cases WHERE id = ?').get(session.case_id)?.client_id;
    if (clientId) {
      legalClientInteractionsRepo.create({
        customer_id: clientId,
        created_by: data.user_id || null,
        type: 'note',
        subject: `جلسة ${session.case_number || session.case_id}: ${data.decision}`,
        details: data.next_session_date
          ? `الجلسة القادمة: ${String(data.next_session_date).slice(0, 10)}${data.next_session_reason ? ` — ${data.next_session_reason}` : ''}`
          : null,
      });
    }

    return { session: getSessionById(sessionId), nextSession };
  });
  return run();
}

module.exports = {
  getSessionsByCaseId,
  getAllUpcomingSessions,
  getSessionById,
  createSession,
  updateSession,
  deleteSession,
  recordOutcome,
  getDueCourtSessionReminders,
  markSessionReminderSent,
  claimSessionReminder,
  releaseSessionReminder,
};

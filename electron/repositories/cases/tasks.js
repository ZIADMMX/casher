// Case tasks and their reminders.
const { db } = require('../../database/db');

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

module.exports = {
  getTasksByCaseId,
  getTaskById,
  createTask,
  updateTask,
  deleteTask,
  getDueCaseTaskReminders,
  claimCaseTaskReminder,
  releaseCaseTaskReminder,
};

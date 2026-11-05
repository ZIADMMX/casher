// Lawyer time logs per case.
const { db } = require('../../database/db');

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
  getTimeLogsByCaseId,
  createTimeLog,
  updateTimeLog,
  deleteTimeLog,
};

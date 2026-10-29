const { db } = require('../database/db');

function getByDate(date) {
  return db.prepare(`
    SELECT
      u.id AS user_id,
      u.username,
      u.full_name,
      u.first_name,
      u.last_name,
      u.role,
      u.job_title,
      u.profile_image,
      u.is_active,
      u.scheduled_start,
      u.scheduled_end,
      a.id AS attendance_id,
      a.attendance_date,
      a.check_in,
      a.check_out
    FROM users u
    LEFT JOIN attendance_records a
      ON a.user_id = u.id AND a.attendance_date = ?
    ORDER BY u.is_active DESC, COALESCE(u.full_name, u.username) COLLATE NOCASE
  `).all(date);
}

function getLast30DaysSummary(startDate, endDate) {
  return db.prepare(`
    SELECT
      u.id AS user_id,
      u.username,
      u.full_name,
      u.first_name,
      u.last_name,
      u.created_at,
      COUNT(DISTINCT a.attendance_date) AS present_days
    FROM users u
    LEFT JOIN attendance_records a
      ON a.user_id = u.id AND a.attendance_date BETWEEN ? AND ?
    WHERE u.role = 'cashier' AND u.is_active = 1
    GROUP BY u.id
    ORDER BY COALESCE(u.full_name, u.username) COLLATE NOCASE
  `).all(startDate, endDate);
}

function updateSchedule(userId, scheduledStart, scheduledEnd) {
  return db.prepare(`
    UPDATE users
    SET scheduled_start = ?, scheduled_end = ?
    WHERE id = ?
  `).run(scheduledStart || null, scheduledEnd || null, userId);
}

function getUser(userId) {
  return db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(userId) || null;
}

function getRecord(userId, date) {
  return db.prepare(`
    SELECT id, user_id, attendance_date, check_in, check_out
    FROM attendance_records
    WHERE user_id = ? AND attendance_date = ?
  `).get(userId, date) || null;
}

function createCheckIn(userId, date, checkIn) {
  return db.prepare(`
    INSERT INTO attendance_records (user_id, attendance_date, check_in)
    VALUES (?, ?, ?)
  `).run(userId, date, checkIn);
}

function setCheckOut(recordId, checkOut) {
  return db.prepare(`
    UPDATE attendance_records
    SET check_out = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND check_out IS NULL
  `).run(checkOut, recordId);
}

module.exports = {
  getByDate,
  getLast30DaysSummary,
  updateSchedule,
  getUser,
  getRecord,
  createCheckIn,
  setCheckOut,
};

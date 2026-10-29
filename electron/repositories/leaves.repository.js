const { db } = require('../database/db');

function getAll() {
  const items = db.prepare(`
    SELECT
      l.id,
      l.user_id,
      l.start_date,
      l.end_date,
      l.reason,
      l.status,
      l.requested_by_user_id,
      l.reviewed_by_user_id,
      l.reviewed_at,
      l.created_at,
      u.username,
      u.full_name,
      u.first_name,
      u.last_name,
      u.job_title,
      u.profile_image,
      requester.username AS requested_by_username,
      reviewer.username AS reviewed_by_username
    FROM leave_requests l
    JOIN users u ON u.id = l.user_id
    LEFT JOIN users requester ON requester.id = l.requested_by_user_id
    LEFT JOIN users reviewer ON reviewer.id = l.reviewed_by_user_id
    ORDER BY
      CASE l.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
      l.start_date DESC,
      l.created_at DESC,
      l.id DESC
  `).all();

  const today = db.prepare("SELECT DATE('now', 'localtime') AS today").get().today;
  const stats = db.prepare(`
    SELECT
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) AS approved,
      SUM(CASE WHEN status = 'approved' AND start_date <= ? AND end_date >= ? THEN 1 ELSE 0 END) AS currently_on_leave,
      SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) AS rejected
    FROM leave_requests
  `).get(today, today);

  return {
    items,
    stats: {
      pending: stats.pending || 0,
      approved: stats.approved || 0,
      currentlyOnLeave: stats.currently_on_leave || 0,
      rejected: stats.rejected || 0,
    },
  };
}

function getEmployee(userId) {
  return db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(userId) || null;
}

function create({ userId, startDate, endDate, reason, status, requestedByUserId }) {
  return db.prepare(`
    INSERT INTO leave_requests (
      user_id, start_date, end_date, reason, status,
      requested_by_user_id, reviewed_by_user_id, reviewed_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, CASE WHEN ? = 'approved' THEN CURRENT_TIMESTAMP ELSE NULL END)
  `).run(
    userId,
    startDate,
    endDate,
    reason,
    status,
    requestedByUserId,
    status === 'approved' ? requestedByUserId : null,
    status,
  );
}

function hasApprovedOverlap(userId, startDate, endDate, excludeRequestId = null) {
  return Boolean(db.prepare(`
    SELECT 1
    FROM leave_requests
    WHERE user_id = ?
      AND status = 'approved'
      AND start_date <= ?
      AND end_date >= ?
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `).get(userId, endDate, startDate, excludeRequestId, excludeRequestId));
}

function getRequest(requestId) {
  return db.prepare('SELECT * FROM leave_requests WHERE id = ?').get(requestId) || null;
}

function decide(requestId, decision, reviewerUserId) {
  return db.prepare(`
    UPDATE leave_requests
    SET status = ?, reviewed_by_user_id = ?, reviewed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
  `).run(decision, reviewerUserId, requestId);
}

module.exports = {
  getAll,
  getEmployee,
  create,
  hasApprovedOverlap,
  getRequest,
  decide,
};

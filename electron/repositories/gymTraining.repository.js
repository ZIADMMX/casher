const { db } = require('../database/db');

function getTrainers() {
  return db.prepare('SELECT * FROM gym_trainers WHERE is_active = 1 ORDER BY id').all();
}

function getTrainerById(id) {
  return db.prepare('SELECT * FROM gym_trainers WHERE id = ? AND is_active = 1').get(id) || null;
}

function createTrainer(data) {
  return db.prepare(`
    INSERT INTO gym_trainers (name, specialty, session_rate, commission_pct, group_fee)
    VALUES (@name, @specialty, @session_rate, @commission_pct, @group_fee)
  `).run(data).lastInsertRowid;
}

function updateTrainer(id, data) {
  db.prepare(`
    UPDATE gym_trainers SET name = @name, specialty = @specialty, session_rate = @session_rate,
      commission_pct = @commission_pct, group_fee = @group_fee
    WHERE id = @id
  `).run({ ...data, id });
}

// PT sessions logged in [from, to] per trainer: count and value at the price paid.
function getPtSessionTotals(from, to) {
  return db.prepare(`
    SELECT trainer_id, COUNT(*) AS sessions, COALESCE(SUM(unit_price), 0) AS value
    FROM gym_pt_sessions WHERE session_date BETWEEN ? AND ? GROUP BY trainer_id
  `).all(from, to);
}

function getPtSessionsByDay(from, to) {
  return db.prepare(`
    SELECT trainer_id, session_date, COUNT(*) AS sessions
    FROM gym_pt_sessions WHERE session_date BETWEEN ? AND ? GROUP BY trainer_id, session_date
  `).all(from, to);
}

// Group classes that actually ran (had at least one booking) in [from, to].
function getGroupClassesHeld(from, to) {
  return db.prepare(`
    SELECT c.trainer_id, COUNT(DISTINCT b.class_id || '|' || b.session_date) AS classes
    FROM gym_class_bookings b JOIN gym_classes c ON c.id = b.class_id
    WHERE b.session_date BETWEEN ? AND ? AND b.status != 'waitlist'
    GROUP BY c.trainer_id
  `).all(from, to);
}

function getAttendance(from, to) {
  return db.prepare(`
    SELECT c.trainer_id,
      SUM(CASE WHEN b.status = 'attended' THEN 1 ELSE 0 END) AS attended,
      SUM(CASE WHEN b.status != 'waitlist' THEN 1 ELSE 0 END) AS booked
    FROM gym_class_bookings b JOIN gym_classes c ON c.id = b.class_id
    WHERE b.session_date BETWEEN ? AND ? GROUP BY c.trainer_id
  `).all(from, to);
}

function getActiveMembersPerTrainer(today) {
  return db.prepare(`
    SELECT p.trainer_id, COUNT(DISTINCT p.customer_id) AS members
    FROM gym_pt_packages p
    WHERE p.valid_until >= ?
      AND p.sessions_total > (SELECT COUNT(*) FROM gym_pt_sessions s WHERE s.package_id = p.id)
    GROUP BY p.trainer_id
  `).all(today);
}

function getClasses() {
  return db.prepare(`
    SELECT c.*, t.name AS trainer_name
    FROM gym_classes c JOIN gym_trainers t ON t.id = c.trainer_id
    WHERE c.is_active = 1 ORDER BY c.start_time, c.weekday
  `).all();
}

function getClassById(id) {
  return db.prepare('SELECT * FROM gym_classes WHERE id = ? AND is_active = 1').get(id) || null;
}

function createClass(data) {
  return db.prepare(`
    INSERT INTO gym_classes (name, tone, trainer_id, weekday, start_time, duration_min, capacity)
    VALUES (@name, @tone, @trainer_id, @weekday, @start_time, @duration_min, @capacity)
  `).run(data).lastInsertRowid;
}

function deactivateClass(id) {
  db.prepare('UPDATE gym_classes SET is_active = 0 WHERE id = ?').run(id);
}

function getBookingCounts(from, to) {
  return db.prepare(`
    SELECT class_id, session_date,
      SUM(CASE WHEN status != 'waitlist' THEN 1 ELSE 0 END) AS booked,
      SUM(CASE WHEN status = 'waitlist' THEN 1 ELSE 0 END) AS waitlist
    FROM gym_class_bookings WHERE session_date BETWEEN ? AND ?
    GROUP BY class_id, session_date
  `).all(from, to);
}

function getRoster(classId, date) {
  return db.prepare(`
    SELECT b.id, b.status, b.customer_id, cu.name AS customer_name, cu.phone
    FROM gym_class_bookings b JOIN customers cu ON cu.id = b.customer_id
    WHERE b.class_id = ? AND b.session_date = ?
    ORDER BY CASE b.status WHEN 'waitlist' THEN 1 ELSE 0 END, b.id
  `).all(classId, date);
}

function countBooked(classId, date) {
  return db.prepare(`
    SELECT COUNT(*) AS n FROM gym_class_bookings
    WHERE class_id = ? AND session_date = ? AND status != 'waitlist'
  `).get(classId, date).n;
}

function insertBooking(classId, customerId, date, status) {
  return db.prepare(`
    INSERT INTO gym_class_bookings (class_id, customer_id, session_date, status) VALUES (?, ?, ?, ?)
  `).run(classId, customerId, date, status).lastInsertRowid;
}

function getBooking(id) {
  return db.prepare('SELECT * FROM gym_class_bookings WHERE id = ?').get(id) || null;
}

function setBookingStatus(id, status) {
  db.prepare('UPDATE gym_class_bookings SET status = ? WHERE id = ?').run(status, id);
}

function deleteBooking(id) {
  db.prepare('DELETE FROM gym_class_bookings WHERE id = ?').run(id);
}

function firstWaitlisted(classId, date) {
  return db.prepare(`
    SELECT id FROM gym_class_bookings WHERE class_id = ? AND session_date = ? AND status = 'waitlist'
    ORDER BY id LIMIT 1
  `).get(classId, date) || null;
}

function getPackages() {
  return db.prepare(`
    SELECT p.*, cu.name AS customer_name, t.name AS trainer_name,
      (SELECT COUNT(*) FROM gym_pt_sessions s WHERE s.package_id = p.id) AS sessions_used,
      (SELECT MAX(session_date) FROM gym_pt_sessions s WHERE s.package_id = p.id) AS last_session
    FROM gym_pt_packages p
    JOIN customers cu ON cu.id = p.customer_id
    JOIN gym_trainers t ON t.id = p.trainer_id
    ORDER BY p.id DESC
  `).all();
}

function getPackageById(id) {
  return db.prepare(`
    SELECT p.*, (SELECT COUNT(*) FROM gym_pt_sessions s WHERE s.package_id = p.id) AS sessions_used
    FROM gym_pt_packages p WHERE p.id = ?
  `).get(id) || null;
}

function createPackage(data) {
  return db.prepare(`
    INSERT INTO gym_pt_packages (customer_id, trainer_id, sessions_total, unit_price, discount_pct, total, valid_until)
    VALUES (@customer_id, @trainer_id, @sessions_total, @unit_price, @discount_pct, @total, @valid_until)
  `).run(data).lastInsertRowid;
}

function setPackageTrainer(id, trainerId) {
  db.prepare('UPDATE gym_pt_packages SET trainer_id = ? WHERE id = ?').run(trainerId, id);
}

function insertPtSession(packageId, trainerId, unitPrice, date) {
  return db.prepare(`
    INSERT INTO gym_pt_sessions (package_id, trainer_id, unit_price, session_date) VALUES (?, ?, ?, ?)
  `).run(packageId, trainerId, unitPrice, date).lastInsertRowid;
}

function customerExists(id) {
  return Boolean(db.prepare('SELECT 1 FROM customers WHERE id = ? AND is_active = 1').get(id));
}

module.exports = {
  db,
  getTrainers, getTrainerById, createTrainer, updateTrainer,
  getPtSessionTotals, getPtSessionsByDay, getGroupClassesHeld, getAttendance, getActiveMembersPerTrainer,
  getClasses, getClassById, createClass, deactivateClass,
  getBookingCounts, getRoster, countBooked, insertBooking, getBooking, setBookingStatus, deleteBooking, firstWaitlisted,
  getPackages, getPackageById, createPackage, setPackageTrainer, insertPtSession,
  customerExists,
};

const { db } = require('../database/db');

function getResources({ activeOnly = false } = {}) {
  return db.prepare(`
    SELECT r.*,
      (SELECT COUNT(*) FROM appointment_working_hours h WHERE h.resource_id = r.id) AS working_days
    FROM appointment_resources r
    ${activeOnly ? 'WHERE r.is_active = 1' : ''}
    ORDER BY r.name COLLATE NOCASE
  `).all();
}

function getResourceById(id) {
  const resource = db.prepare('SELECT * FROM appointment_resources WHERE id = ?').get(id);
  if (!resource) return null;
  resource.workingHours = db.prepare(`
    SELECT weekday, start_time, end_time FROM appointment_working_hours
    WHERE resource_id = ? ORDER BY weekday
  `).all(id);
  return resource;
}

function saveResource({ id, name, resourceType, description, isActive, workingHours }) {
  return db.transaction(() => {
    let resourceId = id;
    if (id) {
      db.prepare(`
        UPDATE appointment_resources
        SET name = ?, resource_type = ?, description = ?, is_active = ?
        WHERE id = ?
      `).run(name, resourceType, description || null, isActive ? 1 : 0, id);
    } else {
      resourceId = db.prepare(`
        INSERT INTO appointment_resources (name, resource_type, description)
        VALUES (?, ?, ?)
      `).run(name, resourceType, description || null).lastInsertRowid;
    }
    db.prepare('DELETE FROM appointment_working_hours WHERE resource_id = ?').run(resourceId);
    const insertHour = db.prepare(`
      INSERT INTO appointment_working_hours (resource_id, weekday, start_time, end_time)
      VALUES (?, ?, ?, ?)
    `);
    for (const hours of workingHours) {
      insertHour.run(resourceId, hours.weekday, hours.startTime, hours.endTime);
    }
    return resourceId;
  })();
}

function getServices({ activeOnly = false } = {}) {
  return db.prepare(`
    SELECT * FROM appointment_services
    ${activeOnly ? 'WHERE is_active = 1' : ''}
    ORDER BY name COLLATE NOCASE
  `).all();
}

function saveService({ id, name, durationMinutes, bufferMinutes, price, resourceType, description, isActive }) {
  if (id) {
    return db.prepare(`
      UPDATE appointment_services
      SET name = ?, duration_minutes = ?, buffer_minutes = ?, price = ?,
        resource_type = ?, description = ?, is_active = ?
      WHERE id = ?
    `).run(name, durationMinutes, bufferMinutes, price, resourceType || null, description || null, isActive ? 1 : 0, id);
  }
  return db.prepare(`
    INSERT INTO appointment_services
      (name, duration_minutes, buffer_minutes, price, resource_type, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(name, durationMinutes, bufferMinutes, price, resourceType || null, description || null).lastInsertRowid;
}

function getHolidays({ fromDate, toDate } = {}) {
  return db.prepare(`
    SELECT h.*, r.name AS resource_name
    FROM appointment_holidays h
    LEFT JOIN appointment_resources r ON r.id = h.resource_id
    WHERE (? IS NULL OR h.end_date >= ?) AND (? IS NULL OR h.start_date <= ?)
    ORDER BY h.start_date, h.start_time
  `).all(fromDate || null, fromDate || null, toDate || null, toDate || null);
}

function createHoliday({ resourceId, startDate, endDate, startTime, endTime, name }) {
  return db.prepare(`
    INSERT INTO appointment_holidays (resource_id, start_date, end_date, start_time, end_time, name)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(resourceId || null, startDate, endDate, startTime || null, endTime || null, name).lastInsertRowid;
}

function removeHoliday(id) {
  return db.prepare('DELETE FROM appointment_holidays WHERE id = ?').run(id);
}

function getAppointments({ from, to, status } = {}) {
  const conditions = [];
  const params = [];
  if (from) {
    conditions.push('a.end_at >= ?');
    params.push(from);
  }
  if (to) {
    conditions.push('a.start_at < ?');
    params.push(to);
  }
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT a.*, s.name AS service_name, s.duration_minutes, s.price,
      r.name AS resource_name, r.resource_type
    FROM appointments a
    JOIN appointment_services s ON s.id = a.service_id
    JOIN appointment_resources r ON r.id = a.resource_id
    ${where}
    ORDER BY a.start_at
  `).all(...params);
}

function getAppointment(id) {
  return db.prepare(`
    SELECT a.*, s.name AS service_name, s.duration_minutes, s.price,
      r.name AS resource_name, r.resource_type
    FROM appointments a
    JOIN appointment_services s ON s.id = a.service_id
    JOIN appointment_resources r ON r.id = a.resource_id
    WHERE a.id = ?
  `).get(id);
}

function findWorkingHours(resourceId, weekday) {
  return db.prepare(`
    SELECT start_time, end_time FROM appointment_working_hours
    WHERE resource_id = ? AND weekday = ?
  `).get(resourceId, weekday);
}

function findHoliday(resourceId, date, startTime, endTime) {
  return db.prepare(`
    SELECT name FROM appointment_holidays
    WHERE (resource_id IS NULL OR resource_id = ?)
      AND start_date <= ? AND end_date >= ?
      AND (start_time IS NULL OR start_time < ?)
      AND (end_time IS NULL OR end_time > ?)
    LIMIT 1
  `).get(resourceId, date, date, endTime, startTime);
}

function findConflict(resourceId, startAt, endAt, excludeId = null) {
  return db.prepare(`
    SELECT id FROM appointments
    WHERE resource_id = ?
      AND status IN ('booked', 'confirmed')
      AND start_at < ? AND end_at > ?
      AND (? IS NULL OR id != ?)
    LIMIT 1
  `).get(resourceId, endAt, startAt, excludeId, excludeId);
}

function createAppointment(data) {
  return db.prepare(`
    INSERT INTO appointments (
      service_id, resource_id, customer_id, customer_name, customer_phone,
      start_at, end_at, deposit_amount, reminder_minutes, notes, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.serviceId,
    data.resourceId,
    data.customerId || null,
    data.customerName,
    data.customerPhone || null,
    data.startAt,
    data.endAt,
    data.depositAmount,
    data.reminderMinutes,
    data.notes || null,
    data.createdByUserId || null,
  ).lastInsertRowid;
}

function updateStatus(id, status) {
  return db.prepare(`
    UPDATE appointments SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?
  `).run(status, id);
}

function updateSchedule(id, resourceId, startAt, endAt) {
  return db.prepare(`
    UPDATE appointments
    SET resource_id = ?, start_at = ?, end_at = ?, reminder_sent = 0,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(resourceId, startAt, endAt, id);
}

function getDueReminders(nowIso, horizonIso) {
  return db.prepare(`
    SELECT a.*, s.name AS service_name, r.name AS resource_name
    FROM appointments a
    JOIN appointment_services s ON s.id = a.service_id
    JOIN appointment_resources r ON r.id = a.resource_id
    WHERE a.status IN ('booked', 'confirmed') AND a.reminder_sent = 0
      AND a.start_at > ? AND a.start_at <= ?
  `).all(nowIso, horizonIso);
}

function markReminderSent(id) {
  return db.prepare(`
    UPDATE appointments SET reminder_sent = 1, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND reminder_sent = 0
  `).run(id);
}

module.exports = {
  getResources,
  getResourceById,
  saveResource,
  getServices,
  saveService,
  getHolidays,
  createHoliday,
  removeHoliday,
  getAppointments,
  getAppointment,
  findWorkingHours,
  findHoliday,
  findConflict,
  createAppointment,
  updateStatus,
  updateSchedule,
  getDueReminders,
  markReminderSent,
};

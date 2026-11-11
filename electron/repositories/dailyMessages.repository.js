const { db } = require('../database/db');

// Each query returns the raw rows one kind of "today's message" is built from.
// Only rows with a phone number: a message nobody can send is not offered.

function getAppointmentsBetween(startIso, endIso) {
  return db.prepare(`
    SELECT a.id, a.customer_id, a.customer_name AS name, a.customer_phone AS phone, a.start_at,
      s.name AS service_name
    FROM appointments a
    LEFT JOIN appointment_services s ON s.id = a.service_id
    WHERE a.status IN ('booked', 'confirmed')
      AND a.start_at >= ? AND a.start_at < ?
      AND COALESCE(TRIM(a.customer_phone), '') <> ''
    ORDER BY a.start_at
  `).all(startIso, endIso);
}

function getSalonAppointmentsOn(date) {
  return db.prepare(`
    SELECT a.id, a.customer_id, a.customer_name AS name, a.customer_phone AS phone,
      a.appointment_date, a.start_time, s.name AS service_name
    FROM salon_appointments a
    LEFT JOIN salon_services s ON s.id = a.service_id
    WHERE a.status IN ('booked', 'confirmed') AND a.appointment_date = ?
      AND COALESCE(TRIM(a.customer_phone), '') <> ''
    ORDER BY a.start_time
  `).all(date);
}

function getStaleDeals(days) {
  return db.prepare(`
    SELECT o.id, o.customer_id, o.title, o.last_stage_changed_at, c.name, c.phone
    FROM crm_opportunities o
    JOIN customers c ON c.id = o.customer_id
    WHERE o.stage NOT IN ('won', 'lost')
      AND o.last_stage_changed_at <= datetime('now', ?)
      AND COALESCE(TRIM(c.phone), '') <> ''
    ORDER BY o.last_stage_changed_at
  `).all(`-${days} days`);
}

function getLeadsToFollow(days) {
  return db.prepare(`
    SELECT id, name, phone, status, updated_at
    FROM crm_leads
    WHERE status IN ('new', 'contacted')
      AND updated_at <= datetime('now', ?)
      AND COALESCE(TRIM(phone), '') <> ''
    ORDER BY updated_at
  `).all(`-${days} days`);
}

function getSubscriptionsEnding(fromDate, toDate) {
  return db.prepare(`
    SELECT sub.id, sub.customer_id, sub.end_date, c.name, c.phone, p.name AS package_name
    FROM customer_subscriptions sub
    JOIN customers c ON c.id = sub.customer_id
    JOIN packages p ON p.id = sub.package_id
    WHERE sub.status = 'active' AND date(sub.end_date) BETWEEN ? AND ?
      AND COALESCE(TRIM(c.phone), '') <> ''
    ORDER BY sub.end_date
  `).all(fromDate, toDate);
}

function getStaleRuleDays() {
  const row = db.prepare(`
    SELECT config_json FROM crm_automation_rules
    WHERE trigger_type = 'opportunity_stale' AND is_enabled = 1
    ORDER BY id LIMIT 1
  `).get();
  try {
    const days = Number(JSON.parse(row?.config_json || '{}').days);
    return Number.isInteger(days) && days >= 1 && days <= 365 ? days : null;
  } catch {
    return null;
  }
}

/** Last day each (kind, ref) was sent, as a Map of "kind:ref" -> "YYYY-MM-DD". */
function getLastSent() {
  // shortcut: reads the whole table; prune rows older than a few months if it ever grows large.
  const rows = db.prepare('SELECT kind, ref_id, MAX(sent_on) AS last FROM daily_messages_sent GROUP BY kind, ref_id').all();
  return new Map(rows.map((row) => [`${row.kind}:${row.ref_id}`, row.last]));
}

/** Marks the row sent and logs it on the CRM record, in one transaction. */
const markSent = db.transaction(({ kind, refId, day, userId, record, title }) => {
  const result = db.prepare(`
    INSERT OR IGNORE INTO daily_messages_sent (kind, ref_id, sent_on, user_id) VALUES (?, ?, ?, ?)
  `).run(kind, refId, day, userId || null);
  if (result.changes && record) {
    db.prepare(`
      INSERT INTO crm_activities (record_type, record_id, activity_type, title, status, owner_user_id, created_by)
      VALUES (?, ?, 'note', ?, 'completed', ?, ?)
    `).run(record.type, record.id, title, userId || null, userId || null);
  }
  return result.changes > 0;
});

module.exports = {
  getAppointmentsBetween,
  getSalonAppointmentsOn,
  getStaleDeals,
  getLeadsToFollow,
  getSubscriptionsEnding,
  getStaleRuleDays,
  getLastSent,
  markSent,
};

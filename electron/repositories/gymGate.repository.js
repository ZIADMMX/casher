const { db } = require('../database/db');
const settings = require('./settings.repository');

// "GM-1042" or "1042" is the member id; anything else is matched against the phone.
function findCustomer(code) {
  const digits = /^(?:GM-?)?(\d{1,9})$/i.exec(code);
  if (digits) {
    const byId = db.prepare('SELECT id, name, phone, is_active FROM customers WHERE id = ?').get(Number(digits[1]));
    if (byId) return byId;
  }
  return db.prepare('SELECT id, name, phone, is_active FROM customers WHERE phone = ? AND phone != \'\'').get(code) || null;
}

function getLatestSubscription(customerId) {
  return db.prepare(`
    SELECT cs.id, cs.status, cs.end_date, cs.remaining_credits, cs.total_credits,
           p.name AS package_name, p.type AS package_type
    FROM customer_subscriptions cs JOIN packages p ON p.id = cs.package_id
    WHERE cs.customer_id = ? AND cs.status != 'cancelled'
    ORDER BY (cs.status = 'active') DESC, cs.id DESC LIMIT 1
  `).get(customerId) || null;
}

function getBalance(customerId) {
  return db.prepare(`
    SELECT ROUND(
      COALESCE((SELECT SUM(total_amount) FROM sales WHERE customer_id = @id AND payment_method = 'credit'), 0)
      - COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id = @id), 0), 2) AS balance
  `).get({ id: customerId }).balance;
}

// The member's last accepted scan, to tell a repeated swipe from a real second visit.
function getLastAcceptedCheckin(customerId, since) {
  return db.prepare(`
    SELECT id, created_at FROM gym_checkins
    WHERE customer_id = ? AND result != 'denied' AND created_at >= ?
    ORDER BY id DESC LIMIT 1
  `).get(customerId, since) || null;
}

function insertCheckin(row) {
  return db.prepare(`
    INSERT INTO gym_checkins (customer_id, code_text, result, reason, subscription_id, gate, created_at)
    VALUES (@customer_id, @code_text, @result, @reason, @subscription_id, @gate, @created_at)
  `).run(row).lastInsertRowid;
}

// Visits this month and the one before this one (allowed/warning only).
function getVisitInfo(customerId, monthStart, beforeId) {
  const month = db.prepare(`
    SELECT COUNT(*) AS n FROM gym_checkins WHERE customer_id = ? AND result != 'denied' AND created_at >= ?
  `).get(customerId, monthStart).n;
  const last = db.prepare(`
    SELECT created_at FROM gym_checkins WHERE customer_id = ? AND result != 'denied' AND id < ?
    ORDER BY id DESC LIMIT 1
  `).get(customerId, beforeId);
  return { month, lastVisit: last?.created_at || null };
}

function getRecent(limit) {
  return db.prepare(`
    SELECT g.id, g.result, g.reason, g.created_at, g.gate, g.code_text, g.customer_id,
           c.name AS customer_name,
           (SELECT p.name FROM customer_subscriptions cs JOIN packages p ON p.id = cs.package_id
            WHERE cs.customer_id = g.customer_id AND cs.status != 'cancelled' ORDER BY cs.id DESC LIMIT 1) AS package_name
    FROM gym_checkins g LEFT JOIN customers c ON c.id = g.customer_id
    ORDER BY g.id DESC LIMIT ?
  `).all(limit);
}

function getHourly(dayStart) {
  return db.prepare(`
    SELECT CAST(strftime('%H', created_at) AS INTEGER) AS hour, COUNT(*) AS n
    FROM gym_checkins WHERE result != 'denied' AND created_at >= ? GROUP BY hour
  `).all(dayStart);
}

function countInside(since) {
  return db.prepare(`
    SELECT COUNT(DISTINCT customer_id) AS n FROM gym_checkins WHERE result != 'denied' AND created_at >= ?
  `).get(since).n;
}

// Member attendance report: per-member visit counts and last visit.
// The subscription is read as a subquery, not joined: a member with an old and a
// new subscription would otherwise have their visits counted once per subscription.
function getAttendanceReport({ from, to, limit = 200 }) {
  return db.prepare(`
    SELECT c.id, c.name, c.phone,
           COUNT(g.id) AS visits,
           MAX(g.created_at) AS last_visit,
           MIN(g.created_at) AS first_visit,
           (SELECT p.name FROM customer_subscriptions cs JOIN packages p ON p.id = cs.package_id
            WHERE cs.customer_id = c.id AND cs.status != 'cancelled'
            ORDER BY (cs.status = 'active') DESC, cs.id DESC LIMIT 1) AS package_name,
           (SELECT cs.status FROM customer_subscriptions cs
            WHERE cs.customer_id = c.id AND cs.status != 'cancelled'
            ORDER BY (cs.status = 'active') DESC, cs.id DESC LIMIT 1) AS sub_status,
           (SELECT cs.end_date FROM customer_subscriptions cs
            WHERE cs.customer_id = c.id AND cs.status != 'cancelled'
            ORDER BY (cs.status = 'active') DESC, cs.id DESC LIMIT 1) AS sub_end
    FROM customers c
    JOIN gym_checkins g ON g.customer_id = c.id AND g.result != 'denied'
    WHERE g.created_at >= @from AND g.created_at < @to
    GROUP BY c.id
    ORDER BY visits DESC
    LIMIT @limit
  `).all({ from, to, limit });
}

function getMemberCheckins(customerId, { from, to, limit = 100 }) {
  return db.prepare(`
    SELECT id, result, reason, gate, created_at
    FROM gym_checkins
    WHERE customer_id = ? AND created_at >= @from AND created_at < @to
    ORDER BY id DESC LIMIT @limit
  `).all(customerId, { from, to, limit });
}

// One row per member who ever entered: last accepted visit and visits since monthStart (denied scans excluded).
function getVisitSummary(monthStart) {
  return db.prepare(`
    SELECT customer_id, MAX(created_at) AS last_visit, SUM(created_at >= ?) AS visits_month
    FROM gym_checkins
    WHERE customer_id IS NOT NULL AND result != 'denied'
    GROUP BY customer_id
  `).all(monthStart);
}

const getCapacity = () => Number(settings.get('gym_capacity')) || 60;
const setCapacity = (n) => settings.set('gym_capacity', n);

module.exports = {
  findCustomer, getLatestSubscription, getBalance, insertCheckin, getVisitInfo, getLastAcceptedCheckin,
  getRecent, getHourly, countInside, getCapacity, setCapacity,
  getAttendanceReport, getMemberCheckins, getVisitSummary,
};

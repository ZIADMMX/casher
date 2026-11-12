const { db } = require('../database/db');

function getCourts({ search = '', courtType = '', status = 'active', page = 1, pageSize = 10 } = {}) {
  const clauses = [];
  const params = [];

  if (search.trim()) {
    clauses.push('(name LIKE ? OR city LIKE ? OR specialization LIKE ?)');
    const term = `%${search.trim()}%`;
    params.push(term, term, term);
  }
  if (courtType) {
    clauses.push('court_type = ?');
    params.push(courtType);
  }
  if (status === 'active' || status === 'inactive') {
    clauses.push('is_active = ?');
    params.push(status === 'active' ? 1 : 0);
  }

  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const total = db.prepare(`SELECT COUNT(*) AS count FROM courts ${where}`).get(...params).count;
  const items = db.prepare(`
    SELECT id, name, court_type, specialization, notes, phone, city, address,
           is_active, created_at, updated_at
    FROM courts ${where}
    ORDER BY name COLLATE NOCASE
    LIMIT ? OFFSET ?
  `).all(...params, pageSize, (page - 1) * pageSize);

  return { items, total, page, pageSize };
}

function getCourtById(id) {
  return db.prepare('SELECT * FROM courts WHERE id = ?').get(id) || null;
}

function createCourt(id, data) {
  db.prepare(`
    INSERT INTO courts (id, name, court_type, specialization, notes, phone, city, address)
    VALUES (@id, @name, @court_type, @specialization, @notes, @phone, @city, @address)
  `).run({
    id,
    name: data.name,
    court_type: data.court_type,
    specialization: data.specialization || null,
    notes: data.notes || null,
    phone: data.phone || null,
    city: data.city || null,
    address: data.address || null,
  });
  return getCourtById(id);
}

function updateCourt(id, data) {
  const columns = {
    name: 'name',
    court_type: 'court_type',
    specialization: 'specialization',
    notes: 'notes',
    phone: 'phone',
    city: 'city',
    address: 'address',
    is_active: 'is_active',
  };
  const fields = Object.keys(data).filter((key) => columns[key]);
  if (!fields.length) throw new Error('لا توجد بيانات لتحديثها');

  const assignments = fields.map((field) => `${columns[field]} = @${field}`);
  assignments.push("updated_at = datetime('now')");
  const result = db.prepare(`
    UPDATE courts SET ${assignments.join(', ')} WHERE id = @id
  `).run({ ...data, id });
  return result.changes ? getCourtById(id) : null;
}

function deactivateCourt(id) {
  return updateCourt(id, { is_active: 0 });
}

// Session dates are saved as local "YYYY-MM-DDTHH:mm", so they are compared with local now.
const UPCOMING = "s.status = 'scheduled' AND datetime(s.session_date) >= datetime('now', 'localtime')";

/** Directory stats from the local case files: counts, per-court cases and next session, upcoming sessions. */
function getCourtsOverview() {
  const courts = db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(is_active = 1), 0) AS active,
      COALESCE(SUM(is_active = 0), 0) AS inactive,
      COALESCE(SUM(is_active = 1 AND (TRIM(COALESCE(phone, '')) = ''
        OR (TRIM(COALESCE(city, '')) = '' AND TRIM(COALESCE(address, '')) = ''))), 0) AS missing
    FROM courts
  `).get();

  const byType = Object.fromEntries(db.prepare(`
    SELECT court_type, COUNT(*) AS total FROM courts WHERE is_active = 1 GROUP BY court_type
  `).all().map((row) => [row.court_type, row.total]));

  const cases = db.prepare(`
    SELECT
      COALESCE(SUM(co.id IS NOT NULL), 0) AS linked,
      COALESCE(SUM(co.id IS NOT NULL AND c.status IN ('active', 'adjourned', 'appealed')), 0) AS open,
      COALESCE(SUM(co.id IS NOT NULL AND c.status = 'judged'), 0) AS judged,
      COALESCE(SUM(co.id IS NULL AND c.status <> 'closed'), 0) AS unlinked
    FROM legal_cases c
    LEFT JOIN courts co ON co.id = c.court_id
  `).get();

  const sessions = db.prepare(`
    SELECT
      COALESCE(SUM(datetime(s.session_date) < datetime('now', 'localtime', '+7 days')), 0) AS week,
      COALESCE(SUM(date(s.session_date) = date('now', 'localtime', '+1 day')), 0) AS tomorrow
    FROM court_sessions s
    JOIN legal_cases c ON c.id = s.case_id
    JOIN courts co ON co.id = c.court_id
    WHERE ${UPCOMING}
  `).get();

  const upcoming = db.prepare(`
    SELECT s.id, s.session_date, c.case_number, c.circuit_name, co.name AS court_name
    FROM court_sessions s
    JOIN legal_cases c ON c.id = s.case_id
    JOIN courts co ON co.id = c.court_id
    WHERE ${UPCOMING}
    ORDER BY datetime(s.session_date)
    LIMIT 4
  `).all();

  const perCourt = db.prepare(`
    SELECT c.court_id, COUNT(*) AS cases,
      (SELECT MIN(s.session_date) FROM court_sessions s
        JOIN legal_cases c2 ON c2.id = s.case_id
        WHERE c2.court_id = c.court_id AND ${UPCOMING}) AS next_session
    FROM legal_cases c
    WHERE c.court_id IS NOT NULL
    GROUP BY c.court_id
  `).all();

  return { courts, byType, cases, sessions, upcoming, perCourt };
}

module.exports = { getCourts, getCourtById, createCourt, updateCourt, deactivateCourt, getCourtsOverview };

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
    SELECT id, name, court_type, specialization, notes, phone, city, address, working_hours,
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
    INSERT INTO courts (id, name, court_type, specialization, notes, phone, city, address, working_hours)
    VALUES (@id, @name, @court_type, @specialization, @notes, @phone, @city, @address, @working_hours)
  `).run({
    working_hours: data.working_hours || null,
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
    working_hours: 'working_hours',
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
    SELECT s.id, s.session_date, c.case_number, c.circuit_name, co.id AS court_id, co.name AS court_name
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

/** One court's page: KPIs, upcoming sessions, cases, documents, expenses, circuits and recent activity. */
function getCourtProfile(id) {
  const court = getCourtById(id);
  if (!court) return null;

  const stats = db.prepare(`
    SELECT COUNT(*) AS total,
      COALESCE(SUM(status IN ('active', 'adjourned', 'appealed')), 0) AS open,
      COALESCE(SUM(status = 'judged'), 0) AS judged,
      COALESCE(SUM(status = 'closed'), 0) AS closed,
      -- files closed before verdicts were recorded fall back to their last update as the end date
      AVG(CASE WHEN status IN ('judged', 'closed')
        THEN julianday(COALESCE(verdict_date, updated_at)) - julianday(created_at) END) AS avg_days,
      COALESCE(SUM(verdict_result IS NOT NULL AND verdict_date >= date('now', 'localtime', '-12 months')), 0) AS verdicts_year,
      COALESCE(SUM(verdict_result = 'favorable' AND verdict_date >= date('now', 'localtime', '-12 months')), 0) AS favorable_year
    FROM legal_cases WHERE court_id = ?
  `).get(id);

  stats.urgent = db.prepare(`
    SELECT COUNT(DISTINCT c.id) AS count
    FROM legal_cases c JOIN court_sessions s ON s.case_id = c.id
    WHERE c.court_id = ? AND ${UPCOMING} AND datetime(s.session_date) < datetime('now', 'localtime', '+7 days')
  `).get(id).count;

  const upcoming = db.prepare(`
    SELECT s.id, s.session_date, s.session_reason, s.court_room,
      c.id AS case_id, c.case_number, c.circuit_name, cu.name AS client_name
    FROM court_sessions s
    JOIN legal_cases c ON c.id = s.case_id
    LEFT JOIN customers cu ON cu.id = c.client_id
    WHERE c.court_id = ? AND ${UPCOMING}
    ORDER BY datetime(s.session_date)
    LIMIT 50
  `).all(id);

  const cases = db.prepare(`
    SELECT c.id, c.case_number, c.circuit_name, c.subject, c.status, cu.name AS client_name,
      (SELECT MIN(s.session_date) FROM court_sessions s WHERE s.case_id = c.id AND ${UPCOMING}) AS next_session
    FROM legal_cases c
    LEFT JOIN customers cu ON cu.id = c.client_id
    WHERE c.court_id = ?
    ORDER BY datetime(c.updated_at) DESC
    LIMIT 100
  `).all(id);

  const documents = db.prepare(`
    SELECT d.id, d.title, d.doc_type, datetime(d.created_at, 'localtime') AS created_at, c.id AS case_id, c.case_number
    FROM case_documents d JOIN legal_cases c ON c.id = d.case_id
    WHERE c.court_id = ?
    ORDER BY datetime(d.created_at) DESC
    LIMIT 50
  `).all(id);

  const expenses = db.prepare(`
    SELECT f.id, f.type, f.amount, f.date, f.description, c.id AS case_id, c.case_number
    FROM case_financials f JOIN legal_cases c ON c.id = f.case_id
    WHERE c.court_id = ? AND f.type NOT IN ('retainer_deposit', 'fee_payment')
    ORDER BY datetime(f.date) DESC
    LIMIT 50
  `).all(id);
  const expensesTotal = db.prepare(`
    SELECT COALESCE(SUM(f.amount), 0) AS total
    FROM case_financials f JOIN legal_cases c ON c.id = f.case_id
    WHERE c.court_id = ? AND f.type NOT IN ('retainer_deposit', 'fee_payment')
  `).get(id).total;

  // Each circuit with its case count, plus the weekday/time its sessions usually sit on.
  const circuits = db.prepare(`
    SELECT TRIM(circuit_name) AS name, COUNT(*) AS cases
    FROM legal_cases
    WHERE court_id = ? AND TRIM(COALESCE(circuit_name, '')) <> ''
    GROUP BY TRIM(circuit_name)
    ORDER BY cases DESC
    LIMIT 6
  `).all(id);
  const slots = db.prepare(`
    SELECT TRIM(c.circuit_name) AS name, CAST(strftime('%w', s.session_date) AS INTEGER) AS weekday,
      strftime('%H:%M', s.session_date) AS time, COUNT(*) AS hits
    FROM court_sessions s JOIN legal_cases c ON c.id = s.case_id
    WHERE c.court_id = ? AND TRIM(COALESCE(c.circuit_name, '')) <> ''
    GROUP BY 1, 2, 3
    ORDER BY hits DESC
  `).all(id);
  for (const circuit of circuits) {
    const mine = slots.filter((slot) => slot.name === circuit.name);
    circuit.weekdays = [...new Set(mine.map((slot) => slot.weekday))].slice(0, 2).sort((a, b) => a - b);
    circuit.time = mine[0]?.time || null;
  }

  const activity = db.prepare(`
    SELECT * FROM (
      SELECT 'session' AS kind, datetime(s.updated_at, 'localtime') AS at, c.id AS case_id, c.case_number,
        s.status AS detail, s.next_session_date AS extra
      FROM court_sessions s JOIN legal_cases c ON c.id = s.case_id
      WHERE c.court_id = @id AND s.status <> 'scheduled'
      UNION ALL
      SELECT 'document', datetime(d.created_at, 'localtime'), c.id, c.case_number, d.title, NULL
      FROM case_documents d JOIN legal_cases c ON c.id = d.case_id
      WHERE c.court_id = @id
      UNION ALL
      SELECT 'case', datetime(c.created_at, 'localtime'), c.id, c.case_number, c.subject, NULL
      FROM legal_cases c WHERE c.court_id = @id
    ) ORDER BY at DESC LIMIT 6
  `).all({ id });

  return { court, stats, upcoming, cases, documents, expenses, expensesTotal, circuits, activity };
}

module.exports = {
  getCourts, getCourtById, createCourt, updateCourt, deactivateCourt, getCourtsOverview, getCourtProfile,
};

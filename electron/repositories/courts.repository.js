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

module.exports = { getCourts, getCourtById, createCourt, updateCourt, deactivateCourt };

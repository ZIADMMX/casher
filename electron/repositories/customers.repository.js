const { db } = require('../database/db');

function create({ name, phone, email, companyId, leadSource, emailConsent, smsConsent }) {
  const columns = new Set(db.prepare('PRAGMA table_info(customers)').all().map((column) => column.name));
  if (!columns.has('company_id')) {
    const result = db.prepare(`
      INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)
    `).run(name, phone || null, email || null);
    return result.lastInsertRowid;
  }
  const result = db.prepare(`
    INSERT INTO customers
      (name, phone, email, company_id, lead_source, email_consent, sms_consent)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, phone || null, email || null, companyId || null, leadSource || null,
    emailConsent ? 1 : 0, smsConsent ? 1 : 0
  );
  return result.lastInsertRowid;
}

function getAll() {
  const columns = new Set(db.prepare('PRAGMA table_info(customers)').all().map((column) => column.name));
  const companiesTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'crm_companies'"
  ).get();
  if (!columns.has('company_id') || !companiesTable) {
    return db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY created_at DESC').all();
  }
  return db.prepare(`
    SELECT customer.*, company.name AS company_name
    FROM customers customer
    LEFT JOIN crm_companies company ON company.id = customer.company_id
    WHERE customer.is_active = 1
    ORDER BY customer.created_at DESC
  `).all();
}

function getById(id) {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

function getPowerOfAttorneys(customerId) {
  return db.prepare(`
    SELECT mandate.*, user.full_name AS created_by_name
    FROM customer_power_of_attorneys mandate
    LEFT JOIN users user ON user.id = mandate.created_by
    WHERE mandate.customer_id = ?
    ORDER BY mandate.issued_at DESC, mandate.id DESC
  `).all(customerId);
}

function getPowerOfAttorneyById(id) {
  return db.prepare('SELECT * FROM customer_power_of_attorneys WHERE id = ?').get(id);
}

function createPowerOfAttorney(data) {
  const result = db.prepare(`
    INSERT INTO customer_power_of_attorneys
      (customer_id, number, issued_at, scope, expires_at, notes, created_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    data.customer_id,
    data.number,
    data.issued_at,
    data.scope,
    data.expires_at || null,
    data.notes || null,
    data.created_by || null
  );
  return db.prepare('SELECT * FROM customer_power_of_attorneys WHERE id = ?').get(result.lastInsertRowid);
}

function updatePowerOfAttorney(id, data) {
  const columns = ['number', 'issued_at', 'scope', 'expires_at', 'notes'];
  const entries = columns.filter((column) => Object.hasOwn(data, column));
  if (entries.length) {
    const assignments = entries.map((column) => `${column} = ?`);
    assignments.push('updated_at = CURRENT_TIMESTAMP');
    db.prepare(`
      UPDATE customer_power_of_attorneys
      SET ${assignments.join(', ')}
      WHERE id = ?
    `).run(...entries.map((column) => data[column] || null), id);
  }
  return db.prepare('SELECT * FROM customer_power_of_attorneys WHERE id = ?').get(id);
}

function deletePowerOfAttorney(id) {
  return db.prepare('DELETE FROM customer_power_of_attorneys WHERE id = ?').run(id);
}

function getByPhone(phone) {
  if (!phone) return null;
  return db.prepare('SELECT * FROM customers WHERE phone = ? AND is_active = 1').get(phone);
}

function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM customers WHERE is_active = 1').get().count;
}

function archive(id) {
  return db.prepare('UPDATE customers SET is_active = 0 WHERE id = ?').run(id);
}

// A customer's debt: credit sales minus payments. Credit sales and payments are
// each summed once per customer, instead of joining every sale of every customer.
function getBalances() {
  return db.prepare(`
    SELECT c.id,
      ROUND(COALESCE(credit.total, 0) - COALESCE(paid.total, 0), 2) AS balance
    FROM customers c
    LEFT JOIN (
      SELECT customer_id, SUM(total_amount) AS total
      FROM sales
      WHERE payment_method = 'credit' AND customer_id IS NOT NULL
      GROUP BY customer_id
    ) credit ON credit.customer_id = c.id
    LEFT JOIN (
      SELECT customer_id, SUM(amount) AS total
      FROM customer_payments
      GROUP BY customer_id
    ) paid ON paid.customer_id = c.id
  `).all();
}

function getBalance(customerId) {
  const row = db.prepare(`
    SELECT ROUND(
      COALESCE((SELECT SUM(total_amount) FROM sales
                WHERE customer_id = @id AND payment_method = 'credit'), 0)
      - COALESCE((SELECT SUM(amount) FROM customer_payments WHERE customer_id = @id), 0),
    2) AS balance
  `).get({ id: customerId });
  return row ? row.balance : 0;
}

function createPayment({ customerId, amount, paymentMethod, notes, userId, shiftId }) {
  const result = db.prepare(`
    INSERT INTO customer_payments (customer_id, amount, payment_method, notes, user_id, shift_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(customerId, amount, paymentMethod, notes || null, userId || null, shiftId || null);
  return result.lastInsertRowid;
}

function getPayments(customerId) {
  return db.prepare(`
    SELECT cp.*, u.username
    FROM customer_payments cp
    LEFT JOIN users u ON u.id = cp.user_id
    WHERE cp.customer_id = ?
    ORDER BY cp.payment_date DESC, cp.id DESC
  `).all(customerId);
}

function getCreditSales(customerId) {
  return db.prepare(`
    SELECT id, total_amount, due_date, created_at
    FROM sales
    WHERE customer_id = ? AND payment_method = 'credit'
    ORDER BY created_at DESC, id DESC
  `).all(customerId);
}

module.exports = {
  create,
  getAll,
  getById,
  getByPhone,
  getPowerOfAttorneys,
  getPowerOfAttorneyById,
  createPowerOfAttorney,
  updatePowerOfAttorney,
  deletePowerOfAttorney,
  countAll,
  archive,
  getBalances,
  getBalance,
  createPayment,
  getPayments,
  getCreditSales,
};
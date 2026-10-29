const { db } = require('../database/db');

function create({ name, phone, email }) {
  const result = db.prepare(`
    INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)
  `).run(name, phone || null, email || null);
  return result.lastInsertRowid;
}

function getAll() {
  return db.prepare('SELECT * FROM customers WHERE is_active = 1 ORDER BY created_at DESC').all();
}

function getById(id) {
  return db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
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

function getBalances() {
  return db.prepare(`
    SELECT c.id,
      ROUND(COALESCE(SUM(CASE WHEN s.payment_method = 'credit' THEN s.total_amount ELSE 0 END), 0)
        - COALESCE((SELECT SUM(cp.amount) FROM customer_payments cp WHERE cp.customer_id = c.id), 0), 2) AS balance
    FROM customers c
    LEFT JOIN sales s ON s.customer_id = c.id
    GROUP BY c.id
  `).all();
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

module.exports = { create, getAll, getById, getByPhone, countAll, archive, getBalances, createPayment, getPayments, getCreditSales };
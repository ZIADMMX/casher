const { db } = require('../database/db');

function getByUsername(username) {
  const clean = username ? username.trim() : '';
  return db.prepare('SELECT * FROM users WHERE LOWER(username) = LOWER(?)').get(clean);
}

function create(user) {
  const stmt = db.prepare(`
    INSERT INTO users (username, password_hash, role, force_password_change, recovery_key_hash)
    VALUES (?, ?, ?, ?, ?)
  `);
  return stmt.run(
    user.username,
    user.passwordHash,
    user.role,
    user.forcePasswordChange ? 1 : 0,
    user.recoveryKeyHash || null
  );
}

function countAll() {
  return db.prepare('SELECT COUNT(*) as count FROM users').get().count;
}

function getAll() {
  return db.prepare('SELECT id, username, role, is_active, created_at FROM users ORDER BY created_at DESC').all();
}

function getAdmin() {
  return db.prepare("SELECT * FROM users WHERE role = 'admin' AND is_active = 1 LIMIT 1").get();
}

function setActive(id, isActive) {
  return db.prepare('UPDATE users SET is_active = ? WHERE id = ?').run(isActive ? 1 : 0, id);
}

function remove(id) {
  return db.prepare('DELETE FROM users WHERE id = ?').run(id);
}

function getById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function updateUsername(id, username) {
  return db.prepare('UPDATE users SET username = ? WHERE id = ?').run(username, id);
}

function updatePassword(id, passwordHash) {
  return db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, id);
}

function updateRecoveryKeyHash(id, recoveryKeyHash) {
  return db.prepare('UPDATE users SET recovery_key_hash = ? WHERE id = ?').run(recoveryKeyHash, id);
}

function clearForcePasswordChange(id) {
  return db.prepare('UPDATE users SET force_password_change = 0 WHERE id = ?').run(id);
}

module.exports = {
  getByUsername,
  getById,
  getAdmin,
  create,
  countAll,
  getAll,
  setActive,
  remove,
  updateUsername,
  updatePassword,
  updateRecoveryKeyHash,
  clearForcePasswordChange,
};


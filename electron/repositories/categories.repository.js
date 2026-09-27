const { db } = require('../database/db');

function getAll() {
  return db.prepare('SELECT * FROM categories ORDER BY name').all();
}

function getByName(name) {
  return db.prepare('SELECT * FROM categories WHERE name = ?').get(name);
}

function create(name) {
  const result = db.prepare('INSERT INTO categories (name) VALUES (?)').run(name);
  return result.lastInsertRowid;
}

module.exports = { getAll, getByName, create };

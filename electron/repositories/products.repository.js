const { db } = require('../database/db');

function create(product) {
  const stmt = db.prepare(`
    INSERT INTO products (name, description, category_id, image_path)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(
    product.name,
    product.description || null,
    product.categoryId || null,
    product.imagePath || null
  );
  return result.lastInsertRowid;
}

function getAll() {
  return db.prepare('SELECT * FROM products WHERE is_active = 1').all();
}

function getById(id) {
  return db.prepare('SELECT * FROM products WHERE id = ?').get(id);
}

function update(id, product) {
  return db.prepare(`
    UPDATE products SET name = ?, description = ?, category_id = ?, image_path = ?
    WHERE id = ?
  `).run(
    product.name,
    product.description || null,
    product.categoryId || null,
    product.imagePath || null,
    id
  );
}

function archive(id) {
  return db.prepare('UPDATE products SET is_active = 0 WHERE id = ?').run(id);
}

module.exports = { create, getAll, getById, update, archive };
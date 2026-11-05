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

let activeWithCategoryStmt = null;

// Active products with their category name, newest first (the catalog base list).
function getAllActiveWithCategory() {
  if (!activeWithCategoryStmt) {
    activeWithCategoryStmt = db.prepare(`
      SELECT
        p.id, p.name, p.description, p.category_id, p.image_path, p.is_service, p.created_at,
        c.name AS category_name
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.is_active = 1
      ORDER BY p.created_at DESC
    `);
  }
  return activeWithCategoryStmt.all();
}

module.exports = { create, getAll, getById, update, archive, getAllActiveWithCategory };
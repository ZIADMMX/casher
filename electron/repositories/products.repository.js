const { db } = require('../database/db');

let stmts = null;

function getStmts() {
  if (!stmts) {
    stmts = {
      create: db.prepare(`
        INSERT INTO products (name, description, category_id, image_path)
        VALUES (?, ?, ?, ?)
      `),
      getAll: db.prepare('SELECT * FROM products'),
      getById: db.prepare('SELECT * FROM products WHERE id = ?'),
      update: db.prepare(`
        UPDATE products SET name = ?, description = ?, category_id = ?, image_path = ?
        WHERE id = ?
      `),
      delete: db.prepare('DELETE FROM products WHERE id = ?'),
    };
  }
  return stmts;
}

function create(product) {
  const result = getStmts().create.run(
    product.name,
    product.description || null,
    product.categoryId || null,
    product.imagePath || null
  );
  return result.lastInsertRowid;
}

function getAll() {
  return getStmts().getAll.all();
}

function getById(id) {
  return getStmts().getById.get(id);
}

function update(id, product) {
  return getStmts().update.run(
    product.name,
    product.description || null,
    product.categoryId || null,
    product.imagePath || null,
    id
  );
}

function remove(id) {
  return getStmts().delete.run(id);
}

module.exports = { create, getAll, getById, update, remove };
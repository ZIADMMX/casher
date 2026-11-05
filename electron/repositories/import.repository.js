const { db } = require('../database/db');

// Prepared statements for a bulk product import. Call inside the caller's transaction.
function prepareProductImport() {
  const getCat = db.prepare('SELECT id FROM categories WHERE name = ?');
  const insertCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
  const getProd = db.prepare('SELECT id FROM products WHERE name = ? AND category_id = ?');
  const insertProd = db.prepare('INSERT INTO products (name, category_id) VALUES (?, ?)');
  const checkVariant = db.prepare('SELECT id FROM product_variants WHERE barcode = ?');
  const insertVariant = db.prepare(`
    INSERT INTO product_variants
    (product_id, size, color, barcode, purchase_price, selling_price, stock_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  return {
    findCategory: (name) => getCat.get(name),
    insertCategory: (name) => insertCat.run(name),
    findProduct: (name, categoryId) => getProd.get(name, categoryId),
    insertProduct: (name, categoryId) => insertProd.run(name, categoryId),
    findVariantByBarcode: (barcode) => checkVariant.get(barcode),
    insertVariant: (productId, size, color, barcode, purchasePrice, sellingPrice, quantity) =>
      insertVariant.run(productId, size, color, barcode, purchasePrice, sellingPrice, quantity),
  };
}

function prepareCustomerInsert() {
  const stmt = db.prepare('INSERT INTO customers (name, phone, email) VALUES (?, ?, ?)');
  return (name, phone, email) => stmt.run(name, phone, email);
}

function prepareSupplierInsert() {
  const stmt = db.prepare('INSERT INTO suppliers (name, phone, company, address, notes) VALUES (?, ?, ?, ?, ?)');
  return (name, phone, company, address, notes) => stmt.run(name, phone, company, address, notes);
}

module.exports = { prepareProductImport, prepareCustomerInsert, prepareSupplierInsert };

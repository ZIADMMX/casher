const { db } = require('../database/db');

function createSale({
  shiftId,
  customerId,
  customerName,
  customerPhone,
  userId,
  totalAmount,
  discount,
  paymentMethod,
  dueDate,
  branchId,
  warehouseId,
}) {
  const stmt = db.prepare(`
    INSERT INTO sales (
      shift_id, branch_id, warehouse_id, customer_id, customer_name, customer_phone, user_id,
      total_amount, discount, payment_method, due_date
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    shiftId || null,
    branchId || null,
    warehouseId || null,
    customerId || null,
    customerName || null,
    customerPhone || null,
    userId || null,
    totalAmount,
    discount || 0,
    paymentMethod,
    dueDate || null
  );
  return result.lastInsertRowid;
}

function createSaleItem(saleId, item) {
  const stmt = db.prepare(`
    INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price)
    VALUES (?, ?, ?, ?)
  `);
  stmt.run(saleId, item.variantId, item.quantity, item.unitPrice);
}

function getStatsByCustomer() {
  return db.prepare(`
    SELECT customer_id, SUM(total_amount) as totalSpent, COUNT(*) as invoiceCount
    FROM sales
    WHERE customer_id IS NOT NULL
    GROUP BY customer_id
  `).all();
}

function getById(saleId) {
  const sale = db.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
  if (!sale) return null;

  const items = db.prepare(`
    SELECT 
      si.id,
      si.sale_id,
      si.variant_id,
      si.variant_id as variantId,
      si.quantity, 
      si.unit_price, 
      pv.size, 
      pv.color, 
      pv.barcode,
      pv.sku,
      p.name as productName,
      p.id as productId
    FROM sale_items si
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    LEFT JOIN products p ON p.id = pv.product_id
    WHERE si.sale_id = ?
  `).all(saleId);

  return { ...sale, items };
}

module.exports = { createSale, createSaleItem, getStatsByCustomer, getById };
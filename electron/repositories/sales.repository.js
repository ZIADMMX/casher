const { db } = require('../database/db');
const { parseModifiers, serializeModifiers } = require('../services/modifiers.service');

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
  orderMode,
  kitchenStatus,
  branchId,
  warehouseId,
  serviceCharge,
  deliveryAddress,
}) {
  const stmt = db.prepare(`
    INSERT INTO sales (
      shift_id, branch_id, warehouse_id, customer_id, customer_name, customer_phone, user_id,
      total_amount, discount, payment_method, due_date, order_mode, kitchen_status,
      service_charge, delivery_address
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
    dueDate || null,
    orderMode || null,
    kitchenStatus || null,
    serviceCharge || 0,
    deliveryAddress || null
  );
  return result.lastInsertRowid;
}

// unit_cost is the cost of one sold unit at sale time (purchase price times the
// unit's conversion factor), so reports keep the real profit of this sale.
function createSaleItem(saleId, item) {
  const quantity = Number(item.quantity) || 0;
  const baseQuantity = Number(item.baseQuantityDeduction) || quantity;
  const factor = quantity > 0 ? baseQuantity / quantity : 1;
  const stmt = db.prepare(`
    INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, unit_cost, modifiers, note)
    VALUES (?, ?, ?, ?, COALESCE(?, (SELECT purchase_price * ? FROM product_variants WHERE id = ?)), ?, ?)
  `);
  stmt.run(saleId, item.variantId, item.quantity, item.unitPrice, item.unitCost ?? null, factor, item.variantId, serializeModifiers(item.modifiers), item.note ?? null);
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
      si.modifiers,
      si.note,
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

  return { ...sale, items: items.map((item) => ({ ...item, modifiers: parseModifiers(item.modifiers) })) };
}

// Returns work per item, so lines of the same item (plain and with add-ons) count as one.
function getSaleItem(saleId, variantId) {
  return db.prepare(`
    SELECT sale_id, variant_id, SUM(quantity) AS quantity,
      SUM(quantity * unit_price) / SUM(quantity) AS unit_price
    FROM sale_items WHERE sale_id = ? AND variant_id = ?
    GROUP BY sale_id, variant_id
  `).get(saleId, variantId);
}

module.exports = { createSale, createSaleItem, getStatsByCustomer, getById, getSaleItem };
const { db } = require('../database/db');

function create({ name, phone, company, address, notes }) {
  const result = db.prepare(`
    INSERT INTO suppliers (name, phone, company, address, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(name, phone || null, company || null, address || null, notes || null);
  return result.lastInsertRowid;
}

function update(id, { name, phone, company, address, notes }) {
  db.prepare(`
    UPDATE suppliers
    SET name = ?, phone = ?, company = ?, address = ?, notes = ?
    WHERE id = ?
  `).run(name, phone || null, company || null, address || null, notes || null, id);
}

function deleteSupplier(id) {
  return db.prepare('UPDATE suppliers SET is_active = 0 WHERE id = ?').run(id);
}

function getById(id) {
  return db.prepare('SELECT * FROM suppliers WHERE id = ?').get(id);
}

function getAll() {
  return db.prepare('SELECT * FROM suppliers WHERE is_active = 1 ORDER BY name ASC').all();
}

function getAllWithStats() {
  const rows = db.prepare(`
    SELECT 
      s.id,
      s.name,
      s.phone,
      s.company,
      s.address,
      s.notes,
      s.is_active,
      s.created_at,
      COUNT(DISTINCT p.id) as total_invoices,
      COALESCE(SUM(p.total_amount), 0) as total_purchased,
      COALESCE(SUM(p.paid_amount), 0) as total_paid,
      COALESCE(SUM(p.remaining_amount), 0) as total_remaining,
      COUNT(CASE WHEN p.payment_status != 'paid' AND p.id IS NOT NULL THEN 1 END) as unpaid_invoices_count,
      MAX(p.created_at) as last_purchase_date
    FROM suppliers s
    LEFT JOIN purchases p ON s.id = p.supplier_id
    GROUP BY s.id
    ORDER BY total_remaining DESC, s.name ASC
  `).all();

  return rows.map((r) => ({
    ...r,
    total_purchased: Number(r.total_purchased || 0),
    total_paid: Number(r.total_paid || 0),
    total_remaining: Number(r.total_remaining || 0),
    total_invoices: Number(r.total_invoices || 0),
    unpaid_invoices_count: Number(r.unpaid_invoices_count || 0),
  }));
}

function getSupplierLedger(supplierId) {
  const supplier = getById(supplierId);
  if (!supplier) return null;

  const purchases = db.prepare(`
    SELECT * FROM purchases
    WHERE supplier_id = ?
    ORDER BY created_at DESC
  `).all(supplierId);

  // For each purchase, get items
  const purchasesWithItems = purchases.map((p) => {
    const items = db.prepare(`
      SELECT * FROM purchase_items
      WHERE purchase_id = ?
    `).all(p.id);
    return {
      ...p,
      items,
      total_amount: Number(p.total_amount || 0),
      paid_amount: Number(p.paid_amount || 0),
      remaining_amount: Number(p.remaining_amount || 0),
    };
  });

  const payments = db.prepare(`
    SELECT sp.*, p.invoice_number
    FROM supplier_payments sp
    LEFT JOIN purchases p ON sp.purchase_id = p.id
    WHERE sp.supplier_id = ?
    ORDER BY sp.payment_date DESC
  `).all(supplierId).map((pay) => ({
    ...pay,
    amount: Number(pay.amount || 0),
  }));

  const totalPurchased = purchases.reduce((sum, p) => sum + Number(p.total_amount || 0), 0);
  const totalPaid = purchases.reduce((sum, p) => sum + Number(p.paid_amount || 0), 0);
  const totalRemaining = purchases.reduce((sum, p) => sum + Number(p.remaining_amount || 0), 0);

  return {
    supplier,
    purchases: purchasesWithItems,
    payments,
    stats: {
      totalPurchased,
      totalPaid,
      totalRemaining,
      invoicesCount: purchases.length,
      unpaidCount: purchases.filter((p) => p.payment_status !== 'paid').length,
    },
  };
}

module.exports = {
  create,
  update,
  deleteSupplier,
  getById,
  getAll,
  getAllWithStats,
  getSupplierLedger,
};

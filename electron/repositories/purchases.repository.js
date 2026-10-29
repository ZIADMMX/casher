const { db } = require('../database/db');
const inventoryRepo = require('./inventory.repository');

function createPurchase({
  supplierId,
  invoiceNumber,
  items,
  totalAmount,
  paidAmount = 0,
  paymentMethod = 'cash',
  dueDate,
  notes,
  userId,
  shiftId,
  warehouseId,
}) {
  const verifiedSupplierId = Number(supplierId);
  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);
  const remaining = Math.max(Math.round((total - paid) * 100) / 100, 0);

  let paymentStatus = 'unpaid';
  if (remaining <= 0) {
    paymentStatus = 'paid';
  } else if (paid > 0) {
    paymentStatus = 'partial';
  }

  return db.transaction(() => {
    const targetWarehouseId = warehouseId || inventoryRepo.getDefaultWarehouseId();
    // 1. Insert into purchases
    const purchaseResult = db.prepare(`
      INSERT INTO purchases (
        supplier_id,
        invoice_number,
        total_amount,
        paid_amount,
        remaining_amount,
        payment_status,
        due_date,
        notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      verifiedSupplierId,
      invoiceNumber || null,
      total,
      paid,
      remaining,
      paymentStatus,
      dueDate || null,
      notes || null
    );

    const purchaseId = purchaseResult.lastInsertRowid;

    // 2. Insert items and record each receipt against the selected warehouse
    const insertItemStmt = db.prepare(`
      INSERT INTO purchase_items (
        purchase_id,
        variant_id,
        product_name,
        size,
        color,
        quantity,
        purchase_price,
        selling_price
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const updatePriceStmt = db.prepare(`
      UPDATE product_variants
      SET purchase_price = CASE WHEN ? > 0 THEN ? ELSE purchase_price END,
          selling_price = CASE WHEN ? > 0 THEN ? ELSE selling_price END
      WHERE id = ?
    `);

    for (const item of items) {
      const qty = Number(item.quantity || 1);
      const pPrice = Number(item.purchase_price || 0);
      const sPrice = Number(item.selling_price || 0);
      const vId = item.variant_id ? Number(item.variant_id) : null;

      insertItemStmt.run(
        purchaseId,
        vId,
        item.product_name || 'منتج',
        item.size || null,
        item.color || null,
        qty,
        pPrice,
        sPrice || null
      );

      // زيادة رصيد المخزون تلقائياً إذا كان الصنف مرتبط بـ variant
      if (vId) {
        updatePriceStmt.run(pPrice, pPrice, sPrice, sPrice, vId);
        inventoryRepo.applyStockChange({
          warehouseId: targetWarehouseId,
          variantId: vId,
          delta: qty,
          movementType: 'purchase',
          referenceType: 'purchase',
          referenceId: purchaseId,
          userId,
          notes: invoiceNumber ? `فاتورة شراء ${invoiceNumber}` : null,
        });
      }
    }

    // 3. If initial payment was made, record it in supplier_payments
    if (paid > 0) {
      db.prepare(`
        INSERT INTO supplier_payments (
          supplier_id,
          purchase_id,
          amount,
          payment_method,
          notes,
          user_id,
          shift_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        verifiedSupplierId,
        purchaseId,
        paid,
        paymentMethod || 'cash',
        invoiceNumber ? `دفعة مقدمة مع فاتورة #${invoiceNumber}` : 'دفعة مقدمة مع الفاتورة',
        userId || null,
        shiftId || null
      );
    }

    return { purchaseId, total, paid, remaining, paymentStatus };
  })();
}

function getAllPurchases(filters = {}) {
  let query = `
    SELECT 
      p.*,
      s.name as supplier_name,
      s.company as supplier_company,
      s.phone as supplier_phone,
      COUNT(pi.id) as items_count,
      SUM(pi.quantity) as total_units
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    LEFT JOIN purchase_items pi ON p.id = pi.purchase_id
  `;

  const whereClauses = [];
  const params = [];

  if (filters.supplierId) {
    whereClauses.push('p.supplier_id = ?');
    params.push(Number(filters.supplierId));
  }

  if (filters.paymentStatus && filters.paymentStatus !== 'all') {
    whereClauses.push('p.payment_status = ?');
    params.push(filters.paymentStatus);
  }

  query = [
    query,
    whereClauses.length ? `WHERE ${whereClauses.join(' AND ')}` : '',
    'GROUP BY p.id ORDER BY p.created_at DESC',
  ].filter(Boolean).join(' ');

  return db.prepare(query).all(...params).map((row) => ({
    ...row,
    total_amount: Number(row.total_amount || 0),
    paid_amount: Number(row.paid_amount || 0),
    remaining_amount: Number(row.remaining_amount || 0),
    items_count: Number(row.items_count || 0),
    total_units: Number(row.total_units || 0),
  }));
}

function getPurchaseById(id) {
  const purchase = db.prepare(`
    SELECT p.*, s.name as supplier_name, s.company as supplier_company, s.phone as supplier_phone
    FROM purchases p
    JOIN suppliers s ON p.supplier_id = s.id
    WHERE p.id = ?
  `).get(id);

  if (!purchase) return null;

  const items = db.prepare(`
    SELECT * FROM purchase_items WHERE purchase_id = ?
  `).all(id).map((i) => ({
    ...i,
    quantity: Number(i.quantity || 0),
    purchase_price: Number(i.purchase_price || 0),
    selling_price: Number(i.selling_price || 0),
  }));

  const payments = db.prepare(`
    SELECT * FROM supplier_payments WHERE purchase_id = ? ORDER BY payment_date DESC
  `).all(id).map((p) => ({
    ...p,
    amount: Number(p.amount || 0),
  }));

  return {
    ...purchase,
    total_amount: Number(purchase.total_amount || 0),
    paid_amount: Number(purchase.paid_amount || 0),
    remaining_amount: Number(purchase.remaining_amount || 0),
    items,
    payments,
  };
}

function addPayment({ supplierId, purchaseId, amount, paymentMethod = 'cash', notes, userId, shiftId }) {
  const supId = Number(supplierId);
  const payAmount = Number(amount || 0);

  if (payAmount <= 0) {
    throw new Error('مبلغ السداد يجب أن يكون أكبر من الصفر');
  }

  return db.transaction(() => {
    // 1. If specific purchaseId provided
    if (purchaseId) {
      const pId = Number(purchaseId);
      const purchase = db.prepare('SELECT * FROM purchases WHERE id = ?').get(pId);
      if (!purchase) {
        throw new Error('فاتورة الشراء غير موجودة');
      }

      const newPaid = Math.round((Number(purchase.paid_amount || 0) + payAmount) * 100) / 100;
      const newRemaining = Math.max(Math.round((Number(purchase.total_amount || 0) - newPaid) * 100) / 100, 0);
      const newStatus = newRemaining <= 0 ? 'paid' : 'partial';

      db.prepare(`
        UPDATE purchases
        SET paid_amount = ?, remaining_amount = ?, payment_status = ?
        WHERE id = ?
      `).run(newPaid, newRemaining, newStatus, pId);

      const payResult = db.prepare(`
        INSERT INTO supplier_payments (
          supplier_id,
          purchase_id,
          amount,
          payment_method,
          notes,
          user_id,
          shift_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(supId, pId, payAmount, paymentMethod, notes || null, userId || null, shiftId || null);

      return { paymentId: payResult.lastInsertRowid, purchaseId: pId, newRemaining, newStatus };
    }

    // 2. If general supplier payment (FIFO over unpaid/partial invoices)
    let leftToApply = payAmount;
    const unpaidPurchases = db.prepare(`
      SELECT * FROM purchases
      WHERE supplier_id = ? AND payment_status != 'paid'
      ORDER BY created_at ASC
    `).all(supId);

    for (const p of unpaidPurchases) {
      if (leftToApply <= 0) break;
      const rem = Number(p.remaining_amount || 0);
      const payForThis = Math.min(leftToApply, rem);

      const newPaid = Math.round((Number(p.paid_amount || 0) + payForThis) * 100) / 100;
      const newRem = Math.max(Math.round((Number(p.total_amount || 0) - newPaid) * 100) / 100, 0);
      const newStatus = newRem <= 0 ? 'paid' : 'partial';

      db.prepare(`
        UPDATE purchases
        SET paid_amount = ?, remaining_amount = ?, payment_status = ?
        WHERE id = ?
      `).run(newPaid, newRem, newStatus, p.id);

      leftToApply = Math.round((leftToApply - payForThis) * 100) / 100;
    }

    const payResult = db.prepare(`
      INSERT INTO supplier_payments (
        supplier_id,
        purchase_id,
        amount,
        payment_method,
        notes,
        user_id,
        shift_id
      ) VALUES (?, NULL, ?, ?, ?, ?, ?)
    `).run(supId, payAmount, paymentMethod, notes || 'سداد دفعة لحساب المورد', userId || null, shiftId || null);

    return { paymentId: payResult.lastInsertRowid, amountPaid: payAmount };
  })();
}

function getAllPayments(limit = 100) {
  return db.prepare(`
    SELECT 
      sp.*,
      s.name as supplier_name,
      s.company as supplier_company,
      p.invoice_number
    FROM supplier_payments sp
    JOIN suppliers s ON sp.supplier_id = s.id
    LEFT JOIN purchases p ON sp.purchase_id = p.id
    ORDER BY sp.payment_date DESC
    LIMIT ?
  `).all(limit).map((r) => ({
    ...r,
    amount: Number(r.amount || 0),
  }));
}

function getPurchasesSummaryKPIs() {
  const suppliersCount = db.prepare('SELECT COUNT(*) as count FROM suppliers').get().count;
  const purchasesStats = db.prepare(`
    SELECT 
      COUNT(*) as total_invoices,
      COALESCE(SUM(total_amount), 0) as total_purchased,
      COALESCE(SUM(paid_amount), 0) as total_paid,
      COALESCE(SUM(remaining_amount), 0) as total_remaining,
      COUNT(CASE WHEN payment_status != 'paid' THEN 1 END) as unpaid_count
    FROM purchases
  `).get();

  return {
    suppliersCount: Number(suppliersCount || 0),
    totalInvoices: Number(purchasesStats.total_invoices || 0),
    totalPurchased: Number(purchasesStats.total_purchased || 0),
    totalPaid: Number(purchasesStats.total_paid || 0),
    totalRemaining: Number(purchasesStats.total_remaining || 0),
    unpaidCount: Number(purchasesStats.unpaid_count || 0),
  };
}

module.exports = {
  createPurchase,
  getAllPurchases,
  getPurchaseById,
  addPayment,
  getAllPayments,
  getPurchasesSummaryKPIs,
};

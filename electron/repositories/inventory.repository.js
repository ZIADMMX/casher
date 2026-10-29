const { db } = require('../database/db');

function getBranches() {
  return db.prepare(`
    SELECT b.*, COUNT(w.id) AS warehouse_count
    FROM branches b
    LEFT JOIN warehouses w ON w.branch_id = b.id AND w.is_active = 1
    GROUP BY b.id
    ORDER BY b.name COLLATE NOCASE
  `).all();
}

function createBranch({ name, address, phone }) {
  return db.transaction(() => {
    const result = db.prepare(
      'INSERT INTO branches (name, address, phone) VALUES (?, ?, ?)'
    ).run(name, address || null, phone || null);
    const branchId = result.lastInsertRowid;
    db.prepare(
      'INSERT INTO warehouses (branch_id, name, is_default) VALUES (?, ?, 1)'
    ).run(branchId, 'المخزن الرئيسي');
    return branchId;
  })();
}

function updateBranch(id, { name, address, phone, isActive }) {
  return db.prepare(`
    UPDATE branches
    SET name = ?, address = ?, phone = ?, is_active = ?
    WHERE id = ?
  `).run(name, address || null, phone || null, isActive ? 1 : 0, id);
}

function getWarehouses(branchId = null) {
  const where = branchId ? 'WHERE w.branch_id = ?' : '';
  const query = `
    SELECT w.*, b.name AS branch_name, b.is_active AS branch_active,
      COUNT(DISTINCT ws.variant_id) AS stocked_variant_count,
      COALESCE(SUM(ws.quantity), 0) AS total_quantity
    FROM warehouses w
    JOIN branches b ON b.id = w.branch_id
    LEFT JOIN warehouse_stock ws ON ws.warehouse_id = w.id
    ${where}
    GROUP BY w.id
    ORDER BY b.name COLLATE NOCASE, w.is_default DESC, w.name COLLATE NOCASE
  `;
  return branchId ? db.prepare(query).all(branchId) : db.prepare(query).all();
}

function createWarehouse({ branchId, name, isDefault }) {
  return db.transaction(() => {
    const firstWarehouse = !db.prepare(
      'SELECT 1 FROM warehouses WHERE branch_id = ? LIMIT 1'
    ).get(branchId);
    const makeDefault = isDefault || firstWarehouse;
    if (makeDefault) {
      db.prepare('UPDATE warehouses SET is_default = 0 WHERE branch_id = ?').run(branchId);
    }
    const result = db.prepare(`
      INSERT INTO warehouses (branch_id, name, is_default)
      VALUES (?, ?, ?)
    `).run(branchId, name, makeDefault ? 1 : 0);
    return result.lastInsertRowid;
  })();
}

function updateWarehouse(id, { name, isActive, isDefault }) {
  return db.transaction(() => {
    const warehouse = db.prepare('SELECT branch_id FROM warehouses WHERE id = ?').get(id);
    if (!warehouse) throw new Error('المخزن غير موجود');
    if (isDefault) {
      db.prepare('UPDATE warehouses SET is_default = 0 WHERE branch_id = ?').run(warehouse.branch_id);
    }
    return db.prepare(`
      UPDATE warehouses
      SET name = ?, is_active = ?, is_default = ?
      WHERE id = ?
    `).run(name, isActive ? 1 : 0, isDefault == null ? Number(warehouse.is_default) : isDefault ? 1 : 0, id);
  })();
}

function getStockQuantity(warehouseId, variantId) {
  const row = db.prepare(
    'SELECT quantity FROM warehouse_stock WHERE warehouse_id = ? AND variant_id = ?'
  ).get(warehouseId, variantId);
  return row?.quantity || 0;
}

function getDefaultWarehouseId() {
  const warehouse = db.prepare(`
    SELECT w.id
    FROM warehouses w
    JOIN branches b ON b.id = w.branch_id
    WHERE w.is_default = 1 AND w.is_active = 1 AND b.is_active = 1
    ORDER BY b.id, w.id
    LIMIT 1
  `).get();
  if (!warehouse) throw new Error('لا يوجد مخزن افتراضي نشط');
  return warehouse.id;
}

function getWarehouseBranchId(warehouseId) {
  const warehouse = db.prepare('SELECT branch_id FROM warehouses WHERE id = ?').get(warehouseId);
  if (!warehouse) throw new Error('المخزن غير موجود');
  return warehouse.branch_id;
}

function hasInventoryHistory(variantId) {
  return Boolean(db.prepare(`
    SELECT 1 FROM inventory_movements WHERE variant_id = ?
    UNION ALL
    SELECT 1 FROM inventory_transfer_items WHERE variant_id = ?
    UNION ALL
    SELECT 1 FROM inventory_count_items WHERE variant_id = ?
    LIMIT 1
  `).get(variantId, variantId, variantId));
}

function ensureStockRow(warehouseId, variantId) {
  db.prepare(`
    INSERT OR IGNORE INTO warehouse_stock (warehouse_id, variant_id, quantity, reorder_level)
    SELECT ?, id, 0, COALESCE(low_stock_threshold, 5)
    FROM product_variants
    WHERE id = ?
  `).run(warehouseId, variantId);
}

function initializeVariantStock(warehouseId, variantId, quantity, userId = null) {
  const inserted = db.prepare(`
    INSERT OR IGNORE INTO warehouse_stock (warehouse_id, variant_id, quantity, reorder_level)
    SELECT ?, id, ?, COALESCE(low_stock_threshold, 5)
    FROM product_variants
    WHERE id = ?
  `).run(warehouseId, quantity, variantId);
  if (inserted.changes && quantity > 0) {
    db.prepare(`
      INSERT INTO inventory_movements
        (warehouse_id, variant_id, movement_type, quantity_change, quantity_after, user_id, notes)
      VALUES (?, ?, 'opening', ?, ?, ?, ?)
    `).run(warehouseId, variantId, quantity, quantity, userId, 'رصيد افتتاحي للصنف');
  }
  db.prepare(`
    UPDATE product_variants
    SET stock_quantity = (
      SELECT COALESCE(SUM(quantity), 0) FROM warehouse_stock WHERE variant_id = ?
    )
    WHERE id = ?
  `).run(variantId, variantId);
}

function applyStockChange({
  warehouseId,
  variantId,
  delta,
  movementType,
  referenceType = null,
  referenceId = null,
  userId = null,
  notes = null,
}) {
  ensureStockRow(warehouseId, variantId);
  const result = db.prepare(`
    UPDATE warehouse_stock
    SET quantity = quantity + ?, updated_at = CURRENT_TIMESTAMP
    WHERE warehouse_id = ? AND variant_id = ? AND quantity + ? >= 0
  `).run(delta, warehouseId, variantId, delta);
  if (result.changes !== 1) {
    throw new Error('لا توجد كمية كافية في المخزن لتنفيذ الحركة');
  }

  const quantityAfter = getStockQuantity(warehouseId, variantId);
  db.prepare(`
    UPDATE product_variants
    SET stock_quantity = (
      SELECT COALESCE(SUM(quantity), 0)
      FROM warehouse_stock
      WHERE variant_id = ?
    )
    WHERE id = ?
  `).run(variantId, variantId);
  db.prepare(`
    INSERT INTO inventory_movements (
      warehouse_id, variant_id, movement_type, quantity_change,
      quantity_after, reference_type, reference_id, user_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    warehouseId,
    variantId,
    movementType,
    delta,
    quantityAfter,
    referenceType,
    referenceId,
    userId,
    notes
  );
  return quantityAfter;
}

function listStock({ warehouseId, lowStockOnly = false, search = '' }) {
  const conditions = ['w.is_active = 1', 'b.is_active = 1'];
  const params = [];
  if (warehouseId) {
    conditions.push('w.id = ?');
    params.push(warehouseId);
  }
  if (lowStockOnly) conditions.push('COALESCE(ws.quantity, 0) <= COALESCE(ws.reorder_level, pv.low_stock_threshold, 5)');
  if (search) {
    conditions.push('(p.name LIKE ? OR pv.sku LIKE ? OR pv.barcode LIKE ?)');
    const term = `%${search}%`;
    params.push(term, term, term);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  return db.prepare(`
    SELECT w.id AS warehouse_id, w.name AS warehouse_name, b.id AS branch_id,
      b.name AS branch_name, pv.id AS variant_id,
      COALESCE(ws.quantity, 0) AS quantity,
      COALESCE(ws.reorder_level, pv.low_stock_threshold, 5) AS reorder_level,
      p.id AS product_id, p.name AS product_name, pv.size, pv.color, pv.sku, pv.barcode
    FROM warehouses w
    JOIN branches b ON b.id = w.branch_id
    CROSS JOIN product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN warehouse_stock ws ON ws.warehouse_id = w.id AND ws.variant_id = pv.id
    ${where}
    ORDER BY b.name COLLATE NOCASE, w.name COLLATE NOCASE, p.name COLLATE NOCASE
  `).all(...params);
}

function getMovementHistory({ warehouseId, variantId, limit = 100 }) {
  const conditions = [];
  const params = [];
  if (warehouseId) {
    conditions.push('m.warehouse_id = ?');
    params.push(warehouseId);
  }
  if (variantId) {
    conditions.push('m.variant_id = ?');
    params.push(variantId);
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);
  return db.prepare(`
    SELECT m.*, w.name AS warehouse_name, b.name AS branch_name,
      p.name AS product_name, pv.size, pv.color, pv.sku, u.username
    FROM inventory_movements m
    JOIN warehouses w ON w.id = m.warehouse_id
    JOIN branches b ON b.id = w.branch_id
    JOIN product_variants pv ON pv.id = m.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN users u ON u.id = m.user_id
    ${where}
    ORDER BY m.created_at DESC, m.id DESC
    LIMIT ?
  `).all(...params);
}

function getTransfers(limit = 100) {
  return db.prepare(`
    SELECT t.*, source.name AS source_warehouse_name,
      destination.name AS destination_warehouse_name,
      source_branch.name AS source_branch_name,
      destination_branch.name AS destination_branch_name,
      u.username, COUNT(i.id) AS item_count,
      COALESCE(SUM(i.quantity), 0) AS total_units
    FROM inventory_transfers t
    JOIN warehouses source ON source.id = t.source_warehouse_id
    JOIN branches source_branch ON source_branch.id = source.branch_id
    JOIN warehouses destination ON destination.id = t.destination_warehouse_id
    JOIN branches destination_branch ON destination_branch.id = destination.branch_id
    LEFT JOIN inventory_transfer_items i ON i.transfer_id = t.id
    LEFT JOIN users u ON u.id = t.user_id
    GROUP BY t.id
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ?
  `).all(limit);
}

function createTransfer({ sourceWarehouseId, destinationWarehouseId, items, userId, notes }) {
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO inventory_transfers
        (source_warehouse_id, destination_warehouse_id, user_id, notes)
      VALUES (?, ?, ?, ?)
    `).run(sourceWarehouseId, destinationWarehouseId, userId, notes || null);
    const transferId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO inventory_transfer_items (transfer_id, variant_id, quantity)
      VALUES (?, ?, ?)
    `);

    for (const item of items) {
      const quantity = Number(item.quantity);
      applyStockChange({
        warehouseId: sourceWarehouseId,
        variantId: Number(item.variantId),
        delta: -quantity,
        movementType: 'transfer_out',
        referenceType: 'transfer',
        referenceId: transferId,
        userId,
        notes,
      });
      applyStockChange({
        warehouseId: destinationWarehouseId,
        variantId: Number(item.variantId),
        delta: quantity,
        movementType: 'transfer_in',
        referenceType: 'transfer',
        referenceId: transferId,
        userId,
        notes,
      });
      insertItem.run(transferId, item.variantId, quantity);
    }
    return transferId;
  })();
}

function adjustStock({ warehouseId, variantId, delta, userId, notes }) {
  return db.transaction(() => applyStockChange({
    warehouseId,
    variantId,
    delta,
    movementType: 'adjustment',
    userId,
    notes,
  }))();
}

function setReorderLevel({ warehouseId, variantId, reorderLevel }) {
  ensureStockRow(warehouseId, variantId);
  return db.prepare(`
    UPDATE warehouse_stock
    SET reorder_level = ?, updated_at = CURRENT_TIMESTAMP
    WHERE warehouse_id = ? AND variant_id = ?
  `).run(reorderLevel, warehouseId, variantId);
}

function createCount({ warehouseId, countType, items, userId, notes }) {
  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO inventory_counts (warehouse_id, count_type, user_id, notes)
      VALUES (?, ?, ?, ?)
    `).run(warehouseId, countType, userId, notes || null);
    const countId = result.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO inventory_count_items
        (count_id, variant_id, expected_quantity, counted_quantity)
      VALUES (?, ?, ?, ?)
    `);

    for (const item of items) {
      const variantId = Number(item.variantId);
      const expectedQuantity = getStockQuantity(warehouseId, variantId);
      const countedQuantity = Number(item.countedQuantity);
      insertItem.run(countId, variantId, expectedQuantity, countedQuantity);
      const delta = countedQuantity - expectedQuantity;
      if (delta !== 0) {
        applyStockChange({
          warehouseId,
          variantId,
          delta,
          movementType: 'count',
          referenceType: 'count',
          referenceId: countId,
          userId,
          notes: notes || `تسوية جرد رقم ${countId}`,
        });
      }
    }
    return countId;
  })();
}

module.exports = {
  getBranches,
  createBranch,
  updateBranch,
  getWarehouses,
  createWarehouse,
  updateWarehouse,
  getStockQuantity,
  getDefaultWarehouseId,
  getWarehouseBranchId,
  hasInventoryHistory,
  initializeVariantStock,
  applyStockChange,
  listStock,
  getMovementHistory,
  getTransfers,
  createTransfer,
  adjustStock,
  setReorderLevel,
  createCount,
};

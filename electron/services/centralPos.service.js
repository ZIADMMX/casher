const { writePool } = require('../database/dbPool');

class PosError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.statusCode = statusCode;
  }
}

async function withWarehouse(client, user, requestedWarehouseId) {
  const warehouseResult = requestedWarehouseId
    ? await client.query(
      `SELECT id, branch_id FROM warehouses
       WHERE id = $1 AND is_active = TRUE FOR SHARE`,
      [requestedWarehouseId]
    )
    : user.branch_id
      ? await client.query(
        `SELECT id, branch_id FROM warehouses
         WHERE branch_id = $1 AND is_active = TRUE AND is_default = TRUE
         ORDER BY id LIMIT 1 FOR SHARE`,
        [user.branch_id]
      )
      : { rows: [] };
  const warehouse = warehouseResult.rows[0];
  if (!warehouse) throw new PosError('لم يتم تحديد مخزن نشط لهذا الجهاز', 409);
  if (user.branch_id != null && Number(warehouse.branch_id) !== Number(user.branch_id)) {
    throw new PosError('المخزن المحدد لا يتبع فرع حسابك', 403);
  }
  return warehouse;
}

async function createCentralSale({ userId, warehouseId, saleData, pool = writePool }) {
  const items = saleData?.items;
  if (!Array.isArray(items) || items.length === 0) {
    throw new PosError('السلة فارغة');
  }
  const normalizedItems = items.map((item) => ({
    variantId: Number(item.variantId),
    quantity: Number(item.quantity),
  }));
  if (normalizedItems.some((item) => !Number.isSafeInteger(item.variantId)
    || item.variantId <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
    throw new PosError('معرف الصنف والكمية يجب أن يكونا رقمين صحيحين موجبين');
  }
  const paymentMethod = saleData.paymentMethod;
  if (!['cash', 'card', 'credit'].includes(paymentMethod)) {
    throw new PosError('طريقة الدفع غير صحيحة');
  }
  const orderMode = saleData.orderMode ?? null;
  if (orderMode !== null && !['dine_in', 'takeaway', 'delivery'].includes(orderMode)) {
    throw new PosError('طريقة استلام الطلب غير صالحة');
  }
  if (paymentMethod === 'credit' && (!String(saleData.customerName || '').trim() || !saleData.dueDate)) {
    throw new PosError('اسم العميل وتاريخ الاستحقاق مطلوبان للبيع الآجل');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;

    const userResult = await client.query(
      `SELECT id, username, role, branch_id, is_active
       FROM users WHERE id = $1 FOR SHARE`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user || !user.is_active) throw new PosError('حساب المستخدم غير نشط أو غير موجود', 401);

    const warehouse = await withWarehouse(client, user, warehouseId);
    const shiftResult = await client.query(
      `SELECT id FROM shifts
       WHERE user_id = $1 AND warehouse_id = $2 AND status = 'open'
       LIMIT 1 FOR SHARE`,
      [user.id, warehouse.id]
    );
    const shift = shiftResult.rows[0];
    if (!shift) throw new PosError('افتح وردية على هذا الجهاز قبل البيع', 409);

    const variantIds = [...new Set(normalizedItems.map((item) => item.variantId))].sort((a, b) => a - b);
    const variantsResult = await client.query(
      `SELECT pv.id, pv.selling_price, pv.purchase_price, pv.sku, p.name AS product_name
       FROM product_variants pv
       JOIN products p ON p.id = pv.product_id
       WHERE pv.id = ANY($1::INTEGER[]) AND p.is_active = TRUE
       ORDER BY pv.id FOR SHARE OF pv`,
      [variantIds]
    );
    const variants = new Map(variantsResult.rows.map((variant) => [Number(variant.id), variant]));
    if (variants.size !== variantIds.length) throw new PosError('أحد المنتجات غير موجود أو غير نشط', 404);

    const requestedByVariant = new Map();
    for (const item of normalizedItems) {
      requestedByVariant.set(
        item.variantId,
        (requestedByVariant.get(item.variantId) || 0) + item.quantity
      );
    }

    const totalAmount = Math.round(normalizedItems.reduce((sum, item) => (
      sum + Number(variants.get(item.variantId).selling_price) * item.quantity
    ), 0) * 100) / 100;

    const saleResult = await client.query(
      `INSERT INTO sales (
         shift_id, branch_id, warehouse_id, customer_name, customer_phone,
         user_id, total_amount, payment_method, due_date, order_mode, kitchen_status
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING id`,
      [
        shift.id,
        warehouse.branch_id,
        warehouse.id,
        paymentMethod === 'credit' ? String(saleData.customerName).trim() : null,
        paymentMethod === 'credit' ? saleData.customerPhone || null : null,
        user.id,
        totalAmount,
        paymentMethod,
        paymentMethod === 'credit' ? saleData.dueDate : null,
        orderMode,
        orderMode ? 'new' : null,
      ]
    );
    const saleId = saleResult.rows[0].id;

    for (const [variantId, quantity] of [...requestedByVariant].sort(([left], [right]) => left - right)) {
      const stockResult = await client.query(
        `UPDATE warehouse_stock
         SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP
         WHERE warehouse_id = $2 AND variant_id = $3 AND quantity >= $1
         RETURNING quantity`,
        [quantity, warehouse.id, variantId]
      );
      if (stockResult.rowCount !== 1) {
        const variant = variants.get(variantId);
        throw new PosError(`الكمية غير كافية للصنف ${variant.sku || variant.product_name}`, 409);
      }
      const quantityAfter = stockResult.rows[0].quantity;
      await client.query(
        `UPDATE product_variants
         SET stock_quantity = (
           SELECT COALESCE(SUM(quantity), 0) FROM warehouse_stock WHERE variant_id = $1
         )
         WHERE id = $1`,
        [variantId]
      );
      await client.query(
        `INSERT INTO inventory_movements (
           warehouse_id, variant_id, movement_type, quantity_change,
           quantity_after, reference_type, reference_id, user_id
         ) VALUES ($1, $2, 'sale', $3, $4, 'sale', $5, $6)`,
        [warehouse.id, variantId, -quantity, quantityAfter, saleId, user.id]
      );
    }

    for (const item of normalizedItems) {
      await client.query(
        `INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price)
         VALUES ($1, $2, $3, $4)`,
        [saleId, item.variantId, item.quantity, variants.get(item.variantId).selling_price]
      );
    }

    const shiftTotalColumn = {
      cash: 'total_cash_sales',
      card: 'total_card_sales',
      credit: 'total_credit_sales',
    }[paymentMethod];
    await client.query(
      `UPDATE shifts SET ${shiftTotalColumn} = ${shiftTotalColumn} + $1 WHERE id = $2`,
      [totalAmount, shift.id]
    );
    await client.query('COMMIT');
    transactionStarted = false;
    return { saleId, totalAmount };
  } catch (error) {
    if (transactionStarted) {
      try {
        await client.query('ROLLBACK');
      } catch {}
    }
    throw error;
  } finally {
    client.release();
  }
}

async function getCentralKitchenOrders({ userId, pool = writePool }) {
  const userResult = await pool.query(
    'SELECT id, branch_id, is_active FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user || !user.is_active) throw new PosError('حساب المستخدم غير نشط أو غير موجود', 401);

  const ordersResult = await pool.query(
    `SELECT s.id, s.order_mode, s.kitchen_status, s.total_amount, s.customer_name,
       s.customer_phone, s.created_at, u.username AS cashier_name
     FROM sales s
     LEFT JOIN users u ON u.id = s.user_id
     WHERE s.order_mode IS NOT NULL
       AND (s.branch_id = $1 OR $1::INTEGER IS NULL)
       AND s.created_at::DATE = CURRENT_DATE
     ORDER BY s.created_at ASC, s.id ASC`,
    [user.branch_id]
  );
  if (!ordersResult.rows.length) return [];

  const saleIds = ordersResult.rows.map((order) => order.id);
  const itemsResult = await pool.query(
    `SELECT si.sale_id, si.quantity, si.unit_price, p.name AS product_name,
       pv.size, pv.color
     FROM sale_items si
     LEFT JOIN product_variants pv ON pv.id = si.variant_id
     LEFT JOIN products p ON p.id = pv.product_id
     WHERE si.sale_id = ANY($1::BIGINT[])
     ORDER BY si.sale_id, si.id`,
    [saleIds]
  );
  const itemsBySale = new Map();
  for (const item of itemsResult.rows) {
    const items = itemsBySale.get(String(item.sale_id)) || [];
    items.push(item);
    itemsBySale.set(String(item.sale_id), items);
  }
  return ordersResult.rows.map((order) => ({
    ...order,
    items: itemsBySale.get(String(order.id)) || [],
  }));
}

async function updateCentralKitchenOrderStatus({ userId, saleId, status, pool = writePool }) {
  if (!Number.isSafeInteger(Number(saleId)) || Number(saleId) <= 0) {
    throw new PosError('رقم الطلب غير صالح');
  }
  if (!['new', 'preparing', 'ready', 'served'].includes(status)) {
    throw new PosError('حالة طلب المطبخ غير صالحة');
  }
  const userResult = await pool.query(
    'SELECT id, branch_id, is_active FROM users WHERE id = $1 LIMIT 1',
    [userId]
  );
  const user = userResult.rows[0];
  if (!user || !user.is_active) throw new PosError('حساب المستخدم غير نشط أو غير موجود', 401);

  const result = await pool.query(
    `UPDATE sales
     SET kitchen_status = $1
     WHERE id = $2 AND order_mode IS NOT NULL
       AND (branch_id = $3 OR $3::INTEGER IS NULL)
     RETURNING id, order_mode, kitchen_status`,
    [status, Number(saleId), user.branch_id]
  );
  if (!result.rows.length) throw new PosError('طلب المطبخ غير موجود', 404);
  return result.rows[0];
}

async function createCentralProduct({ userId, warehouseId, productData, variantData, productId, pool = writePool }) {
  const name = String(productData?.name || '').trim();
  const sellingPrice = Number(variantData?.sellingPrice ?? variantData?.price);
  const purchasePrice = Number(variantData?.purchasePrice ?? 0);
  const stockQuantity = Number(variantData?.stockQuantity ?? 0);
  const lowStockThreshold = Number(variantData?.lowStockThreshold ?? 5);
  if ((!productId && !name) || !Number.isFinite(sellingPrice) || sellingPrice <= 0
    || !Number.isFinite(purchasePrice) || purchasePrice < 0
    || !Number.isSafeInteger(stockQuantity) || stockQuantity < 0
    || !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0) {
    throw new PosError('بيانات المنتج أو السعر أو الكمية غير صحيحة');
  }

  const client = await pool.connect();
  let transactionStarted = false;
  try {
    await client.query('BEGIN');
    transactionStarted = true;
    const userResult = await client.query(
      `SELECT id, username, role, branch_id, is_active
       FROM users WHERE id = $1 FOR SHARE`,
      [userId]
    );
    const user = userResult.rows[0];
    if (!user || !user.is_active) throw new PosError('حساب المستخدم غير نشط أو غير موجود', 401);
    if (user.role !== 'admin') throw new PosError('صلاحية المدير مطلوبة لإدارة المنتجات', 403);
    const warehouse = await withWarehouse(client, user, warehouseId);

    let resolvedProductId = productId;
    if (resolvedProductId) {
      const existing = await client.query(
        'SELECT id FROM products WHERE id = $1 AND is_active = TRUE FOR SHARE',
        [resolvedProductId]
      );
      if (!existing.rows.length) throw new PosError('المنتج غير موجود', 404);
    } else {
      let categoryId = null;
      const categoryName = String(productData.categoryName || '').trim();
      if (categoryName) {
        const category = await client.query(
          `INSERT INTO categories (name) VALUES ($1)
           ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
          [categoryName]
        );
        categoryId = category.rows[0].id;
      }
      const product = await client.query(
        `INSERT INTO products (name, description, category_id, image_path)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [name, productData.description || null, categoryId, productData.imagePath || null]
      );
      resolvedProductId = product.rows[0].id;
    }

    const variant = await client.query(
      `INSERT INTO product_variants (
         product_id, size, color, sku, barcode, purchase_price, selling_price,
         stock_quantity, low_stock_threshold
       ) VALUES ($1, $2, $3, NULL, NULL, $4, $5, $6, $7)
       RETURNING id`,
      [resolvedProductId, variantData.size || null, variantData.color || null,
        purchasePrice, sellingPrice, stockQuantity, lowStockThreshold]
    );
    const variantId = variant.rows[0].id;
    const sizePart = variantData.size
      ? `-${String(variantData.size).trim().toUpperCase().replace(/\s+/g, '')}`
      : '';
    const sku = `P${resolvedProductId}-V${variantId}${sizePart}`;
    const barcode = String(variantData.barcode || `P${resolvedProductId}-V${variantId}`);
    await client.query(
      'UPDATE product_variants SET sku = $1, barcode = $2 WHERE id = $3',
      [variantData.sku || sku, barcode, variantId]
    );
    await client.query(
      `INSERT INTO warehouse_stock (warehouse_id, variant_id, quantity, reorder_level)
       VALUES ($1, $2, $3, $4)`,
      [warehouse.id, variantId, stockQuantity, lowStockThreshold]
    );
    if (stockQuantity > 0) {
      await client.query(
        `INSERT INTO inventory_movements (
           warehouse_id, variant_id, movement_type, quantity_change,
           quantity_after, reference_type, user_id
         ) VALUES ($1, $2, 'opening', $3, $3, 'opening', $4)`,
        [warehouse.id, variantId, stockQuantity, user.id]
      );
    }
    await client.query('COMMIT');
    transactionStarted = false;
    return { productId: resolvedProductId, variantId, sku: variantData.sku || sku };
  } catch (error) {
    if (transactionStarted) {
      try { await client.query('ROLLBACK'); } catch {}
    }
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createCentralSale,
  getCentralKitchenOrders,
  updateCentralKitchenOrderStatus,
  createCentralProduct,
  PosError,
};
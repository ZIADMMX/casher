const { db } = require('../database/db');

/**
 * Operations & Orders Repository
 * SQL Queries for managing orders, items, comments, attachments, and audit history
 */

function generateOrderNumber() {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const lastOrder = db.prepare("SELECT id FROM orders ORDER BY id DESC LIMIT 1").get();
  const nextSeq = (lastOrder ? lastOrder.id + 1 : 1).toString().padStart(4, '0');
  return `ORD-${dateStr}-${nextSeq}`;
}

function createOrder(orderData, items = []) {
  const {
    order_type,
    customer_id,
    customer_name,
    customer_phone,
    assigned_user_id,
    status = 'new',
    priority = 'medium',
    due_date,
    estimated_amount = 0,
    paid_amount = 0,
    notes,
    created_by_user_id
  } = orderData;

  const order_number = generateOrderNumber();

  const insertTransaction = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO orders (
        order_number, order_type, customer_id, customer_name, customer_phone,
        assigned_user_id, status, priority, due_date, estimated_amount,
        paid_amount, notes, created_by_user_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order_number, order_type, customer_id || null, customer_name || null, customer_phone || null,
      assigned_user_id || null, status, priority, due_date || null, estimated_amount,
      paid_amount, notes || null, created_by_user_id || null
    );

    const orderId = result.lastInsertRowid;

    if (items && items.length > 0) {
      const insertItemStmt = db.prepare(`
        INSERT INTO order_items (order_id, variant_id, title, quantity, unit_price, total_price, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of items) {
        insertItemStmt.run(
          orderId,
          item.variant_id || null,
          item.title,
          item.quantity || 1,
          item.unit_price || 0,
          (item.quantity || 1) * (item.unit_price || 0),
          item.notes || null
        );
      }
    }

    // Log history
    db.prepare(`
      INSERT INTO order_history (order_id, user_id, action_type, new_value, description)
      VALUES (?, ?, 'create', ?, ?)
    `).run(orderId, created_by_user_id || null, status, `تم إنشاء الطلب برقم ${order_number}`);

    return orderId;
  });

  return insertTransaction();
}

function getOrders(filters = {}) {
  const { status, order_type, priority, assigned_user_id, customer_id, search, limit = 100, offset = 0 } = filters;

  let query = `
    SELECT 
      o.*,
      c.name AS registered_customer_name,
      u_assigned.username AS assigned_username,
      u_created.username AS created_by_username,
      (SELECT COUNT(*) FROM order_items WHERE order_id = o.id) AS items_count,
      (SELECT COUNT(*) FROM order_comments WHERE order_id = o.id) AS comments_count,
      (SELECT COUNT(*) FROM order_attachments WHERE order_id = o.id) AS attachments_count
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN users u_assigned ON o.assigned_user_id = u_assigned.id
    LEFT JOIN users u_created ON o.created_by_user_id = u_created.id
    WHERE 1=1
  `;

  const params = [];

  if (status) {
    query += ` AND o.status = ?`;
    params.push(status);
  }
  if (order_type) {
    query += ` AND o.order_type = ?`;
    params.push(order_type);
  }
  if (priority) {
    query += ` AND o.priority = ?`;
    params.push(priority);
  }
  if (assigned_user_id) {
    query += ` AND o.assigned_user_id = ?`;
    params.push(assigned_user_id);
  }
  if (customer_id) {
    query += ` AND o.customer_id = ?`;
    params.push(customer_id);
  }
  if (search) {
    query += ` AND (o.order_number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ? OR o.notes LIKE ?)`;
    const searchPattern = `%${search}%`;
    params.push(searchPattern, searchPattern, searchPattern, searchPattern);
  }

  query += ` ORDER BY o.created_at DESC LIMIT ? OFFSET ?`;
  params.push(limit, offset);

  return db.prepare(query).all(...params);
}

function getOrderById(orderId) {
  const order = db.prepare(`
    SELECT 
      o.*,
      c.name AS registered_customer_name,
      c.phone AS registered_customer_phone,
      u_assigned.username AS assigned_username,
      u_created.username AS created_by_username
    FROM orders o
    LEFT JOIN customers c ON o.customer_id = c.id
    LEFT JOIN users u_assigned ON o.assigned_user_id = u_assigned.id
    LEFT JOIN users u_created ON o.created_by_user_id = u_created.id
    WHERE o.id = ?
  `).get(orderId);

  if (!order) return null;

  order.items = db.prepare(`
    SELECT oi.*, pv.sku, pv.size, pv.color, p.name as product_name
    FROM order_items oi
    LEFT JOIN product_variants pv ON oi.variant_id = pv.id
    LEFT JOIN products p ON pv.product_id = p.id
    WHERE oi.order_id = ?
  `).all(orderId);

  order.comments = db.prepare(`
    SELECT oc.*, u.username
    FROM order_comments oc
    LEFT JOIN users u ON oc.user_id = u.id
    WHERE oc.order_id = ?
    ORDER BY oc.created_at ASC
  `).all(orderId);

  order.attachments = db.prepare(`
    SELECT oa.*, u.username as uploaded_by_username
    FROM order_attachments oa
    LEFT JOIN users u ON oa.uploaded_by_user_id = u.id
    WHERE oa.order_id = ?
    ORDER BY oa.created_at DESC
  `).all(orderId);

  order.history = db.prepare(`
    SELECT oh.*, u.username
    FROM order_history oh
    LEFT JOIN users u ON oh.user_id = u.id
    WHERE oh.order_id = ?
    ORDER BY oh.created_at DESC
  `).all(orderId);

  return order;
}

function updateOrderStatus(orderId, newStatus, userId, description = null) {
  const currentOrder = db.prepare("SELECT status FROM orders WHERE id = ?").get(orderId);
  if (!currentOrder) throw new Error("الطلب غير موجود");

  const oldStatus = currentOrder.status;

  const updateTx = db.transaction(() => {
    db.prepare(`
      UPDATE orders 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(newStatus, orderId);

    db.prepare(`
      INSERT INTO order_history (order_id, user_id, action_type, old_value, new_value, description)
      VALUES (?, ?, 'status_change', ?, ?, ?)
    `).run(orderId, userId || null, oldStatus, newStatus, description || `تم تغيير الحالة من ${oldStatus} إلى ${newStatus}`);
  });

  updateTx();
  return getOrderById(orderId);
}

function assignOrder(orderId, assignedUserId, currentUserId) {
  const currentOrder = db.prepare("SELECT assigned_user_id FROM orders WHERE id = ?").get(orderId);
  if (!currentOrder) throw new Error("الطلب غير موجود");

  const oldAssigned = currentOrder.assigned_user_id;

  const assignTx = db.transaction(() => {
    db.prepare(`
      UPDATE orders 
      SET assigned_user_id = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(assignedUserId || null, orderId);

    db.prepare(`
      INSERT INTO order_history (order_id, user_id, action_type, old_value, new_value, description)
      VALUES (?, ?, 'assignment_change', ?, ?, 'تم تغيير الموظف المسؤول')
    `).run(orderId, currentUserId || null, oldAssigned ? String(oldAssigned) : 'غير معين', assignedUserId ? String(assignedUserId) : 'غير معين');
  });

  assignTx();
  return getOrderById(orderId);
}

function addOrderComment(orderId, userId, commentText) {
  const result = db.prepare(`
    INSERT INTO order_comments (order_id, user_id, comment)
    VALUES (?, ?, ?)
  `).run(orderId, userId || null, commentText);

  db.prepare(`
    INSERT INTO order_history (order_id, user_id, action_type, description)
    VALUES (?, ?, 'comment_added', 'إضافة تعليق جديد')
  `).run(orderId, userId || null);

  return result.lastInsertRowid;
}

function addOrderAttachment(orderId, userId, attachmentData) {
  const { file_name, file_path, file_type, file_size } = attachmentData;
  const result = db.prepare(`
    INSERT INTO order_attachments (order_id, file_name, file_path, file_type, file_size, uploaded_by_user_id)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(orderId, file_name, file_path, file_type || null, file_size || 0, userId || null);

  db.prepare(`
    INSERT INTO order_history (order_id, user_id, action_type, description)
    VALUES (?, ?, 'attachment_added', ?)
  `).run(orderId, userId || null, `تم إضافة ملف مرفق: ${file_name}`);

  return result.lastInsertRowid;
}

function getOrderStats() {
  const stats = db.prepare(`
    SELECT 
      COUNT(*) AS total_orders,
      SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) AS new_count,
      SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
      SUM(CASE WHEN status = 'ready' THEN 1 ELSE 0 END) AS ready_count,
      SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) AS delivered_count,
      SUM(CASE WHEN status = 'on_hold' THEN 1 ELSE 0 END) AS on_hold_count,
      SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) AS cancelled_count,
      SUM(CASE WHEN due_date IS NOT NULL AND status NOT IN ('delivered', 'cancelled') AND due_date < CURRENT_TIMESTAMP THEN 1 ELSE 0 END) AS overdue_count
    FROM orders
  `).get();

  return stats;
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  assignOrder,
  addOrderComment,
  addOrderAttachment,
  getOrderStats
};

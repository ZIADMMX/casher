const ordersRepo = require('../repositories/orders.repository');
const ordersCache = require('./orders.cache');
const NotificationsService = require('./notifications.service');

/**
 * Operations & Orders Service
 * Business Logic, State Machine validation, Caching, and Notifications
 */

const ALLOWED_TYPES = ['pos_sale', 'online', 'delivery', 'reservation', 'maintenance', 'tailoring', 'manufacturing', 'service'];
const ALLOWED_STATUSES = ['new', 'in_progress', 'ready', 'delivered', 'cancelled', 'on_hold'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high', 'urgent'];

function createOrder(orderData, items = [], userSession = {}) {
  if (!orderData.order_type || !ALLOWED_TYPES.includes(orderData.order_type)) {
    throw new Error('نوع الطلب غير صحيح');
  }

  if (orderData.priority && !ALLOWED_PRIORITIES.includes(orderData.priority)) {
    throw new Error('أولوية الطلب غير صحيحة');
  }

  if (orderData.requested_part !== undefined && orderData.requested_part !== null) {
    if (orderData.order_type !== 'online' || !String(orderData.requested_part).trim()) {
      throw new Error('اسم قطعة الغيار مطلوب لطلب القطع');
    }
    if (!String(orderData.vehicle_make || '').trim() || !String(orderData.vehicle_model || '').trim()) {
      throw new Error('ماركة السيارة وموديلها مطلوبان لطلب قطعة الغيار');
    }
    if (!String(orderData.customer_name || '').trim() || !String(orderData.customer_phone || '').trim()) {
      throw new Error('اسم العميل ورقم هاتفه مطلوبان لطلب قطعة الغيار');
    }
    if (!Number.isInteger(Number(orderData.requested_quantity)) || Number(orderData.requested_quantity) <= 0) {
      throw new Error('كمية قطعة الغيار يجب أن تكون عددًا صحيحًا أكبر من الصفر');
    }
  }
  if (orderData.vehicle_plate || orderData.vehicle_make || orderData.vehicle_model
    || orderData.vehicle_year || orderData.odometer || orderData.fault_description) {
    if (!['maintenance', 'online'].includes(orderData.order_type)) {
      throw new Error('بيانات السيارة مسموحة لطلبات السيارات فقط');
    }
    if (orderData.order_type === 'maintenance'
      && (!String(orderData.vehicle_plate || '').trim() || !String(orderData.fault_description || '').trim())) {
      throw new Error('رقم لوحة السيارة ووصف العطل مطلوبان');
    }
    if (orderData.vehicle_year !== undefined && orderData.vehicle_year !== null
      && (!Number.isInteger(Number(orderData.vehicle_year)) || Number(orderData.vehicle_year) < 1900)) {
      throw new Error('سنة صنع السيارة غير صالحة');
    }
    if (orderData.odometer !== undefined && orderData.odometer !== null
      && (!Number.isInteger(Number(orderData.odometer)) || Number(orderData.odometer) < 0)) {
      throw new Error('قراءة عداد السيارة غير صالحة');
    }
  }

  const payload = {
    ...orderData,
    vehicle_plate: orderData.vehicle_plate?.trim() || null,
    vehicle_make: orderData.vehicle_make?.trim() || null,
    vehicle_model: orderData.vehicle_model?.trim() || null,
    fault_description: orderData.fault_description?.trim() || null,
    requested_part: orderData.requested_part?.trim() || null,
    part_number: orderData.part_number?.trim() || null,
    requested_quantity: Number(orderData.requested_quantity) || 1,
    estimated_amount: Number(orderData.estimated_amount) || 0,
    due_date: orderData.due_date || null,
    created_by_user_id: userSession?.id || orderData.created_by_user_id || null
  };

  const orderId = ordersRepo.createOrder(payload, items);

  // Invalidate Cache
  ordersCache.invalidate();

  // Notify assigned user if assigned
  if (payload.assigned_user_id) {
    NotificationsService.notify({
      userId: payload.assigned_user_id,
      type: 'info',
      title: 'طلب جديد تم إسناده إليك',
      message: `تم إسناد الطلب الجديد إلى حسابك`,
      linkPage: 'orders'
    });
  }

  // Notify if urgent
  if (payload.priority === 'urgent') {
    NotificationsService.notify({
      userId: null, // Broadcast to all admins/users
      type: 'warning',
      title: 'طلب عاجل جديد!',
      message: `تم إنشاء طلب جديد ذو أولوية عاجلة`,
      linkPage: 'orders'
    });
  }

  return ordersRepo.getOrderById(orderId);
}

function getOrders(filters = {}) {
  const cacheKey = `orders_list_${JSON.stringify(filters)}`;
  const cachedData = ordersCache.get(cacheKey);
  if (cachedData) {
    return cachedData;
  }

  const result = ordersRepo.getOrders(filters);
  ordersCache.set(cacheKey, result, 15000); // 15s cache for lists
  return result;
}

function getOrderById(orderId) {
  if (!orderId) throw new Error('معرف الطلب مطلوب');
  return ordersRepo.getOrderById(orderId);
}

function addOrderItem(orderId, item, userSession = {}) {
  const normalizedOrderId = Number(orderId);
  const variantId = Number(item?.variantId);
  const quantity = Number(item?.quantity);
  if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0
    || !Number.isInteger(variantId) || variantId <= 0) {
    throw new Error('أمر الشغل أو الصنف المحدد غير صالح');
  }
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error('كمية الصنف يجب أن تكون عددًا صحيحًا أكبر من الصفر');
  }
  ordersRepo.addOrderItem(normalizedOrderId, { variantId, quantity }, userSession?.id || null);
  ordersCache.invalidate();
  return ordersRepo.getOrderById(normalizedOrderId);
}

function updateOrderStatus(orderId, newStatus, userSession = {}, description = null) {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error('حالة الطلب غير صالحة');
  }

  const order = ordersRepo.getOrderForCheckout(orderId);
  if (order?.sale_id && newStatus !== 'delivered') {
    throw new Error('لا يمكن تغيير حالة أمر الشغل بعد إصدار فاتورته');
  }
  if (newStatus === 'delivered') {
    if (order?.order_type === 'maintenance' && !order.sale_id) {
      throw new Error('يجب إصدار فاتورة أمر الشغل من نقطة البيع قبل تسجيل التسليم');
    }
  }

  const userId = userSession?.id || null;
  const updatedOrder = ordersRepo.updateOrderStatus(orderId, newStatus, userId, description);

  // Invalidate Cache
  ordersCache.invalidate();

  // Notify assignee or creator if status ready or delivered
  if (updatedOrder.assigned_user_id && ['ready', 'delivered'].includes(newStatus)) {
    const statusText = newStatus === 'ready' ? 'جاهز للتسليم' : 'تم التسليم';
    NotificationsService.notify({
      userId: updatedOrder.assigned_user_id,
      type: 'success',
      title: `تحديث حالة الطلب ${updatedOrder.order_number}`,
      message: `تغيرت حالة الطلب إلى: ${statusText}`,
      linkPage: 'orders'
    });
  }

  return updatedOrder;
}

function assignOrder(orderId, assignedUserId, userSession = {}) {
  const currentUserId = userSession?.id || null;
  const updatedOrder = ordersRepo.assignOrder(orderId, assignedUserId, currentUserId);

  // Invalidate Cache
  ordersCache.invalidate();

  if (assignedUserId) {
    NotificationsService.notify({
      userId: assignedUserId,
      type: 'info',
      title: 'إسناد طلب',
      message: `تم إسناد الطلب رقم ${updatedOrder.order_number} إليك`,
      linkPage: 'orders'
    });
  }

  return updatedOrder;
}

function addOrderComment(orderId, commentText, userSession = {}) {
  if (!commentText || !commentText.trim()) {
    throw new Error('محتوى التعليق لا يمكن أن يكون فارغاً');
  }
  const userId = userSession?.id || null;
  ordersRepo.addOrderComment(orderId, userId, commentText.trim());

  ordersCache.invalidate();
  return ordersRepo.getOrderById(orderId);
}

function addOrderAttachment(orderId, attachmentData, userSession = {}) {
  if (!attachmentData || !attachmentData.file_name || !attachmentData.file_path) {
    throw new Error('بيانات الملف المرفق غير مكتملة');
  }
  const userId = userSession?.id || null;
  ordersRepo.addOrderAttachment(orderId, userId, attachmentData);

  ordersCache.invalidate();
  return ordersRepo.getOrderById(orderId);
}

function getOrderStats() {
  const cacheKey = 'order_stats';
  const cachedStats = ordersCache.get(cacheKey);
  if (cachedStats) return cachedStats;

  const stats = ordersRepo.getOrderStats();
  ordersCache.set(cacheKey, stats, 10000); // 10s TTL
  return stats;
}

module.exports = {
  createOrder,
  getOrders,
  getOrderById,
  addOrderItem,
  updateOrderStatus,
  assignOrder,
  addOrderComment,
  addOrderAttachment,
  getOrderStats
};

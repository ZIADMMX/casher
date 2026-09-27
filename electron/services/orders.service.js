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

  const payload = {
    ...orderData,
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

function updateOrderStatus(orderId, newStatus, userSession = {}, description = null) {
  if (!ALLOWED_STATUSES.includes(newStatus)) {
    throw new Error('حالة الطلب غير صالحة');
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
  updateOrderStatus,
  assignOrder,
  addOrderComment,
  addOrderAttachment,
  getOrderStats
};

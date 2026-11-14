const { db } = require('../database/db');
const subscriptionsRepo = require('../repositories/subscriptions.repository');
const subscriptionsCache = require('./subscriptions.cache');
const NotificationsService = require('./notifications.service');
const salesRepo = require('../repositories/sales.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const inventoryRepo = require('../repositories/inventory.repository');
const settingsRepo = require('../repositories/settings.repository');
const { getCurrentSession } = require('./auth.service');

/**
 * Subscriptions & Packages Service
 * Business logic, memory caching, expiration reminders, freeze management
 */

const ALLOWED_PACKAGE_TYPES = ['time_based', 'session_based', 'product_quota', 'membership'];
const PAYMENT_METHODS = ['cash', 'card', 'credit'];

// The logged-in user, so freeze/renew/sale rows carry who did them even when the
// handler passes nothing.
const sessionOf = (userSession) => (userSession && userSession.id ? userSession : getCurrentSession() || {});

// Selling or renewing a subscription is money taken at the counter, so it becomes a
// sale row in the open shift; otherwise the gym's revenue never reaches the shift or the reports.
const toCents = (value) => Math.round((Number(value) || 0) * 100);

// One payment of the full price by default (old callers send payment_method / due_date). The
// checkout screen sends `payments` [{ method, amount, due_date }] for split or installment
// collection; their amounts must add up to the package price.
function normalizePayments(price, { payments, payment_method = 'cash', due_date = null } = {}) {
  if (!Array.isArray(payments) || payments.length === 0) {
    const method = PAYMENT_METHODS.includes(payment_method) ? payment_method : 'cash';
    return [{ method, cents: toCents(price), dueDate: method === 'credit' ? due_date : null }];
  }

  const list = payments.map((p) => ({ method: p?.method, cents: toCents(p?.amount), dueDate: p?.due_date || null }));
  for (const p of list) {
    if (!PAYMENT_METHODS.includes(p.method)) throw new Error('طريقة الدفع غير مدعومة');
    if (p.cents <= 0) throw new Error('مبلغ كل دفعة يجب أن يكون أكبر من صفر');
    if (p.method !== 'credit') p.dueDate = null;
  }
  if (list.reduce((sum, p) => sum + p.cents, 0) !== toCents(price)) {
    throw new Error('مجموع الدفعات لا يساوي قيمة الباقة');
  }
  return list;
}

function recordSubscriptionSale(sub, payment = {}, userSession = {}) {
  const price = Number(sub.package_price) || 0;
  if (price <= 0) return null;
  const payments = normalizePayments(price, payment);
  if (payments.some((p) => p.method === 'credit' && !p.dueDate)) {
    throw new Error('تاريخ الاستحقاق مطلوب في حالة البيع الآجل');
  }

  const session = sessionOf(userSession);
  const shift = shiftsRepo.getCurrentOpenShift(session.id) || shiftsRepo.getCurrentOpenShift();
  if (!shift) throw new Error('لا يمكن تحصيل الاشتراك لعدم وجود وردية مفتوحة. يرجى فتح وردية أولاً');

  const warehouseId = inventoryRepo.getDefaultWarehouseId();
  const branchId = warehouseId ? inventoryRepo.getWarehouseBranchId(warehouseId) : null;
  // One sale row per payment, so each method lands in its own shift total.
  return payments.map((p) => salesRepo.createSale({
    shiftId: shift.id,
    branchId,
    warehouseId,
    customerId: sub.customer_id,
    customerName: sub.customer_name,
    customerPhone: sub.customer_phone,
    userId: session.id || null,
    totalAmount: p.cents / 100,
    discount: 0,
    paymentMethod: p.method,
    dueDate: p.dueDate,
  }));
}

// --- PACKAGES ---

function createPackage(packageData) {
  if (!packageData.name || !packageData.name.trim()) {
    throw new Error('اسم الباقة مطلوب');
  }
  const type = packageData.type || 'session_based';
  if (!ALLOWED_PACKAGE_TYPES.includes(type)) {
    throw new Error('نوع الباقة غير صحيح');
  }
  packageData.type = type;
  if (packageData.price < 0) {
    throw new Error('سعر الباقة يجب أن يكون رصيداً موجباً');
  }

  const packageId = subscriptionsRepo.createPackage(packageData);
  subscriptionsCache.invalidate();
  return subscriptionsRepo.getPackageById(packageId);
}

function getAllPackages() {
  const cacheKey = 'all_packages';
  const cached = subscriptionsCache.get(cacheKey);
  if (cached) return cached;

  const result = subscriptionsRepo.getAllPackages();
  subscriptionsCache.set(cacheKey, result, 15000);
  return result;
}

function updatePackage(id, packageData) {
  if (!id) throw new Error('معرف الباقة مطلوب');
  const updated = subscriptionsRepo.updatePackage(id, packageData);
  subscriptionsCache.invalidate();
  return updated;
}

function deletePackage(id) {
  if (!id) throw new Error('معرف الباقة مطلوب');
  const result = subscriptionsRepo.deletePackage(id);
  subscriptionsCache.invalidate();
  return result;
}

// --- CUSTOMER SUBSCRIPTIONS ---

function subscribeCustomer(data, userSession = {}) {
  const { customer_id, package_id, auto_renew, notes } = data;
  if (!customer_id || !package_id) {
    throw new Error('يرجى اختيار العميل والباقة');
  }

  const pkg = subscriptionsRepo.getPackageById(package_id);
  if (!pkg) throw new Error('الباقة المحددة غير موجودة');

  const startDateObj = new Date();
  const endDateObj = new Date();
  endDateObj.setDate(startDateObj.getDate() + (pkg.duration_days || 30));

  const payload = {
    customer_id,
    package_id,
    start_date: startDateObj.toISOString(),
    end_date: endDateObj.toISOString(),
    total_credits: pkg.total_credits || 0,
    auto_renew: auto_renew ? 1 : 0,
    notes: notes || null
  };

  const subId = db.transaction(() => {
    const id = subscriptionsRepo.subscribeCustomer(payload);
    recordSubscriptionSale(subscriptionsRepo.getSubscriptionById(id), data, userSession);
    return id;
  })();
  subscriptionsCache.invalidate();

  // Notify customer subscription created
  NotificationsService.notify({
    userId: sessionOf(userSession).id || null,
    type: 'success',
    title: 'اشتراك جديد',
    message: `تم تفعيل ${pkg.name} بنجاح`,
    linkPage: 'subscriptions'
  });

  return subscriptionsRepo.getSubscriptionById(subId);
}

function getAllSubscriptions(filters = {}) {
  const cacheKey = `subscriptions_list_${JSON.stringify(filters)}`;
  const cached = subscriptionsCache.get(cacheKey);
  if (cached) return cached;

  subscriptionsRepo.updateAutoExpirationStatus();
  const result = subscriptionsRepo.getAllSubscriptions(filters);
  subscriptionsCache.set(cacheKey, result, 10000);
  return result;
}

function getActiveSubscriptionByCustomer(customerId) {
  if (!customerId) return null;
  const cacheKey = `active_sub_customer_${customerId}`;
  const cached = subscriptionsCache.get(cacheKey);
  if (cached) return cached;

  subscriptionsRepo.updateAutoExpirationStatus();
  const sub = subscriptionsRepo.getActiveSubscriptionByCustomer(customerId);
  subscriptionsCache.set(cacheKey, sub, 10000);
  return sub;
}

function consumeCredit(subscriptionId, creditsDeducted = 1, userSession = {}, saleId = null, notes = null) {
  const userId = sessionOf(userSession).id || null;
  const updatedSub = subscriptionsRepo.consumeCredit(subscriptionId, creditsDeducted, userId, saleId, notes);
  subscriptionsCache.invalidate();

  if (updatedSub.status === 'depleted') {
    NotificationsService.notify({
      userId,
      type: 'warning',
      title: 'نفاد رصيد الاشتراك',
      message: `نفد رصيد الجلسات للعميل ${updatedSub.customer_name}`,
      linkPage: 'subscriptions'
    });
  }

  return updatedSub;
}

function freezeSubscription(subscriptionId, reason = null, userSession = {}) {
  const userId = sessionOf(userSession).id || null;
  const frozenSub = subscriptionsRepo.freezeSubscription(subscriptionId, reason, userId);
  subscriptionsCache.invalidate();

  NotificationsService.notify({
    userId,
    type: 'info',
    title: 'تجميد اشتراك',
    message: `تم تجميد اشتراك العميل ${frozenSub.customer_name}`,
    linkPage: 'subscriptions'
  });

  return frozenSub;
}

function unfreezeSubscription(subscriptionId, userSession = {}) {
  const userId = sessionOf(userSession).id || null;
  const unfrozenSub = subscriptionsRepo.unfreezeSubscription(subscriptionId, userId);
  subscriptionsCache.invalidate();

  NotificationsService.notify({
    userId,
    type: 'success',
    title: 'إعادة تفعيل اشتراك',
    message: `تم إعادة تفعيل اشتراك العميل ${unfrozenSub.customer_name} وتمديد تاريخ الانتهاء تلقائياً`,
    linkPage: 'subscriptions'
  });

  return unfrozenSub;
}

function renewSubscription(subscriptionId, userSession = {}, payment = {}) {
  const userId = sessionOf(userSession).id || null;
  const sub = subscriptionsRepo.getSubscriptionById(subscriptionId);
  if (!sub) throw new Error('الاشتراك غير موجود');

  const renewedSub = db.transaction(() => {
    const renewed = subscriptionsRepo.renewSubscription(subscriptionId, sub.duration_days || 30, sub.total_credits || 0);
    recordSubscriptionSale(sub, payment, userSession);
    return renewed;
  })();
  subscriptionsCache.invalidate();

  NotificationsService.notify({
    userId,
    type: 'success',
    title: 'تجديد اشتراك',
    message: `تم تجديد اشتراك العميل ${sub.customer_name} بنجاح`,
    linkPage: 'subscriptions'
  });

  return renewedSub;
}

function checkExpiringSubscriptions() {
  // Called on a timer, so the reminder goes out once a day however often it runs.
  const today = new Date().toISOString().slice(0, 10);
  if (settingsRepo.get('subscriptions_expiry_notified_on') === today) return;
  settingsRepo.set('subscriptions_expiry_notified_on', today);

  subscriptionsRepo.updateAutoExpirationStatus();
  const allActive = subscriptionsRepo.getAllSubscriptions({ status: 'active' });
  const now = new Date();
  const threeDaysLater = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  for (const sub of allActive) {
    const endDate = new Date(sub.end_date);
    if (endDate <= threeDaysLater && endDate > now) {
      NotificationsService.notify({
        userId: null,
        type: 'warning',
        title: 'اشتراك ينتهي قريباً ⚠️',
        message: `اشتراك العميل ${sub.customer_name} (${sub.package_name}) ينتهي بتاريخ ${endDate.toLocaleDateString('ar-EG')}`,
        linkPage: 'subscriptions'
      });
    }
  }
}

function getSubscriptionStats() {
  const cacheKey = 'sub_stats';
  const cached = subscriptionsCache.get(cacheKey);
  if (cached) return cached;

  const stats = subscriptionsRepo.getSubscriptionStats();
  subscriptionsCache.set(cacheKey, stats, 10000);
  return stats;
}

module.exports = {
  createPackage,
  getAllPackages,
  updatePackage,
  deletePackage,
  subscribeCustomer,
  getAllSubscriptions,
  getActiveSubscriptionByCustomer,
  consumeCredit,
  freezeSubscription,
  unfreezeSubscription,
  renewSubscription,
  checkExpiringSubscriptions,
  getSubscriptionStats
};

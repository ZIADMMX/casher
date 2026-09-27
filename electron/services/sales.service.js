// sales.service.js - Added centralized error logging and try/catch for critical operations
const { db } = require('../database/db');
const customersRepo = require('../repositories/customers.repository');
const salesRepo = require('../repositories/sales.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const NotificationsService = require('./notifications.service');
const { requireAuth, getCurrentSession } = require('./auth.service');
const { logError } = require('../services/logger.service');

/**
 * Create a new sale transaction.
 * All critical steps are wrapped in a try/catch so that any failure
 * is logged via `logError` and then re‑thrown to be handled by `safeHandle`.
 */
function createSale({ items, discount = 0, paymentMethod, customerId, customerName, customerPhone, dueDate, subscriptionId, creditsDeducted }) {
  try {
    const session = getCurrentSession();
    if (!session) {
      throw new Error('يجب تسجيل الدخول أولاً');
    }
    if (!items || items.length === 0) {
      throw new Error('السلة فارغة');
    }
    if (paymentMethod === 'credit') {
      if (!customerName || !customerName.trim()) {
        throw new Error('اسم العميل مطلوب في حالة البيع الآجل');
      }
      if (!dueDate) {
        throw new Error('تاريخ الاستحقاق مطلوب في حالة البيع الآجل');
      }
    }

    const activeShift = shiftsRepo.getCurrentOpenShift();

    const verifiedItems = [];
    for (const item of items) {
      if (!Number.isInteger(Number(item.quantity)) || Number(item.quantity) < 1) {
        throw new Error('كمية الصنف يجب أن تكون رقمًا صحيحًا أكبر من الصفر');
      }
      const variant = variantsRepo.getById(item.variantId);
      if (!variant) {
        throw new Error('أحد المنتجات لم يعد موجودًا');
      }
      if (variant.stock_quantity < item.quantity) {
        throw new Error(`الكمية المتاحة غير كافية للصنف: ${variant.size || ''} ${variant.color || ''}`);
      }
      verifiedItems.push({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: variant.selling_price,
      });
    }

    const normalizedDiscount = Number(discount);
    if (!Number.isFinite(normalizedDiscount) || normalizedDiscount < 0) {
      throw new Error('الخصم يجب أن يكون رقمًا أكبر من أو يساوي الصفر');
    }

    const subtotal = Math.round(
      verifiedItems.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0) * 100
    ) / 100;

    if (normalizedDiscount > subtotal) {
      throw new Error('قيمة الخصم لا يمكن أن تتجاوز إجمالي الفاتورة');
    }

    // قيود الكاشير على الخصم (30% كحد أقصى للخصم غير الإداري)
    if (session.role !== 'admin' && subtotal > 0 && normalizedDiscount > 0) {
      const discountPercentage = (normalizedDiscount / subtotal) * 100;
      if (discountPercentage > 30) {
        throw new Error('غير مصرح للكاشير بتطبيق خصم يتجاوز 30% من قيمة الفاتورة. يرجى مراجعة المدير');
      }
    }

    const totalAmount = Math.round(Math.max(subtotal - normalizedDiscount, 0) * 100) / 100;

    let resolvedCustomerId = customerId || null;
    if (!resolvedCustomerId) {
      if (customerPhone) {
        const existing = customersRepo.getByPhone(customerPhone);
        if (existing) {
          resolvedCustomerId = existing.id;
        } else if (paymentMethod === 'credit') {
          resolvedCustomerId = customersRepo.create({ name: customerName.trim(), phone: customerPhone, email: null });
        }
      } else if (paymentMethod === 'credit' && customerName) {
        resolvedCustomerId = customersRepo.create({ name: customerName.trim(), phone: null, email: null });
      }
    }

    const runTransaction = db.transaction(() => {
      const saleId = salesRepo.createSale({
        shiftId: activeShift ? activeShift.id : null,
        customerId: resolvedCustomerId,
        customerName: paymentMethod === 'credit' ? customerName.trim() : null,
        customerPhone: paymentMethod === 'credit' ? (customerPhone || null) : null,
        userId: session.id,
        totalAmount,
        discount: normalizedDiscount,
        paymentMethod,
        dueDate: paymentMethod === 'credit' ? dueDate : null,
      });

      for (const item of verifiedItems) {
        salesRepo.createSaleItem(saleId, item);
        variantsRepo.decreaseStock(item.variantId, item.quantity);
      }

      return saleId;
    });

    const saleId = runTransaction();

    // خصم رصيد الاشتراك/الباقة في حالة اختيار العميل لباقة جلسات أو رصيد
    if (subscriptionId) {
      try {
        const subscriptionsService = require('./subscriptions.service');
        subscriptionsService.consumeCredit(
          subscriptionId,
          Number(creditsDeducted || 1),
          session,
          saleId,
          `خصم رصيد باقة مع فاتورة #${saleId}`
        );
      } catch (subErr) {
        console.warn('تنبيه خصم رصيد الاشتراك:', subErr.message);
      }
    }

    // تقييم وتدقيق العمولات التلقائية للموظف
    try {
      const commissionsService = require('./commissions.service');
      const sessionService = require('./session.service');
      const session = sessionService.getCurrentSession();
      commissionsService.evaluateSaleCommissions({ items, discount, paymentMethod, customerId, customerName, customerPhone, dueDate }, saleId, session?.id);
    } catch (e) {
      console.warn('تنبيه فحص العمولات:', e.message);
    }

    // إشعارات حول الفاتورة والرصيد
    try {
      if (paymentMethod === 'credit') {
        NotificationsService.notify({
          type: 'sale_credit',
          title: '👤 مبيعات بالآجل (دين جديد)',
          message: `تم تسجيل فاتورة بيع آجل #${saleId} للعميل "${customerName.trim()}" بقيمة ${totalAmount.toFixed(2)} ج.م (ميعاد الاستحقاق: ${dueDate})`,
          linkPage: 'customers',
        });
      }

      // فحص مستويات المخزون بعد البيع
      for (const item of verifiedItems) {
        const updated = variantsRepo.getById(item.variantId);
        if (updated) {
          if (updated.stock_quantity === 0) {
            NotificationsService.notify({
              type: 'out_of_stock',
              title: '🚫 نفاذ مخزون صنف بالكامل!',
              message: `نفذت كمية الصنف (${updated.sku || 'صنف'} - ${updated.size || ''} ${updated.color || ''}) من المخزون تماماً`,
              linkPage: 'products',
            });
          } else if (updated.stock_quantity <= (updated.low_stock_threshold ?? 5)) {
            NotificationsService.notify({
              type: 'low_stock',
              title: '⚠️ تنبيه: نقص وشيك في المخزون',
              message: `متبقي ${updated.stock_quantity} قطع فقط من الصنف (${updated.sku || 'صنف'} - ${updated.size || ''} ${updated.color || ''})`,
              linkPage: 'products',
            });
          }
        }
      }
    } catch (notifErr) {
      // سجل الأخطاء المتعلقة بالإشعارات لكن لا توقف عملية البيع
      logError('SaleNotifications', notifErr);
    }

    return { saleId, totalAmount };
  } catch (err) {
    // سجل أي خطأ حرجي ثم أعد رميه ليتم التعامل معه في طبقة IPC
    logError('CreateSale', err);
    throw err;
  }
}

function getSaleById(saleId) {
  requireAuth();
  return salesRepo.getById(saleId);
}

module.exports = { createSale, getSaleById };
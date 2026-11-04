// sales.service.js - Added centralized error logging and try/catch for critical operations
const { db } = require('../database/db');
const customersRepo = require('../repositories/customers.repository');
const salesRepo = require('../repositories/sales.repository');
const ordersRepo = require('../repositories/orders.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const productsCache = require('./products.cache');
const NotificationsService = require('./notifications.service');
const { requireAuth, getCurrentSession } = require('./auth.service');
const { logError } = require('../services/logger.service');
const inventoryRepo = require('../repositories/inventory.repository');
const bundlePromotionsService = require('./bundlePromotions.service');

/**
 * Create a new sale transaction.
 * All critical steps are wrapped in a try/catch so that any failure
 * is logged via `logError` and then re‑thrown to be handled by `safeHandle`.
 */
function createSale({
  items,
  discount = 0,
  paymentMethod,
  orderMode,
  customerId,
  customerName,
  customerPhone,
  dueDate,
  subscriptionId,
  creditsDeducted,
  orderId,
}) {
  try {
    const session = getCurrentSession();
    if (!session) {
      throw new Error('يجب تسجيل الدخول أولاً');
    }
    if (!items || items.length === 0) {
      throw new Error('السلة فارغة');
    }
    if (orderMode != null && !['dine_in', 'takeaway', 'delivery'].includes(orderMode)) {
      throw new Error('طريقة استلام الطلب غير صالحة');
    }
    let linkedOrder = null;
    if (orderId !== undefined && orderId !== null) {
      const normalizedOrderId = Number(orderId);
      if (!Number.isInteger(normalizedOrderId) || normalizedOrderId <= 0) {
        throw new Error('معرف أمر الشغل غير صالح');
      }
      linkedOrder = ordersRepo.getOrderForCheckout(normalizedOrderId);
      if (!linkedOrder || linkedOrder.order_type !== 'maintenance') {
        throw new Error('أمر الشغل غير موجود');
      }
      if (linkedOrder.status !== 'ready' || linkedOrder.sale_id) {
        throw new Error('يجب أن يكون أمر الشغل جاهزًا وغير مفوتر قبل إصدار الفاتورة');
      }
      orderId = normalizedOrderId;
    }

    if (paymentMethod === 'credit') {
      if (!(customerName?.trim() || linkedOrder?.customer_name?.trim())) {
        throw new Error('اسم العميل مطلوب في حالة البيع الآجل');
      }
      if (!dueDate) {
        throw new Error('تاريخ الاستحقاق مطلوب في حالة البيع الآجل');
      }
    }

    const activeShift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
    if (!activeShift) {
      throw new Error('لا يمكن إتمام عملية البيع لعدم وجود وردية مفتوحة. يرجى فتح وردية أولاً');
    }

    const warehouseId = session.centralRequest
      ? Number(session.warehouseId)
      : inventoryRepo.getDefaultWarehouseId();
    if (!warehouseId) {
      throw new Error('يجب تخصيص مخزن هذا الفرع من صفحة إدارة الفروع قبل بدء البيع');
    }
    const branchId = inventoryRepo.getWarehouseBranchId(warehouseId);
    const verifiedItems = [];
    const requestedByVariant = new Map();
    for (const item of items) {
      const itemQty = Number(item.quantity);
      if (isNaN(itemQty) || itemQty <= 0) {
        throw new Error('كمية الصنف يجب أن تكون أكبر من الصفر');
      }
      const variant = variantsRepo.getById(item.variantId);
      if (!variant) {
        throw new Error('أحد المنتجات لم يعد موجودًا');
      }
      const isService = Boolean(variant.is_service);
      const quantity = Number(item.quantity);

      // دعم تعدد وحدات القياس (كرتونة، باكت) والأسعار المخصصة للميزان
      let effectiveUnitPrice = variant.selling_price;
      let stockDeductionFactor = 1;

      if (item.unitId) {
        try {
          const unit = db.prepare('SELECT * FROM product_units WHERE id = ?').get(item.unitId);
          if (unit) {
            effectiveUnitPrice = Number(unit.selling_price);
            stockDeductionFactor = Number(unit.conversion_factor) || 1;
          }
        } catch {}
      } else if (
        item.unitPrice !== undefined
        && (Number(item.unitPrice) > 0 || (orderId && Number(item.unitPrice) === 0))
      ) {
        effectiveUnitPrice = Number(item.unitPrice);
      }

      const baseQuantityDeduction = quantity * stockDeductionFactor;
      if (!isService) {
        const requested = (requestedByVariant.get(Number(item.variantId)) || 0) + baseQuantityDeduction;
        requestedByVariant.set(Number(item.variantId), requested);
        const available = inventoryRepo.getStockQuantity(warehouseId, Number(item.variantId));
        if (available < requested) {
          throw new Error(`الكمية المتاحة غير كافية للصنف (${variant.sku || 'الصنف'}). المطلوب: ${requested}، المتاح: ${available}`);
        }
      }

      verifiedItems.push({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: effectiveUnitPrice,
        baseQuantityDeduction,
        isService,
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

    const appliedPromotion = bundlePromotionsService.getBestBundlePromotion(verifiedItems);
    const effectiveDiscount = Math.max(normalizedDiscount, appliedPromotion?.discount || 0);
    const totalAmount = Math.round(Math.max(subtotal - effectiveDiscount, 0) * 100) / 100;

    let resolvedCustomerId = customerId || linkedOrder?.customer_id || null;
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
        customerName: linkedOrder
          ? (customerName?.trim() || linkedOrder.customer_name || null)
          : paymentMethod === 'credit' ? customerName.trim() : null,
        customerPhone: linkedOrder
          ? (customerPhone?.trim() || linkedOrder.customer_phone || null)
          : paymentMethod === 'credit' ? (customerPhone || null) : null,
        userId: session.id,
        totalAmount,
        discount: effectiveDiscount,
        paymentMethod,
        orderMode,
        kitchenStatus: orderMode ? 'new' : null,
        dueDate: paymentMethod === 'credit' ? dueDate : null,
        branchId,
        warehouseId,
      });

      for (const item of verifiedItems) {
        salesRepo.createSaleItem(saleId, item);
        const deductionQty = item.baseQuantityDeduction || item.quantity;
        if (!item.isService) {
          inventoryRepo.applyStockChange({
            warehouseId,
            variantId: item.variantId,
            delta: -deductionQty,
            movementType: 'sale',
            referenceType: 'sale',
            referenceId: saleId,
            userId: session.id,
          });
        }

        if (!item.isService) {
          // خصم رصيد التشغيلات وتواريخ الصلاحية آلياً وفقاً لسياسة FIFO
          try {
            const groceryRepo = require('../repositories/grocery.repository');
            groceryRepo.deductFifoBatchQuantity(item.variantId, deductionQty);
          } catch {
            // تجاهل آمن في حالة عدم وجود تشغيلات لهذا الصنف
          }
        }
      }

      if (linkedOrder) {
        ordersRepo.completeOrderWithSale(
          linkedOrder.id,
          saleId,
          paymentMethod === 'credit' ? 0 : totalAmount,
          session.id
        );
      }

      return saleId;
    });

    const saleId = runTransaction();
    productsCache.invalidate();

    // تسجيل حركة البيع في سجل تدقيق الكاشير
    try {
      const auditService = require('./audit.service');
      const methodLabel = paymentMethod === 'cash' ? 'نقدي (كاش)' : paymentMethod === 'card' ? 'فيزا / بطاقة' : 'آجل';
      auditService.logAction({
        actionType: 'sale_created',
        title: `إصدار فاتورة بيع #${saleId}`,
        details: `فاتورة بيع #${saleId} [${methodLabel}] بإجمالي ${totalAmount.toFixed(2)} ج.م (عدد الأصناف: ${verifiedItems.length})`,
        amount: totalAmount,
        shiftId: activeShift ? activeShift.id : null,
        userId: session.id,
        username: session.username,
        severity: 'success',
      });

      if (effectiveDiscount > 0) {
        auditService.logAction({
          actionType: 'discount_applied',
          title: `تطبيق خصم (${effectiveDiscount.toFixed(2)} ج.م) على فاتورة #${saleId}`,
          details: `${appliedPromotion && appliedPromotion.discount > normalizedDiscount ? `عرض ${appliedPromotion.name}؛ ` : ''}خصم على فاتورة #${saleId} بقيمة ${effectiveDiscount.toFixed(2)} ج.م من أصل ${subtotal.toFixed(2)} ج.م`,
          amount: effectiveDiscount,
          shiftId: activeShift ? activeShift.id : null,
          userId: session.id,
          username: session.username,
          severity: 'warning',
        });
      }
    } catch (auditErr) {
      console.warn('تنبيه تسجيل حركة البيع في سجل التدقيق:', auditErr.message);
    }

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
        if (item.isService) continue;
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
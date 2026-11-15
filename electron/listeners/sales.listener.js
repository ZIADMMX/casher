const eventBus = require('../services/eventBus.service');
const { logError } = require('../services/logger.service');
const NotificationsService = require('../services/notifications.service');
const variantsRepo = require('../repositories/productVariants.repository');

// 1. إدراج الفاتورة في طابور الضرائب (ETA E-Invoice / E-Receipt)
eventBus.on('sale:created', ({ saleId }) => {
  try {
    const einvoice = require('../services/einvoice');
    einvoice.enqueueSale(saleId);
  } catch (err) {
    logError('EInvoiceSaleListener', err);
  }
});

// 2. تسجيل حركة البيع والخصم في سجل تدقيق الكاشير
eventBus.on('sale:created', ({
  saleId,
  totalAmount,
  effectiveDiscount,
  normalizedDiscount,
  subtotal,
  paymentMethod,
  verifiedItems,
  appliedPromotion,
  activeShift,
  session,
}) => {
  try {
    const auditService = require('../services/audit.service');
    const methodLabel =
      paymentMethod === 'cash'
        ? 'نقدي (كاش)'
        : paymentMethod === 'card'
          ? 'فيزا / بطاقة'
          : 'آجل';

    auditService.logAction({
      actionType: 'sale_created',
      title: `إصدار فاتورة بيع #${saleId}`,
      details: `فاتورة بيع #${saleId} [${methodLabel}] بإجمالي ${Number(totalAmount).toFixed(2)} ج.م (عدد الأصناف: ${verifiedItems?.length || 0})`,
      amount: totalAmount,
      shiftId: activeShift ? activeShift.id : null,
      userId: session?.id,
      username: session?.username,
      severity: 'success',
    });

    if (effectiveDiscount > 0) {
      auditService.logAction({
        actionType: 'discount_applied',
        title: `تطبيق خصم (${effectiveDiscount.toFixed(2)} ج.م) على فاتورة #${saleId}`,
        details: `${appliedPromotion && appliedPromotion.discount > normalizedDiscount ? `عرض ${appliedPromotion.name}؛ ` : ''}خصم على فاتورة #${saleId} بقيمة ${effectiveDiscount.toFixed(2)} ج.م من أصل ${subtotal.toFixed(2)} ج.م`,
        amount: effectiveDiscount,
        shiftId: activeShift ? activeShift.id : null,
        userId: session?.id,
        username: session?.username,
        severity: 'warning',
      });
    }
  } catch (auditErr) {
    console.warn('تنبيه تسجيل حركة البيع في سجل التدقيق:', auditErr.message);
  }
});

// 3. تقييم وتدقيق العمولات التلقائية للموظف
eventBus.on('sale:created', ({
  saleId,
  verifiedItems,
  afterDiscount,
  effectiveDiscount,
  paymentMethod,
  session,
}) => {
  try {
    const commissionsService = require('../services/commissions.service');
    commissionsService.evaluateSaleCommissions(
      {
        items: (verifiedItems || []).map((item) => ({ ...item, price: item.unitPrice })),
        totalAmount: afterDiscount,
        discount: effectiveDiscount,
        paymentMethod,
      },
      saleId,
      session?.id
    );
  } catch (e) {
    console.warn('تنبيه فحص العمولات:', e.message);
  }
});

// 4. إشعارات المبيعات الآجلة وفحص مستويات المخزون (نواقص الأصناف)
eventBus.on('sale:created', ({
  saleId,
  totalAmount,
  paymentMethod,
  customerName,
  dueDate,
  requestedVariantIds,
}) => {
  try {
    if (paymentMethod === 'credit' && customerName) {
      NotificationsService.notify({
        type: 'sale_credit',
        title: '👤 مبيعات بالآجل (دين جديد)',
        message: `تم تسجيل فاتورة بيع آجل #${saleId} للعميل "${customerName.trim()}" بقيمة ${Number(totalAmount).toFixed(2)} ج.م (ميعاد الاستحقاق: ${dueDate})`,
        linkPage: 'customers',
      });
    }

    if (Array.isArray(requestedVariantIds)) {
      for (const variantId of requestedVariantIds) {
        const updated = variantsRepo.getById(variantId);
        if (updated) {
          if (updated.stock_quantity === 0) {
            NotificationsService.notify({
              type: 'out_of_stock',
              title: '🚫 نفاذ مخزون صنف بالكامل!',
              dedupeKey: `out_of_stock:${variantId}`,
              message: `نفذت كمية الصنف (${updated.sku || 'صنف'} - ${updated.size || ''} ${updated.color || ''}) من المخزون تماماً`,
              linkPage: 'products',
            });
          } else if (updated.stock_quantity <= (updated.low_stock_threshold ?? 5)) {
            NotificationsService.notify({
              type: 'low_stock',
              title: '⚠️ تنبيه: نقص وشيك في المخزون',
              dedupeKey: `low_stock:${variantId}`,
              message: `متبقي ${updated.stock_quantity} قطع فقط من الصنف (${updated.sku || 'صنف'} - ${updated.size || ''} ${updated.color || ''})`,
              linkPage: 'products',
            });
          }
        }
      }
    }
  } catch (notifErr) {
    logError('SaleNotifications', notifErr);
  }
});

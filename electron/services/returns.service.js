const { db } = require('../database/db');
const returnsRepo = require('../repositories/returns.repository');
const salesRepo = require('../repositories/sales.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const NotificationsService = require('./notifications.service');
const { requireAuth, getCurrentSession } = require('./auth.service');
const inventoryRepo = require('../repositories/inventory.repository');
const groceryRepo = require('../repositories/grocery.repository');

// نجيب فاتورة معينة برقمها عشان الكاشير يقدر يبحث عنها
function findSale(saleId) {
  requireAuth();
  const parsedSaleId = Number(saleId);
  if (!parsedSaleId) throw new Error('يرجى إدخال رقم فاتورة صحيح');

  const sale = salesRepo.getById(parsedSaleId);
  if (!sale) throw new Error('لم يتم العثور على فاتورة بهذا الرقم');

  // نضيف الكمية المرتجعة سابقًا لكل صنف، عشان الواجهة تعرف الحد الأقصى المسموح بإرجاعه
  const itemsWithReturns = sale.items.map((item) => ({
    ...item,
    alreadyReturned: returnsRepo.getReturnedQuantity(parsedSaleId, item.variant_id || item.variantId),
  }));

  return { ...sale, items: itemsWithReturns };
}

function processReturn({
  saleId,
  variantId,
  quantity,
  reason,
  mode,
  exchangeVariantId,
  exchangePaymentMethod = 'cash',
}) {
  const session = getCurrentSession();
  if (!session) throw new Error('يجب تسجيل الدخول أولاً');

  const activeShift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
  if (!activeShift) {
    throw new Error('لا يمكن إتمام عملية المرتجع أو الاستبدال لعدم وجود وردية مفتوحة. يرجى فتح وردية أولاً');
  }

  const parsedSaleId = Number(saleId);
  const parsedVariantId = Number(variantId);
  const parsedQty = Number(quantity);

  if (isNaN(parsedQty) || parsedQty <= 0) throw new Error('الكمية المرتجعة غير صحيحة');
  if (!parsedVariantId) throw new Error('لم يتم تحديد الصنف المراد إرجاعه');
  if (mode === 'exchange' && !['cash', 'card', 'bank_transfer'].includes(exchangePaymentMethod)) {
    throw new Error('وسيلة تسوية فرق الاستبدال غير صالحة');
  }

  const sale = salesRepo.getById(parsedSaleId);
  if (!sale) throw new Error('الفاتورة غير موجودة');

  // نتأكد إن الصنف ده فعلاً جزء من الفاتورة دي
  const rawItem = salesRepo.getSaleItem(parsedSaleId, parsedVariantId);
  if (!rawItem) throw new Error('هذا الصنف غير موجود في الفاتورة المحددة');

  const alreadyReturned = returnsRepo.getReturnedQuantity(parsedSaleId, parsedVariantId);
  if (alreadyReturned + parsedQty > rawItem.quantity) {
    throw new Error(`لا يمكن إرجاع أكثر من الكمية المباعة (المتاح للإرجاع: ${rawItem.quantity - alreadyReturned})`);
  }

  const grossSubtotal = (sale.items || []).reduce(
    (sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0),
    0
  );
  const invoiceDiscount = Math.min(Math.max(Number(sale.discount || 0), 0), grossSubtotal);
  const grossLineAmount = Number(rawItem.unit_price) * Number(rawItem.quantity);
  const lineDiscount = grossSubtotal > 0 ? invoiceDiscount * grossLineAmount / grossSubtotal : 0;
  const lineNetAmount = Math.round((grossLineAmount - lineDiscount) * 100) / 100;
  const cumulativeReturnedQuantity = alreadyReturned + parsedQty;
  const cumulativeRefundTarget = cumulativeReturnedQuantity >= Number(rawItem.quantity)
    ? lineNetAmount
    : Math.round((lineNetAmount * cumulativeReturnedQuantity / Number(rawItem.quantity)) * 100) / 100;
  const refundedPreviously = returnsRepo.getReturnedRefundAmount(parsedSaleId, parsedVariantId);
  const refundAmount = Math.max(
    Math.round((cumulativeRefundTarget - refundedPreviously) * 100) / 100,
    0
  );
  const warehouseId = sale.warehouse_id || inventoryRepo.getDefaultWarehouseId();
  let exchangePriceDifference = 0;
  let recordedExchangePaymentMethod = null;

  const runTransaction = db.transaction(() => {
    // 1. إرجاع الكمية للمخزون (الصنف المرتجع)
    inventoryRepo.applyStockChange({
      warehouseId,
      variantId: parsedVariantId,
      delta: parsedQty,
      movementType: 'return',
      referenceType: 'return',
      userId: session.id,
      notes: `مرتجع من فاتورة بيع #${parsedSaleId}`,
    });
    // إعادة تعبئة التشغيلة / الدفعة إذا كانت السلعة خاضعة للتشغيلات والصلاحيات
    try {
      groceryRepo.restockBatchQuantity(parsedVariantId, parsedQty);
    } catch (err) {
      console.warn('تنبيه: تعذر إعادة تعبئة تشغيلة المرتجع:', err.message);
    }

    let exchangeInfo = null;

    // 2. لو استبدال، نخصم من مخزون الصنف الجديد بنفس الكمية المستبدلة
    if (mode === 'exchange' && exchangeVariantId) {
      const parsedExchangeVariantId = Number(exchangeVariantId);
      const newVariant = variantsRepo.getById(parsedExchangeVariantId);
      if (!newVariant) throw new Error('الصنف البديل غير موجود');
      const available = inventoryRepo.getStockQuantity(warehouseId, parsedExchangeVariantId);
      if (available < parsedQty) {
        throw new Error(`الصنف البديل غير متوفر بالكمية المطلوبة بالمخزون (المتاح: ${available}، والمطلوب: ${parsedQty})`);
      }

      inventoryRepo.applyStockChange({
        warehouseId,
        variantId: parsedExchangeVariantId,
        delta: -parsedQty,
        movementType: 'sale',
        referenceType: 'return_exchange',
        userId: session.id,
        notes: `صنف بديل لمرتجع فاتورة بيع #${parsedSaleId}`,
      });
      // خصم التشغيلة بنظام FIFO للصنف البديل
      try {
        groceryRepo.deductFifoBatchQuantity(parsedExchangeVariantId, parsedQty);
      } catch (err) {
        console.warn('تنبيه: تعذر خصم تشغيلة الصنف البديل:', err.message);
      }
      const totalPriceDifference = Number(newVariant.selling_price) * parsedQty - refundAmount;
      exchangePriceDifference = Math.round(totalPriceDifference * 100) / 100;
      recordedExchangePaymentMethod = exchangePriceDifference === 0 ? null : exchangePaymentMethod;
      exchangeInfo = {
        variantId: parsedExchangeVariantId,
        quantity: parsedQty,
        unitPriceDifference: exchangePriceDifference / parsedQty,
        priceDifference: exchangePriceDifference,
      };
    }

    // 3. تسجيل عملية الإرجاع
    const returnId = returnsRepo.create({
      saleId: parsedSaleId,
      variantId: parsedVariantId,
      quantity: parsedQty,
      reason,
      refundAmount,
      exchangeVariantId: mode === 'exchange' && exchangeVariantId ? Number(exchangeVariantId) : null,
      exchangePriceDifference,
      exchangePaymentMethod: recordedExchangePaymentMethod,
      userId: session.id,
      shiftId: activeShift.id,
    });

    return { returnId, exchangeInfo };
  });

  const result = runTransaction();
  const productsCache = require('./products.cache');
  productsCache.invalidate();

  try {
    const isExchange = mode === 'exchange' && exchangeVariantId;
    NotificationsService.notify({
      type: isExchange ? 'sale_exchange' : 'sale_return',
      title: isExchange ? '🔄 استبدال صنف في فاتورة' : '↩️ مرتجع فاتورة بيع',
      message: `قام ${session.username} بتسجيل ${isExchange ? 'استبدال' : 'استرجاع'} في الفاتورة #${parsedSaleId} بقيمة ${refundAmount.toFixed(2)} ج.م (السبب: ${reason || 'بدون سبب'})`,
      linkPage: 'returns',
    });

    require('./audit.service').logAction({
      actionType: 'return_processed',
      title: isExchange ? `استبدال صنف في فاتورة #${parsedSaleId}` : `إرجاع صنف من فاتورة #${parsedSaleId}`,
      details: `${isExchange ? 'استبدال' : 'إرجاع'} صنف بكمية ${parsedQty} بقيمة استرداد ${refundAmount.toFixed(2)} ج.م - السبب: ${reason || 'غير محدد'}`,
      amount: refundAmount,
      shiftId: activeShift ? activeShift.id : null,
      userId: session.id,
      username: session.username,
      severity: 'warning',
    });
  } catch {
    // Ignore notification/audit failures during return processing
  }

  return { ...result, refundAmount };
}

function getRecentReturns() {
  requireAuth();
  return returnsRepo.getRecent(15);
}

module.exports = { findSale, processReturn, getRecentReturns };
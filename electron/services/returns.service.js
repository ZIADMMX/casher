const { db } = require('../database/db');
const returnsRepo = require('../repositories/returns.repository');
const salesRepo = require('../repositories/sales.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const NotificationsService = require('./notifications.service');
const { requireAuth, getCurrentSession } = require('./auth.service');

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

function processReturn({ saleId, variantId, quantity, reason, mode, exchangeVariantId }) {
  const session = getCurrentSession();
  if (!session) throw new Error('يجب تسجيل الدخول أولاً');

  const parsedSaleId = Number(saleId);
  const parsedVariantId = Number(variantId);
  const parsedQty = Number(quantity);

  if (!Number.isInteger(parsedQty) || parsedQty < 1) throw new Error('الكمية المرتجعة غير صحيحة');
  if (!parsedVariantId) throw new Error('لم يتم تحديد الصنف المراد إرجاعه');

  const sale = salesRepo.getById(parsedSaleId);
  if (!sale) throw new Error('الفاتورة غير موجودة');

  // نتأكد إن الصنف ده فعلاً جزء من الفاتورة دي
  const rawItem = db.prepare('SELECT * FROM sale_items WHERE sale_id = ? AND variant_id = ?').get(parsedSaleId, parsedVariantId);
  if (!rawItem) throw new Error('هذا الصنف غير موجود في الفاتورة المحددة');

  const alreadyReturned = returnsRepo.getReturnedQuantity(parsedSaleId, parsedVariantId);
  if (alreadyReturned + parsedQty > rawItem.quantity) {
    throw new Error(`لا يمكن إرجاع أكثر من الكمية المباعة (المتاح للإرجاع: ${rawItem.quantity - alreadyReturned})`);
  }

  const refundAmount = rawItem.unit_price * parsedQty;

  const runTransaction = db.transaction(() => {
    // 1. إرجاع الكمية للمخزون (الصنف المرتجع)
    db.prepare('UPDATE product_variants SET stock_quantity = stock_quantity + ? WHERE id = ?').run(parsedQty, parsedVariantId);

    let exchangeInfo = null;

    // 2. لو استبدال، نخصم من مخزون الصنف الجديد
    if (mode === 'exchange' && exchangeVariantId) {
      const parsedExchangeVariantId = Number(exchangeVariantId);
      const newVariant = variantsRepo.getById(parsedExchangeVariantId);
      if (!newVariant) throw new Error('الصنف البديل غير موجود');
      if (newVariant.stock_quantity < 1) throw new Error('الصنف البديل غير متوفر بالمخزون');

      variantsRepo.decreaseStock(parsedExchangeVariantId, 1);
      exchangeInfo = { variantId: parsedExchangeVariantId, priceDifference: newVariant.selling_price - rawItem.unit_price };
    }

    // 3. تسجيل عملية الإرجاع
    const returnId = returnsRepo.create({
      saleId: parsedSaleId,
      variantId: parsedVariantId,
      quantity: parsedQty,
      reason,
      refundAmount,
      exchangeVariantId: mode === 'exchange' && exchangeVariantId ? Number(exchangeVariantId) : null,
      userId: session.id,
    });

    return { returnId, exchangeInfo };
  });

  const result = runTransaction();

  try {
    const isExchange = mode === 'exchange' && exchangeVariantId;
    NotificationsService.notify({
      type: isExchange ? 'sale_exchange' : 'sale_return',
      title: isExchange ? '🔄 استبدال صنف في فاتورة' : '↩️ مرتجع فاتورة بيع',
      message: `قام ${session.username} بتسجيل ${isExchange ? 'استبدال' : 'استرجاع'} في الفاتورة #${parsedSaleId} بقيمة ${refundAmount.toFixed(2)} ج.م (السبب: ${reason || 'بدون سبب'})`,
      linkPage: 'returns',
    });
  } catch {}

  return { ...result, refundAmount };
}

function getRecentReturns() {
  requireAuth();
  return returnsRepo.getRecent(15);
}

module.exports = { findSale, processReturn, getRecentReturns };
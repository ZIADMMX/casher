// sales.service.js - Added centralized error logging and try/catch for critical operations
const { db } = require('../database/db');
const customersRepo = require('../repositories/customers.repository');
const salesRepo = require('../repositories/sales.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const tablesRepo = require('../repositories/tables.repository');
const productsCache = require('./products.cache');
const eventBus = require('./eventBus.service');
require('../listeners/sales.listener');
const { requireAuth, getCurrentSession, hasGrantedPermission } = require('./auth.service');
const { logError } = require('../services/logger.service');
const inventoryRepo = require('../repositories/inventory.repository');
const recipesRepo = require('../repositories/recipes.repository');
const SettingsRepository = require('../repositories/settings.repository');
const bundlePromotionsService = require('./bundlePromotions.service');
const loyaltyService = require('./loyalty.service');
const { resolveModifiers, cleanNote, getCatalog: getAddonCatalog } = require('./modifiers.service');
const enterpriseRepo = require('../repositories/enterprise.repository');
const { warrantyUntilFor } = require('./enterprise/workflows');

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
  tableTabId,
  tabItemIds,
  delivery,
  ticketId,
  workOrderId,
  loyaltyRedeemPoints,
}) {
  try {
    const session = getCurrentSession();
    if (!session) {
      throw new Error('يجب تسجيل الدخول أولاً');
    }
    let tableTab = null;
    if (tableTabId !== undefined && tableTabId !== null) {
      const tabId = Number(tableTabId);
      tableTab = Number.isSafeInteger(tabId) && tabId > 0 ? tablesRepo.getTab(tabId) : null;
      if (!tableTab || tableTab.status !== 'open') throw new Error('حساب الطاولة اتقفل بالفعل');
      // Bill what the kitchen received, not what the till sends: every unpaid
      // line, or the chosen ones when the check is split. Their unit_price
      // already includes the add-ons priced when the round was sent.
      let lines = tablesRepo.getTabItems(tableTab.id).filter((item) => item.paid_sale_id == null);
      if (tabItemIds != null) {
        if (!Array.isArray(tabItemIds) || tabItemIds.length === 0 || tabItemIds.length > 500) throw new Error('اختار الأصناف اللي هتتدفع');
        const chosen = new Set(tabItemIds.map(Number));
        lines = lines.filter((item) => chosen.has(item.id));
        if (lines.length !== chosen.size) throw new Error('بعض الأصناف المختارة اتدفعت بالفعل أو مش في الحساب ده');
      }
      if (lines.length === 0) throw new Error('مفيش أصناف فاضلة للدفع على الحساب ده');
      tableTab.payingItemIds = lines.map((item) => item.id);
      items = lines.map((item) => ({
        variantId: item.variant_id,
        quantity: item.quantity,
        unitPrice: item.unit_price,
        sentModifiers: item.modifiers,
        note: item.note,
      }));
      orderMode = 'dine_in';
    }
    // A work order is billed from the order itself: the till sends no items or prices.
    let workOrder = null;
    if (workOrderId !== undefined && workOrderId !== null) {
      const billing = require('./autoWorkshop.service').getBilling(workOrderId);
      workOrder = billing.order;
      items = billing.items;
      customerId = customerId || workOrder.customer_id;
    }
    if (!items || items.length === 0) {
      throw new Error('السلة فارغة');
    }
    if (orderMode != null && !['dine_in', 'takeaway', 'delivery'].includes(orderMode)) {
      throw new Error('طريقة استلام الطلب غير صالحة');
    }
    // A delivery order needs who and where; the kitchen ticket and receipt show them.
    let deliveryInfo = null;
    if (orderMode === 'delivery') {
      const text = (value, max) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
      deliveryInfo = { name: text(delivery?.name, 80), phone: text(delivery?.phone, 20), address: text(delivery?.address, 200) };
      if (!deliveryInfo.phone || !deliveryInfo.address) throw new Error('رقم الموبايل والعنوان مطلوبين لطلب التوصيل');
    }
    if (paymentMethod === 'credit') {
      if (!(customerName?.trim())) {
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
    const addonCatalog = items.some((item) => item.modifiers?.length) ? getAddonCatalog() : [];
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
        let unit = null;
        try {
          unit = require('../repositories/grocery.repository').getUnitById(item.unitId);
        } catch {}
        // A unit of another product would carry that product's (cheaper) price.
        if (unit && Number(unit.variant_id) !== Number(item.variantId)) {
          throw new Error('وحدة القياس لا تخص هذا الصنف');
        }
        if (unit) {
          effectiveUnitPrice = Number(unit.selling_price);
          stockDeductionFactor = Number(unit.conversion_factor) || 1;
        }
      } else if (tableTab || workOrder) {
        // A table check or a work order: the price was fixed by the server.
        effectiveUnitPrice = Number(item.unitPrice);
      } else if (item.scaleBarcode) {
        // A price-printed scale label: read the label again here instead of trusting the till.
        const scan = require('./grocery.service').resolveBarcode(String(item.scaleBarcode));
        if (!scan?.resolved || scan.type !== 'scale_item' || Number(scan.variantId) !== Number(item.variantId)) {
          throw new Error('باركود الميزان غير صالح أو لا يخص هذا الصنف');
        }
        effectiveUnitPrice = Number(scan.unitPrice);
      }
      // Any other unitPrice the till sends is ignored: the catalog price wins.

      let modifiers = tableTab ? item.sentModifiers || [] : [];
      if (!tableTab) {
        const resolved = resolveModifiers(item.modifiers, addonCatalog);
        modifiers = resolved.modifiers;
        effectiveUnitPrice = Math.round((Number(effectiveUnitPrice) + resolved.extra) * 100) / 100;
      }

      const baseQuantityDeduction = quantity * stockDeductionFactor;
      // What leaves the shelf: a recipe's ingredients, or the item itself (a service: nothing).
      const recipe = recipesRepo.getRecipe(Number(item.variantId));
      const stockLines = recipe.length
        ? recipe.map((ing) => ({
          variantId: ing.ingredient_variant_id,
          quantity: Math.round(baseQuantityDeduction * ing.quantity * 1000) / 1000,
          label: ing.product_name || ing.sku,
        }))
        : isService ? [] : [{ variantId: Number(item.variantId), quantity: baseQuantityDeduction, label: variant.sku }];
      for (const line of stockLines) {
        const requested = (requestedByVariant.get(line.variantId) || 0) + line.quantity;
        requestedByVariant.set(line.variantId, requested);
        const available = inventoryRepo.getStockQuantity(warehouseId, line.variantId);
        if (available < requested) {
          throw new Error(`الكمية المتاحة غير كافية للصنف (${line.label || 'الصنف'}). المطلوب: ${requested}، المتاح: ${available}`);
        }
      }

      verifiedItems.push({
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: effectiveUnitPrice,
        baseQuantityDeduction,
        isService,
        stockLines,
        // A recipe item costs what its ingredients cost at sale time.
        unitCost: recipe.length
          ? Math.round(recipe.reduce((sum, ing) => sum + (Number(ing.purchase_price) || 0) * ing.quantity, 0) * stockDeductionFactor * 10000) / 10000
          : undefined,
        modifiers,
        note: cleanNote(item.note),
        // Product and category commission rules match on these catalog values.
        productId: variant.product_id,
        categoryId: variant.category_id,
      });
    }

    // تذكرة ورشة بتتحصّل مع الفاتورة دي: لازم تكون موجودة ولسه ما اتحصّلتش.
    // الفحص هنا بيدّي رسالة مفهومة، والقيد الحقيقي على التحديث جوه المعاملة.
    let workshopTicket = null;
    if (ticketId !== undefined && ticketId !== null) {
      const id = Number(ticketId);
      workshopTicket = Number.isSafeInteger(id) && id > 0 ? enterpriseRepo.getTicketById(id) : null;
      if (!workshopTicket) throw new Error('تذكرة الصيانة غير موجودة');
      if (workshopTicket.sale_id) throw new Error(`تذكرة الصيانة اتحصّلت بالفعل في فاتورة #${workshopTicket.sale_id}`);
    }

    // Sent by the till: a negative or fractional count would add credits instead of using them.
    const credits = subscriptionId ? Number(creditsDeducted || 1) : 0;
    if (subscriptionId && (!Number.isSafeInteger(credits) || credits < 1)) {
      throw new Error('عدد الجلسات المخصومة من الباقة غير صالح');
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

    // A manual discount needs the discount right (branch manager by default; the owner
    // can grant it to cashiers from the Roles screen). Bundle offers below are computed
    // here on the server and need no right.
    if (normalizedDiscount > 0 && !hasGrantedPermission('pos.discount')) {
      // A member's own package discount is allowed, up to the rate the server looks up.
      let memberAllowance = 0;
      if (customerId) {
        try {
          const membership = require('../repositories/subscriptions.repository').getActiveSubscriptionByCustomer(customerId);
          const rate = Number(membership?.discount_percentage) || 0;
          if (rate > 0) memberAllowance = Math.round(subtotal * (rate / 100));
        } catch {
          memberAllowance = 0;
        }
      }
      if (normalizedDiscount > memberAllowance) {
        throw new Error('الخصم اليدوي يحتاج صلاحية الخصم. اطلب من المدير أو مدير الفرع');
      }
    }

    // قيود الخصم لغير المالك (30% كحد أقصى)
    if (session.role !== 'admin' && subtotal > 0 && normalizedDiscount > 0) {
      const discountPercentage = (normalizedDiscount / subtotal) * 100;
      if (discountPercentage > 30) {
        throw new Error('غير مصرح للكاشير بتطبيق خصم يتجاوز 30% من قيمة الفاتورة. يرجى مراجعة المدير');
      }
    }

    const appliedPromotion = bundlePromotionsService.getBestBundlePromotion(verifiedItems);
    const baseDiscount = Math.max(normalizedDiscount, appliedPromotion?.discount || 0);
    // Points the customer spends: worked out here from the server's own settings and balance, never from the till.
    const loyaltyRedeem = loyaltyService.planRedemption(customerId, loyaltyRedeemPoints, Math.max(subtotal - baseDiscount, 0));
    const effectiveDiscount = Math.round((baseDiscount + loyaltyRedeem.discount) * 100) / 100;
    const afterDiscount = Math.round(Math.max(subtotal - effectiveDiscount, 0) * 100) / 100;
    // Dine-in service (a % after discount) or a fixed delivery fee, from settings.
    // Same formula as the till (src/utils/cartTotals.js).
    const servicePercent = orderMode === 'dine_in'
      ? Math.min(Math.max(Number(SettingsRepository.get('service_charge_percent')) || 0, 0), 30) : 0;
    const fixedCharge = orderMode === 'delivery' ? Math.max(Number(SettingsRepository.get('delivery_fee')) || 0, 0) : 0;
    const serviceCharge = afterDiscount > 0
      ? Math.round((afterDiscount * servicePercent / 100 + fixedCharge) * 100) / 100 : 0;
    const totalAmount = Math.round((afterDiscount + serviceCharge) * 100) / 100;

    let loyaltyResult = null;
    const runTransaction = db.transaction(() => {
      // A new credit customer is saved together with the sale, or not at all.
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

      const saleId = salesRepo.createSale({
        shiftId: activeShift ? activeShift.id : null,
        customerId: resolvedCustomerId,
        customerName: paymentMethod === 'credit' ? customerName.trim() : deliveryInfo?.name || null,
        customerPhone: paymentMethod === 'credit' ? (customerPhone || deliveryInfo?.phone || null) : deliveryInfo?.phone || null,
        userId: session.id,
        totalAmount,
        discount: effectiveDiscount,
        paymentMethod,
        orderMode,
        kitchenStatus: tableTab ? 'served' : orderMode ? 'new' : null,
        dueDate: paymentMethod === 'credit' ? dueDate : null,
        branchId,
        warehouseId,
        serviceCharge,
        deliveryAddress: deliveryInfo?.address,
      });

      loyaltyResult = loyaltyService.recordSale({
        customerId: resolvedCustomerId, saleId, redeemPoints: loyaltyRedeem.points, earnBase: afterDiscount, paymentMethod,
      });

      for (const item of verifiedItems) {
        salesRepo.createSaleItem(saleId, item);
        for (const line of item.stockLines) {
          inventoryRepo.applyStockChange({
            warehouseId,
            variantId: line.variantId,
            delta: -line.quantity,
            movementType: 'sale',
            referenceType: 'sale',
            referenceId: saleId,
            userId: session.id,
          });
          // خصم رصيد التشغيلات وتواريخ الصلاحية آلياً وفقاً لسياسة FIFO
          try {
            const groceryRepo = require('../repositories/grocery.repository');
            groceryRepo.deductFifoBatchQuantity(line.variantId, line.quantity);
          } catch {
            // تجاهل آمن في حالة عدم وجود تشغيلات لهذا الصنف
          }
        }
      }

      if (tableTab) {
        if (tablesRepo.markItemsPaid(tableTab.id, tableTab.payingItemIds, saleId) !== tableTab.payingItemIds.length) {
          throw new Error('بعض الأصناف اتدفعت من جهاز تاني');
        }
        // The last part paid closes the check.
        if (tablesRepo.countUnpaidItems(tableTab.id) === 0 && !tablesRepo.closeTab(tableTab.id, 'paid', saleId).changes) {
          throw new Error('حساب الطاولة اتقفل بالفعل');
        }
      }

      // جوه المعاملة: لو التذكرة اتحصّلت من جهاز تاني في نفس اللحظة، الفاتورة
      // نفسها ما تتحفظش — أحسن من تحصيل مرتين.
      if (workshopTicket) {
        if (enterpriseRepo.markTicketBilled(workshopTicket.id, saleId, warrantyUntilFor(workshopTicket)) !== 1) {
          throw new Error('تذكرة الصيانة اتحصّلت بالفعل من جهاز تاني');
        }
      }

      if (workOrder) require('./autoWorkshop.service').settleOrder(workOrder.id, saleId);

      // Inside the transaction: if the package cannot pay, the sale is not saved either.
      if (subscriptionId) {
        require('./subscriptions.service').consumeCredit(
          subscriptionId,
          credits,
          session,
          saleId,
          `خصم رصيد باقة مع فاتورة #${saleId}`
        );
      }

      return saleId;
    });

    const saleId = runTransaction();
    productsCache.refreshStockFromDatabase();

    // إطلاق حدث إتمام البيع عبر ناقل الأحداث لتشغيل الخدمات التابعة
    // (الفاتورة الإلكترونية، سجل التدقيق، العمولات، تنبيهات المخزون والآجل)
    // بشكل منفصل وآمن دون مقاطعة أو إبطاء عملية البيع للكاشير.
    eventBus.emit('sale:created', {
      saleId,
      totalAmount,
      subtotal,
      effectiveDiscount,
      normalizedDiscount,
      afterDiscount,
      paymentMethod,
      customerName,
      dueDate,
      verifiedItems,
      appliedPromotion,
      activeShift,
      session,
      requestedVariantIds: Array.from(requestedByVariant.keys()),
    });

    return {
      saleId, totalAmount, tabClosed: tableTab ? tablesRepo.countUnpaidItems(tableTab.id) === 0 : undefined,
      loyalty: loyaltyResult && (loyaltyResult.earned || loyaltyResult.redeemed) ? { ...loyaltyResult, discount: loyaltyRedeem.discount } : undefined,
    };
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
// sales.service.js - Added centralized error logging and try/catch for critical operations
const { db } = require('../database/db');
const customersRepo = require('../repositories/customers.repository');
const salesRepo = require('../repositories/sales.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const tablesRepo = require('../repositories/tables.repository');
const productsCache = require('./products.cache');
const NotificationsService = require('./notifications.service');
const { requireAuth, getCurrentSession, hasGrantedPermission } = require('./auth.service');
const { logError } = require('../services/logger.service');
const inventoryRepo = require('../repositories/inventory.repository');
const recipesRepo = require('../repositories/recipes.repository');
const SettingsRepository = require('../repositories/settings.repository');
const bundlePromotionsService = require('./bundlePromotions.service');
const { resolveModifiers, cleanNote, getCatalog: getAddonCatalog } = require('./modifiers.service');

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
        try {
          const unit = require('../repositories/grocery.repository').getUnitById(item.unitId);
          if (unit) {
            effectiveUnitPrice = Number(unit.selling_price);
            stockDeductionFactor = Number(unit.conversion_factor) || 1;
          }
        } catch {}
      } else if (tableTab) {
        // A table check: the price was fixed by the server when the round was sent.
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
    const effectiveDiscount = Math.max(normalizedDiscount, appliedPromotion?.discount || 0);
    const afterDiscount = Math.round(Math.max(subtotal - effectiveDiscount, 0) * 100) / 100;
    // Dine-in service (a % after discount) or a fixed delivery fee, from settings.
    // Same formula as the till (src/utils/cartTotals.js).
    const servicePercent = orderMode === 'dine_in'
      ? Math.min(Math.max(Number(SettingsRepository.get('service_charge_percent')) || 0, 0), 30) : 0;
    const fixedCharge = orderMode === 'delivery' ? Math.max(Number(SettingsRepository.get('delivery_fee')) || 0, 0) : 0;
    const serviceCharge = afterDiscount > 0
      ? Math.round((afterDiscount * servicePercent / 100 + fixedCharge) * 100) / 100 : 0;
    const totalAmount = Math.round((afterDiscount + serviceCharge) * 100) / 100;

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

      return saleId;
    });

    const saleId = runTransaction();
    productsCache.refreshStockFromDatabase();

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
      for (const variantId of requestedByVariant.keys()) {
        const updated = variantsRepo.getById(variantId);
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

    return { saleId, totalAmount, tabClosed: tableTab ? tablesRepo.countUnpaidItems(tableTab.id) === 0 : undefined };
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
// Stockout forecasts, reorder quantities, pricing suggestions and dead-stock analysis.
const aiRepo = require('../../repositories/ai.repository');

// -------------------------------------------------------------
// 1. توقع الأصناف التي ستنفد (Stockout Forecasting & Depletion)
// -------------------------------------------------------------
function predictStockouts(options = {}) {
  const daysWindow = Number(options.daysWindow) || 30;
  const warehouseId = options.warehouseId || null;
  const dateModifier = `-${daysWindow} days`;

  // استعلام يجمع المبيعات في آخر N يوم مع رصيد المخزون الحالي
  const rows = aiRepo.getVariantSalesVelocity(warehouseId, dateModifier);
  const predictions = [];

  for (const item of rows) {
    const currentStock = Math.max(0, item.current_stock);
    const totalSold = Math.max(0, item.total_sold_in_window);
    const avgDailySales = totalSold > 0 ? (totalSold / daysWindow) : 0;

    let daysRemaining = null;
    let depletionDate = null;
    let riskLevel = 'safe'; // 'critical', 'warning', 'moderate', 'safe'

    if (currentStock === 0) {
      daysRemaining = 0;
      riskLevel = 'critical';
      depletionDate = new Date().toISOString().split('T')[0];
    } else if (avgDailySales > 0) {
      daysRemaining = Math.round((currentStock / avgDailySales) * 10) / 10;
      const d = new Date();
      d.setDate(d.getDate() + Math.ceil(daysRemaining));
      depletionDate = d.toISOString().split('T')[0];

      if (daysRemaining <= 3) {
        riskLevel = 'critical';
      } else if (daysRemaining <= 7) {
        riskLevel = 'warning';
      } else if (daysRemaining <= 15) {
        riskLevel = 'moderate';
      } else {
        riskLevel = 'safe';
      }
    } else if (currentStock <= (item.low_stock_threshold || 5)) {
      riskLevel = 'warning';
      daysRemaining = 999;
    }

    if (riskLevel !== 'safe' || options.includeAll) {
      predictions.push({
        variantId: item.variant_id,
        productId: item.product_id,
        productName: item.product_name,
        categoryName: item.category_name || 'عام',
        size: item.size,
        color: item.color,
        sku: item.sku,
        barcode: item.barcode,
        purchasePrice: item.purchase_price,
        sellingPrice: item.selling_price,
        currentStock,
        totalSoldInWindow: totalSold,
        avgDailySales: Math.round(avgDailySales * 100) / 100,
        daysRemaining: daysRemaining === 999 ? 'غير محدد (مبيعات منعدمة)' : daysRemaining,
        depletionDate,
        riskLevel,
        lowStockThreshold: item.low_stock_threshold || 5,
      });
    }
  }

  // ترتيب حسب درجة الخطورة: critical أولاً ثم warning
  const riskWeight = { critical: 1, warning: 2, moderate: 3, safe: 4 };
  predictions.sort((a, b) => {
    const diff = riskWeight[a.riskLevel] - riskWeight[b.riskLevel];
    if (diff !== 0) return diff;
    const daysA = typeof a.daysRemaining === 'number' ? a.daysRemaining : 9999;
    const daysB = typeof b.daysRemaining === 'number' ? b.daysRemaining : 9999;
    return daysA - daysB;
  });

  return {
    windowDays: daysWindow,
    totalAssessed: rows.length,
    criticalCount: predictions.filter((p) => p.riskLevel === 'critical').length,
    warningCount: predictions.filter((p) => p.riskLevel === 'warning').length,
    moderateCount: predictions.filter((p) => p.riskLevel === 'moderate').length,
    items: predictions,
  };
}

// -------------------------------------------------------------
// 2. اقتراح كمية الشراء الذكية (Reorder Quantity Suggestions)
// -------------------------------------------------------------
function suggestPurchaseQuantities(options = {}) {
  const stockoutData = predictStockouts({ daysWindow: 30, includeAll: true });
  const leadTimeDays = Number(options.leadTimeDays) || 7; // وقت وصول الشحنة من المورد
  const safetyBufferDays = Number(options.safetyBufferDays) || 5; // هامش أمان إضافي
  const replenishmentCycleDays = Number(options.replenishmentCycleDays) || 14; // مدة التغطية المطلوبة

  const suggestions = [];

  for (const item of stockoutData.items) {
    const ads = item.avgDailySales || 0;
    if (ads <= 0 && item.currentStock > item.lowStockThreshold) continue;

    // معادلة نقطة إعادة الطلب والكمية المقترحة:
    // Reorder Point = (ADS * LeadTime) + (ADS * SafetyBuffer)
    const effectiveAds = ads > 0 ? ads : 0.2; // حد أدنى افتراضي للصنف النشط
    const safetyStock = Math.ceil(effectiveAds * safetyBufferDays);
    const reorderPoint = Math.ceil((effectiveAds * leadTimeDays) + safetyStock);
    
    // إذا كان المخزون الحالي أقل من أو يساوي نقطة إعادة الطلب
    if (item.currentStock <= reorderPoint || item.riskLevel === 'critical' || item.riskLevel === 'warning') {
      const targetStock = Math.ceil(effectiveAds * (leadTimeDays + safetyBufferDays + replenishmentCycleDays));
      const suggestedQty = Math.max(1, targetStock - item.currentStock);
      const estimatedCost = Math.round(suggestedQty * item.purchasePrice * 100) / 100;

      // العثور على آخر مورد تم الشراء منه لهذا الصنف
      const lastSupplier = aiRepo.getLastSupplierForVariant(item.variantId);

      suggestions.push({
        variantId: item.variantId,
        productId: item.productId,
        productName: item.productName,
        categoryName: item.categoryName,
        size: item.size,
        color: item.color,
        sku: item.sku,
        barcode: item.barcode,
        currentStock: item.currentStock,
        avgDailySales: item.avgDailySales,
        reorderPoint,
        suggestedQuantity: suggestedQty,
        unitPurchasePrice: item.purchasePrice,
        estimatedCost,
        urgency: item.riskLevel,
        daysRemaining: item.daysRemaining,
        supplierId: lastSupplier?.supplier_id || null,
        supplierName: lastSupplier?.supplier_name || 'غير محدد (مورد عام)',
        supplierPhone: lastSupplier?.supplier_phone || '',
      });
    }
  }

  suggestions.sort((a, b) => {
    const uWeight = { critical: 1, warning: 2, moderate: 3, safe: 4 };
    return (uWeight[a.urgency] || 9) - (uWeight[b.urgency] || 9);
  });

  const totalEstimatedBudget = suggestions.reduce((sum, s) => sum + s.estimatedCost, 0);

  return {
    parameters: { leadTimeDays, safetyBufferDays, replenishmentCycleDays },
    totalItemsToReorder: suggestions.length,
    totalEstimatedBudget: Math.round(totalEstimatedBudget * 100) / 100,
    suggestions,
  };
}

// -------------------------------------------------------------
// 4. اقتراح السعر والخصم الأمثل (Pricing & Discount Suggestions)
// -------------------------------------------------------------
function suggestPricingAndDiscounts(options = {}) {
  const daysThreshold = Number(options.daysThreshold) || 45;

  // أصناف راكدة تحتاج تخفيضاً لتصفية رأس المال
  const deadStockItems = aiRepo.getClearanceCandidates(daysThreshold);

  const discountSuggestions = [];

  for (const item of deadStockItems) {
    const currentPrice = item.selling_price;
    const costPrice = item.purchase_price;

    let suggestedDiscountPct = 15;
    if (item.days_since_last_sale > 90) suggestedDiscountPct = 30;
    else if (item.days_since_last_sale > 60) suggestedDiscountPct = 20;

    // التأكد من أن سعر الخصم يغطي سعر الشراء بهامش ربح طفيف
    let discountedPrice = Math.round(currentPrice * (1 - suggestedDiscountPct / 100) * 100) / 100;
    if (discountedPrice < costPrice) {
      discountedPrice = Math.round(costPrice * 1.05 * 100) / 100; // سعر التكلفة + 5%
      suggestedDiscountPct = Math.round(((currentPrice - discountedPrice) / currentPrice) * 100);
    }

    const potentialLiquidationValue = Math.round(item.stock_quantity * discountedPrice * 100) / 100;
    const tiedCapital = Math.round(item.stock_quantity * costPrice * 100) / 100;

    discountSuggestions.push({
      variantId: item.variant_id,
      productName: item.product_name,
      categoryName: item.category_name || 'عام',
      size: item.size,
      color: item.color,
      stockQuantity: item.stock_quantity,
      costPrice,
      currentPrice,
      suggestedDiscountPct,
      suggestedDiscountedPrice: discountedPrice,
      daysDormant: item.days_since_last_sale || 90,
      tiedCapital,
      potentialLiquidationValue,
      strategy: suggestedDiscountPct >= 25 ? 'تصفية سريعة لتحرير السيولة' : 'عرض ترويجي لتنشيط المبيعات',
    });
  }

  // أصناف عالية الطلب يمكن تحسين هامش ربحها (Margin Expansion)
  const highDemandItems = aiRepo.getHighDemandVariantsLast30Days();

  const marginOptimizationSuggestions = [];
  for (const item of highDemandItems) {
    const suggestedPrice = Math.round(item.selling_price * 1.05 * 100) / 100; // زيادة 5%
    const projectedExtraProfitPer30Days = Math.round((suggestedPrice - item.selling_price) * item.sold_last_30_days * 100) / 100;

    marginOptimizationSuggestions.push({
      variantId: item.variant_id,
      productName: item.product_name,
      size: item.size,
      color: item.color,
      currentPrice: item.selling_price,
      suggestedPrice,
      soldCount: item.sold_last_30_days,
      projectedExtraMonthlyProfit: projectedExtraProfitPer30Days,
      rationale: 'إقبال ممتاز ومرونة طلب منخفضة تسمح بزيادة هامش الربح',
    });
  }

  return {
    clearanceDiscounts: discountSuggestions,
    marginOptimizations: marginOptimizationSuggestions,
  };
}

// -------------------------------------------------------------
// 5. تحليل الأصناف الراكدة ورأس المال المجمد (Dead Stock Analysis)
// -------------------------------------------------------------
function analyzeDeadStock(options = {}) {
  const daysThreshold = Number(options.daysThreshold) || 30;
  const rows = aiRepo.getDeadStockVariants(daysThreshold);

  let totalTiedCapital = 0;
  let stagnantCount = 0; // 30-60 days
  let deadCount = 0; // 60-90 days
  let frozenCount = 0; // > 90 days

  const items = rows.map((r) => {
    const days = r.days_since_last_sale || 90;
    const tiedCapital = Math.round(r.stock_quantity * r.purchase_price * 100) / 100;
    totalTiedCapital += tiedCapital;

    let tier = 'stagnant_30';
    let tierLabel = 'شبه راكد (30-60 يوم)';
    if (days >= 90) {
      tier = 'frozen_90';
      tierLabel = 'راكد مجمد (> 90 يوم)';
      frozenCount++;
    } else if (days >= 60) {
      tier = 'dead_60';
      tierLabel = 'راكد (60-90 يوم)';
      deadCount++;
    } else {
      stagnantCount++;
    }

    return {
      variantId: r.variant_id,
      productId: r.product_id,
      productName: r.product_name,
      categoryName: r.category_name || 'عام',
      size: r.size,
      color: r.color,
      sku: r.sku,
      barcode: r.barcode,
      purchasePrice: r.purchase_price,
      sellingPrice: r.selling_price,
      stockQuantity: r.stock_quantity,
      tiedCapital,
      daysSinceLastSale: days,
      tier,
      tierLabel,
      lastSaleAt: r.last_sale_at || 'لم يتم تسجيل أي مبيعات',
    };
  });

  const estimatedHoldingCostPerYear = Math.round(totalTiedCapital * 0.18 * 100) / 100; // تكلفة تخزين تقديرية 18% سنوياً

  return {
    totalDeadVariants: items.length,
    totalTiedCapital: Math.round(totalTiedCapital * 100) / 100,
    estimatedHoldingCostPerYear,
    stagnantCount,
    deadCount,
    frozenCount,
    items,
  };
}

module.exports = {
  predictStockouts,
  suggestPurchaseQuantities,
  suggestPricingAndDiscounts,
  analyzeDeadStock,
};

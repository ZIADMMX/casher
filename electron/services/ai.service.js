const https = require('node:https');
const http = require('node:http');
const { URL } = require('node:url');
const { db } = require('../database/db');
const SettingsRepository = require('../repositories/settings.repository');
const { logError } = require('./logger.service');

const DEFAULT_API_KEY = '';
const DEFAULT_API_URL = '';
const DEFAULT_MODEL = 'gpt-4o-mini';

function getAISettings() {
  const apiKey = SettingsRepository.get('codecraft_api_key') || DEFAULT_API_KEY;
  const apiUrl = SettingsRepository.get('codecraft_api_url') || DEFAULT_API_URL;
  const model = SettingsRepository.get('ai_model') || DEFAULT_MODEL;
  const isEnabled = SettingsRepository.get('ai_enabled') !== '0';

  return {
    apiKey,
    apiUrl,
    model,
    isEnabled,
    maskedKey: apiKey ? `${apiKey.substring(0, 10)}...${apiKey.slice(-4)}` : '',
  };
}

function saveAISettings(settingsData) {
  if (settingsData.apiKey !== undefined) SettingsRepository.set('codecraft_api_key', settingsData.apiKey);
  if (settingsData.apiUrl !== undefined) SettingsRepository.set('codecraft_api_url', settingsData.apiUrl);
  if (settingsData.model !== undefined) SettingsRepository.set('ai_model', settingsData.model);
  if (settingsData.isEnabled !== undefined) SettingsRepository.set('ai_enabled', settingsData.isEnabled ? '1' : '0');

  return getAISettings();
}

async function askClaude(prompt, context = {}) {
  const config = getAISettings();
  if (!config.apiKey || !config.apiUrl) {
    throw new Error('لم يتم ضبط مفتاح API أو رابط الخدمة للذكاء الاصطناعي');
  }

  const systemMessage = {
    role: 'system',
    content: `أنت المستشار الذكي لتحليلات الأعمال وإدارة المخزون والمبيعات في نظام (Kashiear / Fox POS & Enterprise Engine).
إجاباتك دقيقة، احترافية، ومباشرة وباللغة العربية الفصحى. تستخدم التنسيق الجميل (Markdown) والجداول والقوائم النقطية عند الحاجة.
السياق والبيانات الحية المتاحة من قاعدة البيانات:
${JSON.stringify(context, null, 2)}`,
  };

  const userMessage = { role: 'user', content: prompt };

  const bodyData = JSON.stringify({
    model: config.model,
    messages: [systemMessage, userMessage],
    temperature: 0.7,
    max_tokens: 1500,
  });

  const parsedUrl = new URL(config.apiUrl);
  const isHttps = parsedUrl.protocol === 'https:';
  const transport = isHttps ? https : http;

  const options = {
    hostname: parsedUrl.hostname,
    port: parsedUrl.port || (isHttps ? 443 : 80),
    path: parsedUrl.pathname + parsedUrl.search,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Length': Buffer.byteLength(bodyData),
    },
  };

  return new Promise((resolve, reject) => {
    const req = transport.request(options, (res) => {
      let responseBody = '';
      res.on('data', (chunk) => {
        responseBody += chunk;
      });

      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const data = JSON.parse(responseBody);
            const content = data.choices?.[0]?.message?.content || data.content || responseBody;
            resolve({ success: true, response: content, usage: data.usage || null });
          } else {
            let errJson;
            try {
              errJson = JSON.parse(responseBody);
            } catch {}
            const errorMsg = errJson?.error?.message || errJson?.message || `HTTP ${res.statusCode}: ${res.statusMessage}`;
            reject(new Error(`AI API Error: ${errorMsg}`));
          }
        } catch (e) {
          reject(new Error(`فشل تحليل استجابة الذكاء الاصطناعي: ${e.message}`));
        }
      });
    });

    req.on('error', (err) => {
      logError('AIService', err);
      reject(new Error(`اتصال شبكي غير متاح بالخدمة: ${err.message}`));
    });

    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('انتهت المهلة المحددة للاتصال بمحرك الذكاء الاصطناعي (Timeout)'));
    });

    req.write(bodyData);
    req.end();
  });
}

// -------------------------------------------------------------
// 1. توقع الأصناف التي ستنفد (Stockout Forecasting & Depletion)
// -------------------------------------------------------------
function predictStockouts(options = {}) {
  const daysWindow = Number(options.daysWindow) || 30;
  const warehouseId = options.warehouseId || null;
  const dateModifier = `-${daysWindow} days`;

  // استعلام يجمع المبيعات في آخر N يوم مع رصيد المخزون الحالي
  const query = `
    SELECT 
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.sku,
      pv.barcode,
      pv.purchase_price,
      pv.selling_price,
      pv.low_stock_threshold,
      COALESCE(SUM(si.quantity), 0) as total_sold_in_window,
      COALESCE(
        (SELECT SUM(quantity) FROM warehouse_stock ws
         WHERE ws.variant_id = pv.id AND (? IS NULL OR ws.warehouse_id = ?)),
        pv.stock_quantity,
        0
      ) as current_stock
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_items si ON si.variant_id = pv.id
    LEFT JOIN sales s ON s.id = si.sale_id AND date(s.created_at, 'localtime') >= date('now', ?)
    GROUP BY pv.id
    ORDER BY total_sold_in_window DESC
  `;

  const rows = db.prepare(query).all(warehouseId, warehouseId, dateModifier);
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
      const lastSupplier = db.prepare(`
        SELECT s.id as supplier_id, s.name as supplier_name, s.phone as supplier_phone, pi.purchase_price as last_purchase_price
        FROM purchase_items pi
        JOIN purchases p ON p.id = pi.purchase_id
        JOIN suppliers s ON s.id = p.supplier_id
        WHERE pi.variant_id = ?
        ORDER BY p.created_at DESC
        LIMIT 1
      `).get(item.variantId);

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
// 3. اكتشاف المبيعات غير الطبيعية والأنشطة المشبوهة (Anomaly Detection)
// -------------------------------------------------------------
function detectSalesAnomalies(options = {}) {
  const days = Number(options.days) || 30;
  const dateModifier = `-${days} days`;
  const anomalies = [];

  // 1. حساب المتوسط والانحراف المعياري لقيم الفواتير
  const stats = db.prepare(`
    SELECT 
      AVG(total_amount) as avg_amount,
      COUNT(*) as count
    FROM sales
    WHERE date(created_at, 'localtime') >= date('now', ?)
  `).get(dateModifier);

  const avgAmount = stats?.avg_amount || 0;
  const invoiceCount = stats?.count || 0;

  if (invoiceCount >= 5) {
    // حساب التباين
    const varianceRow = db.prepare(`
      SELECT AVG((total_amount - ?) * (total_amount - ?)) as variance
      FROM sales
      WHERE date(created_at, 'localtime') >= date('now', ?)
    `).get(avgAmount, avgAmount, dateModifier);

    const stdDev = Math.sqrt(varianceRow?.variance || 0);
    const spikeThreshold = avgAmount + (2.2 * stdDev);

    // فواتير ذات قيم غير طبيعية (Spike Amount)
    const spikeInvoices = db.prepare(`
      SELECT s.*, u.username, u.full_name as cashier_name, b.name as branch_name
      FROM sales s
      LEFT JOIN users u ON u.id = s.user_id
      LEFT JOIN branches b ON b.id = s.branch_id
      WHERE date(s.created_at, 'localtime') >= date('now', ?)
        AND s.total_amount > ?
      ORDER BY s.total_amount DESC
      LIMIT 10
    `).all(dateModifier, spikeThreshold);

    for (const inv of spikeInvoices) {
      anomalies.push({
        type: 'amount_spike',
        severity: inv.total_amount > (avgAmount + 3.5 * stdDev) ? 'danger' : 'warning',
        title: `قيمة فاتورة غير معتادة (${inv.total_amount.toFixed(2)} ر.س)`,
        description: `الفاتورة رقم #${inv.id} تتجاوز متوسط الفواتير (${avgAmount.toFixed(2)} ر.س) بأكثر من انحرافين معياريين.`,
        invoiceId: inv.id,
        amount: inv.total_amount,
        cashier: inv.cashier_name || inv.username || 'كاشير',
        branch: inv.branch_name || 'الفرع الرئيسي',
        createdAt: inv.created_at,
      });
    }
  }

  // 2. اكتشاف الخصومات المرتفعة جداً (> 25% أو خصومات ضخمة)
  const highDiscountInvoices = db.prepare(`
    SELECT s.*, u.username, u.full_name as cashier_name, b.name as branch_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN branches b ON b.id = s.branch_id
    WHERE date(s.created_at, 'localtime') >= date('now', ?)
      AND s.discount > 0
      AND (s.discount / (s.total_amount + s.discount)) >= 0.25
    ORDER BY s.discount DESC
    LIMIT 15
  `).all(dateModifier);

  for (const inv of highDiscountInvoices) {
    const originalTotal = inv.total_amount + inv.discount;
    const discountPct = Math.round((inv.discount / originalTotal) * 100);
    anomalies.push({
      type: 'high_discount',
      severity: discountPct >= 40 ? 'danger' : 'warning',
      title: `نسبة خصم استثنائية (${discountPct}%)`,
      description: `تم تطبيق خصم بقيمة ${inv.discount.toFixed(2)} ر.س على فاتورة إجماليها ${originalTotal.toFixed(2)} ر.س بواسطة ${inv.cashier_name || inv.username}.`,
      invoiceId: inv.id,
      discount: inv.discount,
      discountPercent: discountPct,
      cashier: inv.cashier_name || inv.username || 'كاشير',
      branch: inv.branch_name || 'الفرع الرئيسي',
      createdAt: inv.created_at,
    });
  }

  // 3. كثرة عمليات المرتجعات غير الطبيعية لكاشير أو لصنف معين
  const returnsByCashier = db.prepare(`
    SELECT r.user_id, u.username, u.full_name as cashier_name, COUNT(*) as return_count, SUM(r.refund_amount) as total_refunded
    FROM returns r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE date(r.created_at, 'localtime') >= date('now', ?)
    GROUP BY r.user_id
    HAVING return_count >= 5
    ORDER BY return_count DESC
    LIMIT 5
  `).all(dateModifier);

  for (const ret of returnsByCashier) {
    anomalies.push({
      type: 'high_return_frequency',
      severity: ret.return_count >= 10 ? 'danger' : 'info',
      title: `تكرار مرتجعات مرتفع (${ret.return_count} عمليات إرجاع)`,
      description: `قام الموظف ${ret.cashier_name || ret.username} بتنفيذ ${ret.return_count} عملية إرجاع بإجمالي مسترد ${Number(ret.total_refunded || 0).toFixed(2)} ر.س.`,
      cashier: ret.cashier_name || ret.username,
      totalRefunded: ret.total_refunded,
      returnCount: ret.return_count,
    });
  }

  // 4. مبيعات في أوقات متأخرة أو غير معتادة (مثلاً بين 2:00 صباحاً و 6:00 صباحاً)
  const offHourSales = db.prepare(`
    SELECT s.*, u.username, u.full_name as cashier_name, strftime('%H:%M', s.created_at, 'localtime') as sale_time
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE date(s.created_at, 'localtime') >= date('now', ?)
      AND CAST(strftime('%H', s.created_at, 'localtime') AS INTEGER) BETWEEN 2 AND 5
    ORDER BY s.created_at DESC
    LIMIT 10
  `).all(dateModifier);

  for (const sale of offHourSales) {
    anomalies.push({
      type: 'off_hours_sale',
      severity: 'warning',
      title: `عملية بيع في وقت متأخر (${sale.sale_time})`,
      description: `تم تسجيل فاتورة #${sale.id} بقيمة ${sale.total_amount.toFixed(2)} ر.س في وقت غير معتاد (${sale.sale_time}).`,
      invoiceId: sale.id,
      amount: sale.total_amount,
      cashier: sale.cashier_name || sale.username,
      createdAt: sale.created_at,
    });
  }

  return {
    evaluatedDays: days,
    anomaliesCount: anomalies.length,
    criticalCount: anomalies.filter((a) => a.severity === 'danger').length,
    warningCount: anomalies.filter((a) => a.severity === 'warning').length,
    anomalies,
  };
}

// -------------------------------------------------------------
// 4. اقتراح السعر والخصم الأمثل (Pricing & Discount Suggestions)
// -------------------------------------------------------------
function suggestPricingAndDiscounts(options = {}) {
  const daysThreshold = Number(options.daysThreshold) || 45;

  // أصناف راكدة تحتاج تخفيضاً لتصفية رأس المال
  const deadStockItems = db.prepare(`
    SELECT 
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.purchase_price,
      pv.selling_price,
      pv.stock_quantity,
      MAX(s.created_at) as last_sale_date,
      ROUND(JULIANDAY('now') - JULIANDAY(COALESCE(MAX(s.created_at), pv.created_at))) as days_since_last_sale
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_items si ON si.variant_id = pv.id
    LEFT JOIN sales s ON s.id = si.sale_id
    WHERE pv.stock_quantity > 0
    GROUP BY pv.id
    HAVING days_since_last_sale >= ? OR last_sale_date IS NULL
    ORDER BY (pv.stock_quantity * pv.purchase_price) DESC
    LIMIT 25
  `).all(daysThreshold);

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
  const highDemandItems = db.prepare(`
    SELECT 
      pv.id as variant_id,
      p.name as product_name,
      pv.size,
      pv.color,
      pv.purchase_price,
      pv.selling_price,
      pv.stock_quantity,
      SUM(si.quantity) as sold_last_30_days
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN sale_items si ON si.variant_id = pv.id
    JOIN sales s ON s.id = si.sale_id AND date(s.created_at, 'localtime') >= date('now', '-30 days')
    GROUP BY pv.id
    HAVING sold_last_30_days >= 15
    ORDER BY sold_last_30_days DESC
    LIMIT 10
  `).all();

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
  const query = `
    SELECT 
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.sku,
      pv.barcode,
      pv.purchase_price,
      pv.selling_price,
      pv.stock_quantity,
      MAX(s.created_at) as last_sale_at,
      ROUND(JULIANDAY('now') - JULIANDAY(COALESCE(MAX(s.created_at), pv.created_at))) as days_since_last_sale
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_items si ON si.variant_id = pv.id
    LEFT JOIN sales s ON s.id = si.sale_id
    WHERE pv.stock_quantity > 0
    GROUP BY pv.id
    HAVING days_since_last_sale >= ? OR last_sale_at IS NULL
    ORDER BY (pv.stock_quantity * pv.purchase_price) DESC
  `;

  const rows = db.prepare(query).all(daysThreshold);

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

// -------------------------------------------------------------
// 6. المساعد الذكي للأعمال (Smart Business Copilot / Query Assistant)
// -------------------------------------------------------------
async function askCopilot(prompt, additionalContext = {}) {
  const cleanPrompt = (prompt || '').trim();
  if (!cleanPrompt) throw new Error('يرجى كتابة سؤال أو استفسار');

  // استخراج الإحصائيات الحية من قاعدة البيانات للإجابة الذاتية والسريعة
  const today = new Date().toISOString().split('T')[0];
  const startOfMonth = `${today.slice(0, 7)}-01`;

  // 1. فرع هذا الشهر
  const branchSalesThisMonth = db.prepare(`
    SELECT b.id, b.name as branch_name, COALESCE(SUM(s.total_amount), 0) as total_sales, COUNT(s.id) as invoice_count
    FROM branches b
    LEFT JOIN sales s ON s.branch_id = b.id AND date(s.created_at, 'localtime') >= date(?)
    WHERE b.is_active = 1
    GROUP BY b.id
    ORDER BY total_sales DESC
  `).all(startOfMonth);

  // 2. مبيعات اليوم والأمس
  const todayStats = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as sales
    FROM sales
    WHERE date(created_at, 'localtime') = date(?)
  `).get(today);

  const yesterdayStats = db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as sales
    FROM sales
    WHERE date(created_at, 'localtime') = date('now', '-1 day')
  `).get();

  // 3. أعلى الأصناف مبيعاً
  const topProducts = db.prepare(`
    SELECT p.name as product_name, SUM(si.quantity) as qty_sold, SUM(si.quantity * si.unit_price) as revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id AND date(s.created_at, 'localtime') >= date(?)
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN products p ON p.id = pv.product_id
    GROUP BY p.id
    ORDER BY qty_sold DESC
    LIMIT 5
  `).all(startOfMonth);

  // 4. ملخص المخزون الراكد والنفاد
  const stockoutSummary = predictStockouts({ daysWindow: 30 });
  const deadStockSummary = analyzeDeadStock();

  const businessContext = {
    currentDate: today,
    monthPeriod: `${startOfMonth} إلى ${today}`,
    branchSalesThisMonth,
    todaySales: todayStats?.sales || 0,
    todayInvoices: todayStats?.count || 0,
    yesterdaySales: yesterdayStats?.sales || 0,
    yesterdayInvoices: yesterdayStats?.count || 0,
    topProductsThisMonth: topProducts,
    criticalStockoutItemsCount: stockoutSummary.criticalCount,
    warningStockoutItemsCount: stockoutSummary.warningCount,
    deadStockTotalCapital: deadStockSummary.totalTiedCapital,
    deadStockItemsCount: deadStockSummary.totalDeadVariants,
    ...additionalContext,
  };

  // فحص الأسئلة الشائعة لمعالجتها فورياً بدقة فائقة وبدون الحاجة لـ LLM خارجي
  const lowerPrompt = cleanPrompt.toLowerCase();

  if (lowerPrompt.includes('أكثر فرع') || lowerPrompt.includes('افضل فرع') || lowerPrompt.includes('أفضل فرع') || (lowerPrompt.includes('فرع') && lowerPrompt.includes('مبيع'))) {
    if (branchSalesThisMonth.length === 0 || branchSalesThisMonth[0].total_sales === 0) {
      return {
        answer: `📊 **تحليل مبيعات الفروع لشهر (${today.slice(0, 7)}):**\n\nلا توجد عمليات بيع مسجلة بالفروع خلال هذا الشهر حتى الآن.`,
        data: { branchSalesThisMonth },
      };
    }

    const topBranch = branchSalesThisMonth[0];
    const totalAllBranches = branchSalesThisMonth.reduce((sum, b) => sum + b.total_sales, 0);
    const topBranchPct = totalAllBranches > 0 ? Math.round((topBranch.total_sales / totalAllBranches) * 100) : 100;

    let responseMarkdown = `🏆 **أكثر الفروع مبيعاً هذا الشهر (${today.slice(0, 7)}):**\n\n`;
    responseMarkdown += `🥇 **${topBranch.branch_name}** في الصدارة بإجمالي مبيعات **${topBranch.total_sales.toFixed(2)} ر.س** (${topBranch.invoice_count} فاتورة)، وهو ما يمثل **${topBranchPct}%** من إجمالي مبيعات الفروع.\n\n`;
    responseMarkdown += `📋 **ترتيب باقي الفروع:**\n`;

    branchSalesThisMonth.forEach((b, idx) => {
      const pct = totalAllBranches > 0 ? Math.round((b.total_sales / totalAllBranches) * 100) : 0;
      responseMarkdown += `${idx + 1}. **${b.branch_name}**: ${b.total_sales.toFixed(2)} ر.س (${b.invoice_count} فاتورة - ${pct}%)\n`;
    });

    return { answer: responseMarkdown, data: { branchSalesThisMonth } };
  }

  if (lowerPrompt.includes('أكثر صنف') || lowerPrompt.includes('اكثر صنف') || lowerPrompt.includes('أكثر مبيع') || lowerPrompt.includes('افضل المنتجات') || lowerPrompt.includes('الأكثر مبيع')) {
    if (topProducts.length === 0) {
      return { answer: 'لا توجد بيانات مبيعات كافية في هذه الفترة لتحديد الأصناف الأكثر مبيعاً.' };
    }

    let res = `⭐ **المنتجات الأكثر مبيعاً هذا الشهر:**\n\n`;
    topProducts.forEach((p, idx) => {
      res += `${idx + 1}. **${p.product_name}**: بيع منه **${p.qty_sold} قطعة** بإجمالي إيرادات **${p.revenue.toFixed(2)} ر.س**\n`;
    });
    return { answer: res, data: { topProducts } };
  }

  if (lowerPrompt.includes('اليوم') && (lowerPrompt.includes('مبيع') || lowerPrompt.includes('ارباح') || lowerPrompt.includes('أرباح') || lowerPrompt.includes('تقرير'))) {
    const diff = (todayStats.sales || 0) - (yesterdayStats.sales || 0);
    const growth = yesterdayStats.sales > 0 ? Math.round((diff / yesterdayStats.sales) * 100) : 0;
    const growthText = growth >= 0 ? `ارتفاع بنسبة +${growth}% 🟢` : `انخفاض بنسبة ${growth}% 🔴`;

    let res = `📈 **ملخص مبيعات اليوم (${today}):**\n\n`;
    res += `• إجمالي مبيعات اليوم: **${(todayStats.sales || 0).toFixed(2)} ر.س** (${todayStats.count || 0} فاتورة)\n`;
    res += `• مقارنة بالأمس: **${(yesterdayStats.sales || 0).toFixed(2)} ر.س** (${yesterdayStats.count || 0} فاتورة) - ${growthText}\n`;
    return { answer: res, data: { todayStats, yesterdayStats } };
  }

  if (lowerPrompt.includes('ينفد') || lowerPrompt.includes('تنفد') || lowerPrompt.includes('النواقص') || lowerPrompt.includes('نفاد')) {
    const critical = stockoutSummary.items.filter((i) => i.riskLevel === 'critical');
    let res = `🚨 **تقرير توقع نفاد المخزون:**\n\n`;
    res += `يوجد حالياً **${stockoutSummary.criticalCount} صنف** في حالة حرجة معرضة للنفاد خلال 72 ساعة، و **${stockoutSummary.warningCount} صنف** قريبة من النفاد.\n\n`;
    if (critical.length > 0) {
      res += `📌 **أبرز الأصناف الحرجة:**\n`;
      critical.slice(0, 5).forEach((c, idx) => {
        res += `${idx + 1}. **${c.productName}** (${c.size || ''} ${c.color || ''}) - الرصيد الحالي: ${c.currentStock} قطعة (متبقي ${c.daysRemaining} يوم تقريباً)\n`;
      });
    }
    return { answer: res, data: { stockoutSummary } };
  }

  if (lowerPrompt.includes('راكد') || lowerPrompt.includes('المجمد') || lowerPrompt.includes('الركود')) {
    let res = `🧊 **تقرير الأصناف الراكدة ورأس المال المجمد:**\n\n`;
    res += `• إجمالي رأس المال المجمد في الركود: **${deadStockSummary.totalTiedCapital.toFixed(2)} ر.س**\n`;
    res += `• عدد الأصناف الراكدة: **${deadStockSummary.totalDeadVariants} صنف**\n`;
    res += `• تكلفة التخزين التقديرية سنوياً: **${deadStockSummary.estimatedHoldingCostPerYear.toFixed(2)} ر.س**\n\n`;
    res += `💡 **نصيحة الذكاء الاصطناعي:** يُنصح بتطبيق خصومات تصفية (15% - 25%) على الأصناف المجمدة لتحرير السيولة وإعادة استثمارها في المنتجات الأكثر طلباً.`;
    return { answer: res, data: { deadStockSummary } };
  }

  // إذا لم يكن السؤال من الأسئلة الجاهزة، وكان مفتاح الذكاء الاصطناعي مضبوطاً، نرسل للـ LLM
  const aiConfig = getAISettings();
  if (aiConfig.apiKey && aiConfig.apiUrl && aiConfig.isEnabled) {
    try {
      const llmResult = await askClaude(cleanPrompt, businessContext);
      return { answer: llmResult.response, data: businessContext };
    } catch (llmErr) {
      logError('CopilotLLMFallback', llmErr);
      return {
        answer: `تعذر الاتصال بمحرك الذكاء الاصطناعي السحابي (${llmErr.message}). إليك ملخص البيانات الحالي:\n\n• مبيعات اليوم: ${businessContext.todaySales.toFixed(2)} ر.س\n• أكثر فرع مبيعاً هذا الشهر: ${branchSalesThisMonth[0]?.branch_name || 'غير متوفر'}\n• الأصناف المعرضة للنفاد: ${stockoutSummary.criticalCount} صنف\n• رأس المال المجمد: ${deadStockSummary.totalTiedCapital.toFixed(2)} ر.س`,
        data: businessContext,
      };
    }
  }

  // إجابة عامة سياقية ذكية محلية
  return {
    answer: `🤖 **مساعد كاشير الذكي:**\n\nبناءً على قاعدة بيانات متجرك:\n• مبيعات اليوم: **${businessContext.todaySales.toFixed(2)} ر.س** (${businessContext.todayInvoices} فاتورة)\n• أكثر فرع مبيعاً هذا الشهر: **${branchSalesThisMonth[0]?.branch_name || 'الفرع الرئيسي'}** (${(branchSalesThisMonth[0]?.total_sales || 0).toFixed(2)} ر.س)\n• أصناف بحاجة لإعادة طلب: **${stockoutSummary.criticalCount} صنف**\n• رأس مال مجمد في الركود: **${deadStockSummary.totalTiedCapital.toFixed(2)} ر.س**\n\nيمكنك ضبط مفتاح الذكاء الاصطناعي من صفحة الإعدادات لتفعيل المحادثة الحرة المتقدمة.`,
    data: businessContext,
  };
}

// -------------------------------------------------------------
// 7. توليد تقارير باللغة العربية (Arabic Reports Generator)
// -------------------------------------------------------------
function generateArabicReport(reportType = 'executive_summary', dateRange = {}) {
  const today = new Date().toISOString().split('T')[0];
  const startDate = dateRange.startDate || `${today.slice(0, 7)}-01`;
  const endDate = dateRange.endDate || today;

  // 1. التقرير التنفيذي الشامل
  if (reportType === 'executive_summary') {
    const kpis = db.prepare(`
      SELECT 
        COUNT(*) as total_invoices,
        COALESCE(SUM(total_amount), 0) as total_sales,
        COALESCE(SUM(discount), 0) as total_discounts
      FROM sales
      WHERE date(created_at, 'localtime') >= date(?) AND date(created_at, 'localtime') <= date(?)
    `).get(startDate, endDate);

    const profitRow = db.prepare(`
      SELECT COALESCE(SUM(si.quantity * (si.unit_price - pv.purchase_price)), 0) as profit
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      JOIN product_variants pv ON pv.id = si.variant_id
      WHERE date(s.created_at, 'localtime') >= date(?) AND date(s.created_at, 'localtime') <= date(?)
    `).get(startDate, endDate);

    const netProfit = profitRow?.profit || 0;
    const marginPct = kpis.total_sales > 0 ? Math.round((netProfit / kpis.total_sales) * 100) : 0;

    const branches = db.prepare(`
      SELECT b.name as branch_name, COALESCE(SUM(s.total_amount), 0) as sales, COUNT(s.id) as invoices
      FROM branches b
      LEFT JOIN sales s ON s.branch_id = b.id AND date(s.created_at, 'localtime') >= date(?) AND date(s.created_at, 'localtime') <= date(?)
      WHERE b.is_active = 1
      GROUP BY b.id
      ORDER BY sales DESC
    `).all(startDate, endDate);

    const stockouts = predictStockouts({ daysWindow: 30 });
    const deadStock = analyzeDeadStock();
    const anomalies = detectSalesAnomalies({ days: 30 });

    const reportContent = `
# 📊 التقرير التنفيذي الذكي الشامل للأعمال والمخزون
**الفترة من:** ${startDate} **إلى:** ${endDate}  
**تاريخ التوليد:** ${new Date().toLocaleString('ar-SA')}

---

### 1. ملخص الأداء المالي
* **إجمالي المبيعات المحققة:** ${kpis.total_sales.toFixed(2)} ر.س
* **عدد الفواتير المنفذة:** ${kpis.total_invoices} فاتورة
* **صافي الأرباح التقديرية:** ${netProfit.toFixed(2)} ر.س
* **هامش الربح الإجمالي:** ${marginPct}%
* **إجمالي الخصومات الممنوحة:** ${kpis.total_discounts.toFixed(2)} ر.س

---

### 2. أداء الفروع وقنوات البيع
${branches.map((b, i) => `${i + 1}. **${b.branch_name}:** ${b.sales.toFixed(2)} ر.س (${b.invoices} فاتورة)`).join('\n')}

---

### 3. مؤشرات صحة المخزون والتوريد
* **أصناف معرضة للنفاد الوشيك:** ${stockouts.criticalCount} صنف
* **أصناف قريبة من نقطة إعادة الطلب:** ${stockouts.warningCount} صنف
* **رأس المال المجمد في الأصناف الراكدة:** ${deadStock.totalTiedCapital.toFixed(2)} ر.س (${deadStock.totalDeadVariants} صنف)
* **تكلفة التخزين السنوية المتوقعة للركود:** ${deadStock.estimatedHoldingCostPerYear.toFixed(2)} ر.س

---

### 4. الرقابة واكتشاف العمليات غير الطبيعية
* **إجمالي التنبيهات المرصودة:** ${anomalies.anomaliesCount} تنبيه (${anomalies.criticalCount} تنبيه عالي الخطورة)

---

### 5. التوصيات الاستراتيجية الذكية
1. **إعادة تموين عاجلة:** إنشاء أوامر شراء فورية للأصناف ذات الخطورة الحرجة لتجنب فقدان المبيعات.
2. **تصفية المخزون الراكد:** إطلاق عروض ترويجية وتخفيضات مخصصة لتحرير رأس المال المجمد (${deadStock.totalTiedCapital.toFixed(2)} ر.س).
3. **مراجعة الخصومات:** التدقيق في الفواتير ذات نسب الخصم الاستثنائية لضمان سلامة العمليات المحاسبية.
`;

    return {
      title: 'التقرير التنفيذي الشامل',
      type: reportType,
      generatedAt: new Date().toISOString(),
      period: { startDate, endDate },
      summary: {
        totalSales: kpis.total_sales,
        totalInvoices: kpis.total_invoices,
        netProfit,
        marginPct,
      },
      markdown: reportContent.trim(),
    };
  }

  // تقارير أخرى
  return {
    title: 'تقرير مخصص',
    type: reportType,
    generatedAt: new Date().toISOString(),
    period: { startDate, endDate },
    markdown: `تم توليد التقرير بنجاح للفترة ${startDate} إلى ${endDate}.`,
  };
}

// -------------------------------------------------------------
// 8. إنشاء مسودة أمر شراء فوري من الاقتراحات (1-Click PO Creation)
// -------------------------------------------------------------
function createPurchaseDraftFromSuggestions(suggestedItems = [], supplierId = null, notes = 'تم التوليد تلقائياً بناءً على اقتراحات الذكاء الاصطناعي') {
  if (!suggestedItems || suggestedItems.length === 0) {
    throw new Error('يرجى تحديد الأصناف المطلوبة لإنشاء أمر الشراء');
  }

  const runTx = db.transaction(() => {
    // تحديد مورد
    let targetSupplierId = supplierId;
    if (!targetSupplierId) {
      const sup = db.prepare('SELECT id FROM suppliers LIMIT 1').get();
      if (!sup) throw new Error('لا يوجد موردين مسجلين في النظام. يرجى إضافة مورد أولاً.');
      targetSupplierId = sup.id;
    }

    const totalAmount = suggestedItems.reduce((sum, item) => sum + (Number(item.suggestedQuantity || 1) * Number(item.unitPurchasePrice || item.purchasePrice || 0)), 0);
    const invoiceNumber = `PO-AI-${Date.now().toString().slice(-6)}`;

    const res = db.prepare(`
      INSERT INTO purchases (supplier_id, invoice_number, total_amount, paid_amount, remaining_amount, payment_status, notes)
      VALUES (?, ?, ?, 0, ?, 'unpaid', ?)
    `).run(targetSupplierId, invoiceNumber, totalAmount, totalAmount, notes);

    const purchaseId = res.lastInsertRowid;
    const insertItem = db.prepare(`
      INSERT INTO purchase_items (purchase_id, variant_id, product_name, size, color, quantity, purchase_price, selling_price)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const item of suggestedItems) {
      insertItem.run(
        purchaseId,
        item.variantId || null,
        item.productName || 'صنف',
        item.size || null,
        item.color || null,
        Number(item.suggestedQuantity || 1),
        Number(item.unitPurchasePrice || item.purchasePrice || 0),
        Number(item.sellingPrice || 0)
      );
    }

    return { success: true, purchaseId, invoiceNumber, totalAmount, itemsCount: suggestedItems.length };
  });

  return runTx();
}

async function analyzeStoreDataWithAI() {
  try {
    const today = new Date().toISOString().split('T')[0];
    const report = generateArabicReport('executive_summary', { startDate: today, endDate: today });
    const aiConfig = getAISettings();
    if (aiConfig.apiKey && aiConfig.apiUrl && aiConfig.isEnabled) {
      const prompt = 'قدم لي تحليلاً ذكياً وسريعاً لملخص مبيعات المتجر اليوم مع 3 نصائح عملية لزيادة الأرباح وتحسين المبيعات بناءً على هذا التقرير: ' + report.markdown;
      return await askClaude(prompt, report);
    }
    return { success: true, response: report.markdown };
  } catch (err) {
    logError('AIStoreAnalysis', err);
    throw err;
  }
}

module.exports = {
  getAISettings,
  saveAISettings,
  askClaude,
  predictStockouts,
  suggestPurchaseQuantities,
  detectSalesAnomalies,
  suggestPricingAndDiscounts,
  analyzeDeadStock,
  askCopilot,
  generateArabicReport,
  createPurchaseDraftFromSuggestions,
  analyzeStoreDataWithAI,
};

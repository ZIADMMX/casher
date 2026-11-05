// Business copilot: answers common questions from live data, otherwise asks the LLM.
const aiRepo = require('../../repositories/ai.repository');
const { logError } = require('../logger.service');
const { getAISettings, askClaude } = require('./llmClient');
const { predictStockouts, analyzeDeadStock } = require('./inventoryInsights');

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
  const branchSalesThisMonth = aiRepo.getBranchSalesSince(startOfMonth);

  // 2. مبيعات اليوم والأمس
  const todayStats = aiRepo.getSalesTotalsForDate(today);

  const yesterdayStats = aiRepo.getYesterdaySalesTotals();

  // 3. أعلى الأصناف مبيعاً
  const topProducts = aiRepo.getTopProductsSince(startOfMonth);

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

module.exports = {
  askCopilot,
};

// Arabic executive reports built from the other AI insights.
const aiRepo = require('../../repositories/ai.repository');
const { logError } = require('../logger.service');
const { getAISettings, askClaude } = require('./llmClient');
const { predictStockouts, analyzeDeadStock } = require('./inventoryInsights');
const { detectSalesAnomalies } = require('./anomalies');

// -------------------------------------------------------------
// 7. توليد تقارير باللغة العربية (Arabic Reports Generator)
// -------------------------------------------------------------
function generateArabicReport(reportType = 'executive_summary', dateRange = {}) {
  const today = new Date().toISOString().split('T')[0];
  const startDate = dateRange.startDate || `${today.slice(0, 7)}-01`;
  const endDate = dateRange.endDate || today;

  // 1. التقرير التنفيذي الشامل
  if (reportType === 'executive_summary') {
    const kpis = aiRepo.getSalesKpis(startDate, endDate);

    const profitRow = aiRepo.getGrossProfit(startDate, endDate);

    const netProfit = profitRow?.profit || 0;
    const marginPct = kpis.total_sales > 0 ? Math.round((netProfit / kpis.total_sales) * 100) : 0;

    const branches = aiRepo.getBranchSalesBetween(startDate, endDate);

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
  generateArabicReport,
  analyzeStoreDataWithAI,
};

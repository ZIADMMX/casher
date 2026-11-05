// Flags unusual sales: amount spikes, heavy discounts, frequent returns, off-hours sales.
const aiRepo = require('../../repositories/ai.repository');

// -------------------------------------------------------------
// 3. اكتشاف المبيعات غير الطبيعية والأنشطة المشبوهة (Anomaly Detection)
// -------------------------------------------------------------
function detectSalesAnomalies(options = {}) {
  const days = Number(options.days) || 30;
  const dateModifier = `-${days} days`;
  const anomalies = [];

  // 1. حساب المتوسط والانحراف المعياري لقيم الفواتير
  const stats = aiRepo.getSalesAmountStats(dateModifier);

  const avgAmount = stats?.avg_amount || 0;
  const invoiceCount = stats?.count || 0;

  if (invoiceCount >= 5) {
    // حساب التباين
    const varianceRow = aiRepo.getSalesAmountVariance(avgAmount, dateModifier);

    const stdDev = Math.sqrt(varianceRow?.variance || 0);
    const spikeThreshold = avgAmount + (2.2 * stdDev);

    // فواتير ذات قيم غير طبيعية (Spike Amount)
    const spikeInvoices = aiRepo.getSalesAboveAmount(dateModifier, spikeThreshold);

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
  const highDiscountInvoices = aiRepo.getHighDiscountSales(dateModifier);

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
  const returnsByCashier = aiRepo.getFrequentReturnsByCashier(dateModifier);

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
  const offHourSales = aiRepo.getOffHourSales(dateModifier);

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

module.exports = {
  detectSalesAnomalies,
};

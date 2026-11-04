const reportsRepo = require('../repositories/reports.repository');
const casesRepo = require('../repositories/cases.repository');
const { requireAdmin } = require('./auth.service');

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function isValidReportDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsedDate = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === value;
}

function resolveDateRange(param) {
  const today = new Date();

  // لو الباراميتر كائن وفيه تواريخ مخصصة
  if (typeof param === 'object' && param !== null && param.startDate && param.endDate) {
    return {
      startDate: param.startDate,
      endDate: param.endDate,
    };
  }

  const period = typeof param === 'string' ? param : 'today';

  if (period === 'today') {
    const d = formatDate(today);
    return { startDate: d, endDate: d };
  }

  if (period === 'yesterday') {
    const yest = new Date(today);
    yest.setDate(yest.getDate() - 1);
    const d = formatDate(yest);
    return { startDate: d, endDate: d };
  }

  if (period === 'week') {
    // آخر 7 أيام
    const past = new Date(today);
    past.setDate(past.getDate() - 6);
    return {
      startDate: formatDate(past),
      endDate: formatDate(today),
    };
  }

  if (period === 'month') {
    // الشهر الحالي: من أول يوم في الشهر حتى تاريخ اليوم
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return {
      startDate: formatDate(firstDay),
      endDate: formatDate(today),
    };
  }

  // افتراضي: آخر 30 يوم
  const past30 = new Date(today);
  past30.setDate(past30.getDate() - 29);
  return {
    startDate: formatDate(past30),
    endDate: formatDate(today),
  };
}

function calculateGrowth(current, previous) {
  if (!previous || previous === 0) {
    return current > 0 ? 100 : 0;
  }
  return Math.round(((current - previous) / previous) * 100);
}

function getPreviousDateRange(startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // عدد الأيام

  const prevEnd = new Date(start);
  prevEnd.setDate(prevEnd.getDate() - 1);

  const prevStart = new Date(prevEnd);
  prevStart.setDate(prevStart.getDate() - (diffDays - 1));

  return {
    prevStartDate: formatDate(prevStart),
    prevEndDate: formatDate(prevEnd),
  };
}

function getFullReport(periodParam = 'today') {
  requireAdmin();
  const { startDate, endDate } = resolveDateRange(periodParam);

  const summary = reportsRepo.getSummary(startDate, endDate);
  const profit = reportsRepo.getProfitEstimate(startDate, endDate);
  const topSelling = reportsRepo.getTopSelling(startDate, endDate, 5);
  const trend = reportsRepo.getDailyTrend(startDate, endDate);
  const recentInvoices = reportsRepo.getRecentInvoices(startDate, endDate, 50);

  // حساب الفترة السابقة لمؤشرات النمو (KPI Growth)
  const { prevStartDate, prevEndDate } = getPreviousDateRange(startDate, endDate);
  const prevSummary = reportsRepo.getSummary(prevStartDate, prevEndDate);
  const prevProfit = reportsRepo.getProfitEstimate(prevStartDate, prevEndDate);

  const salesGrowth = calculateGrowth(summary.totalSales, prevSummary.totalSales);
  const profitGrowth = calculateGrowth(profit, prevProfit);
  const invoiceGrowth = calculateGrowth(summary.invoiceCount, prevSummary.invoiceCount);

  const avgInvoice =
    summary.invoiceCount > 0 ? Math.round(summary.totalSales / summary.invoiceCount) : 0;

  return {
    startDate,
    endDate,
    prevStartDate,
    prevEndDate,
    totalSales: summary.totalSales,
    invoiceCount: summary.invoiceCount,
    avgInvoice,
    estimatedProfit: Math.round(profit),
    growth: {
      sales: salesGrowth,
      profit: profitGrowth,
      invoices: invoiceGrowth,
    },
    topSelling,
    trend,
    recentInvoices,
  };
}

function getLegalCaseReport(periodParam = 'today') {
  const { startDate, endDate } = resolveDateRange(periodParam);
  if (!isValidReportDate(startDate) || !isValidReportDate(endDate)) {
    throw new Error('تاريخ فترة التقرير غير صالح');
  }
  if (startDate > endDate) {
    throw new Error('بداية فترة التقرير يجب أن تسبق نهايتها');
  }
  return casesRepo.getLawFirmReport(startDate, endDate);
}

module.exports = { getFullReport, getLegalCaseReport, resolveDateRange };

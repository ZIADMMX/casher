const reportsRepo = require('../repositories/reports.repository');
const casesRepo = require('../repositories/cases.repository');
const { requireAdmin } = require('./auth.service');

const MAX_RANGE_DAYS = 366;
const PRESETS = ['today', 'yesterday', 'week', 'month', 'last_month'];
const LEDGER_METHODS = ['all', 'cash', 'card', 'credit', 'return'];
const MAX_PAGE_SIZE = 100;

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

function daysBetween(startDate, endDate) {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / 86400000) + 1;
}

function shiftDate(value, days) {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function resolveDateRange(param) {
  const today = new Date();

  if (typeof param === 'object' && param !== null && param.startDate && param.endDate) {
    return { startDate: param.startDate, endDate: param.endDate };
  }

  const period = typeof param === 'string'
    ? param
    : (typeof param?.period === 'string' ? param.period : 'today');

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
    const past = new Date(today);
    past.setDate(past.getDate() - 6);
    return { startDate: formatDate(past), endDate: formatDate(today) };
  }
  if (period === 'month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
    return { startDate: formatDate(firstDay), endDate: formatDate(today) };
  }
  if (period === 'last_month') {
    const firstDay = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const lastDay = new Date(today.getFullYear(), today.getMonth(), 0);
    return { startDate: formatDate(firstDay), endDate: formatDate(lastDay) };
  }

  const past30 = new Date(today);
  past30.setDate(past30.getDate() - 29);
  return { startDate: formatDate(past30), endDate: formatDate(today) };
}

// Turns whatever the screen sent into a checked filter. Anything off is refused
// instead of guessed, so a report never silently shows a different period.
function resolveFilter(param) {
  if (typeof param === 'string' && !PRESETS.includes(param)) {
    throw new Error('الفترة الزمنية للتقرير غير صالحة');
  }
  const { startDate, endDate } = resolveDateRange(param);
  if (!isValidReportDate(startDate) || !isValidReportDate(endDate)) {
    throw new Error('تاريخ فترة التقرير غير صالح');
  }
  if (startDate > endDate) {
    throw new Error('بداية فترة التقرير يجب أن تسبق نهايتها');
  }
  if (daysBetween(startDate, endDate) > MAX_RANGE_DAYS) {
    throw new Error('أقصى مدة للتقرير سنة واحدة');
  }

  let userId = null;
  const rawUserId = typeof param === 'object' && param !== null ? param.userId : null;
  if (rawUserId !== null && rawUserId !== undefined && rawUserId !== '') {
    userId = Number(rawUserId);
    if (!Number.isInteger(userId) || userId <= 0 || !reportsRepo.staffExists(userId)) {
      throw new Error('الموظف المحدد غير موجود');
    }
  }
  return { startDate, endDate, userId };
}

function getPreviousDateRange(startDate, endDate) {
  const days = daysBetween(startDate, endDate);
  const prevEndDate = shiftDate(startDate, -1);
  return { prevStartDate: shiftDate(prevEndDate, -(days - 1)), prevEndDate };
}

// Percent change rounded to one decimal; null when there is nothing to compare.
function calculateGrowth(current, previous) {
  if (!previous) return current > 0 ? null : 0;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

function getKpis(filter) {
  const sales = reportsRepo.getSalesSummary(filter);
  const cost = reportsRepo.getCostOfSales(filter);
  const returns = reportsRepo.getReturnsSummary(filter);
  const netSales = sales.grossSales - returns.refundTotal;
  const profit = netSales - (cost - returns.returnedCost);
  return {
    grossSales: round2(sales.grossSales),
    discounts: round2(sales.discounts),
    returnsTotal: round2(returns.refundTotal),
    returnCount: returns.returnCount,
    netSales: round2(netSales),
    invoiceCount: sales.invoiceCount,
    avgInvoice: sales.invoiceCount > 0 ? round2(sales.grossSales / sales.invoiceCount) : 0,
    profit: round2(profit),
    margin: netSales > 0 ? Math.round((profit / netSales) * 1000) / 10 : 0,
  };
}

function buildTrend(filter, prevFilter) {
  const days = daysBetween(filter.startDate, filter.endDate);
  const current = new Map(reportsRepo.getDailyTrend(filter).map((row) => [row.day, row]));
  const previous = new Map(reportsRepo.getDailyTrend(prevFilter).map((row) => [row.day, row]));
  const trend = [];
  for (let i = 0; i < days; i += 1) {
    const day = shiftDate(filter.startDate, i);
    const prevDay = shiftDate(prevFilter.startDate, i);
    trend.push({
      day,
      total: round2(current.get(day)?.total),
      invoiceCount: current.get(day)?.invoiceCount || 0,
      prevTotal: round2(previous.get(prevDay)?.total),
    });
  }
  return trend;
}

function getFullReport(periodParam = 'today') {
  requireAdmin();
  const filter = resolveFilter(periodParam);
  const { prevStartDate, prevEndDate } = getPreviousDateRange(filter.startDate, filter.endDate);
  const prevFilter = { ...filter, startDate: prevStartDate, endDate: prevEndDate };

  const kpis = getKpis(filter);
  const prevKpis = getKpis(prevFilter);
  const days = daysBetween(filter.startDate, filter.endDate);

  const paymentRows = reportsRepo.getPaymentBreakdown(filter);
  const payments = ['cash', 'card', 'credit'].map((method) => {
    const row = paymentRows.find((r) => r.method === method);
    const total = round2(row?.total);
    return {
      method,
      total,
      invoiceCount: row?.invoiceCount || 0,
      share: kpis.grossSales > 0 ? Math.round((total / kpis.grossSales) * 100) : 0,
    };
  });
  const credit = payments.find((p) => p.method === 'credit');

  const staff = reportsRepo.getStaffPerformance(filter).map((row) => ({
    ...row,
    total: round2(row.total),
    avgInvoice: row.invoiceCount > 0 ? round2(row.total / row.invoiceCount) : 0,
  }));
  const topSelling = reportsRepo.getTopProducts(filter, 'revenue', 5);

  return {
    startDate: filter.startDate,
    endDate: filter.endDate,
    prevStartDate,
    prevEndDate,
    userId: filter.userId,
    days,
    kpis,
    prevKpis,
    growth: {
      sales: calculateGrowth(kpis.netSales, prevKpis.netSales),
      profit: calculateGrowth(kpis.profit, prevKpis.profit),
      invoices: calculateGrowth(kpis.invoiceCount, prevKpis.invoiceCount),
      avgInvoice: calculateGrowth(kpis.avgInvoice, prevKpis.avgInvoice),
      returns: calculateGrowth(kpis.returnCount, prevKpis.returnCount),
    },
    invoicesPerDay: Math.round((kpis.invoiceCount / days) * 10) / 10,
    returnRate: kpis.grossSales > 0 ? Math.round((kpis.returnsTotal / kpis.grossSales) * 1000) / 10 : 0,
    trend: buildTrend(filter, prevFilter),
    payments,
    credit: { total: credit.total, customers: reportsRepo.getCreditCustomerCount(filter) },
    topSelling,
    topByQuantity: reportsRepo.getTopProducts(filter, 'quantity', 5),
    staff,
    staffOptions: reportsRepo.listSellingStaff(),

    // Older callers (Today screen, LAN clients) read these names.
    totalSales: kpis.netSales,
    invoiceCount: kpis.invoiceCount,
    avgInvoice: kpis.avgInvoice,
    estimatedProfit: kpis.profit,
    recentInvoices: reportsRepo.getRecentInvoices(filter.startDate, filter.endDate, 50, filter.userId),
  };
}

function getInvoicesPage(query = {}) {
  requireAdmin();
  const filter = resolveFilter(query.period ?? query);
  const method = LEDGER_METHODS.includes(query.method) ? query.method : 'all';
  const search = typeof query.search === 'string' ? query.search.trim().slice(0, 60) : '';
  const pageSize = Math.min(Math.max(Number.parseInt(query.pageSize, 10) || 6, 1), MAX_PAGE_SIZE);
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const result = reportsRepo.getLedgerPage(filter, {
    method,
    search,
    limit: pageSize,
    offset: (page - 1) * pageSize,
  });
  return {
    ...result,
    amountTotal: round2(result.amountTotal),
    page,
    pageSize,
    pageCount: Math.max(Math.ceil(result.total / pageSize), 1),
  };
}

// Every sale and return in the period for the Excel export (not just one page).
function getLedgerForExport(periodParam) {
  requireAdmin();
  const filter = resolveFilter(periodParam);
  const { rows } = reportsRepo.getLedgerPage(filter, { limit: 100000, offset: 0 });
  return { ...filter, rows };
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

module.exports = {
  getFullReport,
  getInvoicesPage,
  getLedgerForExport,
  getLegalCaseReport,
  resolveDateRange,
  resolveFilter,
};

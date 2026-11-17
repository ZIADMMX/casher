// تقارير ورش السيارات: إيراد الأوامر المقفولة (قطع + عمالة) مقارنةً بالفترة السابقة. للورش فقط ولصاحب الصلاحية.
const repo = require('../repositories/workshopReports.repository');
const SettingsRepository = require('../repositories/settings.repository');
const auth = require('./auth.service');

const MAX_DAYS = 366;
const RECENT = 7;
const TOP_MECHANICS = 5;
const UNASSIGNED = 'غير مُسند';
const DAY = 86400000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const round2 = (n) => Math.round(n * 100) / 100;
const utc = (iso) => Date.parse(`${iso}T00:00:00.000Z`);
const isDate = (v) => typeof v === 'string' && DATE_RE.test(v) && new Date(utc(v)).toISOString().slice(0, 10) === v;
const shift = (iso, days) => new Date(utc(iso) + days * DAY).toISOString().slice(0, 10);

function requireWorkshop() {
  auth.requireAdmin();
  if (SettingsRepository.get('business_type') !== 'auto_workshop') throw new Error('تقارير الورشة متاحة لقطاع ورش السيارات فقط');
}

function parseFilters(filters = {}) {
  const { startDate, endDate } = filters;
  if (!isDate(startDate) || !isDate(endDate)) throw new Error('الفترة غير صالحة');
  const days = (utc(endDate) - utc(startDate)) / DAY + 1;
  if (days < 1) throw new Error('تاريخ البداية بعد النهاية');
  if (days > MAX_DAYS) throw new Error('الفترة أطول من سنة');
  let branch = null;
  if (filters.branchId != null && filters.branchId !== '') {
    branch = Number(filters.branchId);
    if (!Number.isSafeInteger(branch) || branch < 1) throw new Error('الفرع غير صالح');
  }
  return { start: startDate, end: endDate, days, branch, prevStart: shift(startDate, -days), prevEnd: shift(startDate, -1) };
}

function totalsOf(rows) {
  const parts = round2(rows.reduce((s, r) => s + r.parts, 0));
  const labor = round2(rows.reduce((s, r) => s + r.labor, 0));
  const revenue = round2(parts + labor);
  return { orders: rows.length, parts, labor, revenue, avg: rows.length ? round2(revenue / rows.length) : 0 };
}

function dailySeries(rows, start, days) {
  const byDay = new Map();
  for (const r of rows) {
    const d = byDay.get(r.closed_day) || { orders: 0, revenue: 0 };
    d.orders += 1; d.revenue += r.parts + r.labor;
    byDay.set(r.closed_day, d);
  }
  return Array.from({ length: days }, (_, i) => {
    const day = shift(start, i);
    const d = byDay.get(day);
    return { day, orders: d?.orders || 0, revenue: round2(d?.revenue || 0) };
  });
}

function mechanicsOf(rows) {
  const by = new Map();
  for (const r of rows) {
    const name = r.mechanic || UNASSIGNED;
    const m = by.get(name) || { name, orders: 0, revenue: 0 };
    m.orders += 1; m.revenue += r.parts + r.labor;
    by.set(name, m);
  }
  return [...by.values()].map((m) => ({ ...m, revenue: round2(m.revenue) })).sort((a, b) => b.revenue - a.revenue || b.orders - a.orders);
}

function getReport(filters) {
  requireWorkshop();
  const f = parseFilters(filters);
  const rows = repo.closedOrders(f.start, f.end, f.branch);
  const prev = totalsOf(repo.closedOrders(f.prevStart, f.prevEnd, f.branch));
  const now = totalsOf(rows);
  const daily = dailySeries(rows, f.start, f.days);
  const mechanics = mechanicsOf(rows);
  const quiet = f.days > 1 && rows.length ? Math.min(...daily.map((d) => d.orders)) : null;
  return {
    range: { start: f.start, end: f.end, days: f.days, prevStart: f.prevStart, prevEnd: f.prevEnd },
    totals: now, prev,
    daily, dailyAvg: round2(now.orders / f.days),
    quietDays: quiet === null ? [] : daily.filter((d) => d.orders === quiet).map((d) => d.day).slice(0, 2),
    mechanics: mechanics.slice(0, TOP_MECHANICS), mechanicCount: mechanics.length,
    services: repo.topServices(f.start, f.end, f.branch).map((s) => ({ ...s, revenue: round2(s.revenue) })),
    recent: rows.slice(0, RECENT).map((r) => ({ ...r, parts: round2(r.parts), labor: round2(r.labor), total: round2(r.parts + r.labor) })),
  };
}

// One row per closed order for the Excel file.
function getExportRows(filters) {
  requireWorkshop();
  const f = parseFilters(filters);
  return {
    start: f.start, end: f.end,
    rows: repo.closedOrders(f.start, f.end, f.branch).map((r) => ({
      'رقم الأمر': r.order_number, 'تاريخ الإغلاق': r.closed_day, 'اللوحة': r.plate,
      'العميل': r.customer_name, 'السيارة': [r.make, r.model].filter(Boolean).join(' '), 'الفني': r.mechanic || '',
      'عمالة': round2(r.labor), 'قطع': round2(r.parts), 'الإجمالي': round2(r.parts + r.labor),
    })),
  };
}

module.exports = { getReport, getExportRows };

import { useCallback, useEffect, useMemo, useState } from 'react';
import * as importExportApi from '../../api/importExport.js';
import * as reportsApi from '../../api/reports.js';
import {
  AlertIcon,
  ChevronSideIcon,
  CurrencyIcon,
  DownloadIcon,
  EyeIcon,
  FileTextIcon,
  BagIcon,
  PrinterIcon,
  SearchIcon,
  TrendUpIcon,
  UndoIcon,
  ChevronDownIcon,
} from '../icons/PosIcons.jsx';
import InvoiceModal from './InvoiceModal.jsx';
import '../../styles/reports.css';

/* Sector-neutral on purpose: "أصناف" covers products and services, "الموظف"
   covers cashier, stylist, technician... The numbers come from the sales
   ledger, which the database keeps append-only, so this screen only reads. */

const PRESETS = [
  { key: 'today', label: 'اليوم' },
  { key: 'yesterday', label: 'أمس' },
  { key: 'week', label: 'آخر 7 أيام' },
  { key: 'month', label: 'الشهر الحالي' },
  { key: 'last_month', label: 'الشهر الماضي' },
];

const METHODS = {
  cash: { label: 'نقدي', tone: 'cash' },
  card: { label: 'بطاقة', tone: 'card' },
  credit: { label: 'آجل', tone: 'credit' },
  return: { label: 'مرتجع', tone: 'return' },
};

const LEDGER_TABS = [
  { key: 'all', label: 'الكل' },
  { key: 'cash', label: 'نقدي' },
  { key: 'card', label: 'بطاقة' },
  { key: 'credit', label: 'آجل' },
  { key: 'return', label: 'مرتجع' },
];

const PAGE_SIZE = 6;
const CURRENCY = 'ج.م';

const numberFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const dayMonthFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', timeZone: 'UTC' });
const yearFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { year: 'numeric', timeZone: 'UTC' });
const weekdayFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { weekday: 'long', timeZone: 'UTC' });
const monthFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { month: 'short', timeZone: 'UTC' });
const timeFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true });
const shortDateFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { day: 'numeric', month: 'short' });

const money = (value) => numberFmt.format(Math.round(Number(value) || 0));
const asDate = (day) => new Date(`${day}T00:00:00.000Z`);
const localDay = (date = new Date()) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

function compact(value) {
  const n = Number(value) || 0;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return numberFmt.format(n);
}

function describeRange(start, end) {
  if (!start || !end) return '';
  if (start === end) return `${dayMonthFmt.format(asDate(start))} ${yearFmt.format(asDate(start))}`;
  return `${dayMonthFmt.format(asDate(start))} – ${dayMonthFmt.format(asDate(end))} ${yearFmt.format(asDate(end))}`;
}

function Money({ value, className = '' }) {
  return (
    <span className={`rep-money ${className}`}>
      <bdi>{money(value)}</bdi> <span className="rep-money__unit">{CURRENCY}</span>
    </span>
  );
}

// Up is good for sales; for returns `invert` makes up the bad direction.
function Growth({ value, invert = false }) {
  if (value === null || value === undefined) {
    return <span className="rep-growth rep-growth--neutral">جديد</span>;
  }
  const up = value > 0;
  const good = invert ? value < 0 : value > 0;
  const tone = value === 0 ? 'neutral' : good ? 'up' : 'down';
  return (
    <span className={`rep-growth rep-growth--${tone}`} title="مقارنة بالفترة السابقة">
      {value === 0 ? '' : up ? '↑ ' : '↓ '}
      <bdi>{Math.abs(value)}%</bdi>
    </span>
  );
}

function KpiCard({ icon: Icon, tone, label, children, footer }) {
  return (
    <article className="rep-card rep-kpi">
      <header className="rep-kpi__head">
        <span className="rep-kpi__label">{label}</span>
        <span className={`rep-kpi__icon rep-tone--${tone}`}><Icon size={18} /></span>
      </header>
      <div className="rep-kpi__value">{children}</div>
      <footer className="rep-kpi__foot">{footer}</footer>
    </article>
  );
}

// Long ranges are grouped so the chart stays readable: days up to 31, then weeks, then months.
function bucketTrend(trend) {
  if (trend.length <= 31) {
    const short = trend.length <= 14;
    return trend.map((row) => ({
      key: row.day,
      label: short
        ? `${row.day === localDay() ? 'اليوم' : weekdayFmt.format(asDate(row.day))} ${asDate(row.day).getUTCDate()}`
        : String(asDate(row.day).getUTCDate()),
      title: dayMonthFmt.format(asDate(row.day)),
      total: row.total,
      prevTotal: row.prevTotal,
      partial: row.day === localDay(),
    }));
  }
  const groups = new Map();
  const byMonth = trend.length > 92;
  for (const row of trend) {
    const date = asDate(row.day);
    const key = byMonth
      ? `${date.getUTCFullYear()}-${date.getUTCMonth()}`
      : String(Math.floor(trend.indexOf(row) / 7));
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        label: byMonth ? monthFmt.format(date) : shortDateFmt.format(date),
        title: byMonth ? monthFmt.format(date) : `أسبوع ${shortDateFmt.format(date)}`,
        total: 0,
        prevTotal: 0,
        partial: false,
      });
    }
    const group = groups.get(key);
    group.total += row.total;
    group.prevTotal += row.prevTotal;
    if (row.day === localDay()) group.partial = true;
  }
  return [...groups.values()];
}

function niceMax(value) {
  if (value <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 2.5, 5, 10].find((s) => s * pow * 4 >= value) * pow;
  return step * 4;
}

function TrendPanel({ report }) {
  const bars = useMemo(() => bucketTrend(report.trend || []), [report.trend]);
  const max = niceMax(Math.max(...bars.map((b) => Math.max(b.total, b.prevTotal)), 0));
  const ticks = [4, 3, 2, 1, 0].map((i) => (max / 4) * i);
  const best = (report.trend || []).reduce((top, row) => (row.total > (top?.total || 0) ? row : top), null);

  return (
    <section className="rep-card rep-panel rep-trend">
      <header className="rep-panel__head">
        <div>
          <h2 className="rep-panel__title">المبيعات حسب الفترة</h2>
          <p className="rep-panel__sub">
            إجمالي <Money value={report.kpis.grossSales} />
            {best && best.total > 0 && (
              <> · أعلى يوم {weekdayFmt.format(asDate(best.day))} {dayMonthFmt.format(asDate(best.day))}</>
            )}
          </p>
        </div>
        <ul className="rep-legend">
          <li><span className="rep-legend__dot rep-legend__dot--current" />الفترة الحالية</li>
          <li><span className="rep-legend__dot rep-legend__dot--prev" />الفترة السابقة</li>
        </ul>
      </header>

      {bars.every((b) => !b.total && !b.prevTotal) ? (
        <p className="rep-empty">لا توجد مبيعات في هذه الفترة</p>
      ) : (
        <div className="rep-chart" role="img" aria-label="مقارنة المبيعات بالفترة السابقة">
          <div className="rep-chart__axis" aria-hidden="true">
            {ticks.map((t) => <span key={t}>{compact(t)}</span>)}
          </div>
          <div className="rep-chart__plot">
            <div className="rep-chart__grid" aria-hidden="true">
              {ticks.map((t) => <span key={t} />)}
            </div>
            <div className="rep-chart__bars" style={{ '--rep-bar-count': bars.length }}>
              {bars.map((bar) => (
                <div
                  key={bar.key}
                  className="rep-chart__group"
                  title={`${bar.title}: ${money(bar.total)} ${CURRENCY} (السابقة ${money(bar.prevTotal)})`}
                >
                  {bars.length <= 14 && <span className="rep-chart__value">{compact(bar.total)}</span>}
                  <div className="rep-chart__pair">
                    <span className="rep-chart__bar rep-chart__bar--prev" style={{ blockSize: `${(bar.prevTotal / max) * 100}%` }} />
                    <span
                      className={`rep-chart__bar rep-chart__bar--current${bar.partial ? ' is-partial' : ''}`}
                      style={{ blockSize: `${(bar.total / max) * 100}%` }}
                    />
                  </div>
                  <span className="rep-chart__label">{bar.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function PaymentsPanel({ report, onNavigate }) {
  const { payments, credit } = report;
  const hasSales = payments.some((p) => p.total > 0);
  return (
    <section className="rep-card rep-panel rep-payments">
      <header className="rep-panel__head">
        <div>
          <h2 className="rep-panel__title">طرق الدفع</h2>
          <p className="rep-panel__sub">توزيع المبيعات حسب طريقة الدفع</p>
        </div>
      </header>

      <div className="rep-stack" aria-hidden="true">
        {hasSales
          ? payments.filter((p) => p.total > 0).map((p) => (
            <span key={p.method} className={`rep-stack__seg rep-pay--${p.method}`} style={{ flexGrow: p.total }} />
          ))
          : <span className="rep-stack__seg rep-stack__seg--empty" />}
      </div>

      <ul className="rep-pay-list">
        {payments.map((p) => (
          <li key={p.method} className="rep-pay-row">
            <span className="rep-pay-row__name">
              <span className={`rep-pay-row__dot rep-pay--${p.method}`} />
              {METHODS[p.method].label}
            </span>
            <Money value={p.total} className="rep-pay-row__amount" />
            <span className="rep-pay-row__share"><bdi>{p.share}%</bdi></span>
          </li>
        ))}
      </ul>

      {credit.total > 0 && (
        <div className="rep-callout">
          <AlertIcon size={18} />
          <div>
            <strong>مبيعات آجلة في الفترة: <Money value={credit.total} /></strong>
            <p>
              على {credit.customers} {credit.customers === 1 ? 'عميل' : 'عملاء'}
              {onNavigate && (
                <>
                  {' · '}
                  <button type="button" className="rep-link" onClick={() => onNavigate('customers')}>
                    عرض العملاء
                  </button>
                </>
              )}
            </p>
          </div>
        </div>
      )}
    </section>
  );
}

function TopItemsPanel({ report }) {
  const [sortBy, setSortBy] = useState('revenue');
  const items = sortBy === 'revenue' ? report.topSelling : report.topByQuantity;
  const max = Math.max(...items.map((i) => (sortBy === 'revenue' ? i.revenue : i.qtySold)), 1);

  return (
    <section className="rep-card rep-panel rep-top">
      <header className="rep-panel__head">
        <h2 className="rep-panel__title">الأصناف الأعلى مبيعًا</h2>
        <div className="rep-segment rep-segment--sm" role="tablist" aria-label="ترتيب الأصناف">
          {[{ key: 'revenue', label: 'بالإيراد' }, { key: 'quantity', label: 'بالكمية' }].map((tab) => (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={sortBy === tab.key}
              className={`rep-segment__btn${sortBy === tab.key ? ' is-active' : ''}`}
              onClick={() => setSortBy(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {items.length === 0 ? (
        <p className="rep-empty">لا توجد مبيعات في هذه الفترة</p>
      ) : (
        <table className="rep-top-table">
          <thead>
            <tr>
              <th scope="col" className="rep-top-table__rank">#</th>
              <th scope="col">الصنف</th>
              <th scope="col" className="rep-top-table__bar-col">{sortBy === 'revenue' ? 'نسبة من الإيراد' : 'نسبة من الكمية'}</th>
              <th scope="col">الكمية</th>
              <th scope="col">الإيراد</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => {
              const value = sortBy === 'revenue' ? item.revenue : item.qtySold;
              return (
                <tr key={item.productId}>
                  <td className="rep-top-table__rank">
                    <span className={`rep-rank${index < 3 ? ' rep-rank--top' : ''}`}>{index + 1}</span>
                  </td>
                  <td>
                    <span className="rep-top-table__name">{item.productName}</span>
                    {item.categoryName && <span className="rep-top-table__cat">{item.categoryName}</span>}
                  </td>
                  <td className="rep-top-table__bar-col">
                    <span className="rep-meter"><span style={{ inlineSize: `${(value / max) * 100}%` }} /></span>
                  </td>
                  <td className="rep-muted"><bdi>{numberFmt.format(item.qtySold)}</bdi></td>
                  <td><Money value={item.revenue} className="rep-strong" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function StaffPanel({ report }) {
  const max = Math.max(...report.staff.map((s) => s.total), 1);
  return (
    <section className="rep-card rep-panel rep-staff">
      <header className="rep-panel__head">
        <h2 className="rep-panel__title">أداء الموظفين</h2>
      </header>
      {report.staff.length === 0 ? (
        <p className="rep-empty">لا توجد مبيعات في هذه الفترة</p>
      ) : (
        <ul className="rep-staff-list">
          {report.staff.map((person) => (
            <li key={person.userId ?? 'none'} className="rep-staff-item">
              <div className="rep-staff-item__row">
                <span className="rep-avatar" aria-hidden="true">{(person.name || '؟').trim().charAt(0)}</span>
                <div className="rep-staff-item__info">
                  <span className="rep-staff-item__name">{person.name}</span>
                  <span className="rep-staff-item__meta">
                    <bdi>{person.invoiceCount}</bdi> فاتورة · متوسط <Money value={person.avgInvoice} />
                  </span>
                </div>
                <bdi className="rep-staff-item__total">{money(person.total)}</bdi>
              </div>
              <span className="rep-meter rep-meter--thin"><span style={{ inlineSize: `${(person.total / max) * 100}%` }} /></span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function pageNumbers(page, pageCount) {
  if (pageCount <= 5) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  const list = [...pages].filter((p) => p >= 1 && p <= pageCount).sort((a, b) => a - b);
  return list.flatMap((p, i) => (i > 0 && p - list[i - 1] > 1 ? ['…', p] : [p]));
}

function LedgerPanel({ periodParam, singleDay, onOpenInvoice }) {
  const [method, setMethod] = useState('all');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setSearch(searchInput.trim()), 300);
    return () => clearTimeout(id);
  }, [searchInput]);

  // Back to page 1 whenever the question changes.
  useEffect(() => { setPage(1); }, [periodParam, method, search]);

  useEffect(() => {
    let cancelled = false;
    reportsApi.getReportInvoices({ period: periodParam, method, search, page, pageSize: PAGE_SIZE })
      .then((result) => { if (!cancelled) { setData(result); setError(''); } })
      .catch((err) => { if (!cancelled) setError(err?.message || 'تعذر تحميل الفواتير'); });
    return () => { cancelled = true; };
  }, [periodParam, method, search, page]);

  const rows = data?.rows || [];
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;

  return (
    <section className="rep-card rep-panel rep-ledger">
      <header className="rep-ledger__head">
        <div className="rep-ledger__title">
          <h2 className="rep-panel__title">أحدث الفواتير</h2>
          {data && <span className="rep-pill"><bdi>{numberFmt.format(data.total)}</bdi> مستند</span>}
        </div>
        <div className="rep-ledger__tools">
          <label className="rep-search">
            <SearchIcon size={18} />
            <input
              type="search"
              value={searchInput}
              maxLength={60}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="ابحث برقم الفاتورة أو العميل أو الموظف أو المبلغ"
              aria-label="بحث في الفواتير"
            />
          </label>
          <div className="rep-segment" role="tablist" aria-label="تصفية حسب طريقة الدفع">
            {LEDGER_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={method === tab.key}
                className={`rep-segment__btn${method === tab.key ? ' is-active is-solid' : ''}`}
                onClick={() => setMethod(tab.key)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      {error ? (
        <p className="rep-empty rep-empty--error" role="alert">{error}</p>
      ) : (
        <div className="rep-table-wrap">
          <table className="rep-table">
            <thead>
              <tr>
                <th scope="col">رقم الفاتورة</th>
                <th scope="col">العميل</th>
                <th scope="col">الموظف</th>
                <th scope="col">الأصناف</th>
                <th scope="col">الدفع</th>
                <th scope="col">{singleDay ? 'الوقت' : 'التاريخ'}</th>
                <th scope="col">الإجمالي</th>
                <th scope="col"><span className="rep-sr">عرض</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const when = new Date(row.created_at.replace(' ', 'T'));
                const isReturn = row.kind === 'return';
                return (
                  <tr key={`${row.kind}-${row.id}`}>
                    <td className="rep-code">#{row.code}</td>
                    <td className="rep-strong">{row.customerName}</td>
                    <td className="rep-muted">{row.staffName}</td>
                    <td className="rep-muted"><bdi>{row.itemCount}</bdi> {isReturn ? 'قطعة' : 'صنف'}</td>
                    <td><span className={`rep-badge rep-badge--${METHODS[row.method]?.tone || 'cash'}`}>{METHODS[row.method]?.label || row.method}</span></td>
                    <td className="rep-muted">
                      {singleDay ? timeFmt.format(when) : `${shortDateFmt.format(when)} · ${timeFmt.format(when)}`}
                    </td>
                    <td><Money value={row.amount} className={isReturn ? 'rep-negative' : 'rep-strong'} /></td>
                    <td>
                      <button
                        type="button"
                        className="rep-icon-btn"
                        onClick={() => onOpenInvoice(row.saleId)}
                        aria-label={isReturn ? `عرض الفاتورة الأصلية للمرتجع ${row.code}` : `عرض الفاتورة ${row.code}`}
                        title={isReturn ? 'عرض الفاتورة الأصلية' : 'عرض الفاتورة'}
                      >
                        <EyeIcon size={18} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data && rows.length === 0 && <p className="rep-empty">لا توجد فواتير مطابقة</p>}
        </div>
      )}

      {data && data.total > 0 && (
        <footer className="rep-ledger__foot">
          <p className="rep-muted">
            عرض <bdi>{from}–{to}</bdi> من <bdi>{numberFmt.format(data.total)}</bdi> · إجمالي المعروض{' '}
            <Money value={data.amountTotal} className="rep-positive" />
          </p>
          {data.pageCount > 1 && (
            <nav className="rep-pager" aria-label="صفحات الفواتير">
              <button type="button" className="rep-pager__btn" disabled={page <= 1} onClick={() => setPage(page - 1)}>السابق</button>
              {pageNumbers(page, data.pageCount).map((p, i) => (p === '…'
                ? <span key={`gap-${i}`} className="rep-pager__gap">…</span>
                : (
                  <button
                    key={p}
                    type="button"
                    className={`rep-pager__btn rep-pager__num${p === page ? ' is-active' : ''}`}
                    aria-current={p === page ? 'page' : undefined}
                    onClick={() => setPage(p)}
                  >
                    {p}
                  </button>
                )))}
              <button type="button" className="rep-pager__btn" disabled={page >= data.pageCount} onClick={() => setPage(page + 1)}>التالي</button>
            </nav>
          )}
        </footer>
      )}
    </section>
  );
}

export default function SalesReportsView({ onNavigate }) {
  const [preset, setPreset] = useState('week');
  const [range, setRange] = useState(null); // { startDate, endDate } when a custom range is applied
  const [draft, setDraft] = useState({ startDate: '', endDate: '', userId: '' });
  const [userId, setUserId] = useState('');
  const [report, setReport] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [openSaleId, setOpenSaleId] = useState(null);

  const periodParam = useMemo(() => {
    const staff = userId ? { userId: Number(userId) } : {};
    if (range) return { ...range, ...staff };
    return userId ? { period: preset, ...staff } : preset;
  }, [preset, range, userId]);

  const loadReport = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await reportsApi.getReports(periodParam);
      // An older main process (app not restarted after an update) returns the old shape.
      if (!data?.kpis || !Array.isArray(data.trend) || !Array.isArray(data.payments)) {
        throw new Error('بيانات التقرير بصيغة قديمة. أغلق البرنامج وافتحه من جديد لتحميل التحديث.');
      }
      setReport(data);
      setDraft((d) => ({ ...d, startDate: data.startDate, endDate: data.endDate }));
    } catch (err) {
      setError(err?.message || 'تعذر تحميل التقارير');
    } finally {
      setLoading(false);
    }
  }, [periodParam]);

  useEffect(() => { loadReport(); }, [loadReport]);

  function choosePreset(key) {
    setRange(null);
    setPreset(key);
  }

  function applyFilters(event) {
    event.preventDefault();
    if (!draft.startDate || !draft.endDate) return;
    if (draft.startDate > draft.endDate) {
      setError('بداية الفترة يجب أن تسبق نهايتها');
      return;
    }
    if (!report || draft.startDate !== report.startDate || draft.endDate !== report.endDate) {
      setRange({ startDate: draft.startDate, endDate: draft.endDate });
    }
    setUserId(draft.userId);
  }

  async function exportExcel() {
    setNotice('');
    try {
      const result = await importExportApi.exportInvoices(periodParam);
      if (!result?.canceled) setNotice('تم تصدير الفواتير بنجاح');
    } catch (err) {
      setNotice(err?.message || 'تعذر التصدير');
    }
  }

  const presetLabel = range ? 'فترة مخصصة' : PRESETS.find((p) => p.key === preset)?.label;
  const k = report?.kpis;

  return (
    <section className="rep-page" dir="rtl">
      <header className="rep-header">
        <div>
          <nav className="rep-breadcrumb" aria-label="مسار الصفحة">
            <span>الرئيسية</span>
            <ChevronSideIcon size={14} />
            <span className="rep-breadcrumb__current">التقارير</span>
          </nav>
          <h1 className="rep-title">التقارير والتحليلات</h1>
          {report && (
            <p className="rep-subtitle">
              {presetLabel}: {describeRange(report.startDate, report.endDate)} · مقارنة بـ{' '}
              {describeRange(report.prevStartDate, report.prevEndDate)}
            </p>
          )}
        </div>
        <div className="rep-header__actions">
          <button type="button" className="rep-btn rep-btn--secondary" onClick={() => window.print()} disabled={!report}>
            <PrinterIcon size={18} /> طباعة PDF
          </button>
          <button type="button" className="rep-btn rep-btn--primary" onClick={exportExcel} disabled={!report}>
            <DownloadIcon size={18} /> تصدير Excel
          </button>
        </div>
      </header>

      {notice && <p className="rep-notice" role="status">{notice}</p>}

      <form className="rep-card rep-filters" onSubmit={applyFilters}>
        <div className="rep-segment" role="group" aria-label="الفترة">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={!range && preset === p.key}
              className={`rep-segment__btn${!range && preset === p.key ? ' is-active' : ''}`}
              onClick={() => choosePreset(p.key)}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="rep-filters__fields">
          <label className="rep-field">
            <span>من</span>
            <input type="date" value={draft.startDate} max={draft.endDate || undefined} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
          </label>
          <label className="rep-field">
            <span>إلى</span>
            <input type="date" value={draft.endDate} min={draft.startDate || undefined} onChange={(e) => setDraft({ ...draft, endDate: e.target.value })} />
          </label>
          <label className="rep-field">
            <span>الموظف</span>
            <span className="rep-select">
              <select value={draft.userId} onChange={(e) => setDraft({ ...draft, userId: e.target.value })}>
                <option value="">الكل</option>
                {(report?.staffOptions || []).map((s) => <option key={s.id} value={String(s.id)}>{s.name}</option>)}
              </select>
              <ChevronDownIcon size={16} />
            </span>
          </label>
          <button type="submit" className="rep-btn rep-btn--primary">تطبيق</button>
        </div>
      </form>

      {error && (
        <div className="rep-card rep-error" role="alert">
          <p>{error}</p>
          <button type="button" className="rep-btn rep-btn--secondary" onClick={loadReport}>إعادة المحاولة</button>
        </div>
      )}

      {loading && !report && <p className="rep-loading">جارٍ تحميل التقارير…</p>}

      {report && (
        <div className={`rep-body${loading ? ' is-loading' : ''}`} aria-busy={loading}>
          <div className="rep-kpis">
            <KpiCard
              icon={CurrencyIcon}
              tone="primary"
              label="صافي المبيعات"
              footer={<><Growth value={report.growth.sales} /><span>بعد خصم المرتجعات</span></>}
            >
              <Money value={k.netSales} />
            </KpiCard>
            <KpiCard
              icon={TrendUpIcon}
              tone="success"
              label="صافي الربح التقديري"
              footer={<><Growth value={report.growth.profit} /><span>هامش <bdi>{k.margin}%</bdi></span></>}
            >
              <Money value={k.profit} />
            </KpiCard>
            <KpiCard
              icon={FileTextIcon}
              tone="info"
              label="عدد الفواتير"
              footer={<><Growth value={report.growth.invoices} /><span><bdi>{report.invoicesPerDay}</bdi> فاتورة / يوم</span></>}
            >
              <bdi>{numberFmt.format(k.invoiceCount)}</bdi> <span className="rep-money__unit">فاتورة</span>
            </KpiCard>
            <KpiCard
              icon={BagIcon}
              tone="violet"
              label="متوسط الفاتورة"
              footer={<><Growth value={report.growth.avgInvoice} /><span>كان <Money value={report.prevKpis.avgInvoice} /></span></>}
            >
              <Money value={k.avgInvoice} />
            </KpiCard>
            <KpiCard
              icon={UndoIcon}
              tone="danger"
              label="المرتجعات والخصومات"
              footer={(
                <>
                  <span className="rep-growth rep-growth--down"><bdi>{k.returnCount}</bdi> مرتجع</span>
                  <span>خصومات <Money value={k.discounts} /> · <bdi>{report.returnRate}%</bdi></span>
                </>
              )}
            >
              <Money value={k.returnsTotal + k.discounts} />
            </KpiCard>
          </div>

          <div className="rep-grid rep-grid--wide-start">
            <TrendPanel report={report} />
            <PaymentsPanel report={report} onNavigate={onNavigate} />
          </div>

          <div className="rep-grid rep-grid--wide-start">
            <TopItemsPanel report={report} />
            <StaffPanel report={report} />
          </div>

          <LedgerPanel
            periodParam={periodParam}
            singleDay={report.startDate === report.endDate}
            onOpenInvoice={setOpenSaleId}
          />

          <p className="rep-integrity">
            الأرقام محسوبة من سجل المبيعات والمرتجعات كما سُجّلت، ولا يمكن تعديل فاتورة بعد حفظها — التصحيح يتم بمرتجع.
          </p>
        </div>
      )}

      {openSaleId && <InvoiceModal invoiceId={openSaleId} onClose={() => setOpenSaleId(null)} />}
    </section>
  );
}

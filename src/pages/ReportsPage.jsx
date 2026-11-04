import { useState, useEffect, useCallback } from 'react';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import CRMReportsPage from './CRMReportsPage.jsx';
import LawFirmReportsPage from '../components/legal/LawFirmReportsPage.jsx';

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function TrendChart({ data }) {
  if (!data || data.length === 0) {
    return <p className="cart-empty">لا توجد بيانات مبيعات كافية بعد</p>;
  }

  const width = 600;
  const height = 180;
  const max = Math.max(...data.map((d) => d.total), 1);
  const stepX = data.length > 1 ? width / (data.length - 1) : 0;

  const points = data
    .map((d, i) => {
      const x = i * stepX;
      const y = height - (d.total / max) * height;
      return `${x},${y}`;
    })
    .join(' ');

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="trend-chart" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F2600C" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#F2600C" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#trendFill)" />
        <polyline points={points} fill="none" stroke="#F2600C" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = i * stepX;
          const y = height - (d.total / max) * height;
          return <circle key={i} cx={x} cy={y} r="3.5" fill="#ffffff" stroke="#F2600C" strokeWidth="2" />;
        })}
      </svg>
      <div className="trend-labels">
        {data.map((d, i) => (
          <span key={i}>{d.day.slice(5)}</span>
        ))}
      </div>
    </div>
  );
}

const MEDALS = ['🥇', '🥈', '🥉'];

function TopSellingBar({ item, index, maxQty, animate }) {
  const pct = (item.qtySold / maxQty) * 100;
  return (
    <div className="top-selling-item">
      <div className="top-selling-info">
        <span className="top-selling-rank">{MEDALS[index] || `#${index + 1}`}</span>
        <span className="top-selling-name">{item.productName}</span>
        <span className="top-selling-qty">{item.qtySold} قطعة</span>
      </div>
      <div className="top-selling-bar-bg">
        <div
          className="top-selling-bar"
          style={{ width: animate ? `${pct}%` : '0%' }}
        />
      </div>
    </div>
  );
}

function PaymentBadge({ method }) {
  const map = {
    cash: { label: 'نقدي 💵', className: 'pay-cash' },
    card: { label: 'بطاقة 💳', className: 'pay-card' },
    credit: { label: 'آجل ⏳', className: 'pay-credit' },
  };
  const info = map[method] || { label: method || 'نقدي', className: 'pay-cash' };
  return <span className={`pay-pill ${info.className}`}>{info.label}</span>;
}

function GrowthBadge({ value }) {
  if (value === undefined || value === null) return null;
  if (value > 0) {
    return <span className="fox-stat-growth growth-up" title="مقارنة بالفترة السابقة">↑ +{value}%</span>;
  }
  if (value < 0) {
    return <span className="fox-stat-growth growth-down" title="مقارنة بالفترة السابقة">↓ {value}%</span>;
  }
  return <span className="fox-stat-growth growth-neutral" title="مقارنة بالفترة السابقة">0%</span>;
}

function InvoiceModal({ invoiceId, onClose }) {
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printing, setPrinting] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getSaleById(invoiceId)
      .then((data) => {
        if (!cancelled) {
          setSale(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error('فشل جلب الفاتورة:', err);
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [invoiceId]);

  const handlePrint = async () => {
    if (!sale) return;
    setPrinting(true);
    try {
      if (window.electronAPI?.printReceipt) {
        await window.electronAPI.printReceipt(sale);
      }
    } catch (err) {
      console.error('فشل طباعة الفاتورة:', err);
    } finally {
      setPrinting(false);
    }
  };

  const handleCopy = () => {
    const text = `#INV-${String(invoiceId).padStart(4, '0')}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formattedDate = sale?.created_at
    ? new Date(sale.created_at).toLocaleDateString('ar-EG', {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : '';

  const formattedTime = sale?.created_at
    ? new Date(sale.created_at).toLocaleTimeString('ar-EG', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      })
    : '';

  return (
    <div className="receipt-modal-backdrop" onClick={onClose}>
      <div className="receipt-sheet" onClick={(e) => e.stopPropagation()}>
        {/* رأسية الإيصال الفاخرة */}
        <div className="receipt-sheet-header">
          <div className="receipt-header-brand">
            <span className="receipt-tag-badge">فاتورة مبيعات معتمدة ✓</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <h2 className="receipt-sheet-title">#INV-{String(invoiceId).padStart(4, '0')}</h2>
              <button
                type="button"
                className="inv-copy-icon"
                style={{ opacity: 1, color: '#93c5fd', background: 'none', border: 'none' }}
                title="نسخ رقم الفاتورة"
                onClick={handleCopy}
              >
                {copied ? '✓' : '📋'}
              </button>
            </div>
            {formattedDate && (
              <span className="receipt-sheet-date">
                📅 {formattedDate} • ⏰ {formattedTime}
              </span>
            )}
          </div>
          <button type="button" className="receipt-close-btn" onClick={onClose} title="إغلاق">×</button>
        </div>

        {loading ? (
          <div style={{ padding: '50px 20px', textAlign: 'center', color: '#64748b' }}>
            جاري تحضير تفاصيل الفاتورة...
          </div>
        ) : sale ? (
          <>
            {/* بطاقة العميل وطريقة الدفع */}
            <div className="receipt-meta-capsule">
              <div className="receipt-customer-chip">
                <span>👤 {sale.customer_name || 'عميل نقدي سريع'}</span>
                {sale.customer_phone && <span className="phone">({sale.customer_phone})</span>}
              </div>
              <PaymentBadge method={sale.payment_method} />
            </div>

            {/* تفاصيل الأصناف */}
            <div className="receipt-body">
              <div className="receipt-items-list">
                {sale.items?.map((item, i) => (
                  <div key={i} className="receipt-item-row">
                    <div className="receipt-item-details">
                      <span className="receipt-item-name">{item.productName || 'صنف بدون اسم'}</span>
                      <div className="receipt-item-specs">
                        {item.size && <span className="receipt-spec-badge">المقاس: {item.size}</span>}
                        {item.color && <span className="receipt-spec-badge">اللون: {item.color}</span>}
                        {item.barcode && <span style={{ opacity: 0.7 }}>#{item.barcode}</span>}
                      </div>
                    </div>
                    <div className="receipt-item-pricing">
                      <span className="receipt-qty-badge">{item.quantity} × {item.unit_price}</span>
                      <span className="receipt-item-total">
                        {(item.quantity * item.unit_price).toLocaleString()} ج.م
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* الملخص المالي */}
              <div className="receipt-financial-summary">
                {sale.discount > 0 && (
                  <>
                    <div className="receipt-summary-line">
                      <span>المجموع الفرعي</span>
                      <span>{Number(sale.subtotal || (sale.total_amount + sale.discount)).toLocaleString()} ج.م</span>
                    </div>
                    <div className="receipt-summary-line discount">
                      <span>خصم خاص</span>
                      <span>- {Number(sale.discount).toLocaleString()} ج.م</span>
                    </div>
                  </>
                )}

                <div className="receipt-total-banner">
                  <span className="receipt-total-label">المبلغ المطلوب / المدفوع</span>
                  <span className="receipt-total-amount">{Number(sale.total_amount).toLocaleString()} ج.م</span>
                </div>
              </div>
            </div>

            {/* أزرار الإجراءات في الأسفل */}
            <div className="receipt-footer-actions">
              <button
                type="button"
                className="receipt-print-btn"
                onClick={handlePrint}
                disabled={printing}
              >
                <span>🖨️</span>
                <span>{printing ? 'جاري إرسال الأمر للطابعة...' : 'طباعة إيصال فوري'}</span>
              </button>
              <button type="button" className="receipt-dismiss-btn" onClick={onClose}>
                إغلاق
              </button>
            </div>
          </>
        ) : (
          <div style={{ padding: '40px', textAlign: 'center', color: '#ef4444' }}>
            تعذر تحميل بيانات الفاتورة
          </div>
        )}
      </div>
    </div>
  );
}

function SalesReportsPage() {
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState(() => {
    const today = getLocalDateString();
    return { startDate: today, endDate: today };
  });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [report, setReport] = useState(null);
  const [reportError, setReportError] = useState('');
  const [loading, setLoading] = useState(true);
  const [animateBars, setAnimateBars] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);
  const [invoiceSearch, setInvoiceSearch] = useState('');
  const [invoiceFilter, setInvoiceFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const INVOICES_PER_PAGE = 6;

  const activePeriodParam = isCustomMode ? customRange : period;

  const loadReport = useCallback(async (param = activePeriodParam) => {
    setLoading(true);
    setReportError('');
    setAnimateBars(false);
    try {
      const data = await window.electronAPI.getReports(param);
      setReport(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
      setReport(null);
      setReportError(err instanceof Error ? err.message : 'تعذر تحميل التقارير');
    } finally {
      setLoading(false);
      setTimeout(() => setAnimateBars(true), 50);
    }
  }, [activePeriodParam]);

  useEffect(() => {
    if (!isCustomMode) {
      const timeoutId = setTimeout(() => loadReport(period), 0);
      return () => clearTimeout(timeoutId);
    }
  }, [period, isCustomMode, loadReport]);

  function handlePeriodClick(p) {
    setIsCustomMode(false);
    setPeriod(p);
  }

  function handleCustomSubmit(e) {
    e.preventDefault();
    if (!customRange.startDate || !customRange.endDate) return;
    setIsCustomMode(true);
    loadReport(customRange);
  }

  async function handleExportInvoices() {
    try {
      const result = await window.electronAPI.exportInvoices(activePeriodParam);
      if (!result.canceled) alert('تم تصدير الفواتير بنجاح');
    } catch (err) {
      alert(err.message);
    }
  }

  const growth = report?.growth || {};
  const maxQty = report?.topSelling ? Math.max(...report.topSelling.map((p) => p.qtySold), 1) : 1;
  const profitMargin = (report?.totalSales > 0 && report?.estimatedProfit)
    ? Math.round((report.estimatedProfit / report.totalSales) * 100)
    : 0;

  const recentInvoices = report?.recentInvoices || [];
  const filteredInvoices = recentInvoices.filter((inv) => {
    const q = invoiceSearch.trim().toLowerCase();
    const code = `inv-${String(inv.id).padStart(4, '0')}`.toLowerCase();
    const matchesSearch =
      !q ||
      code.includes(q) ||
      inv.customerName?.toLowerCase().includes(q) ||
      String(inv.total_amount).includes(q);
    const matchesMethod = invoiceFilter === 'all' || inv.payment_method === invoiceFilter;
    return matchesSearch && matchesMethod;
  });

  const totalInvoicePages = Math.ceil(filteredInvoices.length / INVOICES_PER_PAGE) || 1;
  const paginatedInvoices = filteredInvoices.slice(
    (currentPage - 1) * INVOICES_PER_PAGE,
    currentPage * INVOICES_PER_PAGE
  );

  return (
    <div className="reports-fade-in">
      <div className="page-header-row" style={{ flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1>التقارير والتحليلات</h1>
          <p className="page-subtitle">
            الفترة الحالية: {report?.startDate} إلى {report?.endDate}
            {report?.prevStartDate && ` (مقارنة بـ: ${report.prevStartDate} إلى ${report.prevEndDate})`}
          </p>
        </div>

        <div className="reports-header-actions" style={{ flexWrap: 'wrap' }}>
          {/* الفلاتر السريعة */}
          <div className="period-toggle">
            <button
              className={!isCustomMode && period === 'today' ? 'active' : ''}
              onClick={() => handlePeriodClick('today')}
            >
              اليوم
            </button>
            <button
              className={!isCustomMode && period === 'yesterday' ? 'active' : ''}
              onClick={() => handlePeriodClick('yesterday')}
            >
              أمس
            </button>
            <button
              className={!isCustomMode && period === 'week' ? 'active' : ''}
              onClick={() => handlePeriodClick('week')}
            >
              آخر 7 أيام
            </button>
            <button
              className={!isCustomMode && period === 'month' ? 'active' : ''}
              onClick={() => handlePeriodClick('month')}
            >
              الشهر الحالي
            </button>
          </div>

          {/* فلتر التاريخ المخصص (Custom Date Range) */}
          <form onSubmit={handleCustomSubmit} className="custom-date-picker-row">
            <label>من:</label>
            <input
              type="date"
              className="custom-date-input"
              value={customRange.startDate}
              onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
            />
            <label>إلى:</label>
            <input
              type="date"
              className="custom-date-input"
              value={customRange.endDate}
              onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
            />
            <button type="submit" className="apply-date-btn">
              تطبيق
            </button>
          </form>

          <button className="secondary-btn" onClick={handleExportInvoices}>
            تصدير الفواتير (Excel)
          </button>
        </div>
      </div>

      {loading ? (
        <p style={{ marginTop: '20px', color: '#64748B' }}>جاري تحميل التقارير والبيانات الإحصائية...</p>
      ) : !report ? (
        <div role="alert" style={{ marginTop: '20px', color: '#B91C1C' }}>
          <p>{reportError || 'تعذر تحميل التقارير'}</p>
          <button type="button" className="secondary-btn" onClick={() => loadReport()}>
            إعادة المحاولة
          </button>
        </div>
      ) : (
        <>
          {/* كروت الإحصائيات الفاخرة مع مؤشرات النمو KPI Growth */}
          <div className="fox-stats-row">
            <div className="fox-stat-card fox-stat-blue">
              <div className="fox-stat-icon">💰</div>
              <span className="fox-stat-label">إجمالي المبيعات</span>
              <span className="fox-stat-value">{report.totalSales} ج.م</span>
              <div className="fox-stat-badges">
                <GrowthBadge value={growth.sales} />
              </div>
            </div>

            <div className="fox-stat-card fox-stat-green">
              <div className="fox-stat-icon">📈</div>
              <span className="fox-stat-label">صافي الربح التقديري</span>
              <span className="fox-stat-value">{report.estimatedProfit} ج.م</span>
              <div className="fox-stat-badges">
                <GrowthBadge value={growth.profit} />
                <span className="fox-margin-badge">هامش {profitMargin}%</span>
              </div>
            </div>

            <div className="fox-stat-card fox-stat-purple">
              <div className="fox-stat-icon">🧾</div>
              <span className="fox-stat-label">عدد الفواتير</span>
              <span className="fox-stat-value">{report.invoiceCount}</span>
              <div className="fox-stat-badges">
                <GrowthBadge value={growth.invoices} />
              </div>
            </div>

            <div className="fox-stat-card fox-stat-amber">
              <div className="fox-stat-icon">🛒</div>
              <span className="fox-stat-label">متوسط قيمة الفاتورة</span>
              <span className="fox-stat-value">{report.avgInvoice} ج.م</span>
            </div>
          </div>

          <div className="reports-grid">
            <div className="report-panel fox-hover-lift">
              <h3>المبيعات خلال الفترة</h3>
              <TrendChart data={report.trend} />
            </div>

            <div className="report-panel fox-hover-lift">
              <h3>الأكثر مبيعًا</h3>
              {report.topSelling.length === 0 && <p className="cart-empty">لا توجد مبيعات بعد</p>}
              {report.topSelling.map((p, i) => (
                <TopSellingBar key={i} item={p} index={i} maxQty={maxQty} animate={animateBars} />
              ))}
            </div>
          </div>

          <div className="invoices-header-wrap">
            <div className="invoices-title-row">
              <div className="invoices-title-group">
                <h3 className="invoices-main-title">أحدث الفواتير</h3>
                <span className="invoices-count-pill">{filteredInvoices.length} فاتورة</span>
              </div>
              {filteredInvoices.length > 0 && (
                <div className="invoices-summary-stat">
                  <span>إجمالي المعروض:</span>
                  <strong>
                    {filteredInvoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0).toLocaleString()} ج.م
                  </strong>
                </div>
              )}
            </div>

            {/* شريط البحث والفلترة السريعة */}
            <div className="invoices-toolbar">
              <div className="invoices-search-box">
                <span className="invoices-search-icon">🔍</span>
                <input
                  type="text"
                  className="invoices-search-input"
                  placeholder="ابحث برقم الفاتورة، اسم العميل، المبلغ..."
                  value={invoiceSearch}
                  onChange={(e) => setInvoiceSearch(e.target.value)}
                />
              </div>

              <div className="invoices-filter-tabs">
                {[
                  { key: 'all', label: 'الكل' },
                  { key: 'cash', label: '💵 نقدي' },
                  { key: 'card', label: '💳 بطاقة' },
                  { key: 'credit', label: '⏳ آجل' },
                ].map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    className={`invoices-tab-btn ${invoiceFilter === tab.key ? 'active' : ''}`}
                    onClick={() => setInvoiceFilter(tab.key)}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="invoices-dynamic-list">
            {paginatedInvoices.map((inv) => (
              <div
                key={inv.id}
                className={`invoice-row-card method-${inv.payment_method || 'cash'}`}
                onClick={() => setSelectedInvoiceId(inv.id)}
                title="اضغط لمعاينة وتفاصيل الفاتورة"
              >
                <div className="inv-main-info">
                  <div className="inv-icon-avatar">
                    {inv.payment_method === 'card' ? '💳' : inv.payment_method === 'credit' ? '⏳' : '💵'}
                  </div>
                  <div className="inv-code-group">
                    <div className="inv-code-row">
                      <span className="inv-id-badge">#INV-{String(inv.id).padStart(4, '0')}</span>
                      <span className="inv-customer-name">{inv.customerName || 'عميل نقدي سريع'}</span>
                    </div>
                    <div className="inv-meta-sub">
                      <span className="inv-items-chip">🛍️ {inv.itemCount || 1} صنف</span>
                      {inv.created_at && (
                        <span>⏰ {new Date(inv.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: true })}</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="inv-side-info">
                  <PaymentBadge method={inv.payment_method} />
                  <div className="inv-amount-block">
                    <span className="inv-amount-val">{Number(inv.total_amount).toLocaleString()} ج.م</span>
                    <span className="inv-date-val">📅 {inv.created_at?.split(' ')[0]}</span>
                  </div>
                  <button
                    type="button"
                    className="inv-action-btn"
                    title="معاينة الفاتورة"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedInvoiceId(inv.id);
                    }}
                  >
                    👁
                  </button>
                </div>
              </div>
            ))}

            {filteredInvoices.length === 0 && (
              <div className="invoices-empty-card">
                <span className="invoices-empty-icon">🧾</span>
                <p>لا توجد فواتير مطابقة للبحث أو الفلتر المحدد</p>
              </div>
            )}

            {totalInvoicePages > 1 && (
              <div className="invoices-pagination">
                <button
                  type="button"
                  className="inv-page-btn"
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                >
                  ‹ السابق
                </button>

                <div className="inv-page-numbers">
                  {Array.from({ length: totalInvoicePages }, (_, i) => i + 1).map((pageNum) => (
                    <button
                      key={pageNum}
                      type="button"
                      className={`inv-page-num ${currentPage === pageNum ? 'active' : ''}`}
                      onClick={() => setCurrentPage(pageNum)}
                    >
                      {pageNum}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="inv-page-btn"
                  disabled={currentPage === totalInvoicePages}
                  onClick={() => setCurrentPage((p) => Math.min(totalInvoicePages, p + 1))}
                >
                  التالي ›
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {selectedInvoiceId && (
        <InvoiceModal invoiceId={selectedInvoiceId} onClose={() => setSelectedInvoiceId(null)} />
      )}
    </div>
  );
}

function ReportsPage() {
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key
    || settings?.business_type
    || settings?.onboarding_sector
    || 'retail';

  if (profileKey === 'law_firm') return <LawFirmReportsPage />;
  return profileKey === 'crm' ? <CRMReportsPage /> : <SalesReportsPage />;
}

export default ReportsPage;

import { useState, useEffect, useCallback } from 'react';

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
            <stop offset="0%" stopColor="#2E5BFF" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#2E5BFF" stopOpacity="0" />
          </linearGradient>
        </defs>
        <polygon points={`0,${height} ${points} ${width},${height}`} fill="url(#trendFill)" />
        <polyline points={points} fill="none" stroke="#2E5BFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => {
          const x = i * stepX;
          const y = height - (d.total / max) * height;
          return <circle key={i} cx={x} cy={y} r="3.5" fill="#ffffff" stroke="#2E5BFF" strokeWidth="2" />;
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
    cash: { label: 'نقدي', className: 'pay-cash' },
    card: { label: 'بطاقة', className: 'pay-card' },
    credit: { label: 'آجل', className: 'pay-credit' },
  };
  const info = map[method] || { label: method, className: '' };
  return <span className={`pay-badge ${info.className}`}>{info.label}</span>;
}

function GrowthBadge({ value }) {
  if (value === undefined || value === null) return null;
  if (value > 0) {
    return <span className="onyx-stat-growth growth-up" title="مقارنة بالفترة السابقة">↑ +{value}%</span>;
  }
  if (value < 0) {
    return <span className="onyx-stat-growth growth-down" title="مقارنة بالفترة السابقة">↓ {value}%</span>;
  }
  return <span className="onyx-stat-growth growth-neutral" title="مقارنة بالفترة السابقة">0%</span>;
}

function InvoiceModal({ invoiceId, onClose }) {
  const [sale, setSale] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    window.electronAPI.getSaleById(invoiceId)
      .then((data) => {
        if (!cancelled) {
          setSale(data);
          setLoading(false);
        }
      })
      .catch((err) => console.error('فشل جلب الفاتورة:', err));
    return () => { cancelled = true; };
  }, [invoiceId]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>فاتورة #INV-{String(invoiceId).padStart(4, '0')}</h3>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>

        {loading ? (
          <p>جاري التحميل...</p>
        ) : sale ? (
          <>
            <div className="modal-meta">
              <span>{sale.customer_name || 'عميل نقدي سريع'}</span>
              <PaymentBadge method={sale.payment_method} />
            </div>
            <table className="modal-items-table">
              <thead>
                <tr><th>الصنف</th><th>الكمية</th><th>الإجمالي</th></tr>
              </thead>
              <tbody>
                {sale.items.map((item, i) => (
                  <tr key={i}>
                    <td>{item.productName} {item.size ? `(${item.size})` : ''}</td>
                    <td>{item.quantity}</td>
                    <td>{item.unit_price * item.quantity} ج.م</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="modal-total-row">
              <span>الإجمالي</span>
              <span>{sale.total_amount} ج.م</span>
            </div>
          </>
        ) : (
          <p>تعذر تحميل بيانات الفاتورة</p>
        )}
      </div>
    </div>
  );
}

function ReportsPage() {
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState({
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
  });
  const [isCustomMode, setIsCustomMode] = useState(false);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [animateBars, setAnimateBars] = useState(false);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  const activePeriodParam = isCustomMode ? customRange : period;

  const loadReport = useCallback(async (param = activePeriodParam) => {
    setLoading(true);
    setAnimateBars(false);
    try {
      const data = await window.electronAPI.getReports(param);
      setReport(data);
    } catch (err) {
      console.error('Failed to load reports:', err);
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

      {loading || !report ? (
        <p style={{ marginTop: '20px', color: '#64748B' }}>جاري تحميل التقارير والبيانات الإحصائية...</p>
      ) : (
        <>
          {/* كروت الإحصائيات الفاخرة مع مؤشرات النمو KPI Growth */}
          <div className="onyx-stats-row">
            <div className="onyx-stat-card onyx-stat-blue">
              <div className="onyx-stat-icon">💰</div>
              <span className="onyx-stat-label">إجمالي المبيعات</span>
              <span className="onyx-stat-value">{report.totalSales} ج.م</span>
              <div className="onyx-stat-badges">
                <GrowthBadge value={growth.sales} />
              </div>
            </div>

            <div className="onyx-stat-card onyx-stat-green">
              <div className="onyx-stat-icon">📈</div>
              <span className="onyx-stat-label">صافي الربح التقديري</span>
              <span className="onyx-stat-value">{report.estimatedProfit} ج.م</span>
              <div className="onyx-stat-badges">
                <GrowthBadge value={growth.profit} />
                <span className="onyx-margin-badge">هامش {profitMargin}%</span>
              </div>
            </div>

            <div className="onyx-stat-card onyx-stat-purple">
              <div className="onyx-stat-icon">🧾</div>
              <span className="onyx-stat-label">عدد الفواتير</span>
              <span className="onyx-stat-value">{report.invoiceCount}</span>
              <div className="onyx-stat-badges">
                <GrowthBadge value={growth.invoices} />
              </div>
            </div>

            <div className="onyx-stat-card onyx-stat-amber">
              <div className="onyx-stat-icon">🛒</div>
              <span className="onyx-stat-label">متوسط قيمة الفاتورة</span>
              <span className="onyx-stat-value">{report.avgInvoice} ج.م</span>
            </div>
          </div>

          <div className="reports-grid">
            <div className="report-panel onyx-hover-lift">
              <h3>المبيعات خلال الفترة</h3>
              <TrendChart data={report.trend} />
            </div>

            <div className="report-panel onyx-hover-lift">
              <h3>الأكثر مبيعًا</h3>
              {report.topSelling.length === 0 && <p className="cart-empty">لا توجد مبيعات بعد</p>}
              {report.topSelling.map((p, i) => (
                <TopSellingBar key={i} item={p} index={i} maxQty={maxQty} animate={animateBars} />
              ))}
            </div>
          </div>

          <h3 style={{ marginTop: '20px' }}>أحدث الفواتير</h3>
          <div className="invoices-cards">
            {report.recentInvoices.map((inv) => (
              <div key={inv.id} className="invoice-card onyx-hover-lift">
                <div className="invoice-card-main">
                  <span className="invoice-id-badge">#INV-{String(inv.id).padStart(4, '0')}</span>
                  <span className="invoice-customer">{inv.customerName}</span>
                  <span className="invoice-items">{inv.itemCount} صنف</span>
                </div>
                <div className="invoice-card-side">
                  <PaymentBadge method={inv.payment_method} />
                  <span className="invoice-amount">{inv.total_amount} ج.م</span>
                  <span className="invoice-date">{inv.created_at?.split(' ')[0]}</span>
                  <button
                    className="icon-btn"
                    title="معاينة الفاتورة"
                    onClick={() => setSelectedInvoiceId(inv.id)}
                  >
                    👁
                  </button>
                </div>
              </div>
            ))}
            {report.recentInvoices.length === 0 && (
              <p className="cart-empty">لا توجد فواتير بعد في هذه الفترة</p>
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

export default ReportsPage;

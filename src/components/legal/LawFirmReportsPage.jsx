import { useCallback, useEffect, useState } from 'react';
import '../../styles/lawFirmDashboard.css';

function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatMoney(value) {
  return `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;
}

const MOVEMENT_LABELS = {
  fee_payment: 'سداد أتعاب',
  retainer_deposit: 'إيداع أمانة',
  court_fee: 'رسوم محكمة',
  expert_fee: 'أمانة خبير',
  announcement_fee: 'رسوم إعلان',
  other_expense: 'مصروفات أخرى',
};

const MOVEMENTS_PER_PAGE = 50;

const STATUS_LABELS = {
  active_cases: 'قضايا نشطة ومؤجلة',
  judged_cases: 'قضايا صدر فيها حكم',
  closed_cases: 'قضايا مغلقة',
};

function getMovementSourceLabel(movement) {
  if (movement.type === 'retainer_deposit') return 'إيداع من الموكل';
  if (movement.type === 'fee_payment') return 'سداد من الموكل';
  return movement.paid_by_client ? 'من أمانة الموكل' : 'من المكتب';
}

function FinancialMovementsTable({ movements }) {
  return (
    <table className="law-dashboard-table">
      <thead><tr><th>التاريخ</th><th>القضية</th><th>المحكمة</th><th>الموكل</th><th>نوع الحركة</th><th>مصدر السداد</th><th>البيان</th><th>المبلغ</th><th>الإيصال</th></tr></thead>
      <tbody>
        {movements.map((movement) => (
          <tr key={movement.id}>
            <td>{movement.date}</td><td>{movement.case_number || '—'}</td><td>{movement.court_name || '—'}</td>
            <td>{movement.client_name || '—'}</td><td>{MOVEMENT_LABELS[movement.type] || movement.type}</td>
            <td>{getMovementSourceLabel(movement)}</td>
            <td>{movement.description || '—'}</td><td>{formatMoney(movement.amount)}</td>
            <td>{movement.receipt_number || '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ReportMetric({ title, value, hint, tone }) {
  return (
    <article className={`law-report-metric law-tone-${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </article>
  );
}

function downloadCsv(report) {
  const headers = ['التاريخ', 'رقم القضية', 'المحكمة', 'الموكل', 'نوع الحركة', 'مصدر السداد', 'البيان', 'المبلغ', 'رقم الإيصال'];
  const rows = (report.financialMovements || []).map((movement) => [
    movement.date,
    movement.case_number,
    movement.court_name,
    movement.client_name,
    MOVEMENT_LABELS[movement.type] || movement.type,
    getMovementSourceLabel(movement),
    movement.description,
    movement.amount,
    movement.receipt_number,
  ]);
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => {
      const text = String(value ?? '');
      const safeText = typeof value === 'string' && /^\s*[=+\-@]/.test(text)
        ? `'${text}`
        : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `تقرير-القضايا-${report.startDate}-${report.endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export default function LawFirmReportsPage() {
  const today = getLocalDateString();
  const [period, setPeriod] = useState('month');
  const [customMode, setCustomMode] = useState(false);
  const [customRange, setCustomRange] = useState({ startDate: today, endDate: today });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [movementPage, setMovementPage] = useState(0);

  const loadReport = useCallback(async (selectedPeriod = period) => {
    setLoading(true);
    setError('');
    try {
      const result = await window.electronAPI.getLegalCaseReport(selectedPeriod);
      setReport(result);
      setMovementPage(0);
    } catch (loadError) {
      console.error('تعذر تحميل التقرير القانوني:', loadError);
      setReport(null);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل التقرير القانوني');
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    if (!customMode) loadReport(period);
  }, [customMode, loadReport, period]);

  function applyCustomRange(event) {
    event.preventDefault();
    if (!customRange.startDate || !customRange.endDate || customRange.startDate > customRange.endDate) {
      setError('اختر نطاقًا زمنيًا صحيحًا.');
      return;
    }
    setCustomMode(true);
    loadReport(customRange);
  }

  function selectPeriod(value) {
    setCustomMode(false);
    setPeriod(value);
  }

  const cases = report?.caseStats || {};
  const sessions = report?.periodStats || {};
  const finance = report?.financialStats || {};
  const financialMovements = report?.financialMovements || [];
  const movementPageCount = Math.ceil(financialMovements.length / MOVEMENTS_PER_PAGE);
  const visibleMovements = financialMovements.slice(
    movementPage * MOVEMENTS_PER_PAGE,
    (movementPage + 1) * MOVEMENTS_PER_PAGE
  );

  return (
    <main className="law-dashboard-page law-reports-page" dir="rtl">
      <header className="law-dashboard-header">
        <div>
          <div className="law-dashboard-eyebrow">⚖️ مكتب المحاماة</div>
          <h1>التقارير القانونية</h1>
          <p>ملخص القضايا والجلسات والحركات المالية حسب الفترة والمحكمة.</p>
        </div>
        <button type="button" className="law-dashboard-button law-button-secondary" onClick={() => loadReport()}>
          تحديث التقرير
        </button>
      </header>

      <section className="law-report-controls" aria-label="فترة التقرير">
        <div className="law-report-periods">
          {[
            ['today', 'اليوم'],
            ['yesterday', 'أمس'],
            ['week', 'آخر 7 أيام'],
            ['month', 'الشهر الحالي'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={!customMode && period === value ? 'active' : ''}
              onClick={() => selectPeriod(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <form className="law-report-custom-range" onSubmit={applyCustomRange}>
          <label>من <input type="date" value={customRange.startDate} onChange={(event) => setCustomRange({ ...customRange, startDate: event.target.value })} /></label>
          <label>إلى <input type="date" value={customRange.endDate} onChange={(event) => setCustomRange({ ...customRange, endDate: event.target.value })} /></label>
          <button type="submit" className="law-dashboard-button law-button-primary">تطبيق</button>
        </form>
        {report && (
          <button type="button" className="law-dashboard-button law-button-secondary" onClick={() => downloadCsv(report)}>
            تصدير الحركات CSV
          </button>
        )}
      </section>

      {loading ? (
        <div className="law-dashboard-loading"><span className="law-dashboard-spinner" /> جاري إعداد التقرير القانوني...</div>
      ) : error ? (
        <div className="law-dashboard-error" role="alert">
          <strong>تعذر تحميل التقرير</strong><span>{error}</span>
          <button type="button" onClick={() => loadReport()}>إعادة المحاولة</button>
        </div>
      ) : report ? (
        <>
          <div className="law-report-period-caption">
            الفترة: {report.startDate} — {report.endDate}
            <button type="button" className="law-dashboard-link" onClick={() => window.print()}>طباعة التقرير</button>
          </div>
          <section className="law-report-metrics" aria-label="ملخص الفترة">
            <ReportMetric title="قضايا جديدة" value={Number(sessions.new_cases || 0)} hint="ملفات أُنشئت خلال الفترة" tone="blue" />
            <ReportMetric title="جلسات المحاكم" value={Number(sessions.total_sessions || 0)} hint={`${Number(sessions.scheduled_sessions || 0)} مجدولة · ${Number(sessions.postponed_sessions || 0)} مؤجلة`} tone="violet" />
            <ReportMetric title="أتعاب محصلة" value={formatMoney(finance.fees_collected)} hint="حركات سداد الأتعاب في الفترة" tone="green" />
            <ReportMetric title="أمانات موكلين" value={formatMoney(finance.client_deposits)} hint="معروضة منفصلة عن الأتعاب" tone="teal" />
            <ReportMetric title="مصروفات قضائية" value={formatMoney(finance.court_expenses)} hint={`${Number(finance.movement_count || 0)} حركة مالية`} tone="orange" />
            <ReportMetric title="مصروفات من الأمانة" value={formatMoney(finance.expenses_paid_from_retainer)} hint="تم سدادها من رصيد الموكل" tone="teal" />
            <ReportMetric title="مصروفات المكتب" value={formatMoney(finance.expenses_paid_by_office)} hint="مدفوعة من المكتب" tone="orange" />
          </section>

          <section className="law-report-panels">
            <article className="law-dashboard-panel">
              <div className="law-dashboard-panel-header">
                <div><span className="law-dashboard-panel-icon">📂</span><h2>حالة ملفات القضايا</h2><p>الرصيد الحالي لكافة ملفات المكتب</p></div>
              </div>
              <div className="law-report-status-list">
                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                  <div key={key}><span>{label}</span><strong>{Number(cases[key] || 0)}</strong></div>
                ))}
                <div><span>إجمالي قيمة العقود</span><strong>{formatMoney(cases.contract_value)}</strong></div>
                <div><span>إجمالي الأتعاب المسددة</span><strong>{formatMoney(cases.fees_collected_total)}</strong></div>
              </div>
            </article>

            <article className="law-dashboard-panel">
              <div className="law-dashboard-panel-header">
                <div><span className="law-dashboard-panel-icon">🏛️</span><h2>الجلسات حسب المحكمة</h2><p>توزيع جلسات الفترة المحددة</p></div>
              </div>
              {report.courtBreakdown.length ? (
                <div className="law-dashboard-table-wrap">
                  <table className="law-dashboard-table">
                    <thead><tr><th>المحكمة</th><th>الجلسات</th><th>مجدولة</th><th>مؤجلة</th><th>أحكام</th></tr></thead>
                    <tbody>
                      {report.courtBreakdown.map((court) => (
                        <tr key={court.court_name}>
                          <td>{court.court_name}</td><td>{court.sessions_count}</td>
                          <td>{court.scheduled_count}</td><td>{court.postponed_count}</td><td>{court.judged_count}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="law-dashboard-empty law-dashboard-empty-compact">لا توجد جلسات في الفترة المختارة.</div>}
            </article>
          </section>

          <section className="law-dashboard-panel law-dashboard-movements">
            <div className="law-dashboard-panel-header">
              <div><span className="law-dashboard-panel-icon">🧾</span><h2>الحركات المالية للقضايا</h2><p>كل الحركات المسجلة في النطاق الزمني المحدد ({financialMovements.length})</p></div>
            </div>
            {financialMovements.length ? (
              <>
                <div className="law-dashboard-table-wrap law-report-paged-table-wrap">
                  <FinancialMovementsTable movements={visibleMovements} />
                  {movementPageCount > 1 && (
                    <div className="law-report-pagination" aria-label="صفحات الحركات المالية">
                      <button
                        type="button"
                        className="law-dashboard-button law-button-secondary"
                        disabled={movementPage === 0}
                        onClick={() => setMovementPage((page) => page - 1)}
                      >
                        السابق
                      </button>
                      <span>صفحة {movementPage + 1} من {movementPageCount}</span>
                      <button
                        type="button"
                        className="law-dashboard-button law-button-secondary"
                        disabled={movementPage + 1 >= movementPageCount}
                        onClick={() => setMovementPage((page) => page + 1)}
                      >
                        التالي
                      </button>
                    </div>
                  )}
                </div>
                <div className="law-report-print-table">
                  <div className="law-dashboard-table-wrap">
                    <FinancialMovementsTable movements={financialMovements} />
                  </div>
                </div>
              </>
            ) : <div className="law-dashboard-empty law-dashboard-empty-compact">لا توجد حركات مالية مسجلة خلال الفترة.</div>}
          </section>
        </>
      ) : null}
    </main>
  );
}

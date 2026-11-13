import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import * as reportsApi from '../../api/reports.js';
import LegalIcon from './LegalIcon.jsx';
import LegalAmbient from './LegalAmbient.jsx';
import LegalModalShell from './LegalModalShell.jsx';
import LegalReportDocument, { movementKind, longDay } from './LegalReportDocument.jsx';
import '../../styles/legalMotion.css';
import '../../styles/lawFirmToday.css';
import '../../styles/lawFirmReports.css';

const PERIODS = [['today', 'اليوم'], ['yesterday', 'أمس'], ['week', 'آخر ٧ أيام'], ['month', 'الشهر الحالي']];
const TABS = [['all', 'الكل'], ['fees', 'أتعاب'], ['retainers', 'أمانات'], ['expenses', 'مصروفات']];
const TAB_TYPES = { fees: ['fee_payment'], retainers: ['retainer_deposit'] };
const PAGE_SIZE = 8;
const TOP_COURTS = 4;

const n = (value) => Number(value || 0).toLocaleString('ar-EG');
const amount = (value) => n(Math.round(Number(value) || 0));
const toDate = (value) => new Date(String(value).replace(' ', 'T'));
const dayMonth = (value) => toDate(value).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
const clock = (date) => date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

function Money({ value, className = '' }) {
  return <span className={`lr-money ${className}`}><b>{amount(value)}</b> <small>ج.م</small></span>;
}

// Numbers roll up to their new value instead of jumping.
function useCountUp(target) {
  const [value, setValue] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    if (reduceMotion()) { setValue(target); from.current = target; return undefined; }
    const begin = from.current;
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const progress = Math.min(1, (now - start) / 700);
      setValue(begin + (target - begin) * (1 - (1 - progress) ** 3));
      if (progress < 1) frame = requestAnimationFrame(step);
    });
    return () => { cancelAnimationFrame(frame); from.current = target; };
  }, [target]);
  return value;
}

function CountUp({ value, money = false }) {
  const shown = useCountUp(Number(value) || 0);
  // Big counts use Latin digits like the approved mockup: a lone Arabic zero "٠" reads as a stray dot.
  return money ? <Money value={shown} /> : <b className="lr-count">{Math.round(shown).toLocaleString('en-US')}</b>;
}

// "+3" / "−2" / "=" against the previous period; `inverse` for costs, where going up is bad.
function countDelta(current, previous, inverse = false) {
  const diff = Number(current || 0) - Number(previous || 0);
  if (!diff) return { label: '=', tone: 'muted' };
  const good = inverse ? diff < 0 : diff > 0;
  return { label: `${diff > 0 ? '+' : '−'}${n(Math.abs(diff))}`, tone: good ? 'success' : 'danger' };
}

function percentDelta(current, previous, inverse = false) {
  const cur = Number(current || 0);
  const prev = Number(previous || 0);
  if (!prev) return cur ? { label: 'جديد', tone: inverse ? 'warning' : 'success' } : { label: 'ثابتة', tone: 'accent' };
  const pct = Math.round(((cur - prev) / prev) * 100);
  if (!pct) return { label: 'ثابتة', tone: 'accent' };
  const good = inverse ? pct < 0 : pct > 0;
  return { label: `${pct > 0 ? '+' : '−'}${n(Math.abs(pct))}٪`, tone: good ? 'success' : 'warning' };
}

function ReportCard({ label, value, money, hint, badge, tone = 'primary', index, onClick }) {
  return (
    <button type="button" className={`lr-card lr-tone-${tone}`} style={{ '--i': index }} onClick={onClick}>
      <span className="lr-card-top">
        <span className="lr-card-label">{label}</span>
        <span className={`lt-pill lt-pill--${badge.tone}`}>{badge.label}</span>
      </span>
      <strong className="lr-card-value"><CountUp value={value} money={money} /></strong>
      <small className="lr-card-hint">{hint}</small>
    </button>
  );
}

function downloadCsv(report) {
  const headers = ['التاريخ', 'رقم القضية', 'المحكمة', 'الموكل', 'نوع الحركة', 'البيان', 'وارد', 'منصرف', 'رقم الإيصال'];
  const rows = (report.financialMovements || []).map((movement) => {
    const kind = movementKind(movement);
    return [
      movement.date, movement.case_number, movement.court_name, movement.client_name, kind.label,
      movement.description, kind.sign > 0 ? movement.amount : '', kind.sign < 0 ? movement.amount : '',
      movement.receipt_number,
    ];
  });
  const csv = [headers, ...rows]
    .map((row) => row.map((value) => {
      const text = String(value ?? '');
      // Excel formula injection: a leading = + - @ in text is neutralised.
      const safeText = typeof value === 'string' && /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
      return `"${safeText.replace(/"/g, '""')}"`;
    }).join(','))
    .join('\r\n');
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `تقرير-القضايا-${report.startDate}-${report.endDate}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function MovementWindow({ movement, onClose, onOpenCase, onFilterClient }) {
  const kind = movementKind(movement);
  const rows = [
    ['النوع', <span key="k" className={`lt-pill lt-pill--${kind.tone}`}>{kind.label}</span>],
    ['التاريخ', `${longDay(movement.date)} · ${clock(toDate(movement.date))}`],
    ['القضية', movement.case_number || '—'],
    ['المحكمة', movement.court_name || '—'],
    ['الموكل', movement.client_name || '—'],
    ['مصدر السداد', kind.source],
    ['رقم الإيصال', movement.receipt_number || '—'],
    ['سجّلها', movement.recorded_by_name || '—'],
  ];
  return (
    <LegalModalShell onClose={onClose} labelledBy="lr-movement-title" size="md" className="lr-window">
      {(close) => (
        <>
          <header className="legal-sheet-head">
            <div>
              <span className="legal-sheet-eyebrow">حركة مالية · {movement.case_subject || 'قضية'}</span>
              <h2 id="lr-movement-title">{movement.description || kind.label}</h2>
            </div>
            <button type="button" className="legal-x" onClick={close} aria-label="إغلاق"><LegalIcon name="close" size={18} /></button>
          </header>
          <div className="lr-window-body legal-rise">
            <div className={`lr-window-amount ${kind.sign > 0 ? 'is-in' : 'is-out'}`}>
              <span>{kind.sign > 0 ? 'وارد للمكتب' : 'منصرف'}</span>
              <Money value={movement.amount} />
            </div>
            <dl className="lr-window-grid">
              {rows.map(([term, value]) => (
                <div key={term}><dt>{term}</dt><dd>{value}</dd></div>
              ))}
            </dl>
            <div className="lr-window-actions">
              {movement.client_id && (
                <button type="button" className="legal-btn" onClick={() => { onFilterClient(movement.client_id); close(); }}>
                  كل حركات الموكل
                </button>
              )}
              {movement.case_id && (
                <button type="button" className="legal-btn legal-btn--primary" onClick={() => onOpenCase(movement.case_id)}>
                  فتح ملف القضية <LegalIcon name="chevronLeft" size={16} />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </LegalModalShell>
  );
}

function PrintPreview({ report, onClose }) {
  return (
    <LegalModalShell onClose={onClose} labelledBy="lr-preview-title" className="lr-preview">
      {(close) => (
        <>
          <header className="legal-sheet-head">
            <div>
              <span className="legal-sheet-eyebrow">معاينة قبل الطباعة · A4</span>
              <h2 id="lr-preview-title">تقرير النشاط القضائي والمالي</h2>
            </div>
            <div className="lr-preview-actions">
              <button type="button" className="legal-btn legal-btn--primary" onClick={() => window.print()}>
                <LegalIcon name="printer" size={18} /> طباعة
              </button>
              <button type="button" className="legal-x" onClick={close} aria-label="إغلاق"><LegalIcon name="close" size={18} /></button>
            </div>
          </header>
          <div className="lr-preview-stage">
            <LegalReportDocument report={report} />
          </div>
        </>
      )}
    </LegalModalShell>
  );
}

export default function LawFirmReportsPage({ onNavigate }) {
  const [query, setQuery] = useState({ period: 'month' });
  const [draft, setDraft] = useState({ startDate: '', endDate: '', courtName: '', clientId: '' });
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState(null);
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(0);
  const [movement, setMovement] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const movementsRef = useRef(null);
  const startInputRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await reportsApi.getLegalCaseReport(query);
      setReport(result);
      setLoadedAt(new Date());
      setPage(0);
      setDraft((current) => ({ ...current, startDate: result.startDate, endDate: result.endDate }));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل التقرير القانوني');
    } finally {
      setLoading(false);
    }
  }, [query]);

  useEffect(() => { load(); }, [load]);

  const filters = {
    ...(query.courtName ? { courtName: query.courtName } : {}),
    ...(query.clientId ? { clientId: query.clientId } : {}),
  };
  const selectPeriod = (period) => setQuery({ period, ...filters });
  const applyDraft = (event) => {
    event.preventDefault();
    if (!draft.startDate || !draft.endDate || draft.startDate > draft.endDate) {
      setError('اختر نطاقًا زمنيًا صحيحًا: البداية قبل النهاية.');
      return;
    }
    const sameRange = report && draft.startDate === report.startDate && draft.endDate === report.endDate && query.period;
    setQuery({
      ...(sameRange ? { period: query.period } : { startDate: draft.startDate, endDate: draft.endDate }),
      ...(draft.courtName ? { courtName: draft.courtName } : {}),
      ...(draft.clientId ? { clientId: Number(draft.clientId) } : {}),
    });
  };
  // Clicking a court bar, a client or a filter chip narrows (or widens) the whole report at once.
  const setFilter = (patch) => {
    const next = { ...query, ...patch };
    Object.keys(patch).forEach((key) => { if (!patch[key]) delete next[key]; });
    setQuery(next);
    setDraft((current) => ({ ...current, courtName: next.courtName || '', clientId: next.clientId ? String(next.clientId) : '' }));
  };
  const showMovements = (nextTab) => {
    setTab(nextTab);
    setPage(0);
    movementsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };
  const openCase = (caseId) => onNavigate?.('cases', { caseId });

  const movements = report?.financialMovements;
  const ledger = useMemo(() => {
    const list = (movements || []).filter((item) => {
      if (tab === 'all') return true;
      if (TAB_TYPES[tab]) return TAB_TYPES[tab].includes(item.type);
      return !['fee_payment', 'retainer_deposit'].includes(item.type);
    });
    // Running balance from the oldest movement in view, shown newest first.
    const totals = { totalIn: 0, totalOut: 0, balance: 0 };
    const rows = [];
    for (let index = list.length - 1; index >= 0; index -= 1) {
      const kind = movementKind(list[index]);
      const value = Number(list[index].amount) || 0;
      if (kind.sign > 0) totals.totalIn += value; else totals.totalOut += value;
      totals.balance += kind.sign * value;
      rows.unshift({ ...list[index], kind, balance: totals.balance });
    }
    return { rows, ...totals };
  }, [movements, tab]);

  if (!report && loading) {
    return (
      <main className="legal-ds lt-page lr-page" dir="rtl" aria-busy="true">
        <div className="lr-skeleton" aria-label="جاري إعداد التقرير القانوني">
          <i /><i /><i /><i /><b />
        </div>
      </main>
    );
  }

  if (!report) {
    return (
      <main className="legal-ds lt-page lr-page" dir="rtl">
        <div className="lt-state lt-state--error" role="alert">
          <strong>تعذر تحميل التقرير</strong>
          <span>{error}</span>
          <button type="button" className="legal-btn legal-btn--primary" onClick={load}>إعادة المحاولة</button>
        </div>
      </main>
    );
  }

  const sessions = report.periodStats || {};
  const finance = report.financialStats || {};
  const prevSessions = report.previous?.periodStats || {};
  const prevFinance = report.previous?.financialStats || {};
  const office = report.office || {};
  const cases = report.caseStats || {};
  const critical = Number(office.poa_expiring || 0) + Number(office.appeal_deadlines || 0);
  const days = report.previous?.days || 1;
  const courtName = report.filters?.courtName;
  const clientId = report.filters?.clientId;
  const clientName = report.filterOptions?.clients?.find((client) => client.id === clientId)?.name;

  const courts = report.courtBreakdown || [];
  const totalSessions = courts.reduce((sum, court) => sum + Number(court.sessions_count || 0), 0);
  const courtBars = courts.slice(0, TOP_COURTS);
  const otherSessions = courts.slice(TOP_COURTS).reduce((sum, court) => sum + Number(court.sessions_count || 0), 0);
  const maxSessions = Math.max(1, ...courts.map((court) => Number(court.sessions_count || 0)));

  const pageCount = Math.max(1, Math.ceil(ledger.rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = ledger.rows.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);
  const isCustom = !query.period;

  return (
    <main className="legal-ds lt-page lr-page" dir="rtl">
      <LegalAmbient />

      <header className="lt-hero lr-hero">
        <span className="lt-hero-icon"><LegalIcon name="chart" size={26} /></span>
        <div className="lt-hero-text">
          <span className="legal-sheet-eyebrow">مكتب المحاماة</span>
          <h1>التقارير القانونية</h1>
          <p>ملخص القضايا والجلسات والحركات المالية حسب الفترة والمحكمة.</p>
        </div>
        <div className="lt-hero-actions">
          {loadedAt && (
            <span className="lr-stamp" role="status">
              <i aria-hidden="true" /> آخر تحديث {clock(loadedAt)}
            </span>
          )}
          <button type="button" className="legal-btn" onClick={load} disabled={loading}>
            <LegalIcon name="refresh" size={16} /> تحديث
          </button>
          <button type="button" className="legal-btn" onClick={() => setPreviewing(true)}>
            <LegalIcon name="printer" size={16} /> طباعة
          </button>
          <button type="button" className="legal-btn legal-btn--primary" onClick={() => downloadCsv(report)} disabled={!movements?.length}>
            تصدير CSV
          </button>
        </div>
        {loading && <span className="lt-hero-progress" role="status" aria-label="جاري التحديث" />}
      </header>

      <form className="lr-filters" onSubmit={applyDraft} aria-label="فترة التقرير والتصفية">
        <div className="lr-chips" role="group" aria-label="الفترة">
          {PERIODS.map(([value, label]) => (
            <button type="button" key={value} className={query.period === value ? 'is-active' : ''} onClick={() => selectPeriod(value)}>
              {label}
            </button>
          ))}
          <button type="button" className={isCustom ? 'is-active' : ''} onClick={() => startInputRef.current?.showPicker?.() ?? startInputRef.current?.focus()}>
            مخصص
          </button>
        </div>
        <div className="lr-range">
          <label>
            <span>من</span>
            <input ref={startInputRef} type="date" value={draft.startDate} max={draft.endDate || undefined}
              onChange={(event) => setDraft({ ...draft, startDate: event.target.value })} />
          </label>
          <label>
            <span>إلى</span>
            <input type="date" value={draft.endDate} min={draft.startDate || undefined}
              onChange={(event) => setDraft({ ...draft, endDate: event.target.value })} />
          </label>
        </div>
        <label className="lr-select">
          <select aria-label="المحكمة" value={draft.courtName} onChange={(event) => setDraft({ ...draft, courtName: event.target.value })}>
            <option value="">كل المحاكم</option>
            {(report.filterOptions?.courts || []).map((court) => <option key={court} value={court}>{court}</option>)}
          </select>
        </label>
        <label className="lr-select">
          <select aria-label="الموكل" value={draft.clientId} onChange={(event) => setDraft({ ...draft, clientId: event.target.value })}>
            <option value="">كل الموكلين</option>
            {(report.filterOptions?.clients || []).map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
          </select>
        </label>
        <button type="submit" className="legal-btn legal-btn--primary lr-apply">تطبيق</button>
      </form>

      {error && <div className="lr-alert" role="alert"><LegalIcon name="alert" size={16} /> {error}</div>}

      <div className="lr-caption">
        <span>
          الفترة: <strong>{longDay(report.startDate)} — {longDay(report.endDate)}</strong> · {n(days)} {days >= 3 && days <= 10 ? 'أيام' : 'يوم'}
        </span>
        {courtName && (
          <button type="button" className="lr-filter-chip" onClick={() => setFilter({ courtName: '' })}>
            {courtName} <LegalIcon name="close" size={12} />
          </button>
        )}
        {clientName && (
          <button type="button" className="lr-filter-chip" onClick={() => setFilter({ clientId: '' })}>
            {clientName} <LegalIcon name="close" size={12} />
          </button>
        )}
        <small>المقارنة مع الفترة السابقة بنفس الطول</small>
      </div>

      <h2 className="lr-section-title">النشاط القضائي</h2>
      <section className="lr-cards" aria-label="النشاط القضائي">
        <ReportCard index={0} label="قضايا جديدة" value={sessions.new_cases}
          badge={countDelta(sessions.new_cases, prevSessions.new_cases)} hint="ملفات أُنشئت خلال الفترة"
          onClick={() => onNavigate?.('cases')} />
        <ReportCard index={1} label="جلسات المحاكم" value={sessions.total_sessions}
          badge={countDelta(sessions.total_sessions, prevSessions.total_sessions)}
          hint={`${n(sessions.attended_sessions)} محضورة · ${n(sessions.postponed_sessions)} مؤجلة`}
          onClick={() => document.getElementById('lr-courts')?.scrollIntoView({ behavior: 'smooth', block: 'center' })} />
        <ReportCard index={2} label="أحكام صدرت" value={sessions.judged_sessions}
          badge={countDelta(sessions.judged_sessions, prevSessions.judged_sessions)}
          hint={`${n(sessions.favorable_verdicts)} لصالح المكتب`} onClick={() => onNavigate?.('cases')} />
        <ReportCard index={3} label="مواعيد حرجة" value={critical} tone={critical ? 'danger' : 'primary'}
          badge={critical ? { label: 'انتبه', tone: 'danger' } : { label: 'تمام', tone: 'success' }}
          hint={`${n(office.poa_expiring)} توكيلات · ${n(office.appeal_deadlines)} مواعيد طعن`}
          onClick={() => onNavigate?.('today')} />
      </section>

      <h2 className="lr-section-title">الحركة المالية</h2>
      <section className="lr-cards" aria-label="الحركة المالية">
        <ReportCard index={4} money tone="success" label="أتعاب محصلة" value={finance.fees_collected}
          badge={percentDelta(finance.fees_collected, prevFinance.fees_collected)} hint="حركات سداد الأتعاب"
          onClick={() => showMovements('fees')} />
        <ReportCard index={5} money label="أمانات موكلين" value={finance.client_deposits}
          badge={{ label: `${n(finance.deposit_clients)} موكلين`, tone: 'accent' }} hint="مبالغ منفصلة عن الأتعاب"
          onClick={() => showMovements('retainers')} />
        <ReportCard index={6} money label="مصروفات قضائية" value={finance.court_expenses}
          badge={percentDelta(finance.court_expenses, prevFinance.court_expenses, true)} hint="رسوم وخبراء وإعلانات"
          onClick={() => showMovements('expenses')} />
        <ReportCard index={7} money label="مصروفات المكتب" value={finance.expenses_paid_by_office}
          badge={percentDelta(finance.expenses_paid_by_office, prevFinance.expenses_paid_by_office, true)}
          hint="مدفوعة من حساب المكتب" onClick={() => showMovements('expenses')} />
      </section>

      <section className="lr-balance" aria-label="موقف المكتب">
        <div className="lr-balance-figures">
          <div>
            <span>صافي دخل المكتب</span>
            <strong className={finance.office_net < 0 ? 'is-negative' : 'is-positive'}><CountUp money value={finance.office_net} /></strong>
          </div>
          <div>
            <span>رصيد أمانات الموكلين</span>
            <strong className="is-primary"><CountUp money value={office.retainer_balance} /></strong>
          </div>
          <div>
            <span>أتعاب متأخرة</span>
            <strong className="is-negative"><CountUp money value={office.overdue_fees} /></strong>
          </div>
        </div>
        <p><LegalIcon name="info" size={16} /> الأمانة فلوس الموكل مش إيراد — بتتخصم منها المصروفات القضائية ويفضل الباقي ملكه.</p>
      </section>

      <div className="lr-panels">
        <section className="lt-panel lr-panel" id="lr-courts">
          <div className="lt-panel-head">
            <div><h2>الجلسات حسب المحكمة</h2><p>{n(totalSessions)} جلسة في الفترة المحددة</p></div>
          </div>
          {courtBars.length ? (
            <ul className="lr-bars">
              {courtBars.map((court, index) => (
                <li key={court.court_name} style={{ '--i': index }}>
                  <button type="button" className={court.court_name === courtName ? 'is-active' : ''}
                    onClick={() => setFilter({ courtName: court.court_name === courtName ? '' : court.court_name })}
                    title="عرض التقرير لهذه المحكمة فقط">
                    <span className="lr-bar-label"><span>{court.court_name}</span><b>{n(court.sessions_count)}</b></span>
                    <span className="lr-bar-track"><i style={{ inlineSize: `${(court.sessions_count / maxSessions) * 100}%` }} /></span>
                  </button>
                </li>
              ))}
              {otherSessions > 0 && (
                <li style={{ '--i': TOP_COURTS }}>
                  <div className="lr-bar-static">
                    <span className="lr-bar-label"><span>محاكم أخرى</span><b>{n(otherSessions)}</b></span>
                    <span className="lr-bar-track"><i style={{ inlineSize: `${(otherSessions / maxSessions) * 100}%` }} /></span>
                  </div>
                </li>
              )}
            </ul>
          ) : <p className="lt-side-empty">لا توجد جلسات في الفترة المختارة.</p>}
        </section>

        <section className="lt-panel lr-panel">
          <div className="lt-panel-head">
            <div><h2>حالة ملفات القضايا</h2><p>الرصيد الحالي لكافة ملفات المكتب</p></div>
          </div>
          <ul className="lr-status">
            <li className="lr-dot-primary"><span>قضايا نشطة ومؤجلة</span><b>{n(cases.active_cases)}</b></li>
            <li className="lr-dot-success"><span>قضايا صدر فيها حكم</span><b>{n(cases.judged_cases)}</b></li>
            <li className="lr-dot-muted"><span>قضايا مغلقة</span><b>{n(cases.closed_cases)}</b></li>
            <li className="lr-dot-primary"><span>إجمالي قيمة العقود</span><Money value={cases.contract_value} /></li>
            <li className="lr-dot-primary"><span>إجمالي الأتعاب المسددة</span><Money value={cases.fees_collected_total} /></li>
          </ul>
        </section>

        <section className="lt-panel lr-panel">
          <div className="lt-panel-head">
            <div><h2>أعلى الموكلين تحصيلًا</h2><p>خلال الفترة</p></div>
          </div>
          {report.topClients?.length ? (
            <ul className="lr-clients">
              {report.topClients.slice(0, 4).map((client, index) => (
                <li key={client.id} style={{ '--i': index }}>
                  <button type="button" className={client.id === clientId ? 'is-active' : ''}
                    onClick={() => setFilter({ clientId: client.id === clientId ? '' : client.id })}
                    title="عرض التقرير لهذا الموكل فقط">
                    <span className="lr-avatar" aria-hidden="true">{String(client.name || '؟').trim().charAt(0)}</span>
                    <span className="lr-client-name"><strong>{client.name}</strong><small>{n(client.cases_count)} قضايا</small></span>
                    <Money value={client.collected} className="is-primary" />
                  </button>
                </li>
              ))}
            </ul>
          ) : <p className="lt-side-empty">لا توجد أتعاب محصلة في الفترة.</p>}
        </section>
      </div>

      <section className="lt-panel lt-movements lr-movements" ref={movementsRef}>
        <div className="lt-panel-head">
          <div>
            <h2>الحركات المالية للقضايا</h2>
            <p>كل الحركات المسجلة في النطاق الزمني ({n(movements?.length)} حركة)</p>
          </div>
          <div className="lr-tabs" role="tablist" aria-label="نوع الحركة">
            {TABS.map(([value, label]) => (
              <button type="button" role="tab" key={value} aria-selected={tab === value}
                className={tab === value ? 'is-active' : ''} onClick={() => { setTab(value); setPage(0); }}>
                {label}
              </button>
            ))}
          </div>
        </div>
        {ledger.rows.length ? (
          <>
            <div className="lt-table-wrap">
              <table className="lt-table lr-table">
                <thead>
                  <tr>
                    <th>التاريخ</th><th>البيان</th><th>الموكل</th><th>القضية</th><th>النوع</th>
                    <th className="is-num">وارد</th><th className="is-num">منصرف</th><th className="is-num">الرصيد</th>
                  </tr>
                </thead>
                <tbody key={`${tab}-${safePage}`}>
                  {visible.map((item, index) => (
                    <tr key={item.id} style={{ '--i': index }} onClick={() => setMovement(item)} tabIndex={0}
                      onKeyDown={(event) => { if (event.key === 'Enter') setMovement(item); }}>
                      <td className="lt-muted-cell">{dayMonth(item.date)}</td>
                      <td><strong>{item.description || item.kind.label}</strong></td>
                      <td className="lt-muted-cell">{item.client_name || '—'}</td>
                      <td className="lt-muted-cell">{item.case_number || '—'}</td>
                      <td><span className={`lt-pill lt-pill--${item.kind.tone}`}>{item.kind.label}</span></td>
                      <td className="is-num is-positive">{item.kind.sign > 0 ? amount(item.amount) : '—'}</td>
                      <td className="is-num is-negative">{item.kind.sign < 0 ? amount(item.amount) : '—'}</td>
                      <td className="is-num"><b>{amount(item.balance)}</b></td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={5}>الإجمالي</td>
                    <td className="is-num is-positive">{amount(ledger.totalIn)}</td>
                    <td className="is-num is-negative">{amount(ledger.totalOut)}</td>
                    <td className="is-num">{amount(ledger.balance)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="lr-pager">
              <span>عرض {n(visible.length)} من {n(ledger.rows.length)} حركة</span>
              <div>
                <button type="button" aria-label="الصفحة السابقة" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                  <LegalIcon name="chevronRight" size={16} />
                </button>
                <b>{n(safePage + 1)} / {n(pageCount)}</b>
                <button type="button" aria-label="الصفحة التالية" disabled={safePage + 1 >= pageCount} onClick={() => setPage(safePage + 1)}>
                  <LegalIcon name="chevronLeft" size={16} />
                </button>
              </div>
            </div>
          </>
        ) : <p className="lt-side-empty lt-movements-empty">لا توجد حركات مالية من هذا النوع خلال الفترة.</p>}
      </section>

      {/* Only this copy prints (see @media print in lawFirmReports.css); a direct child of body, clear of the app layout. */}
      {createPortal(
        <div className="lr-print-area" aria-hidden="true"><LegalReportDocument report={report} /></div>,
        document.body,
      )}

      {movement && (
        <MovementWindow
          movement={movement}
          onClose={() => setMovement(null)}
          onOpenCase={openCase}
          onFilterClient={(id) => setFilter({ clientId: id })}
        />
      )}
      {previewing && <PrintPreview report={report} onClose={() => setPreviewing(false)} />}
    </main>
  );
}

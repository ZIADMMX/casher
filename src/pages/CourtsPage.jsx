import { useCallback, useEffect, useMemo, useState } from 'react';
import * as legalApi from '../api/legal.js';
import LegalIcon from '../components/legal/LegalIcon.jsx';
import '../styles/courts.css';

const COURT_TYPES = [
  { value: 'first_instance', label: 'أول درجة', mark: '١' },
  { value: 'cassation', label: 'النقض', mark: '٢' },
  { value: 'appeals', label: 'الاستئناف', mark: '٣' },
  { value: 'family', label: 'الأسرة', mark: '٤' },
  { value: 'criminal', label: 'الجنائية', mark: '٥' },
  { value: 'commercial', label: 'التجارية', mark: '٦' },
  { value: 'labor', label: 'العمالية', mark: '٧' },
  { value: 'administrative', label: 'الإدارية', mark: '٨' },
];

const STEPS = ['معلومات المحكمة', 'الموقع والتواصل', 'مراجعة البيانات'];
const PAGE_SIZE = 10;

const EMPTY_FORM = {
  name: '',
  court_type: '',
  specialization: '',
  notes: '',
  phone: '',
  city: '',
  address: '',
};

const EMPTY_OVERVIEW = {
  courts: { total: 0, active: 0, inactive: 0, missing: 0 },
  byType: {},
  cases: { linked: 0, open: 0, judged: 0, unlinked: 0 },
  sessions: { week: 0, tomorrow: 0 },
  upcoming: [],
  perCourt: [],
};

const n = (value) => Number(value || 0).toLocaleString('ar-EG');
const typeLabel = (value) => COURT_TYPES.find((type) => type.value === value)?.label || value || '—';

function getErrorMessage(error) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}

// Session dates are local "YYYY-MM-DDTHH:mm"; new Date() reads them as local time.
function formatSessionDay(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function CourtsPage({ onNavigate }) {
  const [courts, setCourts] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('active');
  const [courtType, setCourtType] = useState('');
  const [overview, setOverview] = useState(EMPTY_OVERVIEW);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [viewingCourt, setViewingCourt] = useState(null);
  const [showWizard, setShowWizard] = useState(false);
  const [editingCourt, setEditingCourt] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rangeStart = total ? (page - 1) * PAGE_SIZE + 1 : 0;
  const rangeEnd = Math.min(page * PAGE_SIZE, total);

  const statsByCourt = useMemo(
    () => new Map(overview.perCourt.map((row) => [row.court_id, row])),
    [overview.perCourt],
  );

  const distribution = useMemo(() => {
    const rows = COURT_TYPES
      .map((type) => ({ label: type.label, count: overview.byType[type.value] || 0 }))
      .filter((row) => row.count > 0)
      .sort((a, b) => b.count - a.count);
    const top = rows.slice(0, 4);
    const rest = rows.slice(4).reduce((sum, row) => sum + row.count, 0);
    if (rest) top.push({ label: 'أخرى', count: rest });
    const max = Math.max(1, ...top.map((row) => row.count));
    return top.map((row) => ({ ...row, percent: Math.round((row.count / max) * 100) }));
  }, [overview.byType]);

  const loadCourts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const result = await legalApi.getCourts({ search, status, courtType, page, pageSize: PAGE_SIZE });
      const count = Number(result.total) || 0;
      setCourts(result.items || []);
      setTotal(count);
      const lastPage = Math.max(1, Math.ceil(count / PAGE_SIZE));
      if (page > lastPage) setPage(lastPage);
    } catch (loadError) {
      setError(`تعذر تحميل دليل المحاكم: ${getErrorMessage(loadError)}`);
    } finally {
      setLoading(false);
    }
  }, [page, search, status, courtType]);

  const loadOverview = useCallback(async () => {
    try {
      setOverview({ ...EMPTY_OVERVIEW, ...(await legalApi.getCourtsOverview()) });
    } catch (overviewError) {
      setError(`تعذر تحميل إحصائيات المحاكم: ${getErrorMessage(overviewError)}`);
    }
  }, []);

  useEffect(() => { loadCourts(); }, [loadCourts]);
  useEffect(() => { loadOverview(); }, [loadOverview]);

  const refreshAll = () => Promise.all([loadCourts(), loadOverview()]);

  useEffect(() => {
    if (!showWizard && !viewingCourt) return undefined;
    const onKey = (event) => {
      if (event.key !== 'Escape') return;
      if (showWizard) closeWizard();
      else setViewingCourt(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  function openWizard(court = null) {
    setViewingCourt(null);
    setEditingCourt(court);
    setForm(court ? Object.fromEntries(Object.keys(EMPTY_FORM).map((key) => [key, court[key] || ''])) : EMPTY_FORM);
    setStep(0);
    setFormError('');
    setShowWizard(true);
  }

  function closeWizard() {
    if (saving) return;
    setShowWizard(false);
    setEditingCourt(null);
    setFormError('');
  }

  function setField(field) {
    return (event) => setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleNextStep() {
    if (step === 0) {
      if (form.name.trim().length < 2) {
        setFormError('اكتب اسم المحكمة (حرفان على الأقل).');
        return;
      }
      if (!form.court_type) {
        setFormError('اختر نوع المحكمة للمتابعة.');
        return;
      }
    }
    setFormError('');
    setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (step < STEPS.length - 1) {
      handleNextStep();
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (editingCourt) await legalApi.updateCourt(editingCourt.id, form);
      else await legalApi.createCourt(form);
      setShowWizard(false);
      setEditingCourt(null);
      if (page === 1) await refreshAll();
      else { setPage(1); loadOverview(); }
    } catch (saveError) {
      setFormError(`تعذر حفظ المحكمة: ${getErrorMessage(saveError)}`);
    } finally {
      setSaving(false);
    }
  }

  async function toggleCourt(court) {
    const action = court.is_active ? 'تعطيل' : 'تفعيل';
    if (court.is_active && !window.confirm(`هل تريد تعطيل "${court.name}"؟ ستظل المحكمة مرتبطة بملفاتها السابقة.`)) {
      return;
    }
    try {
      if (court.is_active) await legalApi.deactivateCourt(court.id);
      else await legalApi.updateCourt(court.id, { is_active: true });
      await refreshAll();
    } catch (toggleError) {
      setError(`تعذر ${action} المحكمة: ${getErrorMessage(toggleError)}`);
    }
  }

  // Exports every court matching the current filters, not just the visible page.
  async function exportCourts() {
    setExporting(true);
    try {
      const rows = [];
      for (let current = 1; ; current += 1) {
        const result = await legalApi.getCourts({ search, status, courtType, page: current, pageSize: 100 });
        rows.push(...(result.items || []));
        if (rows.length >= Number(result.total) || !result.items?.length) break;
      }
      const header = ['المحكمة', 'النوع', 'الاختصاص', 'المدينة', 'العنوان', 'الهاتف', 'القضايا', 'الحالة', 'ملاحظات'];
      const lines = rows.map((court) => [
        court.name, typeLabel(court.court_type), court.specialization, court.city, court.address, court.phone,
        statsByCourt.get(court.id)?.cases || 0, court.is_active ? 'نشطة' : 'معطلة', court.notes,
      ].map(csvCell).join(','));
      // BOM so Excel opens the Arabic text correctly.
      const blob = new Blob([`${String.fromCharCode(0xfeff)}${[header.join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `دليل-المحاكم-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (exportError) {
      setError(`تعذر تصدير المحاكم: ${getErrorMessage(exportError)}`);
    } finally {
      setExporting(false);
    }
  }

  const { courts: courtTotals, cases, sessions } = overview;

  return (
    <main className="courts-page" dir="rtl">
      <header className="courts-hero">
        <div className="courts-hero-title">
          <span className="courts-hero-mark"><LegalIcon name="scale" size={26} /></span>
          <div>
            <span className="courts-eyebrow">إدارة جهات التقاضي</span>
            <h1>دليل المحاكم</h1>
            <p>نظّم بيانات المحاكم واربطها بملفات القضايا وجلساتها.</p>
          </div>
        </div>
        <div className="courts-hero-actions">
          <button type="button" className="courts-btn courts-btn--primary" onClick={() => openWizard()}>
            <span aria-hidden="true">＋</span> إضافة محكمة
          </button>
          <button type="button" className="courts-btn" onClick={exportCourts} disabled={exporting}>
            <span aria-hidden="true">⇪</span> {exporting ? 'جارٍ التصدير...' : 'تصدير'}
          </button>
        </div>
      </header>

      <section className="courts-stats" aria-label="ملخص دليل المحاكم">
        <article className="courts-stat">
          <div><span>إجمالي المحاكم</span><strong>{n(courtTotals.total)}</strong></div>
          <span className="courts-stat-icon"><LegalIcon name="scale" /></span>
          <small>{n(courtTotals.active)} نشطة · {n(courtTotals.inactive)} معطلة</small>
        </article>
        <article className="courts-stat">
          <div><span>جلسات هذا الأسبوع</span><strong>{n(sessions.week)}</strong></div>
          <span className="courts-stat-icon courts-stat-icon--warning"><LegalIcon name="calendar" /></span>
          <small className="is-accent">{sessions.tomorrow ? `${n(sessions.tomorrow)} جلسات غدًا` : 'لا جلسات غدًا'}</small>
        </article>
        <article className="courts-stat">
          <div><span>قضايا مرتبطة</span><strong>{n(cases.linked)}</strong></div>
          <span className="courts-stat-icon"><LegalIcon name="briefcase" /></span>
          <small>{n(cases.open)} متداولة · {n(cases.judged)} محكوم فيها</small>
        </article>
        <article className="courts-stat">
          <div><span>بيانات ناقصة</span><strong>{n(courtTotals.missing)}</strong></div>
          <span className="courts-stat-icon courts-stat-icon--danger"><LegalIcon name="alert" /></span>
          <small className="is-accent">محاكم بدون عنوان أو هاتف</small>
        </article>
      </section>

      <nav className="courts-type-chips" aria-label="تصفية حسب نوع المحكمة">
        {[{ value: '', label: 'الكل', count: courtTotals.active }, ...COURT_TYPES.map((type) => ({
          ...type, count: overview.byType[type.value] || 0,
        }))].map((type) => (
          <button
            type="button"
            key={type.value || 'all'}
            className={courtType === type.value ? 'is-active' : ''}
            aria-pressed={courtType === type.value}
            onClick={() => { setCourtType(type.value); setPage(1); }}
          >
            {type.label} <span>{n(type.count)}</span>
          </button>
        ))}
      </nav>

      <div className="courts-layout">
        <section className="courts-panel">
          <div className="courts-panel-heading">
            <div>
              <h2>قائمة المحاكم</h2>
              <p>ابحث عن محكمة أو راجع بيانات الاتصال والموقع.</p>
            </div>
            <div className="courts-toolbar">
              <label className="courts-search">
                <span aria-hidden="true">⌕</span>
                <input
                  type="search"
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(1); }}
                  placeholder="اسم المحكمة أو المدينة أو الاختصاص..."
                  aria-label="البحث في المحاكم"
                />
              </label>
              <select
                className="courts-select"
                value={status}
                onChange={(event) => { setStatus(event.target.value); setPage(1); }}
                aria-label="تصفية حسب الحالة"
              >
                <option value="active">المحاكم النشطة</option>
                <option value="inactive">المحاكم المعطلة</option>
                <option value="all">كل المحاكم</option>
              </select>
              <button type="button" className="courts-icon-btn" onClick={refreshAll} disabled={loading} aria-label="تحديث" title="تحديث">
                <LegalIcon name="refresh" />
              </button>
            </div>
          </div>

          {error && <div className="courts-error" role="alert">{error}</div>}

          <div className="courts-table-scroll">
            <table className="courts-table">
              <thead>
                <tr>
                  <th scope="col">المحكمة</th>
                  <th scope="col">النوع</th>
                  <th scope="col">الموقع</th>
                  <th scope="col">القضايا</th>
                  <th scope="col">أقرب جلسة</th>
                  <th scope="col">الحالة</th>
                  <th scope="col">الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan="7" className="courts-table-message">جارٍ تحميل المحاكم...</td></tr>
                ) : courts.length === 0 ? (
                  <tr>
                    <td colSpan="7" className="courts-table-message">
                      <strong>{error ? 'تعذر عرض النتائج' : 'لا توجد محاكم مطابقة'}</strong>
                      <span>{error ? 'راجع الاتصال ثم أعد المحاولة.' : 'أضف محكمة جديدة أو غيّر كلمات البحث.'}</span>
                    </td>
                  </tr>
                ) : courts.map((court) => {
                  const stats = statsByCourt.get(court.id);
                  const location = [court.city, court.address].filter(Boolean).join(' — ');
                  return (
                    <tr key={court.id}>
                      <td>
                        <div className="courts-name-cell">
                          <span className="courts-name-mark"><LegalIcon name="scale" /></span>
                          <span>
                            <strong>{court.name}</strong>
                            {court.specialization && <small>{court.specialization}</small>}
                          </span>
                        </div>
                      </td>
                      <td><span className={`courts-type-chip courts-type-chip--${court.court_type}`}>{typeLabel(court.court_type)}</span></td>
                      <td>{location || <span className="courts-muted">غير محدد</span>}</td>
                      <td className="courts-count">{n(stats?.cases)}</td>
                      <td>{stats?.next_session ? formatSessionDay(stats.next_session) : <span className="courts-muted">—</span>}</td>
                      <td>
                        <span className={`courts-status ${court.is_active ? 'is-active' : 'is-inactive'}`}>
                          <i aria-hidden="true" />
                          {court.is_active ? 'نشطة' : 'معطلة'}
                        </span>
                      </td>
                      <td>
                        <div className="courts-row-actions">
                          <button type="button" onClick={() => setViewingCourt(court)} aria-label={`فتح ${court.name}`}>فتح</button>
                          <button type="button" onClick={() => openWizard(court)} aria-label={`تعديل ${court.name}`}>تعديل</button>
                          <button
                            type="button"
                            className={court.is_active ? 'is-danger' : 'is-success'}
                            onClick={() => toggleCourt(court)}
                            aria-label={`${court.is_active ? 'تعطيل' : 'تفعيل'} ${court.name}`}
                          >
                            {court.is_active ? 'تعطيل' : 'تفعيل'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <footer className="courts-pagination">
            <span>عرض {n(rangeStart)}–{n(rangeEnd)} من {n(total)}</span>
            <div className="courts-pagination-controls">
              <button type="button" className="courts-icon-btn" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading} aria-label="الصفحة السابقة">→</button>
              <span>{n(page)} / {n(pageCount)}</span>
              <button type="button" className="courts-icon-btn" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page >= pageCount || loading} aria-label="الصفحة التالية">←</button>
            </div>
          </footer>
        </section>

        <aside className="courts-aside">
          <section className="courts-card">
            <header className="courts-card-head">
              <h3>جلسات قريبة</h3>
              <button type="button" className="courts-link" onClick={() => onNavigate?.('appointments')}>الكل</button>
            </header>
            {overview.upcoming.length === 0 ? (
              <p className="courts-card-empty">لا توجد جلسات قادمة على محاكم الدليل.</p>
            ) : (
              <ul className="courts-sessions">
                {overview.upcoming.map((session) => {
                  const date = new Date(session.session_date);
                  const valid = !Number.isNaN(date.getTime());
                  return (
                    <li key={session.id}>
                      <span className="courts-session-date">
                        <strong>{valid ? date.toLocaleDateString('ar-EG', { day: 'numeric' }) : '—'}</strong>
                        <small>{valid ? date.toLocaleDateString('ar-EG', { month: 'long' }) : ''}</small>
                      </span>
                      <span className="courts-session-body">
                        <strong>{session.court_name}</strong>
                        <small>قضية {session.case_number}{session.circuit_name ? ` — ${session.circuit_name}` : ''}</small>
                      </span>
                      <span className="courts-session-time">
                        {valid ? date.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: false }) : ''}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <section className="courts-card">
            <header className="courts-card-head"><h3>التوزيع حسب النوع</h3></header>
            {distribution.length === 0 ? (
              <p className="courts-card-empty">أضف محاكم لتظهر هنا.</p>
            ) : (
              <ul className="courts-bars">
                {distribution.map((row) => (
                  <li key={row.label}>
                    <span>{row.label}</span>
                    <b>{n(row.count)}</b>
                    <i><em style={{ inlineSize: `${row.percent}%` }} /></i>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {cases.unlinked > 0 && (
            <section className="courts-cta">
              <span className="courts-cta-icon" aria-hidden="true">☆</span>
              <h3>اربط المحاكم بالقضايا</h3>
              <p>{n(cases.unlinked)} قضايا لسه مش مربوطة بمحكمة، فمش بتظهر في جدول الجلسات.</p>
              <button type="button" className="courts-btn courts-btn--primary" onClick={() => onNavigate?.('cases')}>راجع القضايا</button>
            </section>
          )}
        </aside>
      </div>

      {viewingCourt && (
        <div className="courts-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setViewingCourt(null); }}>
          <section className="courts-wizard" role="dialog" aria-modal="true" aria-labelledby="courts-view-title" dir="rtl">
            <header className="courts-wizard-header">
              <div>
                <span className="courts-eyebrow">دليل المحاكم</span>
                <h2 id="courts-view-title">{viewingCourt.name}</h2>
              </div>
              <button type="button" className="courts-wizard-close" onClick={() => setViewingCourt(null)} aria-label="إغلاق">×</button>
            </header>
            <div className="courts-wizard-body">
              <CourtDetails court={viewingCourt} stats={statsByCourt.get(viewingCourt.id)} />
            </div>
            <footer className="courts-wizard-footer">
              <button type="button" className="courts-btn" onClick={() => setViewingCourt(null)}>إغلاق</button>
              <button type="button" className="courts-btn courts-btn--primary" onClick={() => openWizard(viewingCourt)}>تعديل البيانات</button>
            </footer>
          </section>
        </div>
      )}

      {showWizard && (
        <div className="courts-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) closeWizard(); }}>
          <section className="courts-wizard" role="dialog" aria-modal="true" aria-labelledby="courts-wizard-title" dir="rtl">
            <header className="courts-wizard-header">
              <div>
                <span className="courts-eyebrow">{editingCourt ? 'تحديث بيانات الدليل' : 'دليل المحاكم'}</span>
                <h2 id="courts-wizard-title">{editingCourt ? 'تعديل بيانات المحكمة' : 'إضافة محكمة جديدة'}</h2>
              </div>
              <button type="button" className="courts-wizard-close" onClick={closeWizard} aria-label="إغلاق" disabled={saving}>×</button>
            </header>

            <ol className="courts-steps" aria-label={`الخطوة ${step + 1} من ${STEPS.length}`}>
              {STEPS.map((label, index) => (
                <li
                  key={label}
                  className={index < step ? 'is-done' : index === step ? 'is-current' : ''}
                  aria-current={index === step ? 'step' : undefined}
                >
                  <span>{index < step ? '✓' : n(index + 1)}</span>
                  <small>{label}</small>
                </li>
              ))}
            </ol>

            <form onSubmit={handleSave}>
              <div className="courts-wizard-body">
                {step === 0 && (
                  <>
                    <div className="courts-field">
                      <label htmlFor="court-name">اسم المحكمة <b>*</b></label>
                      <input id="court-name" autoFocus maxLength={180} value={form.name} onChange={setField('name')} placeholder="مثال: محكمة شمال القاهرة الابتدائية" required />
                    </div>
                    <fieldset className="courts-field">
                      <legend>نوع المحكمة <b>*</b></legend>
                      <div className="courts-type-grid">
                        {COURT_TYPES.map((type) => (
                          <button
                            type="button"
                            key={type.value}
                            className={form.court_type === type.value ? 'is-selected' : ''}
                            onClick={() => setForm((current) => ({ ...current, court_type: type.value }))}
                            aria-pressed={form.court_type === type.value}
                          >
                            <span>{type.mark}</span>
                            {type.label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="courts-field">
                      <label htmlFor="court-specialization">الاختصاص القضائي</label>
                      <input id="court-specialization" maxLength={180} value={form.specialization} onChange={setField('specialization')} placeholder="مثال: مدني كلي، تجاري، تعويضات" />
                    </div>
                    <div className="courts-field">
                      <label htmlFor="court-notes">ملاحظات</label>
                      <textarea id="court-notes" rows="3" maxLength={2000} value={form.notes} onChange={setField('notes')} placeholder="أضف أي تفاصيل مفيدة لفريق العمل..." />
                    </div>
                    <div className="courts-info-note">
                      <LegalIcon name="info" />
                      الاسم والنوع كفاية دلوقتي — باقي البيانات تقدر تكمّلها بعدين من شاشة التعديل.
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <div className="courts-form-grid">
                      <div className="courts-field">
                        <label htmlFor="court-phone">رقم الهاتف</label>
                        <input id="court-phone" type="tel" dir="ltr" maxLength={40} value={form.phone} onChange={setField('phone')} placeholder="+20 2 0000 0000" />
                      </div>
                      <div className="courts-field">
                        <label htmlFor="court-city">المدينة</label>
                        <input id="court-city" maxLength={100} value={form.city} onChange={setField('city')} placeholder="مثال: القاهرة" />
                      </div>
                    </div>
                    <div className="courts-field">
                      <label htmlFor="court-address">العنوان</label>
                      <textarea id="court-address" rows="4" maxLength={300} value={form.address} onChange={setField('address')} placeholder="الشارع، المنطقة، وأقرب علامة مميزة" />
                    </div>
                    <div className="courts-info-note">
                      <LegalIcon name="info" />
                      المحكمة بدون هاتف أو عنوان بتظهر في «بيانات ناقصة» لحد ما تكمّلها.
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <CourtDetails court={form} />
                    <p className="courts-review-note">بالحفظ، ستصبح المحكمة متاحة للاختيار عند إنشاء القضايا.</p>
                  </>
                )}
                {formError && <p className="courts-form-error" role="alert">{formError}</p>}
              </div>

              <footer className="courts-wizard-footer">
                <button
                  type="button"
                  className="courts-btn"
                  onClick={() => { setFormError(''); setStep((current) => Math.max(current - 1, 0)); }}
                  disabled={saving || step === 0}
                >
                  السابق
                </button>
                <span>الخطوة {n(step + 1)} من {n(STEPS.length)}</span>
                {step < STEPS.length - 1 ? (
                  <button type="button" className="courts-btn courts-btn--primary" onClick={handleNextStep}>التالي <span aria-hidden="true">←</span></button>
                ) : (
                  <button type="submit" className="courts-btn courts-btn--primary" disabled={saving}>
                    {saving ? 'جارٍ الحفظ...' : editingCourt ? 'حفظ التعديلات' : 'حفظ المحكمة'}
                  </button>
                )}
              </footer>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

function CourtDetails({ court, stats }) {
  return (
    <div className="courts-review-card">
      <div className="courts-review-heading">
        <span className="courts-name-mark"><LegalIcon name="scale" /></span>
        <div><small>اسم المحكمة</small><strong>{court.name}</strong></div>
      </div>
      <dl>
        <div><dt>النوع</dt><dd>{typeLabel(court.court_type)}</dd></div>
        <div><dt>الاختصاص</dt><dd>{court.specialization || 'غير محدد'}</dd></div>
        <div><dt>الهاتف</dt><dd dir="auto">{court.phone || 'غير مسجل'}</dd></div>
        <div><dt>المدينة</dt><dd>{court.city || 'غير محددة'}</dd></div>
        <div><dt>العنوان</dt><dd>{court.address || 'غير مسجل'}</dd></div>
        {stats && <div><dt>القضايا</dt><dd>{n(stats.cases)}</dd></div>}
        {stats?.next_session && <div><dt>أقرب جلسة</dt><dd>{formatSessionDay(stats.next_session)}</dd></div>}
        {court.notes && <div><dt>ملاحظات</dt><dd>{court.notes}</dd></div>}
      </dl>
    </div>
  );
}

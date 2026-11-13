import { useCallback, useEffect, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import LegalIcon from './LegalIcon.jsx';
import LegalModalShell from './LegalModalShell.jsx';
import { typeLabel } from './courtsData.js';

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const CASE_STATUS = {
  active: { label: 'متداولة', tone: 'primary' },
  adjourned: { label: 'مؤجلة', tone: 'muted' },
  appealed: { label: 'مستأنفة', tone: 'warning' },
  judged: { label: 'محكوم فيها', tone: 'success' },
  closed: { label: 'مغلقة', tone: 'muted' },
};
const DOC_TYPES = {
  power_of_attorney: 'توكيل', pleading: 'مذكرة / صحيفة', judgment: 'حكم',
  evidence: 'مستند إثبات', contract: 'عقد', other: 'أخرى',
};
const EXPENSE_TYPES = {
  court_fee: 'رسوم محكمة', expert_fee: 'أتعاب خبير', announcement_fee: 'رسوم إعلان', other_expense: 'مصروفات أخرى',
};
const TABS = [
  { key: 'sessions', label: 'الجلسات القادمة' },
  { key: 'cases', label: 'القضايا' },
  { key: 'documents', label: 'المستندات' },
  { key: 'expenses', label: 'المصاريف' },
];

const n = (value) => Number(value || 0).toLocaleString('ar-EG');
// Big KPI figures use Latin digits: the numeric display font has no Arabic-Indic glyphs.
const big = (value) => Number(value || 0).toLocaleString('en-US');
const money = (value) => `${Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 })} ج.م`;

// Session dates are local "YYYY-MM-DDTHH:mm"; activity stamps are local "YYYY-MM-DD HH:MM:SS".
function toDate(value) {
  if (!value) return null;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}
const day = (value) => toDate(value)?.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' }) || '—';
const shortDay = (value) => toDate(value)?.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) || '—';
const clock = (hhmm) => toDate(`2000-01-01T${hhmm}`)?.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' }) || '';

function ago(value) {
  const date = toDate(value);
  if (!date) return '';
  const minutes = Math.round((date.getTime() - Date.now()) / 60000);
  const rtf = new Intl.RelativeTimeFormat('ar-EG', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  if (Math.abs(minutes) < 1440) return rtf.format(Math.round(minutes / 60), 'hour');
  if (Math.abs(minutes) < 10080) return rtf.format(Math.round(minutes / 1440), 'day');
  return rtf.format(Math.round(minutes / 10080), 'week');
}

// The session purpose is free text; colour it by what it asks for.
function reasonTone(reason = '') {
  if (/حكم/.test(reason)) return 'success';
  if (/مستند|مذكر|إعلان/.test(reason)) return 'warning';
  if (/تأجيل|أجل/.test(reason)) return 'muted';
  return 'primary';
}

function activityText(item) {
  if (item.kind === 'document') return `أضيف «${item.detail}» لقضية ${item.case_number}`;
  if (item.kind === 'case') return `ربط قضية ${item.case_number} بالمحكمة`;
  if (item.detail === 'postponed') return `تم تأجيل قضية ${item.case_number}${item.extra ? ` لجلسة ${shortDay(item.extra)}` : ''}`;
  if (item.detail === 'judged') return `صدر حكم في قضية ${item.case_number}`;
  return `تم حضور جلسة قضية ${item.case_number}`;
}

const EMPTY_SESSION = { case_id: '', session_date: '', court_room: '', session_reason: '' };

export default function CourtProfile({ courtId, version, onBack, onEdit, onToggle, onNavigate }) {
  const [profile, setProfile] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('sessions');
  const [menuOpen, setMenuOpen] = useState(false);
  const [notesDraft, setNotesDraft] = useState(null);
  const [savingNotes, setSavingNotes] = useState(false);
  const [sessionForm, setSessionForm] = useState(null);
  const [sessionError, setSessionError] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const result = await legalApi.getCourtProfile(courtId);
      if (!result) throw new Error('المحكمة غير موجودة');
      setProfile(result);
    } catch (loadError) {
      setError(`تعذر تحميل بيانات المحكمة: ${loadError instanceof Error ? loadError.message : ''}`);
    }
  }, [courtId]);

  useEffect(() => { load(); }, [load, version]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [menuOpen]);

  if (!profile) {
    return (
      <section className="court-profile" aria-busy={!error}>
        <nav className="court-crumbs"><button type="button" onClick={onBack}>دليل المحاكم</button></nav>
        {error ? <div className="courts-error" role="alert">{error}</div> : <div className="court-skeleton" aria-label="جارٍ التحميل" />}
      </section>
    );
  }

  const { court, stats, upcoming, cases, documents, expenses, expensesTotal, circuits, activity } = profile;
  const openCases = cases.filter((item) => ['active', 'adjourned', 'appealed'].includes(item.status));
  const months = stats.avg_days ? Math.max(1, Math.round(stats.avg_days / 30)) : 0;
  const winRate = stats.verdicts_year ? Math.round((stats.favorable_year / stats.verdicts_year) * 100) : null;
  const mapQuery = encodeURIComponent([court.name, court.address, court.city].filter(Boolean).join(' '));
  const openCase = (caseId) => onNavigate?.('cases', { caseId });

  async function saveNotes() {
    setSavingNotes(true);
    try {
      await legalApi.updateCourt(court.id, { notes: notesDraft });
      setNotesDraft(null);
      await load();
    } catch (saveError) {
      setError(`تعذر حفظ الملاحظة: ${saveError instanceof Error ? saveError.message : ''}`);
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveSession(event) {
    event.preventDefault();
    if (!sessionForm.case_id || !sessionForm.session_date) {
      setSessionError('اختر القضية وموعد الجلسة.');
      return;
    }
    setSavingSession(true);
    setSessionError('');
    try {
      await legalApi.createCourtSession({ ...sessionForm, case_id: Number(sessionForm.case_id), status: 'scheduled' });
      setSessionForm(null);
      setTab('sessions');
      await load();
    } catch (saveError) {
      setSessionError(`تعذر تسجيل الجلسة: ${saveError instanceof Error ? saveError.message : ''}`);
    } finally {
      setSavingSession(false);
    }
  }

  const setSessionField = (field) => (event) => setSessionForm((current) => ({ ...current, [field]: event.target.value }));

  return (
    <section className="court-profile">
      <nav className="court-crumbs" aria-label="مسار التنقل">
        <button type="button" onClick={onBack}>دليل المحاكم</button>
        <LegalIcon name="chevronLeft" size={14} />
        <span aria-current="page">{court.name}</span>
      </nav>

      <header className="courts-hero court-hero">
        <div className="courts-hero-title">
          <span className="courts-hero-mark"><LegalIcon name="scale" size={30} /></span>
          <div>
            <h1>{court.name}</h1>
            <div className="court-tags">
              <span className="court-tag">{typeLabel(court.court_type)}</span>
              {court.specialization && <span className="court-tag court-tag--warning">{court.specialization}</span>}
              <span className={`courts-status ${court.is_active ? 'is-active' : 'is-inactive'}`}>
                <i aria-hidden="true" />{court.is_active ? 'نشطة' : 'معطلة'}
              </span>
            </div>
          </div>
        </div>
        <div className="courts-hero-actions">
          <button
            type="button"
            className="legal-btn legal-btn--primary"
            onClick={() => { setSessionError(''); setSessionForm({ ...EMPTY_SESSION, case_id: openCases[0]?.id || '' }); }}
            disabled={!court.is_active}
            title={court.is_active ? undefined : 'فعّل المحكمة أولًا'}
          >
            تسجيل جلسة
          </button>
          <button type="button" className="legal-btn" onClick={() => onEdit(court)}>تعديل البيانات</button>
          <div className="court-menu">
            <button
              type="button"
              className="legal-btn court-menu-trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="المزيد"
              onClick={() => setMenuOpen((open) => !open)}
            >
              <LegalIcon name="more" />
            </button>
            {menuOpen && (
              <div className="court-menu-list" role="menu" onPointerDown={(event) => event.stopPropagation()}>
                <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); onNavigate?.('cases', { createCase: true }); }}>
                  <LegalIcon name="briefcase" /> قضية جديدة
                </button>
                {court.phone && (
                  <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); navigator.clipboard?.writeText(court.phone); }}>
                    <LegalIcon name="phone" /> نسخ رقم الهاتف
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  className={court.is_active ? 'is-danger' : ''}
                  onClick={() => { setMenuOpen(false); onToggle(court); }}
                >
                  <LegalIcon name={court.is_active ? 'alert' : 'check'} /> {court.is_active ? 'تعطيل المحكمة' : 'تفعيل المحكمة'}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {error && <div className="courts-error" role="alert">{error}</div>}

      <section className="courts-stats court-kpis" aria-label="مؤشرات المحكمة">
        <article className="courts-stat">
          <div><span>قضايا مفتوحة</span><strong>{big(stats.open)}</strong></div>
          <small className={stats.urgent ? 'is-danger' : ''}>{stats.urgent ? `${n(stats.urgent)} منها عاجلة (جلسة خلال ٧ أيام)` : 'لا قضايا عاجلة'}</small>
        </article>
        <article className="courts-stat">
          <div><span>جلسات قادمة</span><strong>{big(upcoming.length)}</strong></div>
          <small className="is-accent">{upcoming[0] ? `أقربها ${shortDay(upcoming[0].session_date)}` : 'لا جلسات مجدولة'}</small>
        </article>
        <article className="courts-stat">
          <div><span>أحكام لصالح المكتب</span><strong>{winRate === null ? '—' : `${winRate}%`}</strong></div>
          <small className={winRate === null ? '' : 'is-success'}>
            {winRate === null
              ? 'سجّل نتيجة الحكم عند «صدور حكم» في الجلسة'
              : `آخر ١٢ شهر · ${n(stats.favorable_year)} من ${n(stats.verdicts_year)} حكم`}
          </small>
        </article>
        <article className="courts-stat">
          <div><span>متوسط مدة التقاضي</span><strong>{months ? `${n(months)} ${months > 10 ? 'شهرًا' : 'شهور'}` : '—'}</strong></div>
          <small>{months ? 'للقضايا المنتهية في المحكمة' : 'يظهر بعد انتهاء أول قضية'}</small>
        </article>
      </section>

      <div className="court-layout">
        <div className="court-main">
          <section className="courts-panel court-tabs-panel">
            <div className="court-tabs" role="tablist" aria-label="أقسام المحكمة">
              {TABS.map((item) => (
                <button
                  type="button"
                  role="tab"
                  key={item.key}
                  aria-selected={tab === item.key}
                  className={tab === item.key ? 'is-active' : ''}
                  onClick={() => setTab(item.key)}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="court-tab-body legal-slide" key={tab} role="tabpanel">
              {tab === 'sessions' && (
                <>
                  <div className="court-section-head">
                    <h2>الجلسات القادمة</h2>
                    <button type="button" className="courts-link" onClick={() => onNavigate?.('appointments')}>عرض الكل</button>
                  </div>
                  <CourtTable
                    empty="لا توجد جلسات مجدولة في هذه المحكمة."
                    head={['التاريخ', 'رقم القضية', 'الموكّل', 'الدائرة', 'المطلوب']}
                    rows={upcoming.map((session) => ({
                      key: session.id,
                      onOpen: () => openCase(session.case_id),
                      cells: [
                        <strong key="d">{day(session.session_date)}</strong>,
                        <span key="c" className="court-case-no">{session.case_number}</span>,
                        session.client_name || '—',
                        session.circuit_name || '—',
                        session.session_reason
                          ? <span key="r" className={`court-pill court-pill--${reasonTone(session.session_reason)}`}>{session.session_reason}</span>
                          : <span key="r" className="courts-muted">—</span>,
                      ],
                    }))}
                  />
                </>
              )}

              {tab === 'cases' && (
                <>
                  <div className="court-section-head"><h2>قضايا المحكمة</h2><span className="courts-muted">{n(cases.length)} قضية</span></div>
                  <CourtTable
                    empty="لا توجد قضايا مرتبطة بهذه المحكمة بعد."
                    head={['رقم القضية', 'الموكّل', 'الموضوع', 'الدائرة', 'الجلسة القادمة', 'الحالة']}
                    rows={cases.map((item) => {
                      const status = CASE_STATUS[item.status] || CASE_STATUS.active;
                      return {
                        key: item.id,
                        onOpen: () => openCase(item.id),
                        cells: [
                          <span key="c" className="court-case-no">{item.case_number}</span>,
                          item.client_name || '—',
                          <span key="s" className="court-clip">{item.subject}</span>,
                          item.circuit_name || '—',
                          item.next_session ? shortDay(item.next_session) : '—',
                          <span key="st" className={`court-pill court-pill--${status.tone}`}>{status.label}</span>,
                        ],
                      };
                    })}
                  />
                </>
              )}

              {tab === 'documents' && (
                <>
                  <div className="court-section-head"><h2>مستندات القضايا</h2><span className="courts-muted">{n(documents.length)} مستند</span></div>
                  <CourtTable
                    empty="لم تُرفع مستندات لقضايا هذه المحكمة."
                    head={['المستند', 'النوع', 'القضية', 'تاريخ الإضافة']}
                    rows={documents.map((doc) => ({
                      key: doc.id,
                      onOpen: () => openCase(doc.case_id),
                      cells: [
                        <span key="t" className="court-doc"><LegalIcon name="file" />{doc.title}</span>,
                        DOC_TYPES[doc.doc_type] || 'أخرى',
                        <span key="c" className="court-case-no">{doc.case_number}</span>,
                        shortDay(doc.created_at),
                      ],
                    }))}
                  />
                </>
              )}

              {tab === 'expenses' && (
                <>
                  <div className="court-section-head"><h2>مصاريف القضايا</h2><strong className="court-total">{money(expensesTotal)}</strong></div>
                  <CourtTable
                    empty="لا توجد مصاريف مسجلة على قضايا هذه المحكمة."
                    head={['البند', 'القضية', 'التاريخ', 'المبلغ']}
                    rows={expenses.map((expense) => ({
                      key: expense.id,
                      onOpen: () => openCase(expense.case_id),
                      cells: [
                        <span key="t"><strong>{EXPENSE_TYPES[expense.type] || 'مصروفات'}</strong>{expense.description && <small className="court-sub">{expense.description}</small>}</span>,
                        <span key="c" className="court-case-no">{expense.case_number}</span>,
                        shortDay(expense.date),
                        <strong key="a" className="court-money">{money(expense.amount)}</strong>,
                      ],
                    }))}
                  />
                </>
              )}
            </div>
          </section>

          <section className="courts-panel court-circuits">
            <div className="court-section-head"><h2>الدوائر وأيام الانعقاد</h2></div>
            {circuits.length === 0 ? (
              <p className="courts-card-empty">اكتب الدائرة في ملف القضية عشان تظهر هنا بأيام انعقادها.</p>
            ) : (
              <ul className="court-circuit-grid">
                {circuits.map((circuit) => (
                  <li key={circuit.name}>
                    <strong>{circuit.name}</strong>
                    <span>
                      {circuit.weekdays.length ? circuit.weekdays.map((d) => WEEKDAYS[d]).join(' و') : 'لم تُسجّل جلسات'}
                      {circuit.time && ` — ${clock(circuit.time)}`}
                    </span>
                    <em>{n(circuit.cases)} قضية</em>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="courts-aside">
          <section className="courts-card">
            <header className="courts-card-head"><h3>بيانات التواصل والموقع</h3></header>
            <dl className="court-contact">
              <div><span><LegalIcon name="pin" /></span><dt>العنوان</dt><dd>{court.address || <em>غير مسجل</em>}</dd></div>
              <div><span><LegalIcon name="building" /></span><dt>المدينة</dt><dd>{court.city || <em>غير محددة</em>}</dd></div>
              <div><span><LegalIcon name="phone" /></span><dt>رقم الهاتف</dt><dd>{court.phone ? <bdi dir="ltr">{court.phone}</bdi> : <em>غير مسجل</em>}</dd></div>
              <div><span><LegalIcon name="clock" /></span><dt>مواعيد العمل</dt><dd>{court.working_hours || <em>غير مسجلة</em>}</dd></div>
            </dl>
            <div className="court-contact-foot">
              {mapQuery && (court.address || court.city) ? (
                <a className="legal-btn court-map-btn" href={`https://www.google.com/maps/search/?api=1&query=${mapQuery}`} target="_blank" rel="noreferrer">
                  فتح على الخريطة
                </a>
              ) : (
                <button type="button" className="legal-btn court-map-btn" onClick={() => onEdit(court)}>أضف العنوان</button>
              )}
            </div>
          </section>

          <section className="courts-card">
            <header className="courts-card-head"><h3>آخر النشاط</h3></header>
            {activity.length === 0 ? (
              <p className="courts-card-empty">لا يوجد نشاط على قضايا هذه المحكمة بعد.</p>
            ) : (
              <ol className="court-timeline">
                {activity.map((item, index) => (
                  <li key={`${item.kind}-${item.at}-${index}`}>
                    <button type="button" onClick={() => openCase(item.case_id)}>
                      <strong>{activityText(item)}</strong>
                      <small>{ago(item.at)}</small>
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </section>

          <section className="courts-cta court-notes">
            <h3>ملاحظات المكتب</h3>
            {notesDraft === null ? (
              <>
                <p>{court.notes || 'اكتب هنا أي تفاصيل تفيد الفريق: البوابة، التصوير، مواعيد القلم...'}</p>
                <button type="button" className="legal-btn" onClick={() => setNotesDraft(court.notes || '')}>
                  {court.notes ? 'تعديل الملاحظة' : 'إضافة ملاحظة'}
                </button>
              </>
            ) : (
              <>
                <textarea
                  aria-label="ملاحظات المكتب"
                  rows="4"
                  maxLength={2000}
                  autoFocus
                  value={notesDraft}
                  onChange={(event) => setNotesDraft(event.target.value)}
                />
                <div className="court-notes-actions">
                  <button type="button" className="legal-btn legal-btn--primary" onClick={saveNotes} disabled={savingNotes}>
                    {savingNotes ? 'جارٍ الحفظ...' : 'حفظ'}
                  </button>
                  <button type="button" className="legal-btn" onClick={() => setNotesDraft(null)} disabled={savingNotes}>إلغاء</button>
                </div>
              </>
            )}
          </section>
        </aside>
      </div>

      {sessionForm && (
        <LegalModalShell onClose={() => setSessionForm(null)} locked={savingSession} labelledBy="court-session-title" size="md" className="courts-wizard">
          {(requestClose) => (
            <form onSubmit={saveSession}>
              <header className="courts-wizard-header">
                <div>
                  <span className="courts-eyebrow">{court.name}</span>
                  <h2 id="court-session-title">تسجيل جلسة جديدة</h2>
                </div>
                <button type="button" className="legal-x" onClick={requestClose} aria-label="إغلاق" disabled={savingSession}><LegalIcon name="close" /></button>
              </header>
              <div className="courts-wizard-body legal-rise">
                {openCases.length === 0 ? (
                  <div className="courts-info-note"><LegalIcon name="info" />مفيش قضايا مفتوحة مربوطة بالمحكمة دي. اربط قضية بالمحكمة الأول من ملف القضية.</div>
                ) : (
                  <>
                    <div className="courts-field">
                      <label htmlFor="court-session-case">القضية <b>*</b></label>
                      <select id="court-session-case" className="court-input" value={sessionForm.case_id} onChange={setSessionField('case_id')}>
                        {openCases.map((item) => (
                          <option key={item.id} value={item.id}>{item.case_number} — {item.client_name || item.subject}</option>
                        ))}
                      </select>
                    </div>
                    <div className="courts-form-grid">
                      <div className="courts-field">
                        <label htmlFor="court-session-date">موعد الجلسة <b>*</b></label>
                        <input id="court-session-date" type="datetime-local" value={sessionForm.session_date} onChange={setSessionField('session_date')} required />
                      </div>
                      <div className="courts-field">
                        <label htmlFor="court-session-room">القاعة / الرول</label>
                        <input id="court-session-room" maxLength={100} value={sessionForm.court_room} onChange={setSessionField('court_room')} placeholder="مثال: قاعة ٤" />
                      </div>
                    </div>
                    <div className="courts-field">
                      <label htmlFor="court-session-reason">المطلوب في الجلسة</label>
                      <input id="court-session-reason" maxLength={300} value={sessionForm.session_reason} onChange={setSessionField('session_reason')} placeholder="مثال: مرافعة، تقديم مستندات، حجز للحكم" />
                    </div>
                  </>
                )}
                {sessionError && <p className="courts-form-error" role="alert">{sessionError}</p>}
              </div>
              <footer className="courts-wizard-footer">
                <button type="button" className="courts-btn" onClick={requestClose} disabled={savingSession}>إلغاء</button>
                <button type="submit" className="courts-btn courts-btn--primary" disabled={savingSession || openCases.length === 0}>
                  {savingSession ? 'جارٍ الحفظ...' : 'حفظ الجلسة'}
                </button>
              </footer>
            </form>
          )}
        </LegalModalShell>
      )}
    </section>
  );
}

function CourtTable({ head, rows, empty }) {
  if (!rows.length) return <p className="court-table-empty">{empty}</p>;
  return (
    <div className="courts-table-scroll">
      <table className="courts-table court-table">
        <thead><tr>{head.map((title) => <th scope="col" key={title}>{title}</th>)}</tr></thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} tabIndex={0} onClick={row.onOpen} onKeyDown={(event) => { if (event.key === 'Enter') row.onOpen(); }}>
              {row.cells.map((cell, index) => <td key={head[index]}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

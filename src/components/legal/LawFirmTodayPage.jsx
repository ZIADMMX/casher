import { useCallback, useEffect, useRef, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import SessionOutcomeModal, { sessionTime } from './SessionOutcomeModal.jsx';
import LegalIcon from './LegalIcon.jsx';
import LegalAmbient from './LegalAmbient.jsx';
import '../../styles/legalMotion.css';
import '../../styles/lawFirmToday.css';

const CASE_TYPES = {
  civil: 'مدني كلي',
  commercial: 'تجاري',
  criminal: 'جنح',
  labor: 'عمالي',
  family: 'نفقة',
  administrative: 'إداري',
  inheritance: 'مواريث',
};

// [label, pill tone, money direction]
const MOVEMENTS = {
  fee_payment: ['أتعاب', 'success', 1],
  retainer_deposit: ['أمانة', 'accent', 1],
  court_fee: ['مصروف قضائي', 'danger', -1],
  expert_fee: ['مصروف قضائي', 'danger', -1],
  announcement_fee: ['مصروف قضائي', 'danger', -1],
  other_expense: ['مصروف مكتب', 'danger', -1],
};

const n = (value) => Number(value || 0).toLocaleString('ar-EG');
const money = (value) => `${n(Math.round(Number(value) || 0))} ج.م`;
const toDate = (value) => new Date(String(value).replace(' ', 'T'));

function localDate(date = new Date()) {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function shortClock(value) {
  const { clock } = sessionTime(value);
  return clock;
}

function remainingLabel(days) {
  if (days < 0) return `فات بـ ${n(Math.abs(days))} يوم`;
  if (days === 0) return 'آخر يوم النهاردة';
  if (days === 1) return 'باقي يوم';
  if (days <= 10) return `باقي ${n(days)} أيام`;
  return `باقي ${n(days)} يوم`;
}

// What the pill on a hearing card says, and how loud it is.
function sessionStatus(session, nextId, now, isToday) {
  if (session.status === 'attended') return { label: 'تم الحضور', tone: 'success', done: true };
  if (session.status === 'postponed') return { label: 'تأجلت', tone: 'muted', done: true };
  if (session.status === 'judged') return { label: 'صدر حكم', tone: 'muted', done: true };
  if (session.status !== 'scheduled') return { label: session.status, tone: 'muted', done: true };
  if (!isToday) return { label: 'مجدولة', tone: 'accent' };
  const minutes = Math.round((toDate(session.session_date) - now) / 60000);
  if (minutes < 0) return { label: 'محتاجة تسجيل', tone: 'danger', urgent: true };
  if (minutes <= 60) return { label: `بعد ${n(minutes)} دقيقة`, tone: 'warning', urgent: true, live: true };
  if (session.id === nextId) return { label: 'الجلسة الجاية', tone: 'primary', urgent: true, live: true };
  return { label: 'مجدولة', tone: 'accent' };
}

function Metric({ icon, label, value, note, tone = 'primary', onClick, index }) {
  return (
    <button type="button" className={`lt-metric lt-tone-${tone}`} onClick={onClick} style={{ '--i': index }}>
      <span className="lt-metric-top">
        <span className="lt-metric-label">{label}</span>
        <span className="lt-metric-icon"><LegalIcon name={icon} size={18} /></span>
      </span>
      <strong className="lt-metric-value">{value}</strong>
      <span className="lt-metric-foot">
        <small>{note}</small>
        <em>عرض التفاصيل</em>
      </span>
    </button>
  );
}

function SessionCard({ session, status, index, onRecord, onOpen }) {
  const time = sessionTime(session.session_date);
  return (
    <article
      className={`lt-session${status.urgent ? ' is-urgent' : ''}${status.done ? ' is-done' : ''}`}
      style={{ '--i': index }}
    >
      <span className="lt-session-time">
        <b>{time.clock}</b>
        <small>{time.period}</small>
      </span>
      <button type="button" className="lt-session-main" onClick={onOpen} title="فتح ملف القضية">
        <span className="lt-session-title">
          <strong>قضية {session.case_number}</strong>
          {session.case_type && <span className="lt-chip">{CASE_TYPES[session.case_type] || session.case_type}</span>}
        </span>
        <span className="lt-session-court">{session.court_name || 'محكمة غير محددة'}{session.circuit_name ? ` · ${session.circuit_name}` : ''}</span>
        <small>الموكل: {session.client_name || '—'}{session.assigned_lawyer_name ? ` · أ. ${session.assigned_lawyer_name}` : ''}</small>
      </button>
      <div className="lt-session-need">
        <small>المطلوب في الجلسة</small>
        <strong>{session.session_reason || session.case_subject || 'متابعة'}</strong>
      </div>
      <span className={`lt-pill lt-pill--${status.tone}${status.live ? ' is-live' : ''}`}>{status.label}</span>
      {status.done ? (
        <button type="button" className="legal-btn lt-session-btn" onClick={onOpen}>عرض المحضر</button>
      ) : (
        <button
          type="button"
          className={`legal-btn lt-session-btn${status.urgent ? ' legal-btn--primary' : ''}`}
          onClick={() => onRecord(session)}
        >
          تسجيل الإجراء
        </button>
      )}
      <button type="button" className="lt-more" onClick={onOpen} aria-label="فتح ملف القضية">⋯</button>
    </article>
  );
}

export default function LawFirmTodayPage({ onNavigate }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(localDate);
  const [agendaView, setAgendaView] = useState('today');
  const [search, setSearch] = useState('');
  const [outcomeSession, setOutcomeSession] = useState(null);
  const [taskError, setTaskError] = useState('');
  const [now, setNow] = useState(() => new Date());
  const requestId = useRef(0);
  const sessionsRef = useRef(null);

  const loadDashboard = useCallback(async () => {
    const id = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await legalApi.getLawFirmDashboard(selectedDate);
      if (id === requestId.current) setDashboard(result);
    } catch (loadError) {
      console.error('تعذر تحميل لوحة المحامي:', loadError);
      if (id === requestId.current) setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل لوحة المحامي');
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadDashboard();
    return () => { requestId.current += 1; };
  }, [loadDashboard]);

  // "after 30 minutes" pills stay true without a reload.
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);

  if (loading && !dashboard) {
    return (
      <main className="legal-ds lt-page" dir="rtl" aria-busy="true">
        <div className="lt-state"><span className="lt-spinner" /> جاري تحميل جدول القضايا والجلسات...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="legal-ds lt-page" dir="rtl">
        <div className="lt-state lt-state--error" role="alert">
          <strong>تعذر تحميل بيانات اليوم</strong>
          <span>{error}</span>
          <button type="button" className="legal-btn legal-btn--primary" onClick={loadDashboard}>إعادة المحاولة</button>
        </div>
      </main>
    );
  }

  const cases = dashboard?.caseStats || {};
  const stats = dashboard?.sessionStats || {};
  const finance = dashboard?.financialStats || {};
  const todaySessions = [...(dashboard?.todaySessions || [])]
    .sort((a, b) => String(a.session_date).localeCompare(String(b.session_date)));
  const upcoming = (dashboard?.upcomingSessions || [])
    .filter((session) => String(session.session_date).slice(0, 10) !== selectedDate);
  const movements = dashboard?.financialMovements || [];
  const deadlines = dashboard?.criticalDeadlines || [];
  const tasks = dashboard?.todayTasks || [];
  const openTasks = tasks.filter((task) => task.status !== 'completed').length;

  const isToday = selectedDate === localDate(now);
  const nextId = todaySessions.find((s) => s.status === 'scheduled' && toDate(s.session_date) >= now)?.id;
  const morning = todaySessions.filter((s) => toDate(s.session_date).getHours() < 12).length;
  const courts = new Set(upcoming.map((s) => s.court_name).filter(Boolean)).size;

  const agenda = agendaView === 'today' ? todaySessions : agendaView === 'upcoming' ? upcoming : [...todaySessions, ...upcoming];
  const term = search.trim().toLocaleLowerCase();
  const visibleSessions = agenda.filter((s) => !term || [s.case_number, s.court_name, s.client_name, s.case_subject, s.session_reason]
    .some((value) => String(value || '').toLocaleLowerCase().includes(term)));

  const hour = now.getHours();
  const greeting = hour < 12 ? 'صباح الخير' : 'مساء الخير';
  const dayLabel = new Date(`${selectedDate}T12:00:00`).toLocaleDateString('ar-EG', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });

  const openCase = (caseId) => onNavigate('cases', { caseId });
  const showAgenda = (view) => {
    setAgendaView(view);
    sessionsRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  async function toggleTask(task) {
    const status = task.status === 'completed' ? 'pending' : 'completed';
    const patch = (value) => setDashboard((prev) => ({
      ...prev,
      todayTasks: prev.todayTasks.map((item) => (item.id === task.id ? { ...item, status: value } : item)),
    }));
    patch(status);
    setTaskError('');
    try {
      await legalApi.updateCaseTask(task.id, { status });
    } catch (toggleError) {
      patch(task.status);
      setTaskError(toggleError instanceof Error ? toggleError.message : 'تعذر تحديث المهمة');
    }
  }

  function taskNote(task) {
    if (task.session_date) return `قبل جلسة ${shortClock(task.session_date)}`;
    if (task.days_offset < 0) return task.days_offset === -1 ? 'متابعة من أمس' : `متأخرة ${n(-task.days_offset)} أيام`;
    return `قضية ${task.case_number}`;
  }

  return (
    <main className="legal-ds lt-page" dir="rtl">
      <LegalAmbient />

      <header className="lt-hero">
        <span className="lt-hero-icon"><LegalIcon name="calendar" size={26} /></span>
        <div className="lt-hero-text">
          <span className="legal-sheet-eyebrow">مكتب المحاماة</span>
          <h1>{greeting} — ده يومك في المحاكم</h1>
          <p>{dayLabel} · عندك {n(todaySessions.length)} جلسات و{n(openTasks)} متابعات.</p>
        </div>
        <div className="lt-hero-actions">
          <label className="lt-date">
            <span>عرض يوم</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => event.target.value && setSelectedDate(event.target.value)}
              aria-label="اختيار تاريخ لوحة المحامي"
            />
          </label>
          <button type="button" className="legal-btn" onClick={() => onNavigate('courts')}>دليل المحاكم</button>
          <button type="button" className="legal-btn legal-btn--primary" onClick={() => onNavigate('cases', { createCase: true })}>
            <span aria-hidden="true">+</span> قضية جديدة
          </button>
        </div>
        {loading && <span className="lt-hero-progress" role="status" aria-label="جاري التحديث" />}
      </header>

      <section className="lt-metrics" aria-label="ملخص اليوم">
        <Metric index={0} icon="scale" label="جلسات اليوم" value={n(stats.today_sessions)}
          note={`${n(morning)} صباحية · ${n(todaySessions.length - morning)} بعد الظهر`} onClick={() => showAgenda('today')} />
        <Metric index={1} icon="calendar" label="جلسات خلال ٧ أيام" value={n(stats.upcoming_week)}
          note={`في ${n(courts)} محاكم مختلفة`} onClick={() => showAgenda('upcoming')} />
        <Metric index={2} icon="file" label="قضايا نشطة" value={n(cases.active_cases)}
          note={`أتعاب متبقية ${money(cases.outstanding_fees)}`} onClick={() => onNavigate('cases')} />
        <Metric index={3} icon="cash" tone="success" label="محصّل النهارده" value={money(finance.fees_collected)}
          note={`${n(finance.movement_count)} حركات مالية`} onClick={() => onNavigate('reports')} />
      </section>

      {Number(stats.overdue_sessions) > 0 && (
        <button type="button" className="lt-overdue" onClick={() => onNavigate('cases')}>
          <LegalIcon name="alert" size={20} />
          <strong>{n(stats.overdue_sessions)} جلسات سابقة لسه بحالة «مجدولة»</strong>
          <span>سجّل قرار المحكمة فيها</span>
        </button>
      )}

      <section className="lt-finance" aria-label="ملخص الحركات المالية">
        <div>
          <span>الأتعاب المحصلة</span>
          <strong className="is-positive">{money(finance.fees_collected)}</strong>
          <small>إيراد المكتب من أتعاب القضايا</small>
        </div>
        <div>
          <span>أمانات الموكلين</span>
          <strong className="is-primary">{money(finance.client_deposits)}</strong>
          <small>تُعرض منفصلة عن إيرادات الأتعاب</small>
        </div>
        <div>
          <span>المصروفات القضائية</span>
          <strong className="is-negative">{money(finance.court_expenses)}</strong>
          <small>الرسوم والمصروفات المسجلة اليوم</small>
        </div>
        <button type="button" className="legal-btn lt-finance-link" onClick={() => onNavigate('reports')}>
          التقرير الكامل <LegalIcon name="chevronLeft" size={16} />
        </button>
      </section>

      <div className="lt-columns">
        <section className="lt-panel lt-sessions" ref={sessionsRef}>
          <div className="lt-panel-head">
            <div>
              <h2>{agendaView === 'today' ? 'جلسات اليوم' : agendaView === 'upcoming' ? 'الجلسات القادمة' : 'كل الجلسات'}</h2>
              <p>مرتبة بالوقت · كل جلسة عليها إجراء مطلوب.</p>
            </div>
            <div className="lt-tools">
              <div className="lt-tabs" role="tablist" aria-label="تصفية الجلسات">
                {[['today', 'اليوم'], ['upcoming', 'القادم'], ['all', 'الكل']].map(([value, label]) => (
                  <button type="button" role="tab" key={value} aria-selected={agendaView === value}
                    className={agendaView === value ? 'is-active' : ''} onClick={() => setAgendaView(value)}>
                    {label}
                  </button>
                ))}
              </div>
              <label className="lt-search">
                <LegalIcon name="search" size={16} />
                <input type="search" value={search} onChange={(e) => setSearch(e.target.value)}
                  placeholder="رقم القضية أو اسم الموكل..." aria-label="البحث في جدول الجلسات" />
              </label>
            </div>
          </div>
          {visibleSessions.length ? (
            <div className="lt-session-list" key={`${agendaView}-${selectedDate}`}>
              {visibleSessions.map((session, index) => (
                <SessionCard
                  key={session.id}
                  index={index}
                  session={session}
                  status={sessionStatus(session, nextId, now, isToday && String(session.session_date).startsWith(selectedDate))}
                  onRecord={setOutcomeSession}
                  onOpen={() => openCase(session.case_id)}
                />
              ))}
            </div>
          ) : (
            <div className="lt-empty">
              <span className="lt-empty-icon"><LegalIcon name="calendar" size={30} /></span>
              <strong>{search ? 'مفيش جلسات تطابق البحث' : agendaView === 'today' ? 'مفيش جلسات في اليوم ده' : 'مفيش جلسات قادمة'}</strong>
              <p>{search ? 'جرّب رقم القضية أو اسم الموكل.' : 'سجّل الجلسة من ملف القضية وهتظهر هنا.'}</p>
              <button type="button" className="legal-btn legal-btn--primary" onClick={() => onNavigate('cases')}>إدارة القضايا والجلسات</button>
            </div>
          )}
        </section>

        <aside className="lt-side">
          <section className="lt-panel">
            <div className="lt-panel-head lt-panel-head--compact">
              <div>
                <h2>القادم خلال أسبوع</h2>
                <p>{n(upcoming.length)} جلسات مجدولة</p>
              </div>
              <button type="button" className="lt-link" onClick={() => showAgenda('upcoming')}>الكل</button>
            </div>
            {upcoming.length ? (
              <ul className="lt-upcoming">
                {upcoming.slice(0, 5).map((session, index) => {
                  const date = toDate(session.session_date);
                  return (
                    <li key={session.id} style={{ '--i': index }}>
                      <button type="button" onClick={() => openCase(session.case_id)}>
                        <span className={`lt-day${index === 0 ? ' is-near' : ''}`}>
                          <b>{n(date.getDate())}</b>
                          <small>{date.toLocaleDateString('ar-EG', { month: 'long' })}</small>
                        </span>
                        <span className="lt-upcoming-text">
                          <strong>قضية {session.case_number}</strong>
                          <small>{session.court_name || '—'}</small>
                        </span>
                        <span className="lt-upcoming-time">{shortClock(session.session_date)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="lt-side-empty">مفيش جلسات مجدولة الأسبوع ده.</p>}
          </section>

          <section className="lt-panel">
            <div className="lt-panel-head lt-panel-head--compact">
              <h2>مهام اليوم</h2>
              <span className="lt-count">{n(openTasks)}</span>
            </div>
            {taskError && <p className="lt-task-error" role="alert">{taskError}</p>}
            {tasks.length ? (
              <ul className="lt-tasks">
                {tasks.map((task) => (
                  <li key={task.id} className={task.status === 'completed' ? 'is-done' : ''}>
                    <label>
                      <input type="checkbox" checked={task.status === 'completed'} onChange={() => toggleTask(task)} />
                      <span className="lt-check" aria-hidden="true"><LegalIcon name="check" size={14} /></span>
                      <span className="lt-task-text">
                        <strong>{task.title}</strong>
                        <small className={task.days_offset < 0 ? 'is-late' : ''}>{taskNote(task)}</small>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : <p className="lt-side-empty">مفيش مهام لليوم ده.</p>}
          </section>

          <section className="lt-panel lt-deadlines">
            <div className="lt-panel-head lt-panel-head--compact">
              <h2>مواعيد حرجة</h2>
            </div>
            {deadlines.length ? (
              <ul>
                {deadlines.map((deadline) => {
                  const days = Number(deadline.days_remaining);
                  const tone = days <= 7 ? 'danger' : 'warning';
                  return (
                    <li key={deadline.id} className={`lt-deadline lt-deadline--${tone}`}>
                      <button type="button" onClick={() => openCase(deadline.case_id)}>
                        <span className="lt-deadline-title">{deadline.title} في قضية {deadline.case_number}</span>
                        <span className={`lt-pill lt-pill--${tone}`}>{remainingLabel(days)}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : <p className="lt-side-empty">مفيش مواعيد قانونية مفتوحة.</p>}
          </section>
        </aside>
      </div>

      <section className="lt-panel lt-movements">
        <div className="lt-panel-head">
          <div>
            <h2>حركات اليوم المالية</h2>
            <p>أتعاب ومصروفات وأمانات اتسجلت النهارده</p>
          </div>
          <button type="button" className="legal-btn" onClick={() => onNavigate('cases')}>تسجيل حركة</button>
        </div>
        {movements.length ? (
          <div className="lt-table-wrap">
            <table className="lt-table">
              <thead>
                <tr><th>الوقت</th><th>البيان</th><th>القضية / الموكل</th><th>النوع</th><th>المبلغ</th></tr>
              </thead>
              <tbody>
                {movements.map((movement, index) => {
                  const [label, tone, sign] = MOVEMENTS[movement.type] || [movement.type, 'muted', -1];
                  const date = toDate(movement.date);
                  const clock = `${shortClock(movement.date)} ${date.getHours() < 12 ? 'ص' : 'م'}`;
                  return (
                    <tr key={movement.id} style={{ '--i': index }} onClick={() => openCase(movement.case_id)}>
                      <td className="lt-muted-cell">{clock}</td>
                      <td><strong>{movement.description || label}</strong></td>
                      <td className="lt-muted-cell">{movement.client_name || '—'} · {movement.case_number}</td>
                      <td><span className={`lt-pill lt-pill--${tone}`}>{label}</span></td>
                      <td className={sign > 0 ? 'is-positive' : 'is-negative'}>{sign > 0 ? '+' : '−'} {money(movement.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="lt-side-empty lt-movements-empty">مفيش حركات مالية اتسجلت في اليوم ده.</p>}
      </section>

      {outcomeSession && (
        <SessionOutcomeModal
          session={outcomeSession}
          onClose={() => setOutcomeSession(null)}
          onSaved={loadDashboard}
        />
      )}
    </main>
  );
}

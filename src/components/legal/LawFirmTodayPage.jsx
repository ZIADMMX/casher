import { useCallback, useEffect, useRef, useState } from 'react';
import * as legalApi from '../../api/legal.js';
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

function formatDateTime(value) {
  if (!value) return '—';
  return new Date(value.replace(' ', 'T')).toLocaleString('ar-EG', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const MOVEMENT_LABELS = {
  fee_payment: 'سداد أتعاب',
  retainer_deposit: 'إيداع أمانة',
  court_fee: 'رسوم محكمة',
  other_expense: 'مصروفات أخرى',
};

const ICON_PATHS = {
  scale: (
    <>
      <path d="M12 3v18" />
      <path d="M5 7h14" />
      <path d="m5 7-3 6h6L5 7Z" />
      <path d="m19 7-3 6h6l-3-6Z" />
      <path d="M8 21h8" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18" />
      <path d="m9 15 2 2 4-4" />
    </>
  ),
  briefcase: (
    <>
      <rect x="3" y="7" width="18" height="14" rx="2" />
      <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 12h18M10 12v2h4v-2" />
    </>
  ),
  wallet: (
    <>
      <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4H20v16H6.5A2.5 2.5 0 0 1 4 17.5v-11Z" />
      <path d="M4 7h13a3 3 0 0 1 3 3v1h-5a2 2 0 0 0 0 4h5v2" />
      <path d="M15 13h.01" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 9 16H3l9-16Z" />
      <path d="M12 9v4M12 16h.01" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </>
  ),
  receipt: (
    <>
      <path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </>
  ),
  hourglass: <><path d="M6 2h12M6 22h12" /><path d="M8 2v4l4 4 4-4V2M8 22v-4l4-4 4 4v4" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  check: <><path d="m5 12 4 4L19 6" /></>,
};

function LegalIcon({ name, size = 20 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {ICON_PATHS[name]}
    </svg>
  );
}

function MetricCard({ icon, label, value, note, tone, onClick, active = false }) {
  return (
    <button
      type="button"
      className={`law-dashboard-metric law-tone-${tone}${onClick ? ' is-actionable' : ''}${active ? ' is-selected' : ''}`}
      onClick={onClick}
      disabled={!onClick}
    >
      <span className="law-dashboard-metric-icon"><LegalIcon name={icon} size={21} /></span>
      <div>
        <span className="law-dashboard-metric-label">{label}</span>
        <strong className="law-dashboard-metric-value">{value}</strong>
        {note && <span className="law-dashboard-metric-note">{note}</span>}
      </div>
      {onClick && <span className="law-metric-action">عرض التفاصيل</span>}
    </button>
  );
}

function SessionRow({ session, onOpenCase, onMarkAttended, saving }) {
  const isScheduled = session.status === 'scheduled';
  return (
    <article className="law-dashboard-session">
      <span className="law-session-time">{formatDateTime(session.session_date)}</span>
      <button type="button" className="law-session-main" onClick={onOpenCase} title="فتح ملف القضية">
        <strong>{session.court_name || 'محكمة غير محددة'} · {session.case_number}</strong>
        <small>{session.client_name || 'موكّل غير محدد'} — {session.case_subject || session.session_reason || 'جلسة متابعة'}</small>
      </button>
      <div className="law-session-actions">
        <span className="law-session-lawyer">{session.assigned_lawyer_name || 'لم يُعيّن محامٍ'}</span>
        {isScheduled ? (
          <button type="button" className="law-session-attend" onClick={() => onMarkAttended(session)} disabled={saving}>
            <LegalIcon name="check" size={15} />
            {saving ? 'جارٍ الحفظ' : 'تم الحضور'}
          </button>
        ) : <span className={`law-session-status law-session-status-${session.status}`}>{session.status === 'attended' ? 'تم الحضور' : session.status}</span>}
      </div>
    </article>
  );
}

function deadlineRemainingLabel(days) {
  if (days < 0) return `فات الميعاد بـ ${Math.abs(days)} يوم`;
  if (days === 0) return 'آخر يوم النهاردة';
  if (days === 1) return 'باقي يوم واحد';
  if (days === 2) return 'باقي يومان';
  return `باقي ${days} يوم`;
}

function deadlineTone(days) {
  if (days <= 2) return 'danger';
  if (days <= 7) return 'warning';
  return 'calm';
}

export default function LawFirmTodayPage({ onNavigate }) {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDate, setSelectedDate] = useState(getLocalDateString);
  const [agendaView, setAgendaView] = useState('today');
  const [sessionSearch, setSessionSearch] = useState('');
  const [savingSessionId, setSavingSessionId] = useState(null);
  const [actionError, setActionError] = useState('');
  const dashboardRequestId = useRef(0);

  const loadDashboard = useCallback(async () => {
    const requestId = ++dashboardRequestId.current;
    setLoading(true);
    setError('');
    try {
      const result = await legalApi.getLawFirmDashboard(selectedDate);
      if (requestId === dashboardRequestId.current) setDashboard(result);
    } catch (loadError) {
      console.error('تعذر تحميل لوحة المحامي:', loadError);
      if (requestId === dashboardRequestId.current) {
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل لوحة المحامي');
      }
    } finally {
      if (requestId === dashboardRequestId.current) setLoading(false);
    }
  }, [selectedDate]);

  useEffect(() => {
    loadDashboard();
    return () => {
      dashboardRequestId.current += 1;
    };
  }, [loadDashboard]);

  if (loading && !dashboard) {
    return (
      <main className="law-dashboard-page" dir="rtl" aria-busy="true">
        <div className="law-dashboard-loading"><span className="law-dashboard-spinner" /> جاري تحميل جدول القضايا والجلسات...</div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="law-dashboard-page" dir="rtl">
        <div className="law-dashboard-error" role="alert">
          <strong>تعذر تحميل بيانات اليوم</strong>
          <span>{error}</span>
          <button type="button" onClick={loadDashboard}>إعادة المحاولة</button>
        </div>
      </main>
    );
  }

  const cases = dashboard?.caseStats || {};
  const sessions = dashboard?.sessionStats || {};
  const finance = dashboard?.financialStats || {};
  const todaySessions = dashboard?.todaySessions || [];
  const upcomingSessions = (dashboard?.upcomingSessions || [])
    .filter((session) => String(session.session_date).slice(0, 10) !== selectedDate);
  const movements = dashboard?.financialMovements || [];
  const deadlines = dashboard?.criticalDeadlines || [];
  const agendaSessions = agendaView === 'today'
    ? todaySessions
    : agendaView === 'upcoming'
      ? upcomingSessions
      : [...todaySessions, ...upcomingSessions];
  const term = sessionSearch.trim().toLocaleLowerCase();
  const allSessions = agendaSessions.filter((session) => !term || [
    session.case_number,
    session.court_name,
    session.client_name,
    session.case_subject,
    session.session_reason,
    session.assigned_lawyer_name,
  ].some((value) => String(value || '').toLocaleLowerCase().includes(term)));

  async function markSessionAttended(session) {
    setSavingSessionId(session.id);
    setActionError('');
    try {
      await legalApi.updateCourtSession(session.id, { status: 'attended' });
      await loadDashboard();
    } catch (actionFailure) {
      setActionError(actionFailure instanceof Error ? actionFailure.message : 'تعذر تحديث حالة الجلسة');
    } finally {
      setSavingSessionId(null);
    }
  }

  function openCase(caseId) {
    onNavigate('cases', { caseId });
  }

  return (
    <main className="law-dashboard-page" dir="rtl">
      <header className="law-dashboard-header">
        <div>
          <div className="law-dashboard-eyebrow"><LegalIcon name="scale" size={17} /> مكتب المحاماة</div>
          <h1>يومك في المحاكم</h1>
          <p>
            {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('ar-EG', {
              weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            })}
            {' '}· متابعة الجلسات والقضايا والحركات المالية
          </p>
        </div>
        <div className="law-dashboard-actions">
          <label className="law-dashboard-date-control">
            <span>عرض يوم</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(event) => {
                if (event.target.value) setSelectedDate(event.target.value);
              }}
              aria-label="اختيار تاريخ لوحة المحامي"
            />
          </label>
          <button type="button" className="law-dashboard-button law-button-secondary" onClick={loadDashboard} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث البيانات'}
          </button>
          <button type="button" className="law-dashboard-button law-button-secondary" onClick={() => onNavigate('courts')}>
            دليل المحاكم
          </button>
          <button type="button" className="law-dashboard-button law-button-primary" onClick={() => onNavigate('cases', { createCase: true })}>
            <LegalIcon name="briefcase" size={17} /> قضية جديدة
          </button>
        </div>
      </header>

      {loading && dashboard && (
        <div className="law-dashboard-refreshing" role="status" aria-live="polite">
          جاري تحديث بيانات {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('ar-EG')}...
        </div>
      )}

      <section className="law-dashboard-metrics" aria-label="ملخص اليوم">
        <MetricCard icon="scale" label="جلسات اليوم" value={Number(sessions.today_sessions || 0)} note={`${Number(sessions.scheduled_today || 0)} جلسة مجدولة`} tone="blue" onClick={() => setAgendaView('today')} active={agendaView === 'today'} />
        <MetricCard icon="calendar" label="جلسات خلال 7 أيام" value={Number(sessions.upcoming_week || 0)} note="جلسات مجدولة" tone="violet" onClick={() => setAgendaView('upcoming')} active={agendaView === 'upcoming'} />
        <MetricCard icon="briefcase" label="قضايا نشطة" value={Number(cases.active_cases || 0)} note={`أتعاب متبقية ${formatMoney(cases.outstanding_fees)}`} tone="teal" onClick={() => onNavigate('cases')} />
        <MetricCard icon="wallet" label="أتعاب محصلة في اليوم المحدد" value={formatMoney(finance.fees_collected)} note={`${Number(finance.movement_count || 0)} حركة مالية`} tone="green" onClick={() => onNavigate('reports')} />
      </section>

      {actionError && <div className="law-dashboard-action-error" role="alert">{actionError}</div>}

      {Number(sessions.overdue_sessions || 0) > 0 && (
        <button type="button" className="law-dashboard-overdue" onClick={() => onNavigate('cases')}>
          <span className="law-dashboard-alert-icon"><LegalIcon name="alert" /></span>
          <strong>{Number(sessions.overdue_sessions)} جلسات سابقة ما زالت بحالة «مجدولة»</strong>
          <span>راجع حالة الجلسة وقرار المحكمة</span>
        </button>
      )}

      <section className="law-dashboard-finances" aria-label="ملخص الحركات المالية">
        <article>
          <span>الأتعاب المحصلة</span>
          <strong className="law-finance-positive">{formatMoney(finance.fees_collected)}</strong>
          <small>إيراد المكتب من أتعاب القضايا</small>
        </article>
        <article>
          <span>أمانات الموكلين</span>
          <strong>{formatMoney(finance.client_deposits)}</strong>
          <small>تُعرض منفصلة عن إيرادات الأتعاب</small>
        </article>
        <article>
          <span>المصروفات القضائية</span>
          <strong className="law-finance-negative">{formatMoney(finance.court_expenses)}</strong>
          <small>الرسوم والمصروفات المسجلة اليوم</small>
        </article>
      </section>

      <div className="law-dashboard-columns">
        <section className="law-dashboard-panel law-dashboard-sessions-panel">
          <div className="law-dashboard-panel-header">
            <div>
              <span className="law-dashboard-panel-icon"><LegalIcon name="calendar" /></span>
              <h2>{agendaView === 'today' ? 'جلسات اليوم' : agendaView === 'upcoming' ? 'الجلسات القادمة' : 'كل الجلسات'}</h2>
              <p>{allSessions.length ? `${allSessions.length} جلسة مطابقة` : 'ابحث وراجع جدول المكتب'}</p>
            </div>
            <div className="law-agenda-tools">
              <div className="law-agenda-search">
                <LegalIcon name="search" size={17} />
                <input
                  type="search"
                  value={sessionSearch}
                  onChange={(event) => setSessionSearch(event.target.value)}
                  placeholder="رقم القضية أو الموكل أو المحكمة"
                  aria-label="البحث في جدول الجلسات"
                />
              </div>
              <button type="button" className="law-dashboard-link" onClick={() => onNavigate('courts')}>دليل المحاكم</button>
            </div>
          </div>
          <div className="law-agenda-tabs" role="tablist" aria-label="تصفية الجلسات">
            {[['today', 'اليوم'], ['upcoming', 'القادم'], ['all', 'الكل']].map(([value, label]) => (
              <button type="button" role="tab" aria-selected={agendaView === value} className={agendaView === value ? 'active' : ''} key={value} onClick={() => setAgendaView(value)}>
                {label}
              </button>
            ))}
          </div>
          {allSessions.length ? (
            <div className="law-dashboard-list">
              {allSessions.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onOpenCase={() => openCase(session.case_id)}
                  onMarkAttended={markSessionAttended}
                  saving={savingSessionId === session.id}
                />
              ))}
            </div>
          ) : (
            <div className="law-dashboard-empty">
              <span className="law-dashboard-empty-icon"><LegalIcon name="calendar" size={30} /></span>
              <strong>{sessionSearch ? 'لا توجد جلسات تطابق البحث' : agendaView === 'today' ? 'لا توجد جلسات في هذا اليوم' : 'لا توجد جلسات قادمة'}</strong>
              <p>{sessionSearch ? 'جرّب البحث برقم القضية أو اسم الموكل أو المحكمة.' : 'سجّل الجلسة من ملف القضية لتظهر هنا مع إجراءات المتابعة.'}</p>
              <button type="button" className="law-dashboard-button law-button-primary" onClick={() => onNavigate('cases')}>إدارة القضايا والجلسات</button>
            </div>
          )}
        </section>

        <section className="law-dashboard-panel">
          <div className="law-dashboard-panel-header">
            <div>
              <span className="law-dashboard-panel-icon"><LegalIcon name="arrow" /></span>
              <h2>القادم خلال أسبوع</h2>
              <p>استعد للجلسات القادمة حسب المحكمة</p>
            </div>
          </div>
          {upcomingSessions.length ? (
            <div className="law-dashboard-list">
              {upcomingSessions.slice(0, 8).map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  onOpenCase={() => openCase(session.case_id)}
                  onMarkAttended={markSessionAttended}
                  saving={savingSessionId === session.id}
                />
              ))}
            </div>
          ) : (
            <div className="law-dashboard-empty law-dashboard-empty-compact">
              <strong>لا توجد جلسات مجدولة خلال الأسبوع</strong>
            </div>
          )}

          <div className="law-deadlines">
            <div className="law-deadlines-header">
              <span className="law-dashboard-panel-icon"><LegalIcon name="hourglass" /></span>
              <div>
                <h3>مواعيد حرجة</h3>
                <p>مواعيد الطعن والمدد القانونية المفتوحة</p>
              </div>
            </div>
            {deadlines.length ? (
              <ul className="law-deadlines-list">
                {deadlines.map((deadline) => {
                  const days = Number(deadline.days_remaining);
                  return (
                    <li key={deadline.id} className={`law-deadline law-deadline-${deadlineTone(days)}`}>
                      <button type="button" onClick={() => openCase(deadline.case_id)} title="فتح ملف القضية">
                        <strong>{deadline.title}</strong>
                        <small>قضية {deadline.case_number}{deadline.client_name ? ` · ${deadline.client_name}` : ''}</small>
                        <span className="law-deadline-remaining">
                          {deadlineRemainingLabel(days)}
                          <em>آخر يوم {new Date(deadline.due_at).toLocaleDateString('ar-EG')}</em>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="law-deadlines-empty">لا توجد مواعيد قانونية مفتوحة. سجّل ميعاد الطعن من تبويب «مهام المتابعة» في ملف القضية.</p>
            )}
          </div>
        </section>
      </div>

      <section className="law-dashboard-panel law-dashboard-movements">
        <div className="law-dashboard-panel-header">
          <div>
            <span className="law-dashboard-panel-icon"><LegalIcon name="receipt" /></span>
            <h2>الحركات المالية القانونية في اليوم المحدد</h2>
            <p>الأتعاب والأمانات والمصروفات المرتبطة بملفات القضايا</p>
          </div>
          <button type="button" className="law-dashboard-link" onClick={() => onNavigate('reports')}>التقارير القانونية</button>
        </div>
        {movements.length ? (
          <div className="law-dashboard-table-wrap">
            <table className="law-dashboard-table">
              <thead>
                <tr><th>الوقت</th><th>نوع الحركة</th><th>القضية</th><th>الموكل</th><th>البيان</th><th>المبلغ</th><th>الإجراء</th></tr>
              </thead>
              <tbody>
                {movements.map((movement) => (
                  <tr key={movement.id}>
                    <td>{formatDateTime(movement.date)}</td>
                    <td>{MOVEMENT_LABELS[movement.type] || movement.type}</td>
                    <td>{movement.case_number} · {movement.court_name}</td>
                    <td>{movement.client_name || '—'}</td>
                    <td>{movement.description || '—'}</td>
                    <td className={movement.type === 'fee_payment' ? 'law-finance-positive' : ''}>{formatMoney(movement.amount)}</td>
                    <td><button type="button" className="law-movement-open" onClick={() => openCase(movement.case_id)}>فتح القضية</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="law-dashboard-empty law-dashboard-empty-compact">لا توجد حركات مالية للقضايا اليوم.</div>
        )}
      </section>
    </main>
  );
}

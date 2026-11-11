import { useState } from 'react';
import {
  CalendarIcon, CallIcon, CheckIcon, ChevronSideIcon, ClockIcon, FileTextIcon, MailIcon, PencilIcon, PlusIcon, UsersIcon,
} from '../icons/PosIcons.jsx';
import { daysBetween, initials, money, num, parseDbDate } from './crmFormat.js';

const TYPES = {
  call: { label: 'مكالمة', Icon: CallIcon, tone: 'primary' },
  email: { label: 'بريد', Icon: MailIcon, tone: 'primary' },
  meeting: { label: 'اجتماع', Icon: UsersIcon, tone: 'info' },
  task: { label: 'مهمة', Icon: PencilIcon, tone: 'muted' },
  note: { label: 'ملاحظة', Icon: FileTextIcon, tone: 'muted' },
};
const RECORD_LABELS = { customer: 'عميل', company: 'شركة', lead: 'عميل محتمل', opportunity: 'صفقة' };
const WEEK_DAYS = 7;

const dayTitle = (date) => date.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' });
const timeText = (date) => date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });

function overdueText(days) {
  if (days === 1) return 'متأخرة يوم';
  if (days === 2) return 'متأخرة يومين';
  return days <= 10 ? `متأخرة ${num(days)} أيام` : `متأخرة ${num(days)} يوم`;
}

/**
 * Splits activities into the follow-up schedule: overdue, today, each later day, undated,
 * and recently completed; plus the four counters on top. "Overdue" means due on an earlier day.
 */
export function buildSchedule(activities, now = new Date()) {
  const stats = { overdue: 0, today: 0, week: 0, doneThisWeek: 0 };
  const overdue = [];
  const byDay = new Map();
  const undated = [];
  const done = [];

  activities.forEach((activity) => {
    const due = parseDbDate(activity.due_at);
    if (activity.status === 'completed') {
      const at = parseDbDate(activity.updated_at || activity.created_at);
      if (at && daysBetween(at, now) < WEEK_DAYS) {
        stats.doneThisWeek += 1;
        done.push(activity);
      }
      return;
    }
    if (activity.status !== 'open') return;
    if (!due) { undated.push(activity); return; }
    const offset = -daysBetween(due, now); // 0 = today, 1 = tomorrow, negative = overdue
    if (offset < 0) {
      stats.overdue += 1;
      overdue.push({ activity, late: -offset });
      return;
    }
    if (offset === 0) stats.today += 1;
    if (offset < WEEK_DAYS) stats.week += 1;
    const key = due.toDateString();
    if (!byDay.has(key)) byDay.set(key, { offset, date: due, items: [] });
    byDay.get(key).items.push(activity);
  });

  const byDue = (a, b) => parseDbDate(a.due_at) - parseDbDate(b.due_at);
  const groups = [];
  if (overdue.length) {
    groups.push({
      key: 'overdue',
      title: 'متأخرة — تحتاج تصرف',
      tone: 'warning',
      rows: overdue.sort((a, b) => b.late - a.late).map(({ activity, late }) => ({ activity, when: overdueText(late), late: true })),
    });
  }
  [...byDay.values()].sort((a, b) => a.offset - b.offset).forEach(({ offset, date, items }) => {
    const prefix = offset === 0 ? 'اليوم — ' : offset === 1 ? 'غداً — ' : '';
    groups.push({
      key: date.toDateString(),
      title: `${prefix}${dayTitle(date)}`,
      rows: items.sort(byDue).map((activity) => ({ activity, when: timeText(parseDbDate(activity.due_at)) })),
    });
  });
  if (undated.length) {
    groups.push({ key: 'undated', title: 'بدون موعد', rows: undated.map((activity) => ({ activity, when: '' })) });
  }
  if (done.length) {
    groups.push({ key: 'done', title: 'اكتملت هذا الأسبوع', tone: 'done', rows: done.map((activity) => ({ activity, when: 'مكتملة', done: true })) });
  }
  return { stats, groups };
}

function subtitle(activity) {
  const record = activity.record_name
    ? `${RECORD_LABELS[activity.record_type] || ''} ${activity.record_name}`.trim()
    : 'مهمة داخلية';
  const value = activity.record_value ? `قيمة ${money(activity.record_value)}` : null;
  return [record, value, activity.details].filter(Boolean).join(' · ');
}

function StatCard({ icon: Icon, tone, label, value, highlight }) {
  return (
    <article className={`crm-ov-card crm-ac-stat ${highlight ? 'is-alert' : ''}`}>
      <span className={`crm-ov-chip crm-ov-chip--${tone}`}><Icon size={18} /></span>
      <div>
        <span className="crm-ac-stat-label">{label}</span>
        <strong className={`crm-ac-stat-value crm-ac-stat-value--${tone}`}>{value}</strong>
      </div>
    </article>
  );
}

function CRMActivitiesList({ activities, loading, onAdd, onComplete }) {
  const [completing, setCompleting] = useState(null);
  const { stats, groups } = buildSchedule(activities);
  const show = (value) => (loading ? '—' : num(value));

  const complete = async (id) => {
    setCompleting(id);
    try { await onComplete(id); } finally { setCompleting(null); }
  };

  return (
    <div className="crm-ds crm-ac">
      <div className="crm-ac-stats">
        <StatCard icon={ClockIcon} tone="warning" label="متأخرة" value={show(stats.overdue)} highlight={stats.overdue > 0} />
        <StatCard icon={CalendarIcon} tone="primary" label="اليوم" value={show(stats.today)} />
        <StatCard icon={ChevronSideIcon} tone="info" label="خلال ٧ أيام" value={show(stats.week)} />
        <StatCard icon={CheckIcon} tone="success" label="اكتملت هذا الأسبوع" value={show(stats.doneThisWeek)} />
      </div>

      <section className="crm-ov-card crm-ac-board" aria-labelledby="crm-ac-title">
        <h2 id="crm-ac-title" className="crm-ac-title">جدول المتابعة</h2>
        {loading ? (
          <p className="crm-pl-note">جارٍ تحميل المهام والأنشطة...</p>
        ) : groups.length === 0 ? (
          <div className="crm-cf-empty">
            <div className="crm-ov-empty crm-ct-empty">
              <span className="crm-ov-chip crm-ov-chip--lg"><CalendarIcon size={22} /></span>
              <strong>لا توجد أنشطة أو مهام مسجلة</strong>
              <p>سجّل مكالماتك ومواعيدك، وهتلاقيها هنا مترتبة باليوم.</p>
              <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={onAdd}>
                <PlusIcon size={18} />
                نشاط / مهمة جديدة
              </button>
            </div>
          </div>
        ) : groups.map((group) => (
          <div key={group.key} className="crm-ac-group">
            <h3 className={`crm-ac-group-title ${group.tone ? `crm-ac-group-title--${group.tone}` : ''}`}>{group.title}</h3>
            <ul className="crm-ac-list">
              {group.rows.map(({ activity, when, late, done }) => {
                const type = TYPES[activity.activity_type] || TYPES.task;
                return (
                  <li key={activity.id} className={`crm-ac-row ${done ? 'is-done' : ''}`}>
                    <input
                      type="checkbox"
                      className="crm-ac-check"
                      checked={Boolean(done)}
                      disabled={done || completing === activity.id}
                      onChange={() => complete(activity.id)}
                      aria-label={done ? `${activity.title} مكتملة` : `إكمال ${activity.title}`}
                    />
                    <span className={`crm-ov-chip crm-ov-chip--${type.tone}`} title={type.label}><type.Icon size={18} /></span>
                    <div className="crm-ac-text">
                      <strong>{activity.title}</strong>
                      <span>{subtitle(activity)}</span>
                    </div>
                    <span className={`crm-ac-when ${late ? 'is-late' : ''}`}>{when}</span>
                    <span className="crm-ov-avatar crm-pl-avatar" title={activity.owner_username || 'غير معيّن'}>
                      {activity.owner_username ? initials(activity.owner_username) : '—'}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}

export default CRMActivitiesList;

import { useMemo, useState } from 'react';
import * as inventoryApi from '../../api/inventory.js';
import LegalIcon from './LegalIcon.jsx';
import {
  HOLIDAY_REASONS, dayMonth, formatTime12, holidayName, holidayState, holidaySummary, localTimeOf, parseHolidayName,
  shiftDate, toDateValue,
} from '../../utils/legalSchedule.js';

const SPANS = [['day', 'يوم واحد'], ['week', 'أسبوع'], ['custom', 'مدة مخصصة']];
const STATE_BADGE = { upcoming: ['pending', 'قادمة'], current: ['missed', 'جارية الآن'], ended: ['muted', 'منتهية'] };

const endFor = (span, startDate, endDate) => {
  if (span === 'day') return startDate;
  if (span === 'week') return shiftDate(startDate, 6);
  return endDate < startDate ? startDate : endDate;
};

const blankForm = () => {
  const today = toDateValue(new Date());
  return {
    id: null,
    resourceId: '',
    span: 'day',
    startDate: today,
    endDate: today,
    fullDay: true,
    startTime: '13:00',
    endTime: '16:00',
    reason: HOLIDAY_REASONS[0],
    details: '',
  };
};

export default function LegalHolidaysTab({ holidays, resources, busy, runAction, setError }) {
  const [form, setForm] = useState(blankForm);
  const [view, setView] = useState('upcoming');
  const today = toDateValue(new Date());

  const lists = useMemo(() => {
    const upcoming = holidays.filter((holiday) => holidayState(holiday, today) !== 'ended')
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    const ended = holidays.filter((holiday) => holidayState(holiday, today) === 'ended')
      .sort((a, b) => b.end_date.localeCompare(a.end_date));
    return { upcoming, ended };
  }, [holidays, today]);
  const visible = lists[view];

  const update = (patch) => setForm((prev) => {
    const next = { ...prev, ...patch };
    return { ...next, endDate: endFor(next.span, next.startDate, next.endDate) };
  });

  function edit(holiday) {
    const { reason, details } = parseHolidayName(holiday.name);
    const span = holiday.start_date === holiday.end_date ? 'day'
      : holiday.end_date === shiftDate(holiday.start_date, 6) ? 'week' : 'custom';
    setForm({
      id: holiday.id,
      resourceId: holiday.resource_id ? String(holiday.resource_id) : '',
      span,
      startDate: holiday.start_date,
      endDate: holiday.end_date,
      fullDay: !holiday.start_time,
      startTime: holiday.start_time || '13:00',
      endTime: holiday.end_time || '16:00',
      reason,
      details,
    });
  }

  async function submit(event) {
    event.preventDefault();
    if (!form.reason && !form.details.trim()) return setError('اختر سبب عدم التوفر أو اكتب التفاصيل');
    const payload = {
      id: form.id,
      resourceId: form.resourceId,
      startDate: form.startDate,
      endDate: form.endDate,
      startTime: form.fullDay ? '' : form.startTime,
      endTime: form.fullDay ? '' : form.endTime,
      name: form.reason ? holidayName(form.reason, form.details) : form.details.trim(),
    };

    if (inventoryApi.getAppointmentHolidayConflicts.isAvailable()) {
      try {
        const conflicts = await inventoryApi.getAppointmentHolidayConflicts(payload);
        if (conflicts.length) {
          const lines = conflicts.slice(0, 5).map((item) => (
            `• ${item.customer_name} — ${item.service_name} مع ${item.resource_name} (${toDateValue(new Date(item.start_at))} ${formatTime12(localTimeOf(item.start_at))})`
          ));
          if (conflicts.length > 5) lines.push(`• و${conflicts.length - 5} جلسات أخرى`);
          const proceed = window.confirm(
            `فيه ${conflicts.length} جلسة محجوزة داخل الفترة دي:\n${lines.join('\n')}\n\nالجلسات دي مش هتتلغي تلقائيًا، انقلها أو ألغها من جدول الجلسات.\nتحفظ وقت عدم التوفر برضه؟`,
          );
          if (!proceed) return;
        }
      } catch (conflictError) {
        return setError(conflictError instanceof Error ? conflictError.message : 'تعذر فحص الجلسات المحجوزة');
      }
    }

    const saved = await runAction(
      () => inventoryApi.saveAppointmentHoliday(payload),
      form.id ? 'تم تعديل وقت عدم التوفر' : 'تم تسجيل وقت عدم التوفر',
    );
    if (saved) setForm(blankForm());
  }

  async function remove(holiday) {
    if (!window.confirm(`حذف «${holiday.name}»؟ المواعيد في الفترة دي هتبقى متاحة للحجز تاني.`)) return;
    const done = await runAction(() => inventoryApi.removeAppointmentHoliday(holiday.id), 'تم حذف وقت عدم التوفر');
    if (done && form.id === holiday.id) setForm(blankForm());
  }

  return (
    <div className="legal-resources-layout">
      <form className="appointment-card legal-resource-form" onSubmit={submit}>
        <h2>{form.id ? 'تعديل وقت عدم التوفر' : 'تسجيل وقت عدم توفر'}</h2>

        <label>يشمل
          <select value={form.resourceId} onChange={(event) => update({ resourceId: event.target.value })}>
            <option value="">المكتب كله</option>
            {resources.map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
          </select>
        </label>

        <div className="legal-field">
          <span className="legal-field-label">المدة <span className="legal-required">*</span></span>
          <div className="legal-kind-picker" role="radiogroup" aria-label="المدة">
            {SPANS.map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={form.span === value}
                className={form.span === value ? 'active' : ''}
                onClick={() => update({ span: value })}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="legal-form-row">
          <label><span>من تاريخ <span className="legal-required">*</span></span>
            <input type="date" required value={form.startDate} onChange={(event) => update({ startDate: event.target.value })} />
          </label>
          <label><span>إلى تاريخ <span className="legal-required">*</span></span>
            <input
              type="date"
              required
              min={form.startDate}
              disabled={form.span !== 'custom'}
              value={form.endDate}
              onChange={(event) => update({ endDate: event.target.value })}
            />
          </label>
        </div>

        <div className="legal-time-box">
          <label className="legal-check-row">
            <input type="checkbox" checked={form.fullDay} onChange={(event) => update({ fullDay: event.target.checked })} />
            يوم كامل
          </label>
          <div className="legal-form-row">
            <label>من الساعة
              <input type="time" required={!form.fullDay} disabled={form.fullDay} value={form.startTime} onChange={(event) => update({ startTime: event.target.value })} />
            </label>
            <label>إلى الساعة
              <input type="time" required={!form.fullDay} disabled={form.fullDay} value={form.endTime} onChange={(event) => update({ endTime: event.target.value })} />
            </label>
          </div>
        </div>

        <div className="legal-field">
          <span className="legal-field-label">سبب عدم التوفر <span className="legal-required">*</span></span>
          <div className="legal-chips" role="radiogroup" aria-label="سبب عدم التوفر">
            {HOLIDAY_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                role="radio"
                aria-checked={form.reason === reason}
                className={form.reason === reason ? 'active' : ''}
                onClick={() => update({ reason })}
              >
                {reason}
              </button>
            ))}
          </div>
          <textarea
            rows="3"
            aria-label="تفاصيل إضافية"
            value={form.details}
            onChange={(event) => update({ details: event.target.value })}
            placeholder="تفاصيل إضافية (اختياري)..."
          />
        </div>

        <p className="legal-note warning">
          <LegalIcon name="alert" size={16} />
          <span>لو فيه جلسات محجوزة داخل هذه الفترة، هيتم تنبيهك قبل الحفظ عشان تنقلها أو تلغيها.</span>
        </p>

        <div className="legal-form-actions">
          <button className="appointment-button primary" type="submit" disabled={busy}>
            {busy ? 'جاري الحفظ...' : form.id ? 'حفظ التعديلات' : 'حفظ وقت عدم التوفر'}
          </button>
          {form.id && <button className="appointment-button secondary" type="button" onClick={() => setForm(blankForm())}>إلغاء التعديل</button>}
        </div>
      </form>

      <div className="appointment-card legal-resource-panel">
        <div className="legal-schedule-heading">
          <h2>سجل أوقات عدم التوفر <small>({holidays.length})</small></h2>
          <div className="legal-segmented compact" role="tablist" aria-label="عرض أوقات عدم التوفر">
            {[['upcoming', 'القادمة'], ['ended', 'المنتهية']].map(([key, label]) => (
              <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? 'active' : ''} onClick={() => setView(key)}>
                {label} ({lists[key].length})
              </button>
            ))}
          </div>
        </div>

        {!visible.length ? (
          <div className="appointment-empty">{view === 'upcoming' ? 'لا توجد أوقات عدم توفر قادمة.' : 'لا توجد أوقات عدم توفر منتهية.'}</div>
        ) : (
          <div className="legal-session-list">
            {visible.map((holiday) => {
              const { day, month } = dayMonth(holiday.start_date);
              const [tone, label] = STATE_BADGE[holidayState(holiday, today)];
              return (
                <article className={`legal-session legal-holiday${form.id === holiday.id ? ' editing' : ''}`} key={holiday.id}>
                  <div className="legal-session-row">
                    <div className="legal-session-time">
                      <strong>{day}</strong>
                      <span>{month}</span>
                    </div>
                    <div className="legal-session-body">
                      <div className="legal-session-title">
                        <strong>{holiday.name}</strong>
                        <span className={`legal-badge ${tone}`}>{label}</span>
                      </div>
                      <p>{holidaySummary(holiday)}</p>
                    </div>
                    <div className="legal-session-actions">
                      <button type="button" aria-label={`تعديل ${holiday.name}`} title="تعديل" onClick={() => edit(holiday)}>
                        <LegalIcon name="pencil" />
                      </button>
                      <button type="button" className="danger" aria-label={`حذف ${holiday.name}`} title="حذف" disabled={busy} onClick={() => remove(holiday)}>
                        <LegalIcon name="trash" />
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

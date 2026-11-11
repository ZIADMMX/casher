import { useMemo, useState } from 'react';
import * as inventoryApi from '../../api/inventory.js';
import LegalIcon from './LegalIcon.jsx';
import {
  DAY_NAMES, daySessions, formatLongDate, formatTime12, localTimeOf, sessionStats, shiftDate, toDateValue, weekDays,
} from '../../utils/legalSchedule.js';

const STATUS = {
  booked: ['pending', 'بانتظار التأكيد'],
  confirmed: ['confirmed', 'مؤكدة'],
  completed: ['completed', 'مكتملة'],
  no_show: ['missed', 'لم يحضر'],
  converted: ['completed', 'تم إصدار فاتورة أتعاب'],
};

const FILTERS = [
  ['all', 'الكل'],
  ['confirmed', 'مؤكدة'],
  ['booked', 'بانتظار التأكيد'],
];

const blankForm = (date) => ({
  clientMode: 'registered',
  customerId: '',
  customerName: '',
  customerPhone: '',
  serviceId: '',
  resourceId: '',
  date,
  time: '',
  depositAmount: '',
  notes: '',
});

const money = (value) => `${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })} ج.م`;

export default function LegalScheduleTab({
  appointments, services, resources, customers, busy, runAction, setError, resourceLabel,
}) {
  const today = toDateValue(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [filter, setFilter] = useState('all');
  const [form, setForm] = useState(() => blankForm(today));
  const [editing, setEditing] = useState(null);

  const sessions = useMemo(() => daySessions(appointments, selectedDate), [appointments, selectedDate]);
  const stats = sessionStats(sessions);
  const visible = filter === 'all' ? sessions : sessions.filter((session) => session.status === filter);
  const selectedService = services.find((service) => String(service.id) === String(form.serviceId));
  const matchingResources = resources.filter((resource) => (
    !selectedService?.resource_type || resource.resource_type === selectedService.resource_type
  ));

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  async function submit(event) {
    event.preventDefault();
    if (form.clientMode === 'registered' && !form.customerId) return setError('اختر الموكّل المسجّل أو أضف موكّلاً جديدًا');
    if (!form.serviceId) return setError('اختر نوع الجلسة');
    if (!form.resourceId) return setError('اختر المحامي أو القاعة');
    const registered = form.clientMode === 'registered';
    const saved = await runAction(() => inventoryApi.createAppointment({
      serviceId: Number(form.serviceId),
      resourceId: Number(form.resourceId),
      customerId: registered ? Number(form.customerId) : null,
      customerName: form.customerName.trim(),
      customerPhone: form.customerPhone.trim(),
      startAt: `${form.date}T${form.time}`,
      depositAmount: Number(form.depositAmount || 0),
      reminderMinutes: 60,
      notes: form.notes,
    }), 'تم حفظ الجلسة وإشعار المحامي');
    if (saved) {
      setSelectedDate(form.date);
      setForm(blankForm(form.date));
    }
  }

  function beginEdit(session) {
    const start = new Date(session.start_at);
    setEditing({
      id: session.id,
      resourceId: String(session.resource_id),
      date: toDateValue(start),
      time: localTimeOf(session.start_at),
    });
  }

  async function saveEdit(event) {
    event.preventDefault();
    const saved = await runAction(() => inventoryApi.rescheduleAppointment(editing.id, {
      startAt: `${editing.date}T${editing.time}`,
      resourceId: Number(editing.resourceId),
    }), 'تم تعديل موعد الجلسة');
    if (saved) setEditing(null);
  }

  const setStatus = (session, status, message) => runAction(
    () => inventoryApi.updateAppointmentStatus(session.id, status),
    message,
  ).then((saved) => saved && setEditing(null));

  function cancelSession(session) {
    if (!window.confirm(`إلغاء جلسة ${session.customer_name}؟ ستبقى في السجل كجلسة ملغاة.`)) return;
    setStatus(session, 'cancelled', 'تم إلغاء الجلسة');
  }

  return (
    <div className="legal-schedule-layout">
      <form className="appointment-card legal-booking-form" onSubmit={submit}>
        <h2>حجز جلسة جديدة</h2>

        <section className="legal-form-step">
          <h3><span className="legal-step-number">1</span>الموكّل</h3>
          <div className="legal-segmented" role="radiogroup" aria-label="نوع الموكّل">
            {[['registered', 'موكّل مسجّل'], ['new', 'موكّل جديد']].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={form.clientMode === mode}
                className={form.clientMode === mode ? 'active' : ''}
                onClick={() => update({ clientMode: mode, customerId: '', customerName: '', customerPhone: '' })}
              >
                {label}
              </button>
            ))}
          </div>
          {form.clientMode === 'registered' ? (
            <label>اختر الموكّل
              <select
                value={form.customerId}
                onChange={(event) => {
                  const customer = customers.find((item) => String(item.id) === event.target.value);
                  update({ customerId: event.target.value, customerName: customer?.name || '', customerPhone: customer?.phone || '' });
                }}
              >
                <option value="">اختر موكلاً مسجلاً...</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name}{customer.phone ? ` (${customer.phone})` : ''}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <div className="legal-form-row">
              <label><span>اسم الموكّل <span className="legal-required">*</span></span>
                <input required value={form.customerName} onChange={(event) => update({ customerName: event.target.value })} placeholder="الاسم بالكامل" />
              </label>
              <label>رقم الهاتف
                <input type="tel" value={form.customerPhone} onChange={(event) => update({ customerPhone: event.target.value })} placeholder="010xxxxxxxx" />
              </label>
            </div>
          )}
        </section>

        <section className="legal-form-step">
          <h3><span className="legal-step-number">2</span>تفاصيل الجلسة</h3>
          <label><span>نوع الجلسة <span className="legal-required">*</span></span>
            <select
              required
              value={form.serviceId}
              onChange={(event) => {
                const service = services.find((item) => String(item.id) === event.target.value);
                const current = resources.find((item) => String(item.id) === form.resourceId);
                update({
                  serviceId: event.target.value,
                  resourceId: service?.resource_type && current?.resource_type !== service.resource_type ? '' : form.resourceId,
                });
              }}
            >
              <option value="">اختر نوع الجلسة...</option>
              {services.map((service) => (
                <option key={service.id} value={service.id}>{service.name} — {service.duration_minutes} دقيقة</option>
              ))}
            </select>
          </label>
          <label><span>المحامي أو القاعة <span className="legal-required">*</span></span>
            <select required value={form.resourceId} onChange={(event) => update({ resourceId: event.target.value })}>
              <option value="">اختر المحامي أو القاعة...</option>
              {matchingResources.map((resource) => (
                <option key={resource.id} value={resource.id}>{resource.name} ({resourceLabel(resource.resource_type)})</option>
              ))}
            </select>
          </label>
          <div className="legal-form-row">
            <label><span>التاريخ <span className="legal-required">*</span></span>
              <input type="date" required value={form.date} onChange={(event) => update({ date: event.target.value })} />
            </label>
            <label><span>الوقت <span className="legal-required">*</span></span>
              <input type="time" required value={form.time} onChange={(event) => update({ time: event.target.value })} />
            </label>
          </div>
          <p className="legal-hint">
            <LegalIcon name="clock" size={15} />
            {selectedService
              ? `مدة الجلسة ${selectedService.duration_minutes} دقيقة — تُحسب تلقائيًا من نوعها`
              : 'مدة الجلسة تُحسب تلقائيًا من نوعها'}
          </p>
        </section>

        <section className="legal-form-step">
          <h3><span className="legal-step-number">3</span>الأتعاب والملاحظات</h3>
          <label>الأتعاب المدفوعة مقدماً
            <span className="legal-input-suffix">
              <input
                type="number"
                min="0"
                max={selectedService ? Number(selectedService.price) : undefined}
                step="0.01"
                placeholder="0"
                value={form.depositAmount}
                onChange={(event) => update({ depositAmount: event.target.value })}
              />
              <span>ج.م</span>
            </span>
          </label>
          <label>ملاحظات
            <textarea rows="3" value={form.notes} onChange={(event) => update({ notes: event.target.value })} placeholder="رقم القضية، المستندات المطلوبة..." />
          </label>
        </section>

        <div className="legal-form-actions">
          <button className="appointment-button primary" type="submit" disabled={busy}>
            {busy ? 'جاري الحفظ...' : 'حفظ الجلسة'}
          </button>
          <button className="appointment-button secondary" type="button" onClick={() => setForm(blankForm(selectedDate))}>مسح</button>
        </div>
      </form>

      <div className="appointment-card legal-schedule">
        <div className="legal-schedule-heading">
          <div>
            <h2>جدول الجلسات</h2>
            <p>{formatLongDate(selectedDate)}</p>
          </div>
          <div className="legal-day-nav">
            <button type="button" aria-label="الأسبوع السابق" onClick={() => setSelectedDate(shiftDate(selectedDate, -7))}>
              <LegalIcon name="chevronRight" />
            </button>
            <button type="button" onClick={() => setSelectedDate(today)}>اليوم</button>
            <button type="button" aria-label="الأسبوع التالي" onClick={() => setSelectedDate(shiftDate(selectedDate, 7))}>
              <LegalIcon name="chevronLeft" />
            </button>
          </div>
        </div>

        <div className="legal-week-strip">
          {weekDays(selectedDate).map((day) => (
            <button
              key={day.date}
              type="button"
              className={`${day.date === selectedDate ? 'active' : ''}${day.date === today ? ' today' : ''}`}
              aria-pressed={day.date === selectedDate}
              onClick={() => setSelectedDate(day.date)}
            >
              <span>{DAY_NAMES[day.weekday]}</span>
              <strong>{day.dayNumber}</strong>
            </button>
          ))}
        </div>

        <div className="legal-stats">
          <div><span>جلسات اليوم</span><strong>{stats.total}</strong></div>
          <div className="confirmed"><span>مؤكدة</span><strong>{stats.confirmed}</strong></div>
          <div className="pending"><span>بانتظار التأكيد</span><strong>{stats.pending}</strong></div>
        </div>

        <div className="legal-chips" role="group" aria-label="تصفية الجلسات">
          {FILTERS.map(([key, label]) => (
            <button key={key} type="button" className={filter === key ? 'active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>
              {label}
            </button>
          ))}
        </div>

        {!visible.length ? (
          <div className="appointment-empty">لا توجد جلسات في هذا اليوم.</div>
        ) : (
          <div className="legal-session-list">
            {visible.map((session) => {
              const [tone, label] = STATUS[session.status] || ['pending', session.status];
              const open = ['booked', 'confirmed'].includes(session.status);
              return (
                <article className="legal-session" key={session.id}>
                  <div className="legal-session-row">
                    <div className="legal-session-time">
                      <strong>{formatTime12(localTimeOf(session.start_at))}</strong>
                      <span>{session.duration_minutes} دقيقة</span>
                    </div>
                    <div className="legal-session-body">
                      <div className="legal-session-title">
                        <strong>{session.customer_name}</strong>
                        <span className={`legal-badge ${tone}`}>{label}</span>
                      </div>
                      <p>{session.service_name} · {session.resource_name} · مدفوع {money(session.deposit_amount)}</p>
                    </div>
                    {open && (
                      <div className="legal-session-actions">
                        <button type="button" aria-label="تعديل الجلسة" title="تعديل" onClick={() => (editing?.id === session.id ? setEditing(null) : beginEdit(session))}>
                          <LegalIcon name="pencil" />
                        </button>
                        <button type="button" className="danger" aria-label="إلغاء الجلسة" title="إلغاء الجلسة" disabled={busy} onClick={() => cancelSession(session)}>
                          <LegalIcon name="trash" />
                        </button>
                      </div>
                    )}
                  </div>

                  {editing?.id === session.id && (
                    <form className="legal-session-edit" onSubmit={saveEdit}>
                      <label>المحامي أو القاعة
                        <select required value={editing.resourceId} onChange={(event) => setEditing({ ...editing, resourceId: event.target.value })}>
                          {resources
                            .filter((resource) => {
                              const type = services.find((service) => service.id === session.service_id)?.resource_type;
                              return !type || resource.resource_type === type;
                            })
                            .map((resource) => <option key={resource.id} value={resource.id}>{resource.name}</option>)}
                        </select>
                      </label>
                      <label>التاريخ
                        <input type="date" required value={editing.date} onChange={(event) => setEditing({ ...editing, date: event.target.value })} />
                      </label>
                      <label>الوقت
                        <input type="time" required value={editing.time} onChange={(event) => setEditing({ ...editing, time: event.target.value })} />
                      </label>
                      <div className="legal-form-actions">
                        <button className="appointment-button primary" type="submit" disabled={busy}>حفظ الموعد</button>
                        {session.status === 'booked' && (
                          <button className="appointment-button secondary" type="button" disabled={busy} onClick={() => setStatus(session, 'confirmed', 'تم تأكيد الجلسة')}>تأكيد</button>
                        )}
                        <button className="appointment-button secondary" type="button" disabled={busy} onClick={() => setStatus(session, 'completed', 'تم إكمال الجلسة')}>إكمال</button>
                        <button className="appointment-button secondary" type="button" disabled={busy} onClick={() => setStatus(session, 'no_show', 'تم تسجيل عدم الحضور')}>لم يحضر</button>
                      </div>
                    </form>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

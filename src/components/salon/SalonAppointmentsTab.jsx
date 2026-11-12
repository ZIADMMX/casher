import { useCallback, useState } from 'react';
import * as salonApi from '../../api/salon.js';
import { money, num } from '../crm/crmFormat.js';
import { HrEmpty, HrStat } from '../hr/HrLayout.jsx';
import { CalendarIcon, CheckIcon, ClockIcon, CloseIcon, PlusIcon } from '../icons/PosIcons.jsx';
import { localDateString } from '../../utils/hrStats.js';
import { Field, SalonAlert, SalonFormModal } from './SalonParts.jsx';
import { APPOINTMENT_STATUS, stylistName, summarizeAppointments } from './salonFormat.js';
import { useSalonLoad } from './useSalonLoad.js';

const EMPTY = { service_id: '', stylist_id: '', chair_id: '', customer_name: '', customer_phone: '', start_time: '', notes: '' };

export default function SalonAppointmentsTab() {
  const [date, setDate] = useState(localDateString());
  const { data, loading, busy, error, notice, setError, run } = useSalonLoad(useCallback(async () => {
    const [appointments, services, barbers, chairs] = await Promise.all([
      salonApi.getSalonAppointments({ date }),
      salonApi.getAllSalonServices(),
      salonApi.getSalonBarbersWithStats({}),
      salonApi.getAllSalonChairs(),
    ]);
    return { appointments: appointments || [], services: services || [], barbers: barbers || [], chairs: chairs || [] };
  }, [date]));
  const [form, setForm] = useState(null);
  const appointments = [...(data?.appointments || [])].sort((a, b) => a.start_time.localeCompare(b.start_time));
  const stats = summarizeAppointments(appointments);
  const set = (field) => (event) => setForm((f) => ({ ...f, [field]: event.target.value }));

  async function save() {
    if (!form.service_id || !form.customer_name.trim() || !form.customer_phone.trim() || !form.start_time) {
      setError('اختار الخدمة واكتب اسم العميل وموبايله والساعة.');
      return;
    }
    const ok = await run(() => salonApi.createSalonAppointment({
      service_id: Number(form.service_id),
      stylist_id: form.stylist_id ? Number(form.stylist_id) : null,
      chair_id: form.chair_id ? Number(form.chair_id) : null,
      customer_name: form.customer_name.trim(),
      customer_phone: form.customer_phone.trim(),
      appointment_date: date,
      start_time: form.start_time,
      // No deposit field: it would record money that never enters the shift drawer.
      notes: form.notes.trim(),
    }), 'تم حجز الميعاد.');
    if (ok) setForm(null);
  }

  async function remind(appointment) {
    const link = await run(() => salonApi.getSalonWhatsAppReminderLink(appointment.id), 'اتفتح واتساب برسالة التذكير، اضغط إرسال.');
    if (link?.url) window.open(link.url, '_blank');
  }

  return (
    <>
      <section className="hr-stats" aria-label="ملخص المواعيد">
        <HrStat Icon={CalendarIcon} tone="brand" label="مواعيد اليوم المختار" value={num(stats.total)} />
        <HrStat Icon={ClockIcon} tone="warning" label="لسه جايين / في الكرسي" value={num(stats.waiting)} />
        <HrStat Icon={CheckIcon} tone="success" label="خلصت" value={num(stats.completed)} />
        <HrStat Icon={CloseIcon} tone="danger" label="اتلغت أو ما حضرش" value={num(stats.lost)} />
      </section>

      {!form && <SalonAlert error={error} notice={notice} />}

      <section className="hr-card">
        <header className="hr-card-head">
          <div>
            <h2>جدول المواعيد</h2>
            <p>النظام بيمنع حجز نفس الكرسي أو نفس الحلاق في ميعادين متداخلين.</p>
          </div>
          <div className="salon-toolbar">
            <label className="hr-field">
              <span>اليوم</span>
              <input className="hr-input" type="date" value={date} onChange={(event) => event.target.value && setDate(event.target.value)} />
            </label>
            <button type="button" className="hr-btn is-primary" onClick={() => setForm({ ...EMPTY })} disabled={!data?.services.length}>
              <PlusIcon size={18} /> حجز ميعاد
            </button>
          </div>
        </header>
        {loading ? <p className="hr-loading">جارٍ تحميل المواعيد...</p> : !appointments.length ? (
          <HrEmpty Icon={CalendarIcon} title="مفيش مواعيد في اليوم ده" text={data?.services.length ? 'احجز ميعاد للعميل، وابعتله تذكير على واتساب بضغطة.' : 'ضيف خدماتك الأول من تبويب الخدمات علشان تقدر تحجز.'} />
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead><tr><th>الساعة</th><th>العميل</th><th>الخدمة</th><th>الحلاق / الكرسي</th><th>الحالة</th><th><span className="sr-only">إجراءات</span></th></tr></thead>
              <tbody>
                {appointments.map((a) => {
                  const status = APPOINTMENT_STATUS[a.status] || { label: a.status, tone: 'muted', next: [] };
                  return (
                    <tr key={a.id} className={status.next.length ? undefined : 'is-muted'}>
                      <td><div className="hr-stack"><strong dir="ltr">{a.start_time}</strong><small dir="ltr">{a.end_time}</small></div></td>
                      <td><div className="hr-stack"><strong>{a.customer_name}</strong><small dir="ltr">{a.customer_phone}</small></div></td>
                      <td><div className="hr-stack"><strong>{a.service_name}</strong><small>{money(a.service_price)}{a.deposit_amount > 0 ? ` · عربون ${money(a.deposit_amount)}` : ''}</small></div></td>
                      <td><div className="hr-stack"><strong>{a.stylist_id ? stylistName(a) : 'أي حلاق'}</strong><small>{a.chair_name || 'بدون كرسي محدد'}</small></div></td>
                      <td><span className={`hr-pill is-${status.tone}`}>{status.label}</span></td>
                      <td>
                        <div className="hr-row-actions">
                          {status.next.length > 0 && (
                            <button type="button" className="hr-btn is-sm" onClick={() => remind(a)} disabled={busy}>تذكير واتساب</button>
                          )}
                          {status.next.map((key) => (
                            <button
                              key={key}
                              type="button"
                              className={`hr-btn is-sm${key === 'cancelled' || key === 'no_show' ? '' : ' is-success'}`}
                              onClick={() => run(() => salonApi.updateSalonAppointmentStatus(a.id, key), `الحالة بقت: ${APPOINTMENT_STATUS[key].label}.`)}
                              disabled={busy}
                            >
                              {APPOINTMENT_STATUS[key].label}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {form && (
        <SalonFormModal isOpen onClose={() => setForm(null)} title={`حجز ميعاد يوم ${date}`} subtitle="ميعاد الانتهاء بيتحسب من مدة الخدمة." onSubmit={save} busy={busy} error={error} submitLabel="تأكيد الحجز">
          <Field label="الخدمة *" wide>
            <select className="hr-select" value={form.service_id} onChange={set('service_id')} required>
              <option value="">اختار الخدمة</option>
              {data.services.map((s) => <option key={s.id} value={s.id}>{s.name} ({num(s.duration_minutes)} د · {money(s.price)})</option>)}
            </select>
          </Field>
          <Field label="اسم العميل *"><input className="hr-input" value={form.customer_name} onChange={set('customer_name')} maxLength={80} required /></Field>
          <Field label="الموبايل *"><input className="hr-input" type="tel" dir="ltr" value={form.customer_phone} onChange={set('customer_phone')} maxLength={20} required /></Field>
          <Field label="الساعة *"><input className="hr-input" type="time" value={form.start_time} onChange={set('start_time')} required /></Field>
          <Field label="الحلاق">
            <select className="hr-select" value={form.stylist_id} onChange={set('stylist_id')}>
              <option value="">أي حلاق</option>
              {data.barbers.map((b) => <option key={b.id} value={b.id}>{stylistName(b)}</option>)}
            </select>
          </Field>
          <Field label="الكرسي">
            <select className="hr-select" value={form.chair_id} onChange={set('chair_id')}>
              <option value="">بدون تحديد</option>
              {data.chairs.filter((c) => c.is_active !== 0).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </Field>
          <Field label="ملاحظات" wide><input className="hr-input" value={form.notes} onChange={set('notes')} maxLength={200} /></Field>
        </SalonFormModal>
      )}
    </>
  );
}

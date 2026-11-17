import { useCallback, useEffect, useState } from 'react';
import * as tablesApi from '../api/tables.js';
import MacSheet from '../components/workshop/MacSheet.jsx';
import { openWhatsapp } from '../utils/whatsapp.js';
import '../styles/reservations.css';

const pad = (n) => String(n).padStart(2, '0');
const dayText = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const roundedNow = () => { const d = new Date(Date.now() + 30 * 60_000); d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0); return d; };
const STATUS = {
  booked: ['في الانتظار', 'is-booked'], seated: ['جالسين', 'is-seated'], completed: ['انتهى', 'is-done'],
  cancelled: ['ملغي', 'is-off'], no_show: ['لم يحضر', 'is-off'],
};
const EMPTY = { guest_name: '', phone: '', party_size: '2', time: '', table_id: '', duration_min: '90', notes: '' };

export default function ReservationsPage() {
  const [day, setDay] = useState(() => dayText(new Date()));
  const [items, setItems] = useState([]);
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState(null); // null | { id?, ...fields }
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await tablesApi.getReservations(day));
      setError('');
    } catch (err) { setError(err.message || 'تعذر تحميل الحجوزات'); }
  }, [day]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { tablesApi.getTables().then((t) => setTables(Array.isArray(t) ? t : [])).catch(() => setTables([])); }, []);

  async function run(fn) {
    if (busy) return null;
    setBusy(true);
    try { const out = await fn(); setError(''); await load(); return out; } catch (err) { setError(err.message || 'تعذر تنفيذ العملية'); return null; } finally { setBusy(false); }
  }

  const shiftDay = (n) => { const d = new Date(`${day}T12:00:00`); d.setDate(d.getDate() + n); setDay(dayText(d)); };
  const openNew = () => setForm({ ...EMPTY, time: `${pad(roundedNow().getHours())}:${pad(roundedNow().getMinutes())}` });
  const openEdit = (r) => setForm({
    id: r.id, guest_name: r.guest_name, phone: r.phone || '', party_size: String(r.party_size), time: r.reserved_at.slice(11),
    table_id: r.table_id ? String(r.table_id) : '', duration_min: String(r.duration_min), notes: r.notes || '',
  });

  async function save(e) {
    e.preventDefault();
    const data = {
      guest_name: form.guest_name, phone: form.phone, party_size: Number(form.party_size), reserved_at: `${day} ${form.time}`,
      table_id: form.table_id ? Number(form.table_id) : null, duration_min: Number(form.duration_min), notes: form.notes,
    };
    const out = await run(() => (form.id ? tablesApi.updateReservation(form.id, data) : tablesApi.createReservation(data)));
    if (out) setForm(null);
  }

  const seat = (r) => run(async () => {
    const chosen = r.table_id || (tables.find((t) => !t.tab_id)?.id);
    const out = await tablesApi.seatReservation(r.id, chosen);
    return out;
  });
  const setStatus = (r, status) => run(() => tablesApi.setReservationStatus(r.id, status));
  const remind = (r) => openWhatsapp(r.phone, `أهلًا ${r.guest_name}، تأكيد حجزك اليوم الساعة ${r.reserved_at.slice(11)} (${r.party_size} أفراد). في انتظارك!`);

  const live = items.filter((r) => ['booked', 'seated'].includes(r.status));
  const guests = live.reduce((sum, r) => sum + r.party_size, 0);
  const field = (key) => ({ value: form[key], onChange: (e) => setForm({ ...form, [key]: e.target.value }) });

  return (
    <div className="resv" dir="rtl">
      <header className="resv-head">
        <div>
          <h1>حجز الطاولات</h1>
          <p>{live.length} حجز نشط · {guests} فرد</p>
        </div>
        <div className="resv-nav" role="group" aria-label="اليوم">
          <button type="button" className="resv-btn" onClick={() => shiftDay(-1)} aria-label="اليوم السابق">‹</button>
          <input type="date" value={day} onChange={(e) => e.target.value && setDay(e.target.value)} aria-label="التاريخ" />
          <button type="button" className="resv-btn" onClick={() => shiftDay(1)} aria-label="اليوم التالي">›</button>
          <button type="button" className="resv-btn" onClick={() => setDay(dayText(new Date()))}>اليوم</button>
        </div>
        <button type="button" className="resv-btn is-primary" onClick={openNew}>+ حجز جديد</button>
      </header>

      {error && <p className="resv-error" role="alert">{error}</p>}

      {items.length === 0 ? (
        <p className="resv-empty">مفيش حجوزات في اليوم ده.</p>
      ) : (
        <ul className="resv-list">
          {items.map((r) => {
            const [label, tone] = STATUS[r.status] || [r.status, ''];
            return (
              <li key={r.id} className={`resv-card ${tone}`}>
                <time>{r.reserved_at.slice(11)}</time>
                <div className="resv-body">
                  <b>{r.guest_name}</b>
                  <span>{r.party_size} أفراد · {r.table_name || 'بدون طاولة'}{r.phone ? <> · <bdi>{r.phone}</bdi></> : null}</span>
                  {r.notes && <small>{r.notes}</small>}
                </div>
                <span className="resv-pill">{label}</span>
                {r.status === 'booked' && (
                  <div className="resv-actions">
                    <button type="button" className="resv-btn is-primary" disabled={busy} onClick={() => seat(r)}>جلسوا</button>
                    {r.phone && <button type="button" className="resv-btn" onClick={() => remind(r)}>واتساب</button>}
                    <button type="button" className="resv-btn" disabled={busy} onClick={() => openEdit(r)}>تعديل</button>
                    <button type="button" className="resv-btn" disabled={busy} onClick={() => setStatus(r, 'no_show')}>لم يحضر</button>
                    <button type="button" className="resv-btn is-danger" disabled={busy} onClick={() => setStatus(r, 'cancelled')}>إلغاء</button>
                  </div>
                )}
                {r.status === 'seated' && (
                  <div className="resv-actions">
                    <button type="button" className="resv-btn" disabled={busy} onClick={() => setStatus(r, 'completed')}>انتهى</button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {form && (
        <MacSheet title={form.id ? 'تعديل الحجز' : 'حجز جديد'} subtitle={day} onClose={() => setForm(null)}>
          <form className="wk-form" onSubmit={save}>
            <label className="wk-field"><span>اسم صاحب الحجز</span><input required maxLength={80} autoFocus {...field('guest_name')} /></label>
            <label className="wk-field"><span>الموبايل</span><input dir="ltr" inputMode="tel" maxLength={20} {...field('phone')} /></label>
            <div className="resv-row">
              <label className="wk-field"><span>عدد الأفراد</span><input type="number" min="1" max="100" required {...field('party_size')} /></label>
              <label className="wk-field"><span>الساعة</span><input type="time" step="900" required {...field('time')} /></label>
              <label className="wk-field"><span>المدة (دقيقة)</span><input type="number" min="15" max="480" step="15" {...field('duration_min')} /></label>
            </div>
            <label className="wk-field"><span>الطاولة</span>
              <select {...field('table_id')}>
                <option value="">تتحدد عند الوصول</option>
                {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </label>
            <label className="wk-field"><span>ملاحظات</span><input maxLength={200} placeholder="مثال: عيد ميلاد، كرسي أطفال" {...field('notes')} /></label>
            {error && <p className="wk-error" role="alert">{error}</p>}
            <footer>
              <button type="button" className="wk-btn" onClick={() => setForm(null)}>إلغاء</button>
              <button type="submit" className="wk-btn is-primary" disabled={busy}>{busy ? '...' : 'حفظ'}</button>
            </footer>
          </form>
        </MacSheet>
      )}
    </div>
  );
}

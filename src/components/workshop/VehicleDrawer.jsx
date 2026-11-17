import { useCallback, useEffect, useMemo, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import VehiclePlate from './VehiclePlate.jsx';
import * as workshopApi from '../../api/enterprise.js';
import { openWhatsapp } from '../../utils/whatsapp.js';
import { NEXT_TONE, carColorHex, km, longDate } from '../../utils/vehicles.js';
import '../../styles/vehicleDrawer.css';

const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (v) => longDate(v) || '—';
const dateTime = (v) => {
  if (!v) return '';
  const d = new Date(String(v).replace(' ', 'T'));
  return `${d.toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long' })}، ${d.toLocaleTimeString('ar-EG-u-nu-latn', { hour: 'numeric', minute: '2-digit' })}`;
};

const ORDER_STATUS = {
  received: ['تم الاستلام', 'soft'], diagnosing: ['قيد الفحص', 'warn'], awaiting_approval: ['بانتظار الموافقة', 'warn'],
  in_progress: ['قيد التنفيذ', 'warn'], ready: ['جاهزة', 'ok'], delivered: ['مكتمل', 'ok'], cancelled: ['ملغاة', 'mute'],
};
const REMINDER_TONE = { overdue: 'bad', soon: 'warn', ok: 'ok', done: 'ok', none: 'blue' };
const reminderIcon = (kind) => (/رخص|ترخيص|تأمين|فحص فني/.test(kind) ? 'file' : /فرامل/.test(kind) ? 'stopwatch' : 'wrench');

function OrderCard({ order }) {
  const [open, setOpen] = useState(false);
  const [label, tone] = ORDER_STATUS[order.status] || [order.status, 'soft'];
  const done = order.status === 'delivered';
  const bullets = String(order.complaint || '').split(/\n|،|؛/).map((s) => s.trim()).filter(Boolean);
  const labor = order.lines.filter((l) => l.kind === 'labor');
  const parts = order.lines.filter((l) => l.kind === 'part');
  return (
    <li className={`vd-order is-${tone}`}>
      <span className="vd-order__dot" aria-hidden="true" />
      <article>
        <header>
          <span className="vd-order__date"><b>{day(order.opened_at)}</b><code dir="ltr">#{order.order_number}</code></span>
          <i className={`vd-pill is-${tone}`}><b aria-hidden="true" />{label}</i>
        </header>
        <div className="vd-order__meta">
          <span><LineIcon name="stopwatch" size={15} /> عدّاد {km(order.odometer_in)}</span>
          <strong>{money(order.total)} <small>ج.م{done ? '' : ' (تقديري)'}</small></strong>
        </div>
        {bullets.length > 0 && <ul className="vd-bullets">{bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
        {order.lines.length > 0 && (<>
          <button type="button" className="vd-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
            تفاصيل العمالة وقطع الغيار <LineIcon name="chevronDown" size={15} className={open ? 'is-up' : ''} />
          </button>
          {open && (
            <div className="vd-lines">
              {[['العمالة', labor, order.labor_total], ['قطع الغيار', parts, order.parts_total]].filter(([, rows]) => rows.length).map(([title, rows, total]) => (
                <section key={title}>
                  <h4><span>{title}</span><b>{money(total)} ج.م</b></h4>
                  {rows.map((l) => <p key={l.id}><span>{l.description}{l.quantity !== 1 ? ` (عدد ${l.quantity})` : ''}</span><b>{money(l.line_total)}</b></p>)}
                </section>
              ))}
              <footer><span>الإجمالي{done ? '' : ' (تقديري)'}</span><b>{money(order.total)} ج.م</b></footer>
            </div>
          )}
        </>)}
      </article>
    </li>
  );
}

function OdometerChart({ readings, target }) {
  const W = 420; const H = 230; const L = 58; const R = 22; const T = 24; const B = 38;
  const pts = readings.map((r) => ({ ...r, t: Date.parse(r.read_at) }));
  const kmMax = Math.max(...pts.map((p) => p.km), target || 0);
  const kmMin = Math.min(...pts.map((p) => p.km));
  const hi = Math.ceil((kmMax * 1.02) / 10000) * 10000 || 10000;
  const lo = Math.max(0, Math.floor((kmMin * 0.95) / 10000) * 10000);
  const t0 = pts[0].t; const t1 = pts[pts.length - 1].t || t0 + 1;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - B);
  const line = pts.map((p) => `${x(p.t).toFixed(1)},${y(p.km).toFixed(1)}`).join(' ');
  const area = `${line} ${x(t1).toFixed(1)},${H - B} ${x(t0).toFixed(1)},${H - B}`;
  const ticks = [0, 1, 2, 3, 4].map((i) => lo + ((hi - lo) * i) / 4);
  const last = pts[pts.length - 1];
  return (
    <svg className="vd-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="قراءات العدّاد بالكيلومتر" preserveAspectRatio="xMidYMid meet">
      <defs><linearGradient id="vd-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#F97316" stopOpacity="0.28" /><stop offset="1" stopColor="#F97316" stopOpacity="0" /></linearGradient></defs>
      {ticks.map((v) => (
        <g key={v}><line x1={L} x2={W - R} y1={y(v)} y2={y(v)} className="vd-grid" /><text x={L - 8} y={y(v) + 4} textAnchor="end" className="vd-axis">{money(v)}</text></g>
      ))}
      {pts.length > 1 && <polygon points={area} fill="url(#vd-area)" />}
      {target > 0 && target <= hi && (
        <g><line x1={L} x2={W - R} y1={y(target)} y2={y(target)} className="vd-target" /><text x={L + 6} y={y(target) - 6} className="vd-target__text">موعد الصيانة عند {money(target)} كم</text></g>
      )}
      {pts.length > 1 && <polyline points={line} className="vd-line" />}
      {pts.map((p) => <circle key={p.id} cx={x(p.t)} cy={y(p.km)} r={p.source === 'work_order' ? 4.5 : 3.5} className={p.source === 'work_order' ? 'vd-dot' : 'vd-dot is-manual'} />)}
      <circle cx={x(last.t)} cy={y(last.km)} r="9" className="vd-halo" />
      <g transform={`translate(${Math.max(L, x(last.t) - 140)},${Math.min(y(last.km) + 18, H - B - 52)})`}>
        <rect width="130" height="46" rx="10" className="vd-tip" />
        <text x="65" y="20" textAnchor="middle" className="vd-tip__v">{money(last.km)} كم</text>
        <text x="65" y="37" textAnchor="middle" className="vd-axis">{day(last.read_at)}</text>
      </g>
    </svg>
  );
}

export default function VehicleDrawer({ vehicleId, onClose, onWorkOrder, onChanged, notify }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('log');
  const [reading, setReading] = useState('');
  const [readAt, setReadAt] = useState(new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => Promise.resolve(workshopApi.getVehicleProfile(vehicleId)).then((d) => { setData(d); setError(''); }).catch((err) => setError(err.message || 'تعذر تحميل المركبة')), [vehicleId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const v = data?.vehicle;
  const upcoming = useMemo(() => (data?.reminders || []).filter((r) => !r.done_at), [data]);
  const past = useMemo(() => (data?.reminders || []).filter((r) => r.done_at), [data]);

  async function run(fn, okMessage) {
    setBusy(true);
    try { await fn(); await load(); onChanged(); if (okMessage) notify(okMessage); } catch (err) { notify(err.message || 'تعذر تنفيذ العملية', 'danger'); } finally { setBusy(false); }
  }
  const addReading = (e) => { e.preventDefault(); run(async () => { await workshopApi.addOdometerReading(v.id, { km: Number(reading), read_at: readAt }); setReading(''); }, 'تم تسجيل القراءة'); };
  const send = (r) => run(async () => {
    if (v.customer_phone) openWhatsapp(v.customer_phone, `تذكير بصيانة ${[v.make, v.model].filter(Boolean).join(' ')}: ${r.kind}${r.due_date ? ` بتاريخ ${longDate(r.due_date)}` : ''}${r.due_odometer != null ? ` أو عند ${km(r.due_odometer)}` : ''}.`);
    await workshopApi.markReminderSent(r.id);
  }, 'تم تسجيل الإرسال');
  const complete = (r) => run(() => workshopApi.completeServiceReminder(r.id), 'تم تنفيذ الصيانة');

  const stats = data?.odometerStats;
  const tabs = [['log', 'سجل الصيانة', data?.orders.length], ['odo', 'العدّاد'], ['rem', 'التذكيرات', upcoming.length]];

  return (
    <div className="vd-root" dir="rtl" onClick={onClose}>
      <aside className="vd" role="dialog" aria-modal="true" aria-label="ملف المركبة" onClick={(e) => e.stopPropagation()}>
        <button type="button" className="vd-close" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={20} /></button>
        {error && <p className="vd-error" role="alert">{error} <button type="button" onClick={load}>إعادة المحاولة</button></p>}
        {!v && !error && <p className="vd-loading">جاري التحميل...</p>}
        {v && (<>
          <header className="vd-head">
            <VehiclePlate plate={v.plate} city={v.plate_city} kind={v.plate_kind} />
            <div className="vd-head__who">
              <h2>{[v.make, v.model].filter(Boolean).join(' ') || 'مركبة'}</h2>
              <p>{v.year}{v.color && <><i style={{ background: carColorHex(v.color) }} aria-hidden="true" />{v.color}</>}</p>
              {v.vin && <p className="vd-vin"><span>الشاسيه</span><code dir="ltr">{v.vin}</code></p>}
              <i className={`vd-pill is-${NEXT_TONE[v.next_service.status]}`}><b aria-hidden="true" />{v.next_service.status === 'overdue' ? 'متأخرة عن الصيانة ' : ''}{v.next_service.label.replace(/^متأخرة /, '')}</i>
            </div>
          </header>

          <div className="vd-owner">
            <span className="vd-avatar" aria-hidden="true">{(v.customer_name || '؟').trim().charAt(0)}</span>
            <span><b>{v.customer_name}</b><small dir="ltr">{v.customer_phone || '—'}</small></span>
            {v.customer_phone && (<>
              <a className="vd-btn" href={`tel:${v.customer_phone}`}><LineIcon name="phone" size={16} /> اتصال</a>
              <button type="button" className="vd-btn is-wa" onClick={() => openWhatsapp(v.customer_phone)}><LineIcon name="whatsapp" size={16} /> واتساب</button>
            </>)}
          </div>

          <button type="button" className="vd-cta" onClick={() => onWorkOrder(v)}><LineIcon name="plus" size={18} /> أمر شغل جديد</button>

          <div className="vd-tabs" role="tablist">
            {tabs.map(([key, label, count]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'is-on' : ''} onClick={() => setTab(key)}>
                {label}{count !== undefined && <small>{count}</small>}
              </button>
            ))}
          </div>

          <div className="vd-body" role="tabpanel">
            {tab === 'log' && (data.orders.length === 0 ? (
              <div className="vd-empty">
                <span><LineIcon name="clipboard" size={32} /></span>
                <h3>لا يوجد سجل صيانة لهذه المركبة</h3>
                <p>لم يُفتح لها أي أمر شغل بعد. ابدأ أول أمر شغل لتسجيل الأعمال والتكلفة وقراءة العدّاد.</p>
                <button type="button" className="vd-cta is-small" onClick={() => onWorkOrder(v)}><LineIcon name="plus" size={16} /> أمر شغل جديد</button>
              </div>
            ) : (<>
              <div className="vd-summary"><span>{data.orders.length} أوامر شغل</span><span>المنفَّذ فعليًا <b>{money(data.spent)} ج.م</b></span></div>
              <ol className="vd-timeline">{data.orders.map((o) => <OrderCard key={o.id} order={o} />)}</ol>
            </>))}

            {tab === 'odo' && (<>
              <div className="vd-stats">
                <div><span>منذ آخر صيانة</span><b>{stats.sinceService === null ? '—' : km(stats.sinceService)}</b></div>
                <div><span>المتوسط الشهري</span><b>{stats.monthlyAvg === null ? '—' : km(stats.monthlyAvg)}</b></div>
              </div>
              <section className="vd-card">
                <h3>قراءات العدّاد بالكيلومتر <span className="vd-legend"><i /> من أمر شغل <i className="is-manual" /> إدخال يدوي</span></h3>
                {data.readings.length === 0 ? <p className="vd-none">لا توجد قراءات بعد. سجّل أول قراءة من الأسفل.</p> : <OdometerChart readings={data.readings} target={stats.nextServiceKm} />}
              </section>
              <form className="vd-card vd-form" onSubmit={addReading}>
                <h3>تسجيل قراءة جديدة</h3>
                <label><span>القراءة الحالية</span>
                  <div className="vd-input"><input type="text" inputMode="numeric" dir="ltr" value={reading ? Number(reading).toLocaleString('en-US') : ''} onChange={(e) => setReading(e.target.value.replace(/\D/g, ''))} placeholder={`أكبر من ${money(v.odometer)}`} /><em>كم</em></div>
                </label>
                <label><span>التاريخ</span><div className="vd-input"><input type="date" dir="ltr" value={readAt} onChange={(e) => setReadAt(e.target.value)} /></div></label>
                <button type="submit" className="vd-cta is-small" disabled={busy || !reading}>سجّل القراءة</button>
              </form>
            </>)}

            {tab === 'rem' && (<>
              {[['القادمة', upcoming], ['السابقة', past]].map(([title, rows]) => (
                <section key={title} className="vd-rem">
                  <h3>{title} <small>{rows.length}</small></h3>
                  {rows.length === 0 && <p className="vd-none">{title === 'القادمة' ? 'لا توجد تذكيرات قادمة.' : 'لا توجد تذكيرات سابقة.'}</p>}
                  {rows.map((r) => {
                    const tone = REMINDER_TONE[r.state.status];
                    return (
                      <article key={r.id} className={`vd-reminder is-${tone}`}>
                        <span className="vd-reminder__icon"><LineIcon name={reminderIcon(r.kind)} size={22} /></span>
                        <div>
                          <h4>{r.kind} <i className={`vd-pill is-${tone}`}><b aria-hidden="true" />{r.done_at ? `تمت في ${day(r.done_at)}` : r.state.label}</i></h4>
                          <p>{[r.due_odometer != null && `عند ${km(r.due_odometer)}`, r.due_date && `${r.due_odometer != null ? 'أو ' : 'بتاريخ '}${day(r.due_date)}`].filter(Boolean).join(' ')}</p>
                          {!r.done_at && (
                            <p className={`vd-sent${r.sent_at ? ' is-sent' : ''}`}>
                              <LineIcon name={r.sent_at ? 'checkCircle' : 'clock'} size={15} />
                              {r.sent_at ? `أُرسل عبر واتساب ${dateTime(r.sent_at)}` : r.send_at ? `مجدول للإرسال ${day(r.send_at)}` : 'لم يُرسل بعد'}
                            </p>
                          )}
                        </div>
                        {!r.done_at && (
                          <div className="vd-reminder__acts">
                            <button type="button" className="vd-btn" disabled={busy || !v.customer_phone} onClick={() => send(r)}>{r.sent_at ? 'إعادة الإرسال' : 'إرسال'}</button>
                            <button type="button" className="vd-btn" disabled={busy} onClick={() => complete(r)}>تم</button>
                          </div>
                        )}
                      </article>
                    );
                  })}
                </section>
              ))}
            </>)}
          </div>
        </>)}
      </aside>
    </div>
  );
}

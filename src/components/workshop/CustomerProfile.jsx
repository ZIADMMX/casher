import { useEffect, useState } from 'react';
import * as workshopApi from '../../api/enterprise.js';
import LineIcon from '../icons/LineIcons.jsx';
import MacSheet from './MacSheet.jsx';
import VehiclePlate from './VehiclePlate.jsx';
import { openWhatsapp } from '../../utils/whatsapp.js';
import { longDate } from '../../utils/vehicles.js';
import '../../styles/customerProfile.css';

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const STATUS = { received: 'تم الاستلام', diagnosing: 'قيد الفحص', awaiting_approval: 'بانتظار الموافقة', in_progress: 'قيد التنفيذ', ready: 'جاهزة للتسليم', delivered: 'تم التسليم', cancelled: 'ملغاة' };
const TONE = { delivered: 'green', ready: 'green', cancelled: 'mute' };
const METHOD = { cash: 'نقدًا', card: 'بطاقة', credit: 'آجل' };
// SQLite stores UTC without a zone: read it as UTC so the day matches the till's.
const day = (iso) => (iso ? longDate(new Date(`${String(iso).replace(' ', 'T')}Z`).toISOString()) : '');

/** One customer's workshop file: cars, every visit with what was done and what was paid. */
export default function CustomerProfile({ customerId, onClose }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    workshopApi.getCustomerWorkshopProfile(customerId).then((d) => { if (live) setData(d); }).catch((err) => { if (live) setError(err.message || 'تعذر تحميل ملف العميل'); });
    return () => { live = false; };
  }, [customerId]);

  const c = data?.customer;
  const s = data?.stats;
  return (
    <MacSheet icon="user" title={c?.name || 'ملف العميل'} subtitle={c?.phone || ''} label="ملف العميل" onClose={onClose}>
      <div className="cp">
        {error && <p className="wk-error" role="alert">{error}</p>}
        {!data && !error && <p className="cp-empty" aria-busy="true">جاري التحميل...</p>}
        {data && (
          <>
            <dl className="cp-stats">
              <div><dt>عدد الزيارات</dt><dd>{fmt(s.visits)}{s.open > 0 && <small>{s.open} مفتوحة</small>}</dd></div>
              <div><dt>إجمالي المدفوع</dt><dd>{fmt(s.total_paid)} <small>ج.م</small></dd></div>
              <div><dt>آخر زيارة</dt><dd className="is-date">{s.last_visit ? day(s.last_visit) : '—'}</dd></div>
              {s.on_credit > 0 && <div className="is-warn"><dt>بيع آجل</dt><dd>{fmt(s.on_credit)} <small>ج.م</small></dd></div>}
            </dl>

            <div className="cp-actions">
              {c.phone && <button type="button" className="wk-btn" onClick={() => openWhatsapp(c.phone)}><LineIcon name="whatsapp" size={16} /> واتساب</button>}
              {c.phone && <a className="wk-btn" href={`tel:${c.phone}`}><LineIcon name="phone" size={16} /> اتصال</a>}
            </div>

            <h3 className="cp-sub">المركبات <small>{data.vehicles.length}</small></h3>
            <div className="cp-cars">
              {data.vehicles.map((v) => (
                <div key={v.id}><VehiclePlate plate={v.plate} city={v.plate_city} kind={v.plate_kind} /><span><b>{[v.make, v.model].filter(Boolean).join(' ') || 'مركبة'}</b><small>{v.year || ''}</small></span></div>
              ))}
              {data.vehicles.length === 0 && <p className="cp-empty">لا توجد مركبات مسجلة</p>}
            </div>

            <h3 className="cp-sub">سجل الزيارات <small>{data.visits.length}</small></h3>
            <ol className="cp-visits">
              {data.visits.map((v) => (
                <li key={v.id} className={v.status === 'cancelled' ? 'is-cancelled' : ''}>
                  <header>
                    <b dir="ltr">#{v.order_number.replace('WO-', '')}</b>
                    <span>{day(v.opened_at)}</span>
                    <i className={`wo-pill is-${TONE[v.status] || 'amber'}`}><b aria-hidden="true" />{STATUS[v.status]}</i>
                  </header>
                  <p className="cp-car">{[v.make, v.model].filter(Boolean).join(' ') || 'مركبة'} · <span dir="ltr">{v.plate}</span>{v.odometer_in ? ` · ${fmt(v.odometer_in)} كم` : ''}</p>
                  {v.complaint && <p className="cp-note"><small>الشكوى</small>{v.complaint}</p>}
                  {(v.services.length > 0 || v.parts.length > 0) ? (
                    <ul className="cp-work">
                      {v.services.map((t, i) => <li key={`s${i}`}><LineIcon name="wrench" size={14} />{t}</li>)}
                      {v.parts.map((p, i) => <li key={`p${i}`}><LineIcon name="box" size={14} />{p.description}<em>× {fmt(p.quantity)}</em></li>)}
                    </ul>
                  ) : <p className="cp-empty">لا توجد بنود مسجلة</p>}
                  <footer>
                    {v.payment ? (
                      <span className="cp-paid"><LineIcon name="checkCircle" size={16} /> {v.payment.method === 'credit' ? 'بيع آجل' : 'دفع'} <b>{fmt(v.payment.amount)} ج.م</b> · {METHOD[v.payment.method]} · {day(v.payment.at)}</span>
                    ) : (
                      <span className="cp-unpaid">{v.status === 'cancelled' ? 'ملغي' : 'لم يُحصَّل بعد'}</span>
                    )}
                    <strong>{fmt(v.total)} <small>ج.م</small></strong>
                  </footer>
                </li>
              ))}
              {data.visits.length === 0 && <p className="cp-empty">لا توجد زيارات بعد</p>}
            </ol>
          </>
        )}
      </div>
    </MacSheet>
  );
}

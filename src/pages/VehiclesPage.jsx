import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isBridgeAvailable } from '../api/bridge.js';
import * as workshopApi from '../api/enterprise.js';
import Toast from '../components/ui/Toast.jsx';
import LineIcon from '../components/icons/LineIcons.jsx';
import VehiclePlate from '../components/workshop/VehiclePlate.jsx';
import VehicleDrawer from '../components/workshop/VehicleDrawer.jsx';
import CustomerProfile from '../components/workshop/CustomerProfile.jsx';
import VehicleFormSheet from '../components/workshop/VehicleFormSheet.jsx';
import CheckInDialog from '../components/workshop/CheckInDialog.jsx';
import { DeleteVehicleSheet, ReminderSheet } from '../components/workshop/VehicleSheets.jsx';
import { NEXT_TONE, carColorHex, km, longDate } from '../utils/vehicles.js';
import '../styles/workshop.css';
import '../styles/vehicleForm.css';
import '../styles/vehicles.css';

const FILTERS = [['all', 'الكل', 'brand'], ['soon', 'تستحق قريبًا', 'warn'], ['overdue', 'متأخرة', 'bad']];
const fmt = (n) => (Number(n) || 0).toLocaleString('en-US');

function pageList(page, pages) {
  const set = new Set([1, 2, 3, pages, page - 1, page, page + 1].filter((p) => p >= 1 && p <= pages));
  const out = [];
  [...set].sort((a, b) => a - b).forEach((p, i, arr) => {
    if (i && p - arr[i - 1] > 1) out.push('gap');
    out.push(p);
  });
  return out;
}

/** macOS-style popover, fixed to the viewport so the table never clips it. */
function RowMenu({ vehicle, onPick }) {
  const [at, setAt] = useState(null);
  const button = useRef(null);
  const close = useCallback(() => setAt(null), []);

  useEffect(() => {
    if (!at) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [at, close]);

  function toggle() {
    if (at) { close(); return; }
    const r = button.current.getBoundingClientRect();
    const height = 232;
    setAt({ top: r.bottom + height > window.innerHeight ? r.top - height - 6 : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 240)) });
  }
  const pick = (action) => () => { close(); onPick(action, vehicle); };
  const items = [['open', 'car', 'فتح المركبة'], ['order', 'clipboard', 'استلام مركبة / أمر شغل'], ['service', 'wrench', 'تسجيل صيانة'], ['edit', 'edit', 'تعديل البيانات']];

  return (
    <>
      <button ref={button} type="button" className={`wk-iconbtn veh-dots${at ? ' is-open' : ''}`} aria-label={`إجراءات ${vehicle.plate}`} aria-haspopup="menu" aria-expanded={Boolean(at)} onClick={toggle}>
        <LineIcon name="dots" size={18} />
      </button>
      {at && createPortal(
        <>
          <div className="wk-scrim" onClick={close} />
          <div className="wk-menu" role="menu" style={{ top: at.top, left: at.left }}>
            {items.map(([key, icon, label]) => (
              <button key={key} type="button" role="menuitem" onClick={pick(key)}><LineIcon name={icon} size={16} /> {label}</button>
            ))}
            <hr />
            <button type="button" role="menuitem" className="is-danger" onClick={pick('delete')}><LineIcon name="trash" size={16} /> حذف المركبة</button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

function Kpi({ tone, icon, label, value, hint, trend }) {
  return (
    <article className={`wk-card veh-kpi is-${tone}`}>
      <span className="veh-kpi__tile"><LineIcon name={icon} size={22} /></span>
      <span className="veh-kpi__label">{label}</span>
      <strong>{fmt(value)}</strong>
      <small className={trend ? `is-${trend}` : ''}>{trend === 'up' && <LineIcon name="trendUp" size={14} />}{hint}</small>
    </article>
  );
}

export default function VehiclesPage() {
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState('all');
  const [make, setMake] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sheet, setSheet] = useState(null); // { type, vehicle?, plate? }
  const [toast, setToast] = useState(null);
  const [lastOk, setLastOk] = useState(null);

  useEffect(() => { const t = setTimeout(() => { setDebounced(query.trim()); setPage(1); }, 250); return () => clearTimeout(t); }, [query]);

  const load = useCallback(async () => {
    if (!isBridgeAvailable()) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      setData(await workshopApi.getVehiclesOverview({ q: debounced, status, make, page, pageSize }));
      setLastOk(new Date());
    } catch (err) {
      setLoadError(err.message || 'تعذر تحميل المركبات');
    } finally {
      setLoading(false);
    }
  }, [debounced, status, make, page, pageSize]);

  useEffect(() => { load(); }, [load]);

  const notify = (message, type = 'success') => setToast({ id: Date.now(), type, message });
  const closeSheet = () => setSheet(null);
  const stats = data?.stats;
  const growth = stats && stats.servicedPrev > 0 ? Math.round(((stats.servicedMonth - stats.servicedPrev) / stats.servicedPrev) * 100) : null;
  const counts = { all: stats?.total ?? 0, soon: stats?.soon ?? 0, overdue: stats?.overdue ?? 0 };
  const items = data?.items || [];
  const filtering = Boolean(debounced || status !== 'all' || make);

  const onPick = (action, vehicle) => setSheet({ type: action, vehicle });

  return (
    <div className="wk veh" dir="rtl">
      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <header className="wk-card veh-head">
        <div className="veh-head__title">
          <h1>المركبات</h1>
          <p>سجل مركبات العملاء ومواعيد صيانتها</p>
        </div>
        <button type="button" className="wk-btn is-primary veh-receive" onClick={() => setSheet({ type: 'order' })}>
          <LineIcon name="logIn" size={18} /> استلام مركبة
        </button>
      </header>

      <section className="veh-kpis" aria-label="مؤشرات المركبات">
        <Kpi tone="brand" icon="car" label="إجمالي المركبات" value={stats?.total} trend="up" hint={`${fmt(stats?.newThisMonth)} مركبة جديدة هذا الشهر`} />
        <Kpi tone="ok" icon="calendar" label="صيانة هذا الشهر" value={stats?.servicedMonth} trend={growth === null ? '' : growth >= 0 ? 'up' : 'down'}
          hint={growth === null ? 'لا مقارنة بالشهر الماضي' : `${Math.abs(growth)}% ${growth >= 0 ? 'أكثر' : 'أقل'} من الشهر الماضي`} />
        <Kpi tone="warn" icon="clock" label="تستحق قريبًا" value={stats?.soon} hint="خلال 14 يومًا أو 1,000 كم" />
        <Kpi tone="bad" icon="alert" label="متأخرة عن الصيانة" value={stats?.overdue} hint="تحتاج متابعة مع العميل" />
      </section>

      <section className="wk-card veh-tools" aria-label="بحث وتصفية">
        <label className="wk-search veh-search">
          <LineIcon name="search" size={18} />
          <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم اللوحة أو اسم المالك أو الشاسيه" aria-label="بحث عن مركبة" />
        </label>
        <div className="wk-chips veh-chips" role="group" aria-label="حالة الصيانة">
          {FILTERS.map(([key, label, tone]) => (
            <button key={key} type="button" className={status === key ? 'is-on' : ''} aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1); }}>
              {key !== 'all' && <i className={`veh-dot is-${tone}`} aria-hidden="true" />}{label} <small>{fmt(counts[key])}</small>
            </button>
          ))}
        </div>
        <label className="veh-select">
          <span>الماركة</span>
          <select value={make} onChange={(e) => { setMake(e.target.value); setPage(1); }} aria-label="تصفية حسب الماركة">
            <option value="">كل الماركات</option>
            {(data?.makes || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <LineIcon name="chevronDown" size={16} />
        </label>
        <button type="button" className="wk-btn is-primary veh-new" onClick={() => setSheet({ type: 'new' })}><LineIcon name="plus" size={18} /> مركبة جديدة</button>
      </section>

      <section className="wk-card veh-panel" aria-label="جدول المركبات">
        {loadError ? (
          <div className="veh-state">
            <span className="veh-state__icon is-bad"><LineIcon name="alert" size={28} /></span>
            <h2>تعذّر تحميل المركبات</h2>
            <p>{loadError}. بياناتك محفوظة، تحقق من الاتصال ثم أعد المحاولة.</p>
            <div className="veh-state__actions">
              <button type="button" className="wk-btn" onClick={() => notify(loadError, 'danger')}>عرض التفاصيل</button>
              <button type="button" className="wk-btn is-primary" onClick={load}><LineIcon name="refresh" size={16} /> إعادة المحاولة</button>
            </div>
            {lastOk && <small>آخر مزامنة ناجحة {lastOk.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</small>}
          </div>
        ) : (<>
          <div className="veh-table" role="table" aria-label="المركبات" aria-busy={loading}>
            <div className="veh-row is-head" role="row">
              {['رقم اللوحة', 'المركبة', 'المالك', 'آخر عدّاد', 'آخر صيانة', 'الصيانة القادمة', ''].map((c, i) => <span key={i} role="columnheader">{c}</span>)}
            </div>

            {loading && !data && Array.from({ length: 6 }, (_, i) => <div key={i} className="veh-row is-skeleton" aria-hidden="true">{Array.from({ length: 6 }, (__, j) => <i key={j} />)}</div>)}

            {items.map((v) => (
              <div key={v.id} className="veh-row" role="row">
                <span role="cell" data-label="اللوحة"><VehiclePlate plate={v.plate} city={v.plate_city} kind={v.plate_kind} /></span>
                <span role="cell" data-label="المركبة" className="veh-car">
                  <button type="button" className="veh-link" onClick={() => onPick('open', v)}>{[v.make, v.model].filter(Boolean).join(' ') || 'مركبة'}</button>
                  <small>{v.year && <>{v.year}</>}{v.color && <><i className="veh-swatch" style={{ background: carColorHex(v.color) }} aria-hidden="true" />{v.color}</>}</small>
                </span>
                <span role="cell" data-label="المالك" className="veh-owner-cell">
                  <span className="wk-avatar" aria-hidden="true">{(v.customer_name || '؟').trim().charAt(0)}</span>
                  <span><button type="button" className="veh-link" onClick={() => setSheet({ type: 'customer', customerId: v.customer_id })}>{v.customer_name}</button><small dir="ltr">{v.customer_phone || '—'}</small></span>
                </span>
                <span role="cell" data-label="آخر عدّاد" className="veh-km">{v.odometer ? km(v.odometer) : '—'}</span>
                <span role="cell" data-label="آخر صيانة">{longDate(v.last_service_date) || <em className="veh-muted">لم تُسجَّل بعد</em>}</span>
                <span role="cell" data-label="الصيانة القادمة"><i className={`wk-pill veh-next is-${NEXT_TONE[v.next_service.status]}`}><b aria-hidden="true" />{v.next_service.label}</i></span>
                <span role="cell" className="veh-act"><RowMenu vehicle={v} onPick={onPick} /></span>
              </div>
            ))}

            {data && items.length === 0 && (
              <div className="veh-state">
                <span className={`veh-state__icon${filtering ? '' : ' is-brand'}`}><LineIcon name={filtering ? 'search' : 'car'} size={30} /></span>
                {filtering ? (<>
                  <h2>{debounced ? 'لا توجد مركبة بهذه اللوحة' : 'لا توجد مركبات مطابقة'}</h2>
                  <p>{debounced ? `لم نعثر على «${debounced}» بين ${fmt(stats?.total)} مركبة. راجع الحروف والأرقام، أو سجّلها كمركبة جديدة.` : 'غيّر عوامل التصفية لعرض المزيد.'}</p>
                  <div className="veh-state__actions">
                    <button type="button" className="wk-btn" onClick={() => { setQuery(''); setStatus('all'); setMake(''); }}>مسح البحث</button>
                    {debounced && <button type="button" className="wk-btn is-primary" onClick={() => setSheet({ type: 'new', plate: debounced })}>تسجيل مركبة بهذه اللوحة</button>}
                  </div>
                </>) : (<>
                  <h2>لا توجد مركبات بعد</h2>
                  <p>سجّل أول مركبة ليبدأ النظام بتذكيرك بمواعيد صيانتها.</p>
                  <div className="veh-state__actions"><button type="button" className="wk-btn is-primary" onClick={() => setSheet({ type: 'new' })}><LineIcon name="plus" size={16} /> مركبة جديدة</button></div>
                </>)}
              </div>
            )}
          </div>

          {data && data.total > 0 && (
            <footer className="veh-pager">
              <span className="veh-pager__info">عرض {fmt(items.length)} مركبات من {fmt(data.total)}</span>
              <nav aria-label="الصفحات">
                <button type="button" className="veh-pg" disabled={data.page <= 1} onClick={() => setPage(data.page - 1)} aria-label="السابقة"><LineIcon name="chevronRight" size={16} /></button>
                {pageList(data.page, data.pages).map((p, i) => (p === 'gap'
                  ? <span key={`g${i}`} className="veh-pg is-gap">…</span>
                  : <button key={p} type="button" className={`veh-pg${p === data.page ? ' is-on' : ''}`} aria-current={p === data.page ? 'page' : undefined} onClick={() => setPage(p)}>{fmt(p)}</button>))}
                <button type="button" className="veh-pg" disabled={data.page >= data.pages} onClick={() => setPage(data.page + 1)} aria-label="التالية"><LineIcon name="chevronLeft" size={16} /></button>
              </nav>
              <label className="veh-select is-small">
                <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} aria-label="عدد الصفوف في الصفحة">
                  {[10, 25, 50].map((n) => <option key={n} value={n}>{n} في الصفحة</option>)}
                </select>
                <LineIcon name="chevronDown" size={16} />
              </label>
            </footer>
          )}
        </>)}
      </section>

      {(sheet?.type === 'new' || sheet?.type === 'edit') && (
        <VehicleFormSheet vehicle={sheet.type === 'edit' ? sheet.vehicle : null} presetPlate={sheet.plate || ''} onClose={closeSheet}
          onOpenExisting={(v) => setSheet({ type: 'open', vehicle: v })}
          onSaved={(_, editing) => { closeSheet(); notify(editing ? 'تم حفظ التعديلات' : 'تم تسجيل المركبة'); load(); }} />
      )}
      {sheet?.type === 'order' && (
        <CheckInDialog vehicle={sheet.vehicle} onClose={closeSheet} onDone={(o) => { notify(`تم استلام المركبة وفتح أمر الشغل ${o.order_number}`); load(); }} />
      )}
      {sheet?.type === 'service' && (
        <ReminderSheet vehicle={sheet.vehicle} onClose={closeSheet} onSaved={() => { closeSheet(); notify('تم حفظ موعد الصيانة'); load(); }} />
      )}
      {sheet?.type === 'open' && (
        <VehicleDrawer vehicleId={sheet.vehicle.id} onClose={closeSheet} onChanged={load} notify={notify} onWorkOrder={(v) => setSheet({ type: 'order', vehicle: v })} />
      )}
      {sheet?.type === 'customer' && <CustomerProfile customerId={sheet.customerId} onClose={closeSheet} />}
      {sheet?.type === 'delete' && (
        <DeleteVehicleSheet vehicle={sheet.vehicle} onClose={closeSheet} onDeleted={() => { closeSheet(); notify('تم حذف المركبة'); load(); }} />
      )}
    </div>
  );
}

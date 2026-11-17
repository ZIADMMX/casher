import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { isBridgeAvailable } from '../api/bridge.js';
import * as workshopApi from '../api/enterprise.js';
import Toast from '../components/ui/Toast.jsx';
import LineIcon from '../components/icons/LineIcons.jsx';
import MacSheet from '../components/workshop/MacSheet.jsx';
import VehiclePlate from '../components/workshop/VehiclePlate.jsx';
import VehicleDrawer from '../components/workshop/VehicleDrawer.jsx';
import CheckInDialog from '../components/workshop/CheckInDialog.jsx';
import WorkOrderDetail from '../components/workshop/WorkOrderDetail.jsx';
import '../styles/workshop.css';
import '../styles/vehicles.css';
import '../styles/workOrders.css';

// Board columns, left to right in the order a car moves through the workshop.
const STATUSES = [
  { key: 'received', label: 'تم الاستلام', tone: 'blue' },
  { key: 'diagnosing', label: 'فحص وتسعير', tone: 'amber' },
  { key: 'awaiting_approval', label: 'بانتظار الموافقة', tone: 'blue' },
  { key: 'in_progress', label: 'قيد التنفيذ', tone: 'amber' },
  { key: 'ready', label: 'جاهزة للتسليم', tone: 'green' },
  { key: 'delivered', label: 'تم التسليم', tone: 'green' },
];
const LABEL = Object.fromEntries([...STATUSES, { key: 'cancelled', label: 'ملغاة' }].map((s) => [s.key, s.label]));
const TONE = Object.fromEntries(STATUSES.map((s) => [s.key, s.tone]));
// Same moves the server allows (autoWorkshop.service NEXT); the server stays the judge, this only offers valid ones.
const NEXT = {
  received: ['diagnosing', 'in_progress'], diagnosing: ['awaiting_approval', 'in_progress'], awaiting_approval: ['in_progress'],
  in_progress: ['awaiting_approval', 'ready'], ready: ['in_progress', 'delivered'], delivered: [], cancelled: [],
};
const DAYS = [[1, 'اليوم'], [7, 'آخر 7 أيام'], [30, 'آخر 30 يوم'], [90, 'آخر 90 يوم']];

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
function age(min) {
  if (min < 60) return `${Math.max(min, 1)} د`;
  if (min < 1440) { const h = Math.floor(min / 60); const m = min % 60; return m ? `${h} س ${m} د` : `${h} س`; }
  const d = Math.floor(min / 1440); const h = Math.floor((min % 1440) / 60);
  if (d === 1) return `يوم و${h} س`;
  if (d === 2) return `يومين و${h} س`;
  return `${d} أيام`;
}
const initial = (name) => String(name || '').replace(/^م\.\s*/, '').trim().charAt(0) || '؟';
const tone = (name) => ['a', 'b', 'c'][[...String(name)].reduce((s, c) => s + c.charCodeAt(0), 0) % 3];

function Dots({ count }) {
  const filled = Math.min(count, 5);
  const total = Math.max(filled, 2);
  return <span className="wo-dots" role="img" aria-label={`${count} بنود`}>{Array.from({ length: total }, (_, i) => <i key={i} className={i < filled ? 'is-on' : ''} />)}</span>;
}

function Mechanic({ name }) {
  if (!name) return <span className="wo-mech is-none"><i aria-hidden="true">−</i>غير مُسند</span>;
  return <span className="wo-mech"><i className={`tone-${tone(name)}`} aria-hidden="true">{initial(name)}</i>{name}</span>;
}

function Since({ o }) {
  return (
    <span className={`wo-since${o.late ? ' is-late' : ''}`}>
      <span>منذ {age(o.age_minutes)}</span>
      {o.late && <b className="wo-late"><LineIcon name="clock" size={12} />متأخر</b>}
    </span>
  );
}

/** macOS-style popover, fixed to the viewport. */
function OrderMenu({ order, onPick }) {
  const [at, setAt] = useState(null);
  const button = useRef(null);
  const close = useCallback(() => setAt(null), []);
  useEffect(() => {
    if (!at) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey); window.addEventListener('resize', close); window.addEventListener('scroll', close, true);
    return () => { window.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); window.removeEventListener('scroll', close, true); };
  }, [at, close]);

  const moves = NEXT[order.status] || [];
  const open = order.status !== 'delivered' && order.status !== 'cancelled';
  function toggle() {
    if (at) { close(); return; }
    const r = button.current.getBoundingClientRect();
    const height = 120 + moves.length * 38 + (open ? 90 : 0);
    setAt({ top: r.bottom + height > window.innerHeight ? Math.max(8, r.top - height - 6) : r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - 250)) });
  }
  const pick = (action, extra) => () => { close(); onPick(action, order, extra); };
  return (
    <>
      <button ref={button} type="button" className="wk-iconbtn wo-dots-btn" aria-haspopup="menu" aria-expanded={Boolean(at)} aria-label={`إجراءات الأمر ${order.order_number}`} onClick={toggle}><LineIcon name="dots" size={18} /></button>
      {at && createPortal(
        <>
          <div className="wk-scrim" onClick={close} />
          <div className="wk-menu" role="menu" style={{ top: at.top, left: at.left }}>
            <button type="button" role="menuitem" onClick={pick('open')}><LineIcon name="clipboard" size={16} /> فتح الأمر</button>
            <button type="button" role="menuitem" onClick={pick('vehicle')}><LineIcon name="car" size={16} /> فتح ملف المركبة</button>
            {open && <button type="button" role="menuitem" onClick={pick('assign')}><LineIcon name="wrench" size={16} /> إسناد فني</button>}
            {moves.length > 0 && <hr />}
            {moves.map((s) => <button key={s} type="button" role="menuitem" onClick={pick('move', s)}><LineIcon name="arrowRight" size={16} /> نقل إلى «{LABEL[s]}»</button>)}
            {open && <><hr /><button type="button" role="menuitem" className="is-danger" onClick={pick('cancel')}><LineIcon name="x" size={16} /> إلغاء الأمر</button></>}
          </div>
        </>,
        document.body,
      )}
    </>
  );
}

export default function WorkOrdersPage() {
  const [view, setView] = useState(() => { try { return window.localStorage.getItem('wo.view') === 'table' ? 'table' : 'board'; } catch { return 'board'; } });
  const [query, setQuery] = useState('');
  const [mechanic, setMechanic] = useState('');
  const [days, setDays] = useState(7);
  const [statusFilter, setStatusFilter] = useState('active');
  const [lateOnly, setLateOnly] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [sheet, setSheet] = useState(null);
  const [toast, setToast] = useState(null);
  const [openId, setOpenId] = useState(null);
  const [dragId, setDragId] = useState(null);
  const [overKey, setOverKey] = useState(null);
  const toastSeq = useRef(0);

  const load = useCallback(async () => {
    if (!isBridgeAvailable()) { setLoading(false); return; }
    setLoadError('');
    try { setData(await workshopApi.getWorkOrderBoard({ days })); } catch (err) { setLoadError(err.message || 'تعذر تحميل أوامر الشغل'); } finally { setLoading(false); }
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const notify = (message, type = 'success') => setToast({ id: ++toastSeq.current, type, message });
  const chooseView = (v) => { setView(v); try { window.localStorage.setItem('wo.view', v); } catch { /* the choice just is not remembered */ } };

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.items || []).filter((o) => (
      (!q || `${o.order_number} ${o.plate} ${o.customer_name} ${o.make || ''} ${o.model || ''}`.toLowerCase().includes(q))
      && (!mechanic || (mechanic === '__none' ? !o.mechanic : o.mechanic === mechanic))
      && (!lateOnly || o.late)
    ));
  }, [data, query, mechanic, lateOnly]);
  const tableItems = useMemo(() => items.filter((o) => (statusFilter === 'active' ? o.status !== 'delivered' && o.status !== 'cancelled' : statusFilter === 'all' ? true : o.status === statusFilter)), [items, statusFilter]);
  const stats = data?.stats;

  async function move(order, status) {
    if (order.status === status) return;
    try { await workshopApi.setWorkOrderStatus(order.id, status); notify(`${order.order_number}: ${LABEL[status]}`); await load(); } catch (err) { notify(err.message || 'تعذر نقل الأمر', 'danger'); }
  }
  function onPick(action, order, extra) {
    if (action === 'open') setOpenId(order.id);
    else if (action === 'vehicle') setSheet({ type: 'drawer', vehicleId: order.vehicle_id });
    else if (action === 'assign') setSheet({ type: 'assign', order });
    else if (action === 'cancel') setSheet({ type: 'cancel', order });
    else if (action === 'move') move(order, extra);
  }
  const onDrop = (key) => (e) => {
    e.preventDefault();
    const order = (data?.items || []).find((o) => o.id === dragId);
    setOverKey(null); setDragId(null);
    if (order) move(order, key);
  };

  const closeSheet = () => setSheet(null);

  return (
    <div className="wk wo" dir="rtl">
      {toast && <Toast key={toast.id} message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      {openId !== null ? (
        <WorkOrderDetail orderId={openId} mechanics={data?.mechanics || []} onBack={() => setOpenId(null)} onChanged={load} notify={notify} />
      ) : (<>
      <header className="wk-card wo-head">
        <div className="wo-head__title">
          <h1>أوامر الشغل</h1>
          <p>{stats ? `${fmt(stats.active)} أمر شغل نشط بقيمة ${fmt(stats.activeValue)} ج.م` : 'جاري التحميل...'}</p>
        </div>
        <div className="wo-seg" role="group" aria-label="طريقة العرض">
          <button type="button" className={view === 'board' ? 'is-on' : ''} aria-pressed={view === 'board'} onClick={() => chooseView('board')}><LineIcon name="clipboard" size={16} /> لوحة</button>
          <button type="button" className={view === 'table' ? 'is-on' : ''} aria-pressed={view === 'table'} onClick={() => chooseView('table')}><LineIcon name="file" size={16} /> جدول</button>
        </div>
        <label className="wk-search wo-search"><LineIcon name="search" size={18} /><input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث برقم الأمر أو اللوحة أو العميل" aria-label="بحث في أوامر الشغل" /></label>
        <button type="button" className="wk-btn is-primary wo-new" onClick={() => setSheet({ type: 'checkin' })}><LineIcon name="plus" size={18} strokeWidth={2.2} /> أمر شغل جديد</button>
      </header>

      <section className="wk-card wo-filters" aria-label="التصفية">
        <label className="wo-select"><LineIcon name="wrench" size={16} /><span>الفني</span>
          <select value={mechanic} onChange={(e) => setMechanic(e.target.value)} aria-label="الفني">
            <option value="">كل الفنيين</option><option value="__none">غير مُسند</option>
            {(data?.mechanics || []).map((m) => <option key={m} value={m}>{m}</option>)}
          </select><LineIcon name="chevronDown" size={16} />
        </label>
        <label className="wo-select"><LineIcon name="calendar" size={16} /><span>التاريخ</span>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="التاريخ (الأوامر المفتوحة تظهر دائمًا)" title="الأوامر المفتوحة تظهر دائمًا، والتاريخ بيحدد المسلَّمة والملغية">
            {DAYS.map(([d, label]) => <option key={d} value={d}>{label}</option>)}
          </select><LineIcon name="chevronDown" size={16} />
        </label>
        {view === 'table' && (
          <label className="wo-select"><LineIcon name="checkCircle" size={16} /><span>الحالة</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} aria-label="الحالة">
              <option value="active">كل الحالات النشطة</option><option value="all">كل الحالات</option>
              {STATUSES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}<option value="cancelled">ملغاة</option>
            </select><LineIcon name="chevronDown" size={16} />
          </label>
        )}
        <button type="button" className={`wo-late-chip${lateOnly ? ' is-on' : ''}`} aria-pressed={lateOnly} onClick={() => setLateOnly((v) => !v)} disabled={!stats?.late && !lateOnly}>
          <LineIcon name="clock" size={15} />{fmt(stats?.late)} أوامر متأخرة
        </button>
      </section>

      {loadError ? (
        <div className="wk-card wo-state">
          <span className="is-bad"><LineIcon name="alert" size={28} /></span>
          <h2>تعذّر تحميل أوامر الشغل</h2><p>{loadError}. بياناتك محفوظة، أعد المحاولة.</p>
          <button type="button" className="wk-btn is-primary" onClick={() => { setLoading(true); load(); }}><LineIcon name="refresh" size={16} /> إعادة المحاولة</button>
        </div>
      ) : loading && !data ? (
        <div className="wk-card wo-state" aria-busy="true"><p>جاري التحميل...</p></div>
      ) : view === 'table' ? (
        <section className="wk-card wo-table" aria-label="جدول أوامر الشغل">
          <div className="wo-row is-head" role="row">
            {['رقم الأمر', 'اللوحة', 'السيارة', 'العميل', 'الفني', 'الحالة', 'البنود', 'منذ الاستلام', 'الإجمالي', ''].map((c, i) => <span key={i} role="columnheader">{c}</span>)}
          </div>
          {tableItems.map((o) => (
            <div key={o.id} className="wo-row" role="row" onClick={(e) => { if (!e.target.closest("button")) setOpenId(o.id); }}>
              <b className="wo-code" dir="ltr">#{o.order_number.replace('WO-', '')}</b>
              <span><VehiclePlate plate={o.plate} city={o.plate_city} kind={o.plate_kind} /></span>
              <span className="wo-car"><b>{[o.make, o.model].filter(Boolean).join(' ') || 'مركبة'}</b><small>{o.year}</small></span>
              <span className="wo-cust">{o.customer_name}</span>
              <Mechanic name={o.mechanic} />
              <span className={`wo-pill is-${o.status === 'cancelled' ? 'mute' : TONE[o.status]}`}><b aria-hidden="true" />{LABEL[o.status]}</span>
              <Dots count={o.lines_count} />
              <Since o={o} />
              <b className="wo-total">{fmt(o.total)} <small>ج.م</small></b>
              <OrderMenu order={o} onPick={onPick} />
            </div>
          ))}
          {tableItems.length === 0 && (
            <div className="wo-state"><span><LineIcon name="clipboard" size={30} /></span><h2>{query || mechanic || lateOnly ? 'لا توجد أوامر مطابقة' : 'لا توجد أوامر شغل'}</h2>
              <p>{query || mechanic || lateOnly ? 'غيّر البحث أو التصفية.' : 'استلم أول مركبة لفتح أمر شغل.'}</p></div>
          )}
          <footer className="wo-foot"><span>{fmt(tableItems.length)} أمر شغل</span><span>القيمة الإجمالية <b>{fmt(tableItems.reduce((s, o) => s + o.total, 0))} ج.م</b></span></footer>
        </section>
      ) : (
        <section className="wo-board" aria-label="لوحة أوامر الشغل">
          {STATUSES.map((s) => {
            const col = items.filter((o) => o.status === s.key);
            const over = overKey === s.key && dragId !== null;
            return (
              <div key={s.key} className={`wo-col${over ? ' is-over' : ''}`} onDragOver={(e) => { e.preventDefault(); setOverKey(s.key); }} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOverKey(null); }} onDrop={onDrop(s.key)} aria-label={s.label}>
                <header><span className={`wo-dot is-${s.tone}`} aria-hidden="true" /><h2>{s.label}</h2><small>{col.length}</small><em>{fmt(col.reduce((t, o) => t + o.total, 0))} ج.م</em></header>
                {over && <div className="wo-drop">أفلت هنا<small>للنقل إلى «{s.label}»</small></div>}
                {col.map((o) => (
                  <article key={o.id} className={`wo-card${dragId === o.id ? ' is-drag' : ''}${o.waiting_parts ? ' is-waiting' : ''}`} onClick={(e) => { if (!e.target.closest('button')) setOpenId(o.id); }} draggable onDragStart={(e) => { setDragId(o.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', String(o.id)); }} onDragEnd={() => { setDragId(null); setOverKey(null); }}>
                    <div className="wo-card__top">{o.waiting_parts ? <b className="wo-parts"><LineIcon name="box" size={12} />بانتظار القطع</b> : null}{o.late ? <b className="wo-late"><LineIcon name="clock" size={12} />متأخر</b> : <span />}<code dir="ltr">#{o.order_number.replace('WO-', '')}</code><OrderMenu order={o} onPick={onPick} /></div>
                    <div className="wo-card__plate"><VehiclePlate plate={o.plate} city={o.plate_city} kind={o.plate_kind} />{o.mechanic ? <i className={`wo-badge tone-${tone(o.mechanic)}`} title={o.mechanic}>{initial(o.mechanic)}</i> : <i className="wo-badge is-none" title="غير مُسند">−</i>}</div>
                    <div className="wo-card__row">
                      <div className="wo-card__who"><b>{[o.make, o.model].filter(Boolean).join(' ') || 'مركبة'}</b><small>{o.customer_name}</small></div>
                      <strong className="wo-card__amount">{fmt(o.total)}<small>ج.م</small></strong>
                    </div>
                    <div className="wo-card__foot"><Since o={o} /><Dots count={o.lines_count} /></div>
                  </article>
                ))}
                {col.length === 0 && !over && (
                  <div className="wo-colempty">{s.key === 'delivered' ? <><span><LineIcon name="checkCircle" size={26} /></span><b>لا توجد أوامر مسلَّمة</b><small>بتظهر هنا بعد تسليم المركبة للعميل.</small></> : <small>لا توجد أوامر</small>}</div>
                )}
              </div>
            );
          })}
        </section>
      )}
      </>)}

      {sheet?.type === 'checkin' && <CheckInDialog vehicle={sheet.vehicle} onClose={closeSheet} onDone={(o) => { notify(`تم استلام المركبة وفتح أمر الشغل ${o.order_number}`); load(); }} />}
      {sheet?.type === 'drawer' && <VehicleDrawer vehicleId={sheet.vehicleId} onClose={closeSheet} onChanged={load} notify={notify} onWorkOrder={(v) => setSheet({ type: 'checkin', vehicle: v })} />}
      {sheet?.type === 'assign' && <AssignSheet order={sheet.order} mechanics={data?.mechanics || []} onClose={closeSheet} onSaved={() => { closeSheet(); notify('تم إسناد الفني'); load(); }} />}
      {sheet?.type === 'cancel' && <CancelSheet order={sheet.order} onClose={closeSheet} onDone={() => { closeSheet(); notify('تم إلغاء الأمر'); load(); }} />}
    </div>
  );
}

function AssignSheet({ order, mechanics, onClose, onSaved }) {
  const [name, setName] = useState(order.mechanic || '');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    if (!name.trim()) { setError('اكتب اسم الفني'); return; }
    setBusy(true);
    try { await workshopApi.updateWorkOrder(order.id, { mechanic: name.trim() }); onSaved(); } catch (err) { setError(err.message || 'تعذر الإسناد'); setBusy(false); }
  }
  return (
    <MacSheet title="إسناد فني" subtitle={`${order.order_number} · ${order.plate}`} onClose={onClose}>
      <form className="wk-form" onSubmit={save}>
        <label className="wk-field"><span>اسم الفني</span>
          <input type="text" list="wo-mechanics" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} placeholder="م. حسن علاء" autoFocus />
          <datalist id="wo-mechanics">{mechanics.map((m) => <option key={m} value={m} />)}</datalist>
        </label>
        {error && <p className="wk-error" role="alert">{error}</p>}
        <footer><button type="button" className="wk-btn" onClick={onClose}>إلغاء</button><button type="submit" className="wk-btn is-primary" disabled={busy}>{busy ? '...' : 'حفظ'}</button></footer>
      </form>
    </MacSheet>
  );
}

function CancelSheet({ order, onClose, onDone }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run() {
    setBusy(true);
    try { await workshopApi.setWorkOrderStatus(order.id, 'cancelled'); onDone(); } catch (err) { setError(err.message || 'تعذر الإلغاء'); setBusy(false); }
  }
  return (
    <MacSheet title="إلغاء أمر الشغل؟" subtitle={`${order.order_number} · ${order.customer_name}`} onClose={onClose}>
      <div className="wk-done"><VehiclePlate plate={order.plate} city={order.plate_city} kind={order.plate_kind} /><p>الأمر المُلغى بيتقفل ومينفعش يتعدّل.</p>{error && <p className="wk-error" role="alert">{error}</p>}</div>
      <footer><button type="button" className="wk-btn" onClick={onClose}>رجوع</button><button type="button" className="wk-btn is-danger" onClick={run} disabled={busy}>إلغاء الأمر</button></footer>
    </MacSheet>
  );
}

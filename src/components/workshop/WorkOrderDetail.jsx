import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import * as workshopApi from '../../api/enterprise.js';
import { getAllProductsWithVariants } from '../../api/products.js';
import LineIcon from '../icons/LineIcons.jsx';
import { BarcodeIcon } from '../icons/PosIcons.jsx';
import VehiclePlate from './VehiclePlate.jsx';
import MacSheet from './MacSheet.jsx';
import CustomerTrackingCard from './CustomerTrackingCard.jsx';
import { getAllSuppliersWithStats } from '../../api/purchases.js';
import { openWhatsapp } from '../../utils/whatsapp.js';
import INTAKE from '../../../shared/vehicleIntake.json';
import '../../styles/workOrderDetail.css';

// Same six steps as the board. 'cancelled' is not a step: it shows as a banner instead.
const STEPS = [
  ['received', 'تم الاستلام'], ['diagnosing', 'فحص وتسعير'], ['awaiting_approval', 'بانتظار الموافقة'],
  ['in_progress', 'قيد التنفيذ'], ['ready', 'جاهزة للتسليم'], ['delivered', 'تم التسليم'],
];
const TONE = { received: 'blue', diagnosing: 'amber', awaiting_approval: 'blue', in_progress: 'amber', ready: 'green', delivered: 'green', cancelled: 'mute' };
const START = ['in_progress', 'بدء التنفيذ'];
const CTA = { received: START, diagnosing: START, awaiting_approval: START, in_progress: ['ready', 'تجهيز للتسليم'], ready: ['in_progress', 'رجوع للتنفيذ'] };
// shortcut: fixed starter list of common jobs; move it to a settings table when workshops want their own price list.
const PRESETS = [['تغيير زيت وفلتر', 250], ['فحص وتغيير تيل الفرامل', 450], ['ضبط زوايا العجل', 300], ['فحص كمبيوتر شامل', 200], ['غسيل وتنظيف محرك', 150]];

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const when = (iso) => {
  const d = new Date(`${String(iso).replace(' ', 'T')}Z`);
  return Number.isNaN(d.getTime()) ? '' : `${d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' })} · ${d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })}`;
};
const stock = (l) => {
  const s = Number(l.stock_quantity) || 0;
  if (l.po_status === 'sent') return { tone: 'warn', text: `على الطلب · ${l.po_number}`, onOrder: true };
  if (s < l.quantity) return { tone: 'bad', text: `المطلوب ${fmt(l.quantity)} / المتاح ${fmt(s)}`, icon: 'alert' };
  if (s <= (l.low_stock_threshold ?? 5)) return { tone: 'warn', text: `المتاح ${fmt(s)} (منخفض)` };
  return { tone: 'ok', text: `المتاح ${fmt(s)}` };
};

export default function WorkOrderDetail({ orderId, mechanics = [], onBack, onChanged, notify }) {
  const [order, setOrder] = useState(null);
  const [intake, setIntake] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [products, setProducts] = useState([]);
  const [partQuery, setPartQuery] = useState('');
  const [menu, setMenu] = useState(false);
  const [custom, setCustom] = useState(null);
  const [laborOpen, setLaborOpen] = useState(true);
  const [profit, setProfit] = useState(null);
  const [sheet, setSheet] = useState(null); // 'order' | 'collect' | { po: id }

  const load = useCallback(async () => {
    try {
      const [o, c, pr] = await Promise.all([workshopApi.getWorkOrder(orderId), workshopApi.getVehicleCheckIn(orderId).catch(() => null), workshopApi.getOrderProfit(orderId).catch(() => null)]);
      setOrder(o); setIntake(c?.intake || null); setProfit(pr); setError('');
    } catch (err) { setError(err.message || 'تعذر تحميل أمر الشغل'); }
  }, [orderId]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { getAllProductsWithVariants().then((p) => setProducts(Array.isArray(p) ? p : [])).catch(() => setProducts([])); }, []);

  // Runs one change, then reloads. The server stays the judge of what is allowed.
  async function act(fn, done) {
    if (busy) return;
    setBusy(true);
    try { await fn(); if (done) notify?.(done); await load(); onChanged?.(); } catch (err) { notify?.(err.message || 'تعذر تنفيذ العملية', 'danger'); } finally { setBusy(false); }
  }

  const matches = useMemo(() => {
    const q = partQuery.trim().toLowerCase();
    if (q.length < 2) return [];
    const out = [];
    for (const p of products) for (const v of p.variants || []) {
      if (`${p.name} ${v.barcode || ''} ${v.sku || ''}`.toLowerCase().includes(q)) out.push({ p, v });
    }
    return out.slice(0, 8);
  }, [products, partQuery]);

  if (error) return <div className="wk-card wod-state" role="alert"><p>{error}</p><button type="button" className="wk-btn" onClick={onBack}>رجوع</button></div>;
  if (!order) return <div className="wk-card wod-state" aria-busy="true"><p>جاري التحميل...</p></div>;

  const open = !['delivered', 'cancelled'].includes(order.status) && !order.sale_id;
  const labor = order.lines.filter((l) => l.kind === 'labor');
  const parts = order.lines.filter((l) => l.kind === 'part');
  const step = STEPS.findIndex(([k]) => k === order.status);
  const fuel = intake ? INTAKE.fuel[intake.fuel_level] : null;
  const addPart = ({ v }) => { setPartQuery(''); act(() => workshopApi.addWorkOrderLine(order.id, { kind: 'part', variant_id: v.id, quantity: 1 })); };
  const addLabor = (description, price, hours = 1) => { setMenu(false); setCustom(null); act(() => workshopApi.addWorkOrderLine(order.id, { kind: 'labor', description, quantity: hours, unit_price: price })); };
  const submitCustom = (e) => {
    e.preventDefault();
    if (!custom.description.trim()) return;
    addLabor(custom.description.trim(), Number(custom.price) || 0, Number(custom.hours) || 1);
  };
  const waiting = order.pending_parts_order;
  const missing = parts.filter((l) => stock(l).tone === 'bad').length;
  const laborTotal = labor.reduce((t, l) => t + l.line_total, 0);

  return (
    <div className="wod" dir="rtl">
      <header className="wk-card wod-head">
        <button type="button" className="wk-iconbtn wod-back" onClick={onBack} aria-label="رجوع للأوامر"><LineIcon name="chevronRight" size={20} /></button>
        <div className="wod-title">
          <h1>أمر شغل <span dir="ltr">#{order.order_number.replace('WO-', '')}</span> <span className={`wo-pill is-${TONE[order.status]}`}><b aria-hidden="true" />{order.status === 'cancelled' ? 'ملغاة' : STEPS[step][1]}</span>{waiting && <span className="wo-pill is-amber is-outline"><LineIcon name="box" size={14} />بانتظار القطع</span>}</h1>
          <p>استُلمت {when(order.opened_at)}</p>
        </div>
        <div className="wod-facts">
          <VehiclePlate plate={order.plate} city={order.plate_city} kind={order.plate_kind} />
          <p><b>{[order.make, order.model].filter(Boolean).join(' ') || 'مركبة'}</b> {order.year ? `· ${order.year}` : ''}</p>
        </div>
        <dl className="wod-facts">
          <div><dt>العميلة / العميل</dt><dd>{order.customer_name}</dd><small dir="ltr">{order.customer_phone}</small></div>
          <div><dt>العدّاد وقت الدخول</dt><dd>{fmt(order.odometer_in)} كم</dd></div>
          {fuel && <div><dt>الوقود</dt><dd>{fuel.label}</dd></div>}
        </dl>
        <div className="wod-note"><span>شكوى العميل</span><p>{order.complaint || 'لا توجد شكوى مسجلة'}</p></div>
        <div className="wod-side">
          <label className="wod-mech"><span>الفني المسؤول</span>
            <select value={order.mechanic || ''} disabled={!open || busy} onChange={(e) => act(() => workshopApi.updateWorkOrder(order.id, { mechanic: e.target.value }))}>
              <option value="">غير مُسند</option>
              {[...new Set([order.mechanic, ...mechanics].filter(Boolean))].map((m) => <option key={m} value={m}>{m}</option>)}
            </select>
          </label>
          <button type="button" className="wk-btn" onClick={() => workshopApi.printVehicleCheckIn(order.id).catch((err) => notify?.(err.message || 'تعذرت الطباعة', 'danger'))}><LineIcon name="printer" size={18} /> طباعة أمر الشغل</button>
        </div>
      </header>

      <ol className="wk-card wod-steps" aria-label="مراحل الأمر">
        {STEPS.map(([k, label], i) => {
          const done = order.status !== 'cancelled' && i < step;
          const here = i === step;
          return (
            <li key={k} className={`${done ? 'is-done' : ''}${here ? ' is-here' : ''}`}>
              <span aria-hidden="true">{done ? <LineIcon name="check" size={16} strokeWidth={2.4} /> : i + 1}</span>
              <b>{label}</b>
              {i === 0 && <small>{when(order.opened_at).split('·')[1]}</small>}
            </li>
          );
        })}
      </ol>
      {order.status === 'cancelled' && <p className="wod-banner" role="status">هذا الأمر ملغي ومقفول.</p>}

      <div className="wod-body">
        <div className="wod-main">
          <section className="wk-card wod-card" aria-label="الخدمات والعمالة">
            <header>
              <h2>الخدمات والعمالة <small>{labor.length} بنود</small></h2>
              {!laborOpen && <b className="wod-collapsed">{fmt(laborTotal)} ج.م</b>}
              <button type="button" className="wod-fold" aria-expanded={laborOpen} aria-label={laborOpen ? 'طي الخدمات' : 'عرض الخدمات'} onClick={() => setLaborOpen((v) => !v)}><LineIcon name="chevronDown" size={18} /></button>
              {laborOpen && open && (
                <div className="wod-add">
                  <button type="button" className="wk-btn" aria-expanded={menu} onClick={() => setMenu((m) => !m)}><LineIcon name="plus" size={18} /> إضافة خدمة <LineIcon name="chevronDown" size={16} /></button>
                  {menu && (
                    <div className="wod-menu" role="menu">
                      <small>خدمات جاهزة</small>
                      {PRESETS.map(([name, price]) => <button key={name} type="button" role="menuitem" onClick={() => addLabor(name, price)}><span>{name}</span><em>{fmt(price)} ج.م</em></button>)}
                      <hr />
                      <button type="button" role="menuitem" className="is-accent" onClick={() => { setMenu(false); setCustom({ description: '', hours: '1', price: '' }); }}><LineIcon name="plus" size={16} /> خدمة مخصصة</button>
                    </div>
                  )}
                </div>
              )}
            </header>
            {laborOpen && custom && (
              <form className="wod-custom" onSubmit={submitCustom}>
                <input autoFocus required maxLength={200} placeholder="وصف الخدمة" aria-label="وصف الخدمة" value={custom.description} onChange={(e) => setCustom({ ...custom, description: e.target.value })} />
                <input type="number" min="0.25" step="0.25" required aria-label="الساعات" value={custom.hours} onChange={(e) => setCustom({ ...custom, hours: e.target.value })} />
                <input type="number" min="0" step="any" required placeholder="السعر" aria-label="السعر" value={custom.price} onChange={(e) => setCustom({ ...custom, price: e.target.value })} />
                <button type="submit" className="wk-btn is-primary" disabled={busy}>إضافة</button>
                <button type="button" className="wk-btn" onClick={() => setCustom(null)}>إلغاء</button>
              </form>
            )}
            {laborOpen && <div className="wod-table" role="table">
              <div className="wod-row is-head services" role="row"><span>الوصف</span><span>الساعات</span><span>السعر</span><span /></div>
              {labor.map((l) => (
                <div key={l.id} className="wod-row services" role="row">
                  <b>{l.description}</b><span>{fmt(l.quantity)} س</span><span><b>{fmt(l.line_total)}</b> ج.م</span>
                  {open ? <button type="button" className="wod-del" disabled={busy} onClick={() => act(() => workshopApi.removeWorkOrderLine(l.id))} aria-label={`حذف ${l.description}`}><LineIcon name="trash" size={18} /></button> : <span />}
                </div>
              ))}
              {labor.length === 0 && <p className="wod-empty">لا توجد خدمات بعد</p>}
            </div>}
          </section>

          <section className="wk-card wod-card" aria-label="قطع الغيار">
            <header>
              <h2>قطع الغيار <small>{parts.length} أصناف</small></h2>
              {open && (
                <div className="wod-add wod-scan">
                  <label><BarcodeIcon size={18} /><input type="search" value={partQuery} onChange={(e) => setPartQuery(e.target.value)} placeholder="امسح الباركود أو اكتب اسم القطعة" aria-label="إضافة قطعة" /></label>
                  {matches.length > 0 && (
                    <div className="wod-menu" role="listbox">
                      {matches.map((m) => <button key={m.v.id} type="button" role="option" aria-selected="false" onClick={() => addPart(m)}><span>{m.p.name}{m.v.size ? ` - ${m.v.size}` : ''}</span><em>{fmt(m.v.selling_price)} ج.م</em></button>)}
                    </div>
                  )}
                </div>
              )}
            </header>
            {open && !waiting && missing > 0 && (
              <div className="wod-wait is-short" role="alert">
                <span aria-hidden="true"><LineIcon name="box" size={22} /></span>
                <div><b>{missing === 1 ? 'قطعة غير متوفرة في المخزون' : missing === 2 ? 'قطعتان غير متوفرتين في المخزون' : `${missing} قطع غير متوفرة في المخزون`}</b>
                  <p>ينقص {parts.filter((l) => stock(l).tone === 'bad').map((l) => `${fmt(l.quantity - Number(l.stock_quantity))} من ${l.description}`).join(' و')} لإتمام العمل.</p></div>
                <button type="button" className="wk-btn is-primary" onClick={() => setSheet('order')}><LineIcon name="file" size={16} /> إنشاء أمر شراء</button>
              </div>
            )}
            {waiting && (
              <div className="wod-wait" role="status">
                <span aria-hidden="true"><LineIcon name="box" size={22} /></span>
                <div><b>بانتظار توريد القطع</b><p>أمر الشراء {waiting.po_number}{waiting.expected_date ? ` · التوريد المتوقع ${new Date(waiting.expected_date).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' })}` : ''}</p></div>
                <button type="button" className="wk-btn" onClick={() => setSheet({ po: waiting.id })}><LineIcon name="file" size={16} /> عرض أمر الشراء</button>
              </div>
            )}
            <div className="wod-table" role="table">
              <div className="wod-row is-head parts" role="row"><span>القطعة</span><span>الكمية</span><span>سعر الوحدة</span><span>المخزون</span><span>الإجمالي</span><span /></div>
              {parts.map((l) => {
                const s = stock(l);
                return (
                  <Fragment key={l.id}>
                  <div className={`wod-row parts${s.tone === 'bad' ? ' is-short' : ''}${s.onOrder ? ' is-ordered' : ''}`} role="row">
                    <span className="wod-name"><b>{l.description}</b><small dir="ltr">{l.barcode || ''}</small>{profit && !profit.hidden && !(l.unit_cost > 0) && <em className="wod-nocost">سعر التكلفة ناقص</em>}</span>
                    <span className="wod-qty">
                      <button type="button" disabled={!open || busy || l.quantity <= 1} aria-label="تقليل الكمية" onClick={() => act(() => workshopApi.setWorkOrderLineQuantity(l.id, l.quantity - 1))}><LineIcon name="minus" size={14} /></button>
                      <b>{fmt(l.quantity)}</b>
                      <button type="button" disabled={!open || busy} aria-label="زيادة الكمية" onClick={() => act(() => workshopApi.setWorkOrderLineQuantity(l.id, l.quantity + 1))}><LineIcon name="plus" size={14} /></button>
                    </span>
                    <span>{fmt(l.unit_price)}</span>
                    <span className={`wod-stock is-${s.tone}`}>{s.icon ? <LineIcon name={s.icon} size={14} /> : <i aria-hidden="true" />}{s.text}</span>
                    <b>{fmt(l.line_total)}</b>
                    {open ? <button type="button" className="wod-del" disabled={busy} onClick={() => act(() => workshopApi.removeWorkOrderLine(l.id))} aria-label={`حذف ${l.description}`}><LineIcon name="trash" size={18} /></button> : <span />}
                  </div>
                  </Fragment>
                );
              })}
              {parts.length === 0 && <p className="wod-empty">لا توجد قطع غيار بعد</p>}
            </div>
          </section>
        </div>

        <div className="wod-col">
        <aside className="wk-card wod-sum" aria-label="ملخص التكلفة">
          <h2>ملخص التكلفة</h2>
          <dl>
            <div><dt>العمالة</dt><dd>{fmt(order.labor_total)} ج.م</dd></div>
            <div><dt>قطع الغيار</dt><dd>{fmt(order.parts_total)} ج.م</dd></div>
          </dl>
          <p className="wod-total"><span>الإجمالي المستحق</span><b>{fmt(order.total)} <small>ج.م</small></b></p>
          {open && order.status === 'ready' && (
            <>
              <button type="button" className="wk-btn is-primary wod-cta" disabled={busy || order.lines.length === 0} onClick={() => setSheet('collect')}><LineIcon name="banknote" size={20} /> تسليم وتحصيل</button>
              <button type="button" className="wk-btn" disabled={busy} onClick={() => act(() => workshopApi.setWorkOrderStatus(order.id, 'in_progress'), 'تم الرجوع للتنفيذ')}>رجوع للتنفيذ</button>
            </>
          )}
          {open && order.status !== 'ready' && (
            <button type="button" className="wk-btn is-primary wod-cta" disabled={busy || Boolean(waiting && CTA[order.status][0] === 'ready')} onClick={() => act(() => workshopApi.setWorkOrderStatus(order.id, CTA[order.status][0]), 'تم تحديث حالة الأمر')}>
              <LineIcon name="check" size={20} /> {CTA[order.status][1]}
            </button>
          )}
          {waiting && open && <p className="wod-warn" role="status"><LineIcon name="info" size={16} /> بانتظار توريد القطع ({waiting.po_number}). يُفتح التسليم بعد استلامها.</p>}
          {order.status === 'delivered' && <p className="wod-hint">تم التسليم · فاتورة #{order.sale_id}</p>}
          {missing > 0 && open && !waiting && <p className="wod-warn" role="alert"><LineIcon name="alert" size={16} /> {missing === 1 ? 'صنف واحد ناقص' : missing === 2 ? 'صنفان ناقصان' : `${missing} أصناف ناقصة`} في المخزون. يمكنك المتابعة، لكن لن يتم التحصيل قبل توفر الكميات.</p>}
          <div className="wod-actions">
            <button type="button" className="wk-btn" onClick={() => workshopApi.printVehicleCheckIn(order.id).catch((err) => notify?.(err.message || 'تعذرت الطباعة', 'danger'))}><LineIcon name="printer" size={18} /> طباعة</button>
            {order.customer_phone && <button type="button" className="wk-btn" onClick={() => openWhatsapp(order.customer_phone)}><LineIcon name="message" size={18} /> إبلاغ العميل</button>}
          </div>
        </aside>
        <CustomerTrackingCard order={order} busy={busy} notify={notify} onChanged={() => { load(); onChanged?.(); }} />
        <ProfitCard profit={profit} onAddCost={() => setSheet('cost')} onSaveRate={(v) => act(() => workshopApi.setLaborCostPerHour(v), 'تم حفظ تكلفة الساعة')} />
        </div>
      </div>
      {sheet === 'order' && <OrderPartsSheet order={order} onClose={() => setSheet(null)} onDone={(po) => { setSheet(null); notify?.(`تم إنشاء أمر الشراء ${po.po_number} للمورد ${po.supplier_name}`); load(); onChanged?.(); }} />}
      {sheet === 'collect' && <CollectSheet order={order} onClose={() => setSheet(null)} onDone={() => { setSheet(null); notify?.('تم التحصيل وتسليم المركبة'); load(); onChanged?.(); }} />}
      {sheet === 'cost' && profit && !profit.hidden && <CostSheet missing={profit.missing} onClose={() => setSheet(null)} onSaved={() => { setSheet(null); notify?.('تم حفظ سعر التكلفة'); load(); onChanged?.(); }} />}
      {sheet?.po && <PartsOrderSheet id={sheet.po} onClose={() => setSheet(null)} onChanged={(msg) => { setSheet(null); notify?.(msg); load(); onChanged?.(); }} />}
    </div>
  );
}

const pct = (part, whole) => (whole > 0 ? Math.max(0, (part / whole) * 100) : 0);

function ProfitCard({ profit, onAddCost, onSaveRate }) {
  const [rate, setRate] = useState('');
  useEffect(() => { if (profit && !profit.hidden) setRate(String(profit.hourly_cost || '')); }, [profit]);
  if (!profit) return null;
  if (profit.hidden) {
    return (
      <aside className="wk-card wod-profit is-hidden" aria-label="ربحية الأمر">
        <span aria-hidden="true"><LineIcon name="lock" size={22} /></span>
        <div><b>الربح مخفي</b><p>هذه البيانات متاحة للمالك والمدير فقط.</p></div>
      </aside>
    );
  }
  const p = profit;
  const complete = p.missing.length === 0;
  const good = complete && p.margin >= p.target_margin;
  const gap = complete ? Math.abs(Math.round((p.margin - p.target_margin) * 10) / 10) : 0;
  const rows = [
    { key: 'parts', label: 'تكلفة القطع', amount: p.parts_cost, share: pct(p.parts_cost, p.revenue) },
    { key: 'labor', label: 'تكلفة الفني', amount: p.labor_cost, share: pct(p.labor_cost, p.revenue) },
    complete ? { key: 'net', label: 'صافي الربح', amount: p.net, share: pct(p.net, p.revenue) } : { key: 'unknown', label: 'غير محدد', amount: null, share: Math.max(0, 100 - pct(p.parts_cost, p.revenue) - pct(p.labor_cost, p.revenue)) },
  ];
  return (
    <aside className="wk-card wod-profit" aria-label="ربحية الأمر">
      <header><h2>ربحية الأمر</h2><span className="wod-chip"><LineIcon name="lock" size={13} /> للمالك والمدير فقط</span></header>
      <dl>
        <div><dt>الإيراد<small>عمالة {fmt(p.labor_total)} + قطع {fmt(p.parts_total)}</small></dt><dd>{fmt(p.revenue)} ج.م</dd></div>
        <div><dt>تكلفة القطع<small>{complete ? `${p.parts_lines} أصناف بسعر التكلفة` : `${p.costed_lines} من ${p.parts_lines} أصناف فقط لها سعر تكلفة: ${fmt(p.parts_cost)} ج.م`}</small></dt><dd>{complete ? `− ${fmt(p.parts_cost)} ج.م` : 'غير مكتملة'}</dd></div>
        <div><dt>تكلفة الفني<small>{fmt(p.hours)} س × {fmt(p.hourly_cost)} ج.م/س</small></dt><dd>− {fmt(p.labor_cost)} ج.م</dd></div>
      </dl>
      <p className="wod-net"><span>صافي الربح</span>{complete ? <b>{fmt(p.net)} <small>ج.م</small></b> : <b className="is-na">—</b>}</p>
      <span className={`wod-chip ${complete ? (good ? 'is-good' : 'is-low') : ''}`}><i aria-hidden="true" />{complete ? `الهامش ${fmt(p.margin)}% · ${good ? 'جيد' : 'منخفض'}` : 'الهامش غير متاح'}</span>
      <div className="wod-bar" aria-hidden="true">{rows.map((r) => <i key={r.key} className={`is-${r.key}`} style={{ flexGrow: r.share || 0.001 }} />)}</div>
      <ul className="wod-legend">{rows.map((r) => <li key={r.key}><span className={`is-${r.key}`} /> <em>{r.label}</em><b>{r.amount == null ? '—' : fmt(r.amount)}</b><small>{fmt(Math.round(r.share * 10) / 10)}%</small></li>)}</ul>
      {complete && <p className={good ? 'wod-ok' : 'wod-lowbox'}>{good ? `أعلى من هدفك البالغ ${p.target_margin}% بمقدار ${gap} نقطة.` : `الهامش أقل من هدفك البالغ ${p.target_margin}%. راجع سعر البيع أو تكلفة القطع قبل التسليم.`}</p>}
      {!complete && (
        <div className="wod-lowbox is-missing">
          <p><LineIcon name="info" size={16} /> {p.missing.length === 1 ? 'أضف سعر التكلفة لقطعة واحدة' : p.missing.length === 2 ? 'أضف سعر التكلفة لقطعتين' : `أضف سعر التكلفة لـ ${p.missing.length} قطع`} لعرض الربح.<small>{p.missing.map((m) => m.description).join('، ')}</small></p>
          <button type="button" className="wk-btn" onClick={onAddCost}><LineIcon name="plus" size={16} /> إضافة سعر التكلفة</button>
        </div>
      )}
      <form className="wod-rate" onSubmit={(e) => { e.preventDefault(); onSaveRate(Number(rate) || 0); }}>
        <label><span>تكلفة ساعة الفني (ج.م)</span><input type="number" min="0" step="any" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} placeholder="0" /></label>
        <button type="submit" className="wk-btn">حفظ</button>
      </form>
    </aside>
  );
}

function CostSheet({ missing, onClose, onSaved }) {
  const rows = [...new Map(missing.map((m) => [m.variant_id, m])).values()];
  const [costs, setCosts] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      for (const r of rows) if (costs[r.variant_id] !== undefined && costs[r.variant_id] !== '') await workshopApi.setPartCost(r.variant_id, Number(costs[r.variant_id]));
      onSaved();
    } catch (err) { setError(err.message || 'تعذر حفظ التكلفة'); setBusy(false); }
  }
  return (
    <MacSheet title="إضافة سعر التكلفة" subtitle="بيتسجّل على الصنف في المخزون ويتحسب في الأرباح" onClose={onClose}>
      <form className="wk-form" onSubmit={save}>
        {rows.map((r) => (
          <label key={r.variant_id} className="wk-field"><span>{r.description}</span>
            <input type="number" min="0" step="any" required inputMode="decimal" placeholder="سعر الشراء للوحدة" value={costs[r.variant_id] ?? ''} onChange={(e) => setCosts({ ...costs, [r.variant_id]: e.target.value })} />
          </label>
        ))}
        {error && <p className="wk-error" role="alert">{error}</p>}
        <footer><button type="button" className="wk-btn" onClick={onClose}>إلغاء</button><button type="submit" className="wk-btn is-primary" disabled={busy}>{busy ? '...' : 'حفظ'}</button></footer>
      </form>
    </MacSheet>
  );
}

const METHODS = [['cash', 'نقدًا'], ['card', 'بطاقة']];

function CollectSheet({ order, onClose, onDone }) {
  const [method, setMethod] = useState('cash');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function pay() {
    setBusy(true);
    try { await workshopApi.collectWorkOrder(order.id, { paymentMethod: method }); onDone(); } catch (err) { setError(err.message || 'تعذر التحصيل'); setBusy(false); }
  }
  return (
    <MacSheet title="تسليم وتحصيل" subtitle={`${order.order_number} · ${order.customer_name}`} onClose={onClose}>
      <div className="wk-form">
        <p className="wod-total"><span>المبلغ المطلوب</span><b>{fmt(order.total)} <small>ج.م</small></b></p>
        <div className="wod-methods" role="radiogroup" aria-label="طريقة التحصيل">
          {METHODS.map(([k, label]) => <button key={k} type="button" role="radio" aria-checked={method === k} className={method === k ? 'is-on' : ''} onClick={() => setMethod(k)}>{label}</button>)}
        </div>
        <p className="wod-hint">بيتسجّل البيع في الوردية المفتوحة، وبتتخصم القطع من المخزون، والأمر بيتقفل كـ«تم التسليم».</p>
        {error && <p className="wk-error" role="alert">{error}</p>}
        <footer><button type="button" className="wk-btn" onClick={onClose}>إلغاء</button><button type="button" className="wk-btn is-primary" disabled={busy} onClick={pay}>{busy ? '...' : 'تأكيد التحصيل والتسليم'}</button></footer>
      </div>
    </MacSheet>
  );
}

const dayOf = (iso) => (iso ? new Date(iso).toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

function OrderPartsSheet({ order, onClose, onDone }) {
  const [suppliers, setSuppliers] = useState([]);
  const [draft, setDraft] = useState([]);
  const [qty, setQty] = useState({}); // variant_id -> quantity to order
  const [supplierId, setSupplierId] = useState('');
  const [date, setDate] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    Promise.all([getAllSuppliersWithStats(), workshopApi.getPartsOrderDraft(order.id)]).then(([sup, rows]) => {
      setSuppliers(Array.isArray(sup) ? sup : []);
      setDraft(rows);
      setQty(Object.fromEntries(rows.map((r) => [r.variant_id, r.shortage])));
      const last = rows.find((r) => r.last)?.last; // suggest whoever supplied one of these parts last
      if (last) setSupplierId(String(last.supplier_id));
    }).catch((err) => setError(err.message || 'تعذر تحميل القطع الناقصة'));
  }, [order.id]);

  const supplier = suppliers.find((s) => String(s.id) === supplierId);
  const total = draft.reduce((t, r) => t + (Number(qty[r.variant_id]) || 0) * r.unit_cost, 0);
  const valid = supplierId && draft.length > 0 && draft.every((r) => Number(qty[r.variant_id]) > 0);
  const step = (id, d) => setQty((q) => ({ ...q, [id]: Math.max(1, (Number(q[id]) || 0) + d) }));

  async function create(whatsapp) {
    setBusy(true);
    try {
      const { parts_order: po } = await workshopApi.orderMissingParts(order.id, {
        supplier_id: Number(supplierId), expected_date: date || null,
        items: draft.map((r) => ({ variant_id: r.variant_id, quantity: Number(qty[r.variant_id]) })),
      });
      if (whatsapp && supplier?.phone) {
        openWhatsapp(supplier.phone, `أمر شراء ${po.po_number}\n${draft.map((r) => `${r.description}: ${fmt(qty[r.variant_id])}`).join('\n')}`);
      }
      onDone(po);
    } catch (err) { setError(err.message || 'تعذر إنشاء أمر الشراء'); setBusy(false); }
  }

  return (
    <MacSheet icon="file" title="إنشاء أمر شراء" subtitle={`لأمر الشغل ${order.order_number} · ${[order.make, order.model].filter(Boolean).join(' ')}`} onClose={onClose}>
      <div className="wk-form">
        <label className="wk-field"><span>المورد</span>
          <select required value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">اختر المورد</option>
            {suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}{s.company ? ` (${s.company})` : ''}</option>)}
          </select>
        </label>
        {supplier && <p className="wod-hint">{supplier.last_purchase_date ? `آخر توريد منه: ${dayOf(supplier.last_purchase_date)}` : 'لا توجد توريدات سابقة منه'}{supplier.phone ? ` · ${supplier.phone}` : ''}</p>}

        <h3 className="wod-sub">القطع الناقصة <small>{draft.length}</small></h3>
        {draft.map((r) => (
          <div key={r.variant_id} className="wod-po-item">
            <header>
              <span><b>{r.description}</b><small dir="ltr">{r.barcode || ''}</small></span>
              <strong>{fmt((Number(qty[r.variant_id]) || 0) * r.unit_cost)} <small>ج.م</small><em>{fmt(r.unit_cost)} × {fmt(qty[r.variant_id])}</em></strong>
            </header>
            <div className="wod-po-row">
              <span className="wod-po-qty"><small>الكمية المطلوبة</small>
                <span className="wod-qty">
                  <button type="button" disabled={Number(qty[r.variant_id]) <= 1} aria-label="تقليل الكمية" onClick={() => step(r.variant_id, -1)}><LineIcon name="minus" size={14} /></button>
                  <b>{fmt(qty[r.variant_id])}</b>
                  <button type="button" aria-label="زيادة الكمية" onClick={() => step(r.variant_id, 1)}><LineIcon name="plus" size={14} /></button>
                </span>
              </span>
              <span><small>آخر مورد</small><b>{r.last?.supplier_name || 'لا يوجد'}</b></span>
              <span><small>آخر تكلفة</small><b>{fmt(r.last?.cost ?? r.unit_cost)} ج.م{r.last?.date ? ` · ${dayOf(r.last.date)}` : ''}</b></span>
            </div>
            <p className="wod-po-short"><LineIcon name="alert" size={14} /> مطلوب {fmt(r.required)} · المتاح {fmt(r.stock)} · الناقص {fmt(r.shortage)}</p>
          </div>
        ))}

        <label className="wk-field"><span>التوريد المتوقع (اختياري)</span><input type="date" dir="ltr" value={date} onChange={(e) => setDate(e.target.value)} /></label>
        <div className="wod-po-total"><span>التكلفة التقديرية</span><b>{fmt(total)} <small>ج.م</small></b><p>محسوبة بآخر تكلفة لكل صنف. يُسجَّل السعر النهائي عند استلام فاتورة المورد.</p></div>
        {error && <p className="wk-error" role="alert">{error}</p>}
        <footer className="wod-po-foot">
          <button type="button" className="wk-btn is-primary" disabled={busy || !valid} onClick={() => create(false)}><LineIcon name="check" size={18} /> {busy ? '...' : 'إنشاء الأمر'}</button>
          <button type="button" className="wk-btn" disabled={busy || !valid || !supplier?.phone} title={supplier && !supplier.phone ? 'المورد ملوش رقم موبايل' : undefined} onClick={() => create(true)}><LineIcon name="message" size={18} /> إرسال للمورد عبر واتساب</button>
        </footer>
      </div>
    </MacSheet>
  );
}

function PartsOrderSheet({ id, onClose, onChanged }) {
  const [po, setPo] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { workshopApi.getPartsOrder(id).then(setPo).catch((err) => setError(err.message || 'تعذر تحميل أمر الشراء')); }, [id]);
  async function run(fn, msg) {
    setBusy(true);
    try { await fn(id); onChanged(msg); } catch (err) { setError(err.message || 'تعذر التنفيذ'); setBusy(false); }
  }
  return (
    <MacSheet title={po ? `أمر الشراء ${po.po_number}` : 'أمر الشراء'} subtitle={po ? `المورد: ${po.supplier_name}` : ''} onClose={onClose}>
      <div className="wk-form">
        {po && <ul className="wod-polist">{po.items.map((i) => <li key={i.id}><span>{i.product_name}</span><b>{fmt(i.quantity)}</b><em>{fmt(i.unit_cost)} ج.م</em></li>)}</ul>}
        {po?.status === 'sent' && <p className="wod-hint">تسجيل الاستلام بيضيف الكميات للمخزون وبيسجّل فاتورة توريد آجلة على المورد.</p>}
        {po && po.status !== 'sent' && <p className="wod-hint">{po.status === 'received' ? 'اتسجّل استلام الأمر.' : 'الأمر ملغي.'}</p>}
        {error && <p className="wk-error" role="alert">{error}</p>}
        <footer>
          <button type="button" className="wk-btn" onClick={onClose}>إغلاق</button>
          {po?.status === 'sent' && <>
            <button type="button" className="wk-btn is-danger" disabled={busy} onClick={() => run(workshopApi.cancelPartsOrder, 'تم إلغاء أمر الشراء')}>إلغاء الأمر</button>
            <button type="button" className="wk-btn is-primary" disabled={busy} onClick={() => run(workshopApi.receivePartsOrder, 'تم تسجيل استلام القطع')}>تسجيل الاستلام</button>
          </>}
        </footer>
      </div>
    </MacSheet>
  );
}

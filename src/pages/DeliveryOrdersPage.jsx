import { useCallback, useEffect, useMemo, useState } from 'react';
import * as deliveryApi from '../api/delivery.js';
import { getAllProductsWithVariants } from '../api/products.js';
import '../styles/reservations.css';

const TABS = [['new', 'جديدة'], ['accepted', 'مقبولة'], ['rejected', 'مرفوضة']];

export default function DeliveryOrdersPage() {
  const [tab, setTab] = useState('new');
  const [orders, setOrders] = useState([]);
  const [menu, setMenu] = useState([]); // flat list of menu items for mapping
  const [maps, setMaps] = useState({}); // order id -> { lineIndex: variantId }
  const [edits, setEdits] = useState({}); // order id -> { phone, address }
  const [inbox, setInbox] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setOrders(await deliveryApi.getDeliveryOrders(tab)); setError(''); } catch (err) { setError(err.message || 'تعذر تحميل الطلبات'); }
  }, [tab]);
  useEffect(() => { load(); const timer = setInterval(load, 15_000); return () => clearInterval(timer); }, [load]);
  useEffect(() => {
    getAllProductsWithVariants().then((list) => setMenu((Array.isArray(list) ? list : []).flatMap((p) => (p.variants || []).map((v) => ({ id: v.id, label: `${p.name}${v.size ? ` - ${v.size}` : ''}` }))))).catch(() => setMenu([]));
  }, []);

  const unmatched = useMemo(() => (o) => o.items.some((item, i) => !item.variant_id && !maps[o.id]?.[i]), [maps]);

  async function run(fn) {
    if (busy) return;
    setBusy(true);
    try { await fn(); setError(''); await load(); } catch (err) { setError(err.message || 'تعذر تنفيذ العملية'); } finally { setBusy(false); }
  }

  async function accept(o) {
    const edit = edits[o.id];
    await run(async () => {
      if (edit && (edit.phone || edit.address)) await deliveryApi.updateDeliveryOrderDetails(o.id, edit);
      await deliveryApi.acceptDeliveryOrder(o.id, maps[o.id] || {});
    });
  }
  const reject = (o) => {
    const reason = window.prompt('سبب الرفض (اختياري)') ?? null;
    if (reason !== null) run(() => deliveryApi.rejectDeliveryOrder(o.id, reason));
  };
  const showInbox = () => run(async () => setInbox((await deliveryApi.getDeliveryInbox()).url));

  return (
    <div className="resv" dir="rtl">
      <header className="resv-head">
        <div><h1>طلبات التوصيل</h1><p>الطلبات اللي بتوصل من تطبيقات الدليفري</p></div>
        <button type="button" className="resv-btn" onClick={showInbox} disabled={busy}>رابط الاستقبال</button>
      </header>

      {inbox && (
        <p className="resv-card" style={{ gridTemplateColumns: '1fr auto' }}>
          <span><b>اديه للتطبيق أو الوسيط (Webhook):</b> <bdi dir="ltr" style={{ wordBreak: 'break-all' }}>{inbox}</bdi></span>
          <button type="button" className="resv-btn" onClick={() => navigator.clipboard?.writeText(inbox)}>نسخ</button>
        </p>
      )}

      <div className="resv-nav" role="tablist" aria-label="حالة الطلبات">
        {TABS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={tab === key} className={`resv-btn${tab === key ? ' is-primary' : ''}`} onClick={() => setTab(key)}>{label}</button>)}
      </div>

      {error && <p className="resv-error" role="alert">{error}</p>}
      {orders.length === 0 ? <p className="resv-empty">مفيش طلبات هنا.</p> : (
        <ul className="resv-list">
          {orders.map((o) => (
            <li key={o.id} className={`resv-card ${o.status === 'accepted' ? 'is-seated' : o.status === 'rejected' ? 'is-off' : ''}`} style={{ gridTemplateColumns: '1fr auto' }}>
              <div className="resv-body">
                <b>{o.source} #{o.external_id}{o.app_total != null ? ` · ${o.app_total} ج.م` : ''}</b>
                <span>{o.customer_name || 'بدون اسم'}{o.phone ? <> · <bdi>{o.phone}</bdi></> : null}{o.address ? ` · ${o.address}` : ''}</span>
                {o.notes && <small>{o.notes}</small>}
                <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
                  {o.items.map((item, i) => (
                    <li key={i}>
                      {item.quantity} × {item.name}
                      {o.status === 'new' && !item.variant_id && (
                        <select aria-label={`ربط ${item.name}`} value={maps[o.id]?.[i] || ''} style={{ marginInlineStart: 8 }}
                          onChange={(e) => setMaps({ ...maps, [o.id]: { ...(maps[o.id] || {}), [i]: Number(e.target.value) } })}>
                          <option value="">اربطه بصنف من المنيو</option>
                          {menu.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                        </select>
                      )}
                    </li>
                  ))}
                </ul>
                {o.reject_reason && <small>سبب الرفض: {o.reject_reason}</small>}
                {o.status === 'new' && (!o.phone || !o.address) && (
                  <div className="resv-nav" style={{ marginTop: 8 }}>
                    {!o.phone && <input placeholder="الموبايل" dir="ltr" onChange={(e) => setEdits({ ...edits, [o.id]: { ...(edits[o.id] || {}), phone: e.target.value } })} />}
                    {!o.address && <input placeholder="العنوان" onChange={(e) => setEdits({ ...edits, [o.id]: { ...(edits[o.id] || {}), address: e.target.value } })} />}
                  </div>
                )}
              </div>
              {o.status === 'new' ? (
                <div className="resv-actions" style={{ gridColumn: 'auto' }}>
                  <button type="button" className="resv-btn is-primary" disabled={busy || unmatched(o)} onClick={() => accept(o)}>قبول</button>
                  <button type="button" className="resv-btn is-danger" disabled={busy} onClick={() => reject(o)}>رفض</button>
                </div>
              ) : <span className="resv-pill">{o.status === 'accepted' ? `فاتورة #${o.sale_id}` : 'مرفوض'}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

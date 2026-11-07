import { useCallback, useEffect, useRef, useState } from 'react';
import * as salesApi from '../api/sales.js';
import { LockIcon, CheckIcon, UndoIcon } from '../components/icons/PosIcons.jsx';
import '../styles/kitchen.css';

/* Kitchen display. The backend decides what moves are allowed (one step
   forward, undo the last step within two minutes) and records each move, so
   this screen only offers those buttons. Brand colors: gold = new, orange =
   preparing, deep gold = ready, muted = delivered, red only for late orders. */

const COLUMNS = [
  { key: 'new', label: 'طلبات جديدة', next: 'preparing', action: 'ابدأ التحضير', tone: 'new' },
  { key: 'preparing', label: 'قيد التحضير', next: 'ready', action: 'جاهز', tone: 'preparing', icon: true },
  { key: 'ready', label: 'جاهز للتقديم', next: 'served', action: 'تم التسليم', tone: 'ready' },
  { key: 'served', label: 'تم التسليم', tone: 'served' },
];
const COLUMN_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

const MODES = { dine_in: 'صالة', takeaway: 'تيك أواي', delivery: 'توصيل' };

const POLL_MS = 10_000;
const LATE_MINUTES = 20;
const WARN_MINUTES = 10;
const FRESH_SECONDS = 60;
const UNDO_VISIBLE_MS = 15_000;

const clockFmt = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hour12: false });
const timeFmt = new Intl.DateTimeFormat('ar-EG-u-nu-latn', { hour: '2-digit', minute: '2-digit', hour12: true });

// SQLite stores UTC as "YYYY-MM-DD HH:MM:SS".
function parseDbTime(value) {
  if (!value) return null;
  const date = new Date(`${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function elapsed(fromDate, now) {
  const total = Math.max(0, Math.floor((now - fromDate) / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return { minutes: m, label: `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` };
}

// Table rounds are named by their table; sale orders by their number.
function orderLabel(order) {
  return order.round_id ? `${order.table_name} · دفعة ${order.round_no}` : `#${order.id}`;
}

function OrderCard({ order, column, now, busy, onMove }) {
  const createdAt = parseDbTime(order.created_at);
  const age = createdAt ? elapsed(createdAt, now) : null;
  const active = order.kitchen_status !== 'served';
  const late = active && age && age.minutes >= LATE_MINUTES;
  const warn = active && age && !late && age.minutes >= WARN_MINUTES;
  const fresh = order.kitchen_status === 'new' && age && (now - createdAt) / 1000 < FRESH_SECONDS;

  return (
    <article className={`kds-card kds-card--${column.tone}${late ? ' is-late' : ''}${fresh ? ' is-fresh' : ''}`}>
      <header className="kds-card__head">
        <span className="kds-card__no">{orderLabel(order)}</span>
        {active && age && (
          <span className={`kds-timer${late ? ' kds-timer--late' : warn ? ' kds-timer--warn' : ''}`} title="منذ تسجيل الطلب">
            {age.label}
          </span>
        )}
      </header>

      <div className="kds-card__meta">
        <span className="kds-chip">{MODES[order.order_mode] || 'طلب'}</span>
        {createdAt && <span>{timeFmt.format(createdAt)}</span>}
        {order.customer_name && <span className="kds-card__customer">{order.customer_name}</span>}
      </div>

      <ul className="kds-items">
        {(order.items || []).map((item, index) => (
          <li key={`${order.key}-${index}`} className="kds-item">
            <span className="kds-item__qty">×<bdi>{item.quantity}</bdi></span>
            <span className="kds-item__name">
              {item.product_name || 'صنف محذوف'}
              {[item.size, item.color].filter(Boolean).length > 0 && (
                <span className="kds-item__variant">{[item.size, item.color].filter(Boolean).join(' / ')}</span>
              )}
              {item.modifiers?.length > 0 && (
                <span className="kds-item__variant">+ {item.modifiers.map((m) => m.name).join('، ')}</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      {order.notes && <p className="kds-note">📝 {order.notes}</p>}

      {column.next && (
        <button
          type="button"
          className={`kds-action kds-action--${column.tone}`}
          disabled={busy}
          onClick={() => onMove(order, column.next)}
        >
          {column.icon && <CheckIcon size={20} />}
          {busy ? 'جارٍ النقل…' : column.action}
        </button>
      )}
    </article>
  );
}

export default function KitchenDisplayPage() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(true);
  const [lastSync, setLastSync] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [undo, setUndo] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  const [fullscreen, setFullscreen] = useState(false);
  const pageRef = useRef(null);

  const loadOrders = useCallback(async () => {
    try {
      if (!salesApi.getKitchenOrders.isAvailable()) throw new Error('شاشة المطبخ غير متاحة في هذا الإصدار');
      const result = await salesApi.getKitchenOrders();
      // The central server sends sale orders only, without a key.
      setOrders(Array.isArray(result) ? result.map((o) => ({ ...o, key: o.key || `sale-${o.id}` })) : []);
      setConnected(true);
      setLastSync(new Date());
    } catch (loadError) {
      setConnected(false);
      setError(loadError?.message || 'تعذر تحميل طلبات المطبخ');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOrders();
    const poll = window.setInterval(loadOrders, POLL_MS);
    const tick = window.setInterval(() => setNow(Date.now()), 1000);
    return () => { window.clearInterval(poll); window.clearInterval(tick); };
  }, [loadOrders]);

  useEffect(() => {
    if (!undo) return undefined;
    const id = window.setTimeout(() => setUndo(null), UNDO_VISIBLE_MS);
    return () => window.clearTimeout(id);
  }, [undo]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === pageRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function moveOrder(order, nextStatus, { isUndo = false } = {}) {
    const fromStatus = order.kitchen_status || 'new';
    setBusyId(order.key);
    setError('');
    // Show the move right away; the next poll (or the error path) corrects it.
    setOrders((list) => list.map((o) => (o.key === order.key ? { ...o, kitchen_status: nextStatus } : o)));
    try {
      await salesApi.updateKitchenOrderStatus(order.round_id ? null : order.id, nextStatus, order.round_id || null);
      setUndo(isUndo ? null : { order: { ...order, kitchen_status: nextStatus }, from: fromStatus, to: nextStatus });
    } catch (moveError) {
      setError(moveError?.message || 'تعذر تحديث حالة الطلب');
    } finally {
      setBusyId(null);
      loadOrders();
    }
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else pageRef.current?.requestFullscreen?.().catch(() => {});
  }

  const status = (key) => orders.filter((o) => (o.kitchen_status || 'new') === key);
  const lateCount = orders.filter((o) => {
    const at = parseDbTime(o.created_at);
    return o.kitchen_status !== 'served' && at && (now - at) / 60000 >= LATE_MINUTES;
  }).length;

  const counters = [
    { key: 'new', label: 'جديد', value: status('new').length },
    { key: 'preparing', label: 'بيتحضر', value: status('preparing').length },
    { key: 'ready', label: 'جاهز', value: status('ready').length },
    { key: 'late', label: `متأخر +${LATE_MINUTES}د`, value: lateCount },
  ];

  return (
    <section ref={pageRef} className={`kds-page${fullscreen ? ' is-fullscreen' : ''}`} dir="rtl">
      <header className="kds-top">
        <div className="kds-top__title">
          <h1>شاشة المطبخ</h1>
          <p className={`kds-conn${connected ? '' : ' is-offline'}`} role="status">
            <span className="kds-conn__dot" aria-hidden="true" />
            {connected
              ? 'متصل — تحديث تلقائي'
              : `غير متصل — آخر تحديث ${lastSync ? clockFmt.format(lastSync) : '—'}`}
          </p>
        </div>

        <dl className="kds-counters">
          {counters.map((c) => (
            <div key={c.key} className={`kds-counter kds-counter--${c.key}${c.key === 'late' && c.value > 0 ? ' is-alert' : ''}`}>
              <dt>{c.label}</dt>
              <dd><bdi>{c.value}</bdi></dd>
            </div>
          ))}
        </dl>

        <div className="kds-top__side">
          <button
            type="button"
            className={`kds-mode${fullscreen ? ' is-on' : ''}`}
            onClick={toggleFullscreen}
            aria-pressed={fullscreen}
            title={fullscreen ? 'الخروج من وضع المطبخ (Esc)' : 'عرض الشاشة كاملة للمطبخ'}
          >
            <LockIcon size={16} /> وضع المطبخ
          </button>
          <time className="kds-clock"><bdi>{clockFmt.format(now)}</bdi></time>
        </div>
      </header>

      {error && <div className="kds-alert" role="alert">{error}</div>}

      {loading ? (
        <p className="kds-loading" role="status">جارٍ تحميل طلبات المطبخ…</p>
      ) : (
        <div className="kds-board">
          {COLUMNS.map((column) => {
            const list = status(column.key);
            return (
              <section key={column.key} className={`kds-col kds-col--${column.tone}`} aria-label={column.label}>
                <header className="kds-col__head">
                  <h2>{column.label}</h2>
                  <span className="kds-col__count"><bdi>{list.length}</bdi></span>
                </header>
                <div className="kds-col__list">
                  {list.map((order) => (
                    <OrderCard
                      key={order.key}
                      order={order}
                      column={column}
                      now={now}
                      busy={busyId === order.key}
                      onMove={moveOrder}
                    />
                  ))}
                  {list.length === 0 && <p className="kds-empty">لا توجد طلبات</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {undo && (
        <div className="kds-toast" role="status">
          <span>
            تم نقل الطلب <bdi>{orderLabel(undo.order)}</bdi> إلى {COLUMN_BY_KEY[undo.to]?.label}
          </span>
          <button
            type="button"
            className="kds-toast__undo"
            onClick={() => { const u = undo; setUndo(null); moveOrder(u.order, u.from, { isUndo: true }); }}
          >
            <UndoIcon size={16} /> تراجع
          </button>
        </div>
      )}
    </section>
  );
}

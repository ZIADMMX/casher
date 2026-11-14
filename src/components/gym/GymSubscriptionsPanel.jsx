import { useMemo, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import * as subscriptionsApi from '../../api/subscriptions.js';

const STATUS = {
  active: { label: 'نشط', tone: 'ok' },
  frozen: { label: 'مجمد', tone: 'blue' },
  expired: { label: 'منتهي', tone: 'warn' },
  depleted: { label: 'نفد الرصيد', tone: 'bad' },
};
const STATS = [
  { key: 'total_subscriptions', label: 'إجمالي الاشتراكات', tone: 'brand' },
  { key: 'active_count', label: 'اشتراكات نشطة', tone: 'ok' },
  { key: 'frozen_count', label: 'مجمدة', tone: 'blue' },
  { key: 'expired_count', label: 'منتهية', tone: 'warn' },
  { key: 'depleted_count', label: 'نفد الرصيد', tone: 'bad' },
];
const DAY = 86400000;
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (v) => (v ? new Date(v).toLocaleDateString('ar-EG') : '—');

// What is left of a subscription: sessions for session packages, days for the rest.
export function balanceOf(sub, now = Date.now()) {
  if (sub.package_type === 'session_based') {
    const total = Number(sub.total_credits) || 0;
    const left = Math.max(Number(sub.remaining_credits) || 0, 0);
    return { label: 'رصيد الجلسات', text: `${left} من ${total} جلسة`, percent: total > 0 ? Math.min(100, Math.round((left / total) * 100)) : 0 };
  }
  const end = new Date(sub.end_date).getTime();
  const start = new Date(sub.start_date).getTime();
  const span = end - start;
  const daysLeft = Number.isFinite(end) ? Math.max(Math.ceil((end - now) / DAY), 0) : 0;
  return {
    label: 'المدة المتبقية',
    text: `${daysLeft} يوم متبقي`,
    percent: span > 0 ? Math.min(100, Math.max(0, Math.round(((end - now) / span) * 100))) : 0,
  };
}

function Ring({ percent }) {
  const r = 17;
  const c = 2 * Math.PI * r;
  return (
    <svg className="gco-ring" width="48" height="48" viewBox="0 0 48 48" role="img" aria-label={`${percent}%`}>
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" className="gco-ring__track" />
      <circle cx="24" cy="24" r={r} fill="none" strokeWidth="5" strokeLinecap="round" className="gco-ring__bar"
        strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform="rotate(-90 24 24)" />
      <text x="24" y="28" textAnchor="middle" className="gco-ring__text">{percent}%</text>
    </svg>
  );
}

/** Members' subscriptions: stats, search, one card per member with the quick actions. */
export default function GymSubscriptionsPanel({ subscriptions, stats, loading, onChanged, onRenew, onError }) {
  const [query, setQuery] = useState('');
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return subscriptions;
    return subscriptions.filter((s) => [s.customer_name, s.customer_phone, s.package_name].some((v) => (v || '').toLowerCase().includes(q)));
  }, [subscriptions, query]);

  // One wrapper so every action reports failures the same way and reloads on success.
  async function run(id, action, failure) {
    setBusyId(id);
    try {
      await action();
      onChanged();
    } catch (err) {
      onError(`${failure}: ${err.message}`);
    } finally {
      setBusyId(null);
    }
  }

  const deduct = (sub) => run(sub.id, () => subscriptionsApi.consumeSubscriptionCredit(sub.id, 1, null, 'خصم جلسة يدوي من شاشة الاشتراكات'), 'فشل خصم الجلسة');
  const unfreeze = (sub) => run(sub.id, () => subscriptionsApi.unfreezeSubscription(sub.id), 'فشل إعادة التفعيل');

  async function confirmFreeze(event) {
    event.preventDefault();
    const target = freezeTarget;
    setFreezeTarget(null);
    await run(target.id, () => subscriptionsApi.freezeSubscription(target.id, freezeReason), 'فشل تجميد الاشتراك');
    setFreezeReason('');
  }

  return (
    <>
      {stats && (
        <div className="gco-stats">
          {STATS.map((s) => (
            <article key={s.key} className={`gco-card gco-stat is-${s.tone}`}>
              <span className="gco-stat__label"><i aria-hidden="true" />{s.label}</span>
              <strong>{stats[s.key] || 0}</strong>
            </article>
          ))}
        </div>
      )}

      <div className="gco-tools">
        <label className="gco-search">
          <LineIcon name="search" size={18} />
          <input type="search" placeholder="ابحث باسم العميل أو رقم التليفون..." aria-label="بحث في الاشتراكات" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <span className="gco-count">عرض {visible.length} من {subscriptions.length}</span>
      </div>

      {loading ? <p className="gco-state">جاري التحميل...</p> : subscriptions.length === 0 ? (
        <p className="gco-state">لا توجد اشتراكات عملاء مسجلة. استخدم «اشتراك عميل جديد» لتفعيل أول اشتراك.</p>
      ) : visible.length === 0 ? (
        <p className="gco-state">لا توجد نتائج مطابقة للبحث.</p>
      ) : (
        <ul className="gco-members">
          {visible.map((sub) => {
            const st = STATUS[sub.status] || { label: sub.status, tone: 'muted' };
            const bal = balanceOf(sub);
            const busy = busyId === sub.id;
            return (
              <li key={sub.id} className={`gco-card gco-member is-${st.tone}`}>
                <div className="gco-member__who">
                  <span className="gco-avatar" aria-hidden="true">{(sub.customer_name || '؟').trim().charAt(0).toUpperCase()}</span>
                  <div>
                    <b>{sub.customer_name}</b>
                    <small><LineIcon name="phone" size={12} /> {sub.customer_phone || '—'}</small>
                  </div>
                </div>

                <div className="gco-member__col">
                  <span className="gco-cap">الباقة</span>
                  <span className="gco-pkgpill"><b>{sub.package_name}</b><small>{money(sub.package_price)} ج.م</small></span>
                </div>

                <div className="gco-member__col">
                  <span className="gco-cap">الحالة والانتهاء</span>
                  <div className="gco-statusrow">
                    <span className={`gco-pill is-${st.tone}`}>{st.label}</span>
                    <small>{day(sub.end_date)}</small>
                  </div>
                </div>

                <div className="gco-member__balance">
                  <div>
                    <span className="gco-cap">{bal.label}</span>
                    <b>{bal.text}</b>
                    <div className="gco-bar" aria-hidden="true"><i style={{ inlineSize: `${bal.percent}%` }} /></div>
                  </div>
                  <Ring percent={bal.percent} />
                </div>

                <div className="gco-member__actions">
                  {sub.package_type === 'session_based' && sub.status === 'active' && sub.remaining_credits > 0 && (
                    <button type="button" className="gco-btn is-dark" disabled={busy} onClick={() => deduct(sub)}>
                      <LineIcon name="minus" size={16} /> خصم جلسة
                    </button>
                  )}
                  {sub.status === 'active' && (
                    <button type="button" className="gco-btn is-blue" disabled={busy} onClick={() => { setFreezeTarget(sub); setFreezeReason(''); }}>
                      <LineIcon name="snowflake" size={16} /> تجميد
                    </button>
                  )}
                  {sub.status === 'frozen' && (
                    <button type="button" className="gco-btn is-blue" disabled={busy} onClick={() => unfreeze(sub)}>
                      <LineIcon name="unlock" size={16} /> فك التجميد
                    </button>
                  )}
                  <button type="button" className="gco-btn is-brand" disabled={busy} onClick={() => onRenew(sub)}>
                    <LineIcon name="refresh" size={16} /> تجديد
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {freezeTarget && (
        <div className="gco-overlay" onClick={() => setFreezeTarget(null)}>
          <form className="gco-sheet" role="dialog" aria-modal="true" aria-label="تجميد اشتراك" onClick={(e) => e.stopPropagation()} onSubmit={confirmFreeze}>
            <header>
              <span className="gco-tile is-blue"><LineIcon name="snowflake" size={24} /></span>
              <div>
                <h2>تجميد اشتراك: {freezeTarget.customer_name}</h2>
                <p>سيتم إيقاف حساب الأيام والرصيد مؤقتًا. عند فك التجميد يُمدَّد تاريخ الانتهاء تلقائيًا بعدد أيام التجميد.</p>
              </div>
              <button type="button" className="gco-x" onClick={() => setFreezeTarget(null)} aria-label="إغلاق"><LineIcon name="x" size={18} /></button>
            </header>
            <label className="gco-field">
              <span>سبب التجميد (اختياري)</span>
              <input type="text" placeholder="مثال: سفر العميل" value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} autoFocus />
            </label>
            <footer>
              <button type="button" className="gco-btn" onClick={() => setFreezeTarget(null)}>إلغاء</button>
              <button type="submit" className="gco-btn is-primary"><LineIcon name="snowflake" size={16} /> تأكيد التجميد</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

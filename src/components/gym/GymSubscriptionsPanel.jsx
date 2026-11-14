import { useMemo, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import GymMemberDetail, { fmtDate } from './GymMemberDetail.jsx';
import Kpi from './GymKpi.jsx';
import { TransferSheet, UpgradeSheet } from './GymMemberSheets.jsx';
import * as subscriptionsApi from '../../api/subscriptions.js';
import '../../styles/gymMembers.css';

const STATUS = {
  active: { label: 'نشط', tone: 'ok' },
  frozen: { label: 'مجمد', tone: 'blue' },
  expired: { label: 'منتهي', tone: 'warn' },
  depleted: { label: 'نفد الرصيد', tone: 'bad' },
};
const FILTERS = [
  { key: 'all', label: 'الكل' },
  { key: 'active', label: 'نشط' },
  { key: 'frozen', label: 'مجمد' },
  { key: 'ended', label: 'منتهي' },
];
const FREEZE_REASONS = ['سفر', 'إصابة أو ظرف صحي', 'ظرف شخصي'];
const FREEZE_DAYS = [7, 14, 30, 60];
const RANK = { active: 0, frozen: 1, expired: 2, depleted: 3 };
const DAY = 86400000;

// What is left of a subscription: sessions for session packages, days for the rest.
export function balanceOf(sub, now = Date.now()) {
  if (sub.package_type === 'session_based') {
    const total = Number(sub.total_credits) || 0;
    const left = Math.max(Number(sub.remaining_credits) || 0, 0);
    return { label: 'رصيد الجلسات', text: `${left} من ${total} جلسة`, value: left, unit: 'جلسة متبقية', percent: total > 0 ? Math.min(100, Math.round((left / total) * 100)) : 0 };
  }
  const end = new Date(sub.end_date).getTime();
  const start = new Date(sub.start_date).getTime();
  const span = end - start;
  const daysLeft = Number.isFinite(end) ? Math.max(Math.ceil((end - now) / DAY), 0) : 0;
  return {
    label: 'المدة المتبقية',
    text: `${daysLeft} يوم متبقي`,
    value: daysLeft,
    unit: 'يوم متبقي',
    percent: span > 0 ? Math.min(100, Math.max(0, Math.round(((end - now) / span) * 100))) : 0,
  };
}

// One entry per member; their subscriptions are ordered active first, then newest.
export function groupMembers(subscriptions) {
  const byMember = new Map();
  subscriptions.forEach((s) => {
    if (!byMember.has(s.customer_id)) byMember.set(s.customer_id, []);
    byMember.get(s.customer_id).push(s);
  });
  return [...byMember.entries()].map(([id, subs]) => {
    subs.sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || new Date(b.end_date) - new Date(a.end_date));
    return { id, name: subs[0].customer_name, phone: subs.find((s) => s.customer_phone)?.customer_phone || '', subs, primary: subs[0] };
  });
}

// Freeze days left on the package (null = no cap).
function allowanceOf(sub) {
  const max = Number(sub.max_freeze_days) || 0;
  return max > 0 ? Math.max(max - (Number(sub.frozen_days_used) || 0), 0) : null;
}

const inFilter = (member, filter) => {
  const status = member.primary.status;
  if (filter === 'all') return true;
  if (filter === 'ended') return status === 'expired' || status === 'depleted';
  return status === filter;
};

/** Members and their subscriptions: KPIs, a searchable member list, and the selected member's detail. */
export default function GymSubscriptionsPanel({ subscriptions, stats, customers = [], packages = [], loading, onChanged, onRenew, onError, onNotice = () => {}, initialSelectedId = null }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(initialSelectedId);
  const [subId, setSubId] = useState(null);
  const [freezeTarget, setFreezeTarget] = useState(null);
  const [freezeReason, setFreezeReason] = useState('');
  const [freezeDays, setFreezeDays] = useState(14); // null = until someone unfreezes
  const [upgradeTarget, setUpgradeTarget] = useState(null);
  const [transferTarget, setTransferTarget] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [now] = useState(() => Date.now()); // fixed for the render so "expires this week" does not drift

  const members = useMemo(() => groupMembers(subscriptions), [subscriptions]);
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return members.filter((m) => inFilter(m, filter)
      && (!q || [m.name, m.phone, ...m.subs.map((s) => s.package_name)].some((v) => (v || '').toLowerCase().includes(q))));
  }, [members, query, filter]);

  const member = visible.find((m) => m.id === selectedId) || visible[0] || null;
  const sub = member ? (member.subs.find((s) => s.id === subId) || member.primary) : null;
  const customer = member ? customers.find((c) => c.id === member.id) : null;

  const expiringSoon = subscriptions.filter((s) => {
    if (s.status !== 'active' || s.package_type === 'session_based') return false;
    const left = new Date(s.end_date).getTime() - now;
    return left >= 0 && left <= 7 * DAY;
  }).length;
  const totalSubs = Number(stats?.total_subscriptions) || subscriptions.length;
  const active = Number(stats?.active_count) || 0;
  const frozen = Number(stats?.frozen_count) || 0;

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

  const deduct = (s) => run(s.id, () => subscriptionsApi.consumeSubscriptionCredit(s.id, 1, null, 'خصم جلسة يدوي من شاشة الاشتراكات'), 'فشل خصم الجلسة');
  const unfreeze = (s) => run(s.id, () => subscriptionsApi.unfreezeSubscription(s.id), 'فشل إعادة التفعيل');

  async function confirmFreeze(event) {
    event.preventDefault();
    const target = freezeTarget;
    setFreezeTarget(null);
    await run(target.id, () => subscriptionsApi.freezeSubscription(target.id, freezeReason, freezeDays), 'فشل تجميد الاشتراك');
    setFreezeReason('');
  }

  function pickMember(id) { setSelectedId(id); setSubId(null); }
  const allowance = freezeTarget ? allowanceOf(freezeTarget) : null;
  const runningIds = new Set(subscriptions.filter((s) => s.status === 'active' || s.status === 'frozen').map((s) => s.customer_id));
  const newEnd = freezeTarget && freezeDays ? new Date(new Date(freezeTarget.end_date).getTime() + freezeDays * DAY) : null;
  const finished = (message) => { setUpgradeTarget(null); setTransferTarget(null); onChanged(); onNotice(message); };

  return (
    <>
      {stats && (
        <div className="gms-kpis">
          <Kpi label="إجمالي الاشتراكات" tone="brand" value={totalSubs} hint={`${members.length} عضو مسجل`} ratio={1} />
          <Kpi label="اشتراكات نشطة" tone="ok" value={active} hint={`${totalSubs ? Math.round((active / totalSubs) * 100) : 0}% من الاشتراكات`} ratio={totalSubs ? active / totalSubs : 0} />
          <Kpi label="مجمدة" tone="blue" value={frozen} hint="متوقفة مؤقتًا" ratio={totalSubs ? frozen / totalSubs : 0} />
          <Kpi label="تنتهي هذا الأسبوع" tone="warn" value={expiringSoon} hint="تحتاج متابعة تجديد" ratio={active ? expiringSoon / active : 0} />
        </div>
      )}

      <div className="gms-layout">
        <aside className="gms-card gms-list" aria-label="قائمة الأعضاء">
          <header>
            <h2>قائمة الأعضاء</h2>
            <span className="gms-count">عرض {visible.length} من {members.length}</span>
          </header>
          <label className="gms-search">
            <LineIcon name="search" size={17} />
            <input type="search" placeholder="ابحث بالاسم أو رقم الهاتف" aria-label="بحث في الاشتراكات" value={query} onChange={(e) => setQuery(e.target.value)} />
          </label>
          <div className="gms-seg" role="group" aria-label="تصفية الحالة">
            {FILTERS.map((f) => (
              <button key={f.key} type="button" className={filter === f.key ? 'is-on' : ''} aria-pressed={filter === f.key} onClick={() => setFilter(f.key)}>{f.label}</button>
            ))}
          </div>

          {loading ? <p className="gms-empty">جاري التحميل...</p> : members.length === 0 ? (
            <p className="gms-empty">لا توجد اشتراكات عملاء مسجلة. استخدم «اشتراك عميل جديد» لتفعيل أول اشتراك.</p>
          ) : visible.length === 0 ? (
            <p className="gms-empty">لا توجد نتائج مطابقة للبحث.</p>
          ) : (
            <ul>
              {visible.map((m) => {
                const st = STATUS[m.primary.status] || { label: m.primary.status, tone: 'muted' };
                const bal = balanceOf(m.primary, now);
                const live = m.primary.status === 'active';
                const urgent = live && bal.percent <= 10;
                return (
                  <li key={m.id}>
                    <button type="button" className={member?.id === m.id ? 'is-on' : ''} aria-pressed={member?.id === m.id} onClick={() => pickMember(m.id)}>
                      <span className="gms-avatar" aria-hidden="true">{(m.name || '؟').trim().charAt(0).toUpperCase()}</span>
                      <span className="gms-list__who"><b>{m.name}</b><small>{m.primary.package_name}</small></span>
                      <span className={`gms-pill ${live ? (urgent ? 'is-warn' : 'is-ok') : `is-${st.tone}`}`}>{live ? `${bal.value} ${bal.unit.split(' ')[0]}` : st.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {member && sub ? (
          <GymMemberDetail
            key={member.id}
            member={member}
            sub={sub}
            customer={customer}
            balance={balanceOf(sub, now)}
            busy={busyId === sub.id}
            onPickSub={setSubId}
            onDeduct={deduct}
            onFreeze={(s) => { setFreezeTarget(s); setFreezeReason(''); setFreezeDays(allowanceOf(s) === null || allowanceOf(s) >= 14 ? 14 : null); }}
            onUnfreeze={unfreeze}
            onRenew={onRenew}
            onUpgrade={setUpgradeTarget}
            onTransfer={setTransferTarget}
          />
        ) : <div className="gms-card gms-detail-empty">اختر عضوًا من القائمة لعرض تفاصيل اشتراكه.</div>}
      </div>

      {upgradeTarget && <UpgradeSheet sub={upgradeTarget} packages={packages} onClose={() => setUpgradeTarget(null)} onDone={finished} />}
      {transferTarget && <TransferSheet sub={transferTarget} customers={customers} busyIds={runningIds} onClose={() => setTransferTarget(null)} onDone={finished} />}

      {freezeTarget && (
        <div className="gco-overlay" onClick={() => setFreezeTarget(null)}>
          <form className="gms-sheet gms-sheet--wide" role="dialog" aria-modal="true" aria-label="تجميد اشتراك" onClick={(e) => e.stopPropagation()} onSubmit={confirmFreeze}>
            <header>
              <div>
                <h2>تجميد الاشتراك</h2>
                <p>{freezeTarget.customer_name} · {freezeTarget.package_name}</p>
              </div>
              <button type="button" className="gms-iconbtn" onClick={() => setFreezeTarget(null)} aria-label="إغلاق"><LineIcon name="x" size={17} /></button>
            </header>
            <div className="gms-field">
              <span>المدة</span>
              <div className="gms-seg gms-seg--5" role="group" aria-label="مدة التجميد">
                {FREEZE_DAYS.map((d) => (
                  <button key={d} type="button" className={freezeDays === d ? 'is-on' : ''} aria-pressed={freezeDays === d} disabled={allowance !== null && d > allowance} onClick={() => setFreezeDays(d)}>{d} يوم</button>
                ))}
                <button type="button" className={freezeDays === null ? 'is-on' : ''} aria-pressed={freezeDays === null} onClick={() => setFreezeDays(null)}>مفتوح</button>
              </div>
            </div>
            <p className="gms-sheet__rule">
              {freezeDays ? `يبدأ التجميد الآن ويُستأنف الاشتراك تلقائيًا بعد ${freezeDays} يوم، ويُمدَّد تاريخ الانتهاء بنفس المدة.` : 'تجميد مفتوح: يتوقف الاشتراك حتى تفكّه يدويًا، ويُمدَّد تاريخ الانتهاء بعدد أيام التجميد الفعلية.'}
            </p>
            <dl className="gms-sheet__facts">
              <div><dt>ينتهي حاليًا</dt><dd>{fmtDate(freezeTarget.end_date)}</dd></div>
              <div><dt>النهاية بعد التجميد</dt><dd>{newEnd ? fmtDate(newEnd) : 'تُحدَّد عند فك التجميد'}</dd></div>
              <div><dt>الحد الأقصى للتجميد</dt><dd>{allowance === null ? 'بدون حد' : `${allowance} يوم متبقي`}</dd></div>
            </dl>
            <label className="gms-field">
              <span>سبب التجميد (اختياري)</span>
              <input type="text" placeholder="مثال: سفر العميل" value={freezeReason} onChange={(e) => setFreezeReason(e.target.value)} autoFocus />
            </label>
            <div className="gms-chips" role="group" aria-label="أسباب شائعة">
              {FREEZE_REASONS.map((r) => <button key={r} type="button" className={freezeReason === r ? 'is-on' : ''} onClick={() => setFreezeReason(r)}>{r}</button>)}
            </div>
            <footer>
              <button type="button" className="gms-btn" onClick={() => setFreezeTarget(null)}>إلغاء</button>
              <button type="submit" className="gms-btn is-primary"><LineIcon name="snowflake" size={16} /> تأكيد التجميد</button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}

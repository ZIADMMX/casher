import { useEffect, useMemo, useState } from 'react';
import LineIcon from '../icons/LineIcons.jsx';
import * as customersApi from '../../api/customers.js';
import * as subscriptionsApi from '../../api/subscriptions.js';
import { ProfileSheet } from './GymMemberSheets.jsx';

const DAY = 86400000;
const WEEKS = 12;
const STATUS = {
  active: { label: 'نشط', tone: 'ok' },
  frozen: { label: 'مجمد', tone: 'blue' },
  expired: { label: 'منتهي', tone: 'warn' },
  depleted: { label: 'نفد الرصيد', tone: 'bad' },
};
const METHOD = { cash: 'نقدي', card: 'بطاقة / محفظة', credit: 'آجل' };

export const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
export const fmtDate = (v) => {
  const d = new Date(v);
  if (!v || Number.isNaN(d.getTime())) return '—';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`; // no spaces: keeps the digits in reading order inside RTL text
};
// SQLite CURRENT_TIMESTAMP is "YYYY-MM-DD HH:MM:SS" in UTC.
const fromDb = (v) => new Date(String(v).includes('T') ? v : `${String(v).replace(' ', 'T')}Z`);
const dbDate = (d) => d.toISOString().slice(0, 10);

/** Bars for the last 12 weeks (oldest first) from visit timestamps. */
export function weeklyVisits(visits, now = Date.now()) {
  const bars = Array(WEEKS).fill(0);
  visits.forEach((v) => {
    const age = Math.floor((now - fromDb(v.created_at).getTime()) / (7 * DAY));
    if (age >= 0 && age < WEEKS) bars[WEEKS - 1 - age] += 1;
  });
  return bars;
}

function lastVisitText(visits, now = Date.now()) {
  if (!visits.length) return 'لا توجد زيارات';
  const days = Math.floor((now - fromDb(visits[0].created_at).getTime()) / DAY);
  if (days <= 0) return 'اليوم';
  if (days === 1) return 'أمس';
  return `منذ ${days} يوم`;
}

// Attendance and recent payments of one member; both screens degrade to empty on failure.
function useMemberExtras(customerId) {
  const [extras, setExtras] = useState({ visits: [], payments: [], profile: null, loading: true });
  useEffect(() => {
    let alive = true;
    setExtras({ visits: [], payments: [], profile: null, loading: true });
    const from = `${dbDate(new Date(Date.now() - WEEKS * 7 * DAY))} 00:00:00`;
    const to = `${dbDate(new Date(Date.now() + DAY))} 00:00:00`;
    Promise.all([
      Promise.resolve(subscriptionsApi.getGymMemberCheckins?.(customerId, { from, to, limit: 500 })).catch(() => []),
      Promise.resolve(customersApi.getCustomerRecentSales?.(customerId)).catch(() => []),
      Promise.resolve(subscriptionsApi.getGymMemberProfile?.(customerId)).catch(() => null),
    ]).then(([rows, sales, profile]) => {
      if (!alive) return;
      const visits = (rows || []).filter((r) => r.result !== 'denied');
      setExtras({ visits, payments: sales || [], profile: profile || null, loading: false });
    });
    return () => { alive = false; };
  }, [customerId]);
  return extras;
}

function BalanceRing({ percent, value, unit }) {
  const r = 62;
  const c = 2 * Math.PI * r;
  return (
    <div className="gms-ring" role="img" aria-label={`${value} ${unit}`}>
      <svg width="164" height="164" viewBox="0 0 164 164">
        <defs>
          <linearGradient id="gms-ring-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#C2410C" />
          </linearGradient>
        </defs>
        <circle cx="82" cy="82" r={r} fill="none" strokeWidth="13" className="gms-ring__track" />
        <circle cx="82" cy="82" r={r} fill="none" strokeWidth="13" strokeLinecap="round" stroke="url(#gms-ring-grad)"
          strokeDasharray={c} strokeDashoffset={c * (1 - percent / 100)} transform="rotate(-90 82 82)" />
      </svg>
      <div><strong>{value}</strong><span>{unit}</span></div>
    </div>
  );
}

/** One member: profile and attendance, the current subscription with its actions, recent payments. */
export default function GymMemberDetail({ member, sub, customer, balance, busy, onPickSub, onDeduct, onFreeze, onUnfreeze, onRenew, onUpgrade, onTransfer }) {
  const { visits, payments, profile: loadedProfile, loading } = useMemberExtras(member.id);
  const [savedProfile, setSavedProfile] = useState(null);
  const [editing, setEditing] = useState(false);
  const profile = savedProfile || loadedProfile;
  const [now] = useState(() => Date.now());
  const st = STATUS[sub.status] || { label: sub.status, tone: 'muted' };
  const weeks = useMemo(() => weeklyVisits(visits, now), [visits, now]);
  const peak = Math.max(1, ...weeks);
  const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
  const monthVisits = visits.filter((v) => fromDb(v.created_at).getTime() >= monthStart).length;
  const maxFreeze = Number(sub.max_freeze_days) || 0;
  const phone = member.phone || customer?.phone;
  const start = new Date(sub.start_date).getTime();
  const end = new Date(sub.end_date).getTime();
  const elapsed = end > start ? Math.min(100, Math.max(0, Math.round(((now - start) / (end - start)) * 100))) : 0;

  return (
    <section className="gms-detail" aria-label={`تفاصيل ${member.name}`}>
      <article className="gms-card gms-profile">
        <header className="gms-profile__head">
          <span className="gms-avatar gms-avatar--lg" aria-hidden="true">{(member.name || '؟').trim().charAt(0).toUpperCase()}</span>
          <div className="gms-profile__who">
            <h2>{member.name}</h2>
            <span className={`gms-pill is-${st.tone}`}>{st.label}</span>
            <span className="gms-pill is-soft">{sub.package_name}</span>
            <p>كود <b dir="ltr">GM-{member.id}</b> · عضو منذ {new Date(customer?.created_at || sub.start_date).getFullYear()}</p>
          </div>
          {phone && <a className="gms-iconbtn" href={`tel:${phone}`} aria-label={`اتصال بـ ${member.name}`}><LineIcon name="phone" size={18} /></a>}
        </header>

        <div className="gms-stats">
          <div><span>الحضور هذا الشهر</span><b>{loading ? '…' : monthVisits}</b><small>زيارة</small></div>
          <div><span>آخر زيارة</span><b className="is-text">{loading ? '…' : lastVisitText(visits, now)}</b></div>
          <div><span>إجمالي المدفوع</span><b>{money(customer?.totalSpent)}<small> ج.م</small></b></div>
          <div className="gms-stats__bars">
            <span>انتظام الحضور · {WEEKS} أسبوع</span>
            <div className="gms-bars" aria-hidden="true">
              {weeks.map((n, i) => <i key={i} className={n ? 'is-on' : ''} style={{ blockSize: `${Math.max(14, (n / peak) * 100)}%` }} />)}
            </div>
          </div>
        </div>

        <h3 className="gms-sec">بيانات العضو</h3>
        <dl className="gms-facts">
          <div><dt>رقم الهاتف</dt><dd dir="ltr">{phone || '—'}</dd></div>
          <div><dt>البريد الإلكتروني</dt><dd dir="ltr">{customer?.email || '—'}</dd></div>
          <div><dt>تاريخ التسجيل</dt><dd>{fmtDate(customer?.created_at)}</dd></div>
          <div><dt>نقاط الولاء</dt><dd>{customer?.loyalty_points ?? 0}</dd></div>
          <div><dt>جهة اتصال الطوارئ</dt><dd>{profile?.emergency_name || '—'}{profile?.emergency_phone && <small dir="ltr"> {profile.emergency_phone}</small>}</dd></div>
          <div><dt>المدرب</dt><dd>{profile?.trainer_name || '—'}</dd></div>
        </dl>
        {profile?.health_notes && (
          <div className="gms-health" role="note">
            <b><LineIcon name="info" size={16} /> ملاحظات صحية</b>
            <p>{profile.health_notes}</p>
          </div>
        )}
        <div className="gms-profile__foot">
          <button type="button" className="gms-btn" onClick={() => setEditing(true)}><LineIcon name="edit" size={16} /> تعديل بيانات العضو</button>
        </div>
        {editing && <ProfileSheet member={member} profile={profile} onClose={() => setEditing(false)} onSaved={(p) => { setSavedProfile(p); setEditing(false); }} />}
      </article>

      <article className="gms-card gms-sub">
        <header className="gms-sub__head">
          <h3>الاشتراك الحالي</h3>
          {member.subs.length > 1 && (
            <div className="gms-chips" role="group" aria-label="اشتراكات العضو">
              {member.subs.map((s) => (
                <button key={s.id} type="button" className={s.id === sub.id ? 'is-on' : ''} aria-pressed={s.id === sub.id} onClick={() => onPickSub(s.id)}>{s.package_name}</button>
              ))}
            </div>
          )}
          <span className="gms-pill is-soft">{sub.package_name}</span>
        </header>

        <div className="gms-sub__body">
          <BalanceRing percent={balance.percent} value={balance.value} unit={balance.unit} />
          <div className="gms-sub__info">
            <dl className="gms-facts gms-facts--inline">
              <div><dt>تاريخ البداية</dt><dd>{fmtDate(sub.start_date)}</dd></div>
              <div><dt>قيمة الباقة</dt><dd>{money(sub.package_price)} ج.م</dd></div>
              <div><dt>تاريخ الانتهاء</dt><dd>{fmtDate(sub.end_date)}</dd></div>
            </dl>
            <div className="gms-track" aria-hidden="true"><i style={{ inlineSize: `${elapsed}%` }} /></div>
            <div className="gms-track__ends"><span>{fmtDate(sub.start_date)}</span><span>{fmtDate(sub.end_date)}</span></div>
            {sub.status === 'frozen' && sub.last_freeze_date && <p className="gms-note">مجمد منذ {fmtDate(sub.last_freeze_date)}. {sub.frozen_until ? `يُستأنف تلقائيًا في ${fmtDate(sub.frozen_until)}.` : 'عند فك التجميد يُمدَّد تاريخ الانتهاء بعدد أيام التجميد.'}</p>}
            {maxFreeze > 0 && <p className="gms-note">أيام التجميد المستخدمة {Number(sub.frozen_days_used) || 0} من {maxFreeze}</p>}
          </div>
        </div>

        <footer className="gms-sub__actions">
          <button type="button" className="gms-btn is-primary" disabled={busy} onClick={() => onRenew(sub)}><LineIcon name="refresh" size={17} /> تجديد</button>
          {sub.status === 'active' && <button type="button" className="gms-btn" disabled={busy} onClick={() => onUpgrade(sub)}><LineIcon name="trendUp" size={17} /> ترقية الباقة</button>}
          {sub.status === 'active' && <button type="button" className="gms-btn" disabled={busy} onClick={() => onFreeze(sub)}><LineIcon name="snowflake" size={17} /> تجميد</button>}
          {sub.status === 'frozen' && <button type="button" className="gms-btn" disabled={busy} onClick={() => onUnfreeze(sub)}><LineIcon name="unlock" size={17} /> فك التجميد</button>}
          {(sub.status === 'active' || sub.status === 'frozen') && <button type="button" className="gms-btn" disabled={busy} onClick={() => onTransfer(sub)}><LineIcon name="user" size={17} /> نقل</button>}
          {sub.package_type === 'session_based' && sub.status === 'active' && sub.remaining_credits > 0 && (
            <button type="button" className="gms-btn" disabled={busy} onClick={() => onDeduct(sub)}><LineIcon name="minus" size={17} /> خصم جلسة</button>
          )}
        </footer>
      </article>

      <article className="gms-card gms-pay">
        <header><h3>آخر المدفوعات</h3></header>
        {loading ? <p className="gms-empty">جاري التحميل...</p> : payments.length === 0 ? <p className="gms-empty">لا توجد مدفوعات مسجلة لهذا العضو.</p> : (
          <div className="gms-table" role="table" aria-label="آخر المدفوعات">
            <div className="gms-table__row is-head" role="row"><span>التاريخ</span><span>البيان</span><span>الطريقة</span><span>المبلغ</span><span>الحالة</span></div>
            {payments.map((p) => (
              <div className="gms-table__row" role="row" key={p.id}>
                <span>{fmtDate(fromDb(p.created_at))}</span>
                <span>فاتورة #{p.id}</span>
                <span>{METHOD[p.payment_method] || p.payment_method}</span>
                <span className="is-num">{money(p.total_amount)} ج.م</span>
                <span><i className={`gms-pill ${p.payment_method === 'credit' ? 'is-warn' : 'is-ok'}`}>{p.payment_method === 'credit' ? 'آجل' : 'مدفوع'}</i></span>
              </div>
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

import { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import * as customersApi from '../../api/customers.js';
import * as subscriptionsApi from '../../api/subscriptions.js';
import LineIcon from '../icons/LineIcons.jsx';
import Kpi from './GymKpi.jsx';
import { STATUS, statusOf } from '../../utils/gymMembers.js';
import { RESULT, WEEKDAYS, analyzeVisits, fromDb, hourLabel, timeLabel } from '../../utils/gymAttendance.js';

const SHOWN = 20;
const ALL_TIME = '2000-01-01 00:00:00';
const METHOD = { cash: 'نقدي', card: 'بطاقة / محفظة', credit: 'آجل', bank_transfer: 'تحويل بنكي' };
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const day = (v) => (v ? (v instanceof Date ? v : new Date(String(v).replace(' ', 'T'))).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const stamp = (v) => fromDb(v).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' });
// Each source degrades on its own: a failing history query must not blank the whole profile.
const soft = (call, fallback) => Promise.resolve().then(call).catch(() => fallback);

function useQr(text) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(''));
    return () => { alive = false; };
  }, [text]);
  return url;
}

function useHistory(customerId) {
  const [state, setState] = useState({ loading: true, visits: [], ledger: null, sales: [], profile: null });
  useEffect(() => {
    let alive = true;
    const to = `${new Date(Date.now() + 86400000).toISOString().slice(0, 10)} 00:00:00`;
    Promise.all([
      soft(() => subscriptionsApi.getGymMemberCheckins(customerId, { from: ALL_TIME, to, limit: 5000 }), []),
      soft(() => customersApi.getCustomerLedger(customerId), null),
      soft(() => customersApi.getCustomerRecentSales(customerId, 500), []),
      soft(() => subscriptionsApi.getGymMemberProfile(customerId), null),
    ]).then(([visits, ledger, sales, profile]) => {
      if (alive) setState({ loading: false, visits: visits || [], ledger, sales: sales || [], profile });
    });
    return () => { alive = false; };
  }, [customerId]);
  return state;
}

function Bars({ values, label, caption }) {
  const peak = Math.max(1, ...values.map((v) => v.n));
  return (
    <div className="gpf-bars" role="img" aria-label={label}>
      {values.map((v) => (
        <div key={v.key} className="gpf-bar" title={`${v.key}: ${v.n}`}>
          <i className={v.n ? 'is-on' : ''} style={{ blockSize: `${Math.max(6, (v.n / peak) * 100)}%` }} />
          <small>{caption(v)}</small>
        </div>
      ))}
    </div>
  );
}

export default function GymMemberProfile({ member, customer, subs, onBack, onRenew, onOpenFile, onSubscribe, onPay, onCopy }) {
  const { loading, visits, ledger, sales, profile } = useHistory(member.id);
  const qr = useQr(member.code);
  const [now] = useState(() => Date.now());
  const [visitsShown, setVisitsShown] = useState(SHOWN);
  const [moneyShown, setMoneyShown] = useState(SHOWN);
  const stats = useMemo(() => analyzeVisits(visits, now), [visits, now]);
  const st = STATUS[member.status];

  // One chronological money list: invoices (sales) and the payments members made against their balance.
  const money_rows = useMemo(() => {
    const rows = [
      ...sales.map((s) => ({ key: `s${s.id}`, at: s.created_at, kind: 'فاتورة', ref: `#${s.id}`, method: s.payment_method, amount: s.total_amount, credit: s.payment_method === 'credit' })),
      ...(ledger?.payments || []).map((p) => ({ key: `p${p.id}`, at: p.payment_date, kind: 'سداد', ref: p.notes || '', method: p.payment_method, amount: p.amount, paid: true })),
    ];
    return rows.sort((a, b) => String(b.at).localeCompare(String(a.at)));
  }, [sales, ledger]);
  const paidIn = (ledger?.payments || []).reduce((s, p) => s + Number(p.amount || 0), 0);

  const weekdays = WEEKDAYS.map((name, i) => ({ key: name, n: stats.byWeekday[i] }));
  const first = stats.byHour.findIndex((n) => n > 0);
  const last = stats.byHour.length - 1 - [...stats.byHour].reverse().findIndex((n) => n > 0);
  const hours = first < 0 ? [] : stats.byHour.slice(first, last + 1).map((n, i) => ({ key: hourLabel(first + i), n, h: first + i }));

  const subRows = [...subs].sort((a, b) => b.id - a.id);
  const rankLabel = (s) => (s.status === 'cancelled' ? { label: 'ملغي', tone: 'muted' } : STATUS[statusOf(s, now)]);

  return (
    <div className="gpf" aria-label={`ملف العضو ${member.name}`}>
      <header className="gms-card gpf-hero">
        <button type="button" className="gms-iconbtn" onClick={onBack} aria-label="العودة إلى قائمة الأعضاء"><LineIcon name="arrowRight" size={18} /></button>
        <span className="gms-avatar gms-avatar--lg" aria-hidden="true">{(member.name || '؟').trim().charAt(0).toUpperCase()}</span>
        <div className="gpf-hero__who">
          <h2>{member.name}</h2>
          <div className="gpf-hero__tags">
            <i className={`gms-pill is-${st.tone}`}>{st.label}</i>
            {member.packageName && <i className="gms-pill is-soft">{member.packageName}</i>}
            <span dir="ltr" className="gmp-code">{member.code}</span>
          </div>
          <p>عضو منذ {day(customer?.created_at)}{member.phone ? <> · <bdi dir="ltr">{member.phone}</bdi></> : null}</p>
        </div>
        <div className="gpf-hero__actions">
          {member.sub
            ? <button type="button" className="gms-btn is-primary" onClick={() => onRenew(member)}><LineIcon name="refresh" size={16} /> تجديد</button>
            : <button type="button" className="gms-btn is-primary" onClick={() => onSubscribe(member)}><LineIcon name="bolt" size={16} /> اشتراك الآن</button>}
          {member.sub && <button type="button" className="gms-btn" onClick={() => onOpenFile(member)}><LineIcon name="idCard" size={16} /> إدارة الاشتراك</button>}
          {member.debt > 0 && <button type="button" className="gms-btn" onClick={() => onPay(member)}><LineIcon name="banknote" size={16} /> سداد المستحق</button>}
          {member.phone && <a className="gms-iconbtn" href={`tel:${member.phone}`} aria-label={`اتصال بـ ${member.name}`}><LineIcon name="phone" size={18} /></a>}
        </div>
      </header>

      <div className="gmp-kpis gpf-kpis">
        <Kpi tone={member.expiring ? 'warn' : 'ok'} label="أيام متبقية" value={member.daysLeft ?? 0} hint={member.endDate ? `ينتهي ${day(member.endDate)}` : 'لا يوجد اشتراك'} ratio={(member.daysLeft ?? 0) / 30} />
        <Kpi tone="brand" label="زيارات الشهر" value={stats.thisMonth} hint="هذا الشهر" ratio={stats.thisMonth / 20} />
        <Kpi tone="mute" label="إجمالي الزيارات" value={stats.total} hint={`بمعدل ${stats.perWeek} أسبوعيًا`} ratio={stats.perWeek / 7} />
        <Kpi tone={member.debt > 0 ? 'bad' : 'ok'} label="المستحق" value={money(member.debt)} hint="ج.م" ratio={member.debt > 0 ? 1 : 0} />
        <Kpi tone="brand" label="إجمالي المدفوع" value={money(customer?.totalSpent)} hint="ج.م" ratio={1} />
      </div>

      <div className="gpf-grid">
        <div className="gpf-col">
          <section className="gms-card gpf-card" aria-label="الحضور">
            <h3>انتظام الحضور</h3>
            {stats.total === 0 ? <p className="gms-empty">{loading ? 'جاري التحميل...' : 'لا توجد زيارات مسجلة لهذا العضو.'}</p> : (
              <>
                <p className="gpf-sum">
                  أكثر الأيام حضورًا <b>{WEEKDAYS[stats.topWeekday]}</b> · أكثر ساعة <b>{hourLabel(stats.topHour)}</b>
                  {stats.lastVisit && <> · آخر زيارة <b>{day(stats.lastVisit)} {timeLabel(stats.lastVisit)}</b></>}
                </p>
                <h4>أيام الحضور</h4>
                <Bars values={weekdays} label="عدد الزيارات في كل يوم من الأسبوع" caption={(v) => v.key.replace('ال', '')} />
                <h4>ساعات الحضور</h4>
                <Bars values={hours} label="عدد الزيارات في كل ساعة" caption={(v) => v.h} />
              </>
            )}
          </section>

          <section className="gms-card gpf-card" aria-label="سجل الدخول">
            <h3>سجل الدخول <small>({visits.length})</small></h3>
            {visits.length === 0 ? <p className="gms-empty">{loading ? 'جاري التحميل...' : 'لا يوجد سجل دخول.'}</p> : (
              <div className="gpf-list" role="table" aria-label="سجل الدخول">
                <div className="gpf-row is-head" role="row"><span>التاريخ</span><span>اليوم</span><span>الوقت</span><span>البوابة</span><span>النتيجة</span></div>
                {visits.slice(0, visitsShown).map((v) => {
                  const at = fromDb(v.created_at);
                  const r = RESULT[v.result] || { label: v.result, tone: 'muted' };
                  return (
                    <div key={v.id} className="gpf-row" role="row">
                      <span role="cell" data-label="التاريخ">{stamp(v.created_at)}</span>
                      <span role="cell" data-label="اليوم">{WEEKDAYS[at.getDay()]}</span>
                      <span role="cell" data-label="الوقت">{timeLabel(at)}</span>
                      <span role="cell" data-label="البوابة">{v.gate || '—'}</span>
                      <span role="cell" data-label="النتيجة"><i className={`gms-pill is-${r.tone}`} title={v.reason}>{r.label}</i></span>
                    </div>
                  );
                })}
              </div>
            )}
            {visits.length > visitsShown && <div className="gmp-more"><button type="button" className="gms-btn" onClick={() => setVisitsShown((n) => n + SHOWN * 2)}>عرض المزيد ({visits.length - visitsShown})</button></div>}
          </section>

          <section className="gms-card gpf-card" aria-label="سجل الاشتراكات">
            <h3>سجل الاشتراكات <small>({subRows.length})</small></h3>
            {subRows.length === 0 ? <p className="gms-empty">لا توجد اشتراكات لهذا العضو بعد.</p> : (
              <div className="gpf-list" role="table" aria-label="سجل الاشتراكات">
                <div className="gpf-row gpf-row--subs is-head" role="row"><span>الباقة</span><span>من</span><span>إلى</span><span>القيمة</span><span>الحالة</span></div>
                {subRows.map((s) => {
                  const r = rankLabel(s);
                  return (
                    <div key={s.id} className="gpf-row gpf-row--subs" role="row">
                      <span role="cell" data-label="الباقة"><b>{s.package_name}</b></span>
                      <span role="cell" data-label="من">{day(s.start_date)}</span>
                      <span role="cell" data-label="إلى">{day(s.end_date)}</span>
                      <span role="cell" data-label="القيمة" className="gmp-num">{s.package_price != null ? `${money(s.package_price)} ج.م` : '—'}</span>
                      <span role="cell" data-label="الحالة"><i className={`gms-pill is-${r.tone}`}>{r.label}</i></span>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <section className="gms-card gpf-card" aria-label="الحركة المالية">
            <h3>الحركة المالية <small>({money_rows.length})</small></h3>
            <p className="gpf-sum">المستحق الآن <b>{money(member.debt)} ج.م</b> · إجمالي المدفوع <b>{money(customer?.totalSpent)} ج.م</b> · سداد على الحساب <b>{money(paidIn)} ج.م</b></p>
            {money_rows.length === 0 ? <p className="gms-empty">{loading ? 'جاري التحميل...' : 'لا توجد حركة مالية.'}</p> : (
              <div className="gpf-list" role="table" aria-label="الحركة المالية">
                <div className="gpf-row is-head" role="row"><span>التاريخ</span><span>النوع</span><span>البيان</span><span>الطريقة</span><span>المبلغ</span></div>
                {money_rows.slice(0, moneyShown).map((r) => (
                  <div key={r.key} className="gpf-row" role="row">
                    <span role="cell" data-label="التاريخ">{stamp(r.at)}</span>
                    <span role="cell" data-label="النوع"><i className={`gms-pill ${r.paid ? 'is-ok' : r.credit ? 'is-warn' : 'is-soft'}`}>{r.kind}</i></span>
                    <span role="cell" data-label="البيان">{r.ref || '—'}</span>
                    <span role="cell" data-label="الطريقة">{METHOD[r.method] || r.method}</span>
                    <span role="cell" data-label="المبلغ" className="gmp-num">{money(r.amount)} ج.م</span>
                  </div>
                ))}
              </div>
            )}
            {money_rows.length > moneyShown && <div className="gmp-more"><button type="button" className="gms-btn" onClick={() => setMoneyShown((n) => n + SHOWN * 2)}>عرض المزيد ({money_rows.length - moneyShown})</button></div>}
          </section>
        </div>

        <aside className="gpf-col">
          <section className="gms-card gpf-card gpf-qr" aria-label="كود العضو">
            <h3>كود الدخول</h3>
            {qr ? <img src={qr} alt={`QR ${member.code}`} width="200" height="200" /> : <div className="gpf-qr__ph" aria-hidden="true" />}
            <b dir="ltr" className="gmp-code">{member.code}</b>
            <div className="gpf-qr__actions">
              {qr && <a className="gms-btn" href={qr} download={`${member.code}.png`}><LineIcon name="download" size={16} /> تنزيل</a>}
              <button type="button" className="gms-btn" onClick={() => onCopy(member.code, 'الكود')}>نسخ الكود</button>
            </div>
          </section>

          <section className="gms-card gpf-card" aria-label="بيانات العضو">
            <h3>بيانات العضو</h3>
            <dl className="gpf-facts">
              <div><dt>الهاتف</dt><dd dir="ltr">{member.phone || '—'}</dd></div>
              <div><dt>البريد</dt><dd dir="ltr">{customer?.email || '—'}</dd></div>
              <div><dt>المدرب</dt><dd>{profile?.trainer_name || member.trainer || '—'}</dd></div>
              <div><dt>الطوارئ</dt><dd>{profile?.emergency_name || '—'}{profile?.emergency_phone && <small dir="ltr"> {profile.emergency_phone}</small>}</dd></div>
            </dl>
            {profile?.health_notes && (
              <div className="gms-health" role="note"><b><LineIcon name="info" size={16} /> ملاحظات صحية</b><p>{profile.health_notes}</p></div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

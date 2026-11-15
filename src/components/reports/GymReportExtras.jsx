import { useEffect, useMemo, useState } from 'react';
import * as customersApi from '../../api/customers.js';
import * as subscriptionsApi from '../../api/subscriptions.js';
import { buildMembers } from '../../utils/gymMembers.js';

const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 0 });
const TOP = 6;
const shortDate = (v) => (v ? new Date(String(v).replace(' ', 'T')).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' }) : '—');

/**
 * Gym-specific panels for the reports page: subscription health, members who need attention (debts),
 * subscriptions expiring this week, and revenue spread across packages. All from existing data (the
 * customers-with-stats, subscriptions and subscription-stats APIs), so it adds no backend query.
 */
export default function GymReportExtras({ onNavigate }) {
  const [state, setState] = useState({ loading: true, customers: [], subscriptions: [], stats: null, error: '' });

  useEffect(() => {
    let alive = true;
    Promise.all([
      Promise.resolve(customersApi.getAllCustomersWithStats()).catch(() => []),
      Promise.resolve(subscriptionsApi.getAllSubscriptions({ limit: 10000 })).catch(() => []),
      Promise.resolve(subscriptionsApi.getSubscriptionStats()).catch(() => null),
    ]).then(([customers, subscriptions, stats]) => {
      if (alive) setState({ loading: false, customers: customers || [], subscriptions: subscriptions || [], stats, error: '' });
    });
    return () => { alive = false; };
  }, []);

  const members = useMemo(() => buildMembers({ customers: state.customers, subscriptions: state.subscriptions }), [state.customers, state.subscriptions]);

  const overdue = useMemo(() => members.filter((m) => m.debt > 0).sort((a, b) => b.debt - a.debt), [members]);
  const overdueTotal = overdue.reduce((sum, m) => sum + m.debt, 0);
  const expiring = useMemo(
    () => members.filter((m) => m.expiring).sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0)),
    [members],
  );

  // Revenue spread: the price of every live (non-cancelled) subscription, grouped by package.
  const packages = useMemo(() => {
    const byName = new Map();
    state.subscriptions.filter((s) => s.status !== 'cancelled').forEach((s) => {
      const name = s.package_name || 'بدون باقة';
      const prev = byName.get(name) || { name, revenue: 0, count: 0 };
      byName.set(name, { name, revenue: prev.revenue + (Number(s.package_price) || 0), count: prev.count + 1 });
    });
    const rows = [...byName.values()].sort((a, b) => b.revenue - a.revenue);
    const total = rows.reduce((sum, r) => sum + r.revenue, 0) || 1;
    return rows.map((r) => ({ ...r, share: Math.round((r.revenue / total) * 100) }));
  }, [state.subscriptions]);

  const active = members.filter((m) => m.status === 'active').length;
  const frozen = members.filter((m) => m.status === 'frozen').length;
  const newThisMonth = members.filter((m) => m.isNew).length;

  const goToMembers = () => onNavigate && onNavigate('customers');

  if (state.loading) return <section className="rep-card rep-panel"><p className="rep-loading">جارٍ تحميل بيانات الأعضاء…</p></section>;

  return (
    <>
      <section className="rep-card rep-panel gmr-strip" aria-label="مؤشرات الاشتراكات">
        <div className="gmr-stat"><span>اشتراكات سارية</span><b>{money(active)}</b><small>عضو نشط</small></div>
        <div className="gmr-stat"><span>أعضاء جدد</span><b>{money(newThisMonth)}</b><small>هذا الشهر</small></div>
        <div className="gmr-stat gmr-stat--warn"><span>تنتهي هذا الأسبوع</span><b>{money(expiring.length)}</b><small>أقل من 7 أيام</small></div>
        <div className="gmr-stat gmr-stat--ice"><span>مجمّدون</span><b>{money(frozen)}</b><small>اشتراك موقوف</small></div>
        <div className="gmr-stat gmr-stat--bad"><span>مديونيات متأخرة</span><b>{money(overdueTotal)}</b><small>{overdue.length} عضو · ج.م</small></div>
      </section>

      <div className="rep-grid rep-grid--wide-start">
        <section className="rep-card rep-panel gmr-list" aria-label="أعضاء يحتاجون انتباهك">
          <header className="rep-panel__head">
            <div>
              <h2 className="rep-panel__title">يحتاج انتباهك</h2>
              <p className="rep-panel__sub">أعضاء عليهم مديونيات متأخرة</p>
            </div>
            {overdue.length > 0 && <span className="rep-pill"><bdi>{overdue.length}</bdi> عضو</span>}
          </header>
          {overdue.length === 0 ? (
            <p className="rep-empty">لا توجد مديونيات متأخرة. كل الأعضاء منتظمون.</p>
          ) : (
            <ul className="gmr-rows">
              {overdue.slice(0, TOP).map((m) => (
                <li key={m.id} className="gmr-row">
                  <span className="gmr-row__avatar" aria-hidden="true">{(m.name || '؟').trim().charAt(0).toUpperCase()}</span>
                  <span className="gmr-row__who"><b>{m.name}</b><small>{m.packageName || 'بدون اشتراك'}</small></span>
                  <bdi className="gmr-row__amount gmr-row__amount--bad">{money(m.debt)} ج.م</bdi>
                </li>
              ))}
            </ul>
          )}
          {overdue.length > 0 && onNavigate && (
            <button type="button" className="gmr-more" onClick={goToMembers}>عرض كل الأعضاء</button>
          )}
        </section>

        <section className="rep-card rep-panel gmr-list" aria-label="اشتراكات تنتهي هذا الأسبوع">
          <header className="rep-panel__head">
            <div>
              <h2 className="rep-panel__title">اشتراكات تنتهي هذا الأسبوع</h2>
              <p className="rep-panel__sub">أقل من 7 أيام متبقية</p>
            </div>
            {expiring.length > 0 && <span className="rep-pill"><bdi>{expiring.length}</bdi> عضو</span>}
          </header>
          {expiring.length === 0 ? (
            <p className="rep-empty">لا توجد اشتراكات تنتهي هذا الأسبوع.</p>
          ) : (
            <ul className="gmr-rows">
              {expiring.slice(0, TOP).map((m) => (
                <li key={m.id} className="gmr-row">
                  <span className="gmr-row__avatar" aria-hidden="true">{(m.name || '؟').trim().charAt(0).toUpperCase()}</span>
                  <span className="gmr-row__who"><b>{m.name}</b><small>{m.packageName || ''} · ينتهي {shortDate(m.endDate)}</small></span>
                  <bdi className={`gmr-row__amount${m.daysLeft === 0 ? ' gmr-row__amount--bad' : ' gmr-row__amount--warn'}`}>
                    {m.daysLeft === 0 ? 'ينتهي اليوم' : `${m.daysLeft} يوم`}
                  </bdi>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="rep-card rep-panel gmr-packages" aria-label="توزيع الإيراد على الباقات">
        <header className="rep-panel__head">
          <div>
            <h2 className="rep-panel__title">توزيع الإيراد على الباقات</h2>
            <p className="rep-panel__sub">قيمة الاشتراكات السارية والمجمّدة حسب نوع الباقة</p>
          </div>
        </header>
        {packages.length === 0 ? (
          <p className="rep-empty">لا توجد اشتراكات مسجّلة بعد.</p>
        ) : (
          <ul className="gmr-pkg-list">
            {packages.map((p) => (
              <li key={p.name} className="gmr-pkg">
                <span className="gmr-pkg__head">
                  <b>{p.name}</b>
                  <span className="gmr-pkg__meta"><bdi>{p.count}</bdi> اشتراك · <bdi>{p.share}%</bdi></span>
                </span>
                <span className="gmr-pkg__bar"><i style={{ inlineSize: `${p.share}%` }} /></span>
                <bdi className="gmr-pkg__amount">{money(p.revenue)} ج.م</bdi>
              </li>
            ))}
          </ul>
        )}
        <p className="rep-integrity">الأرقام من قيمة الباقات على الاشتراكات الحالية، وليست إيرادًا محصّلًا في فترة بعينها.</p>
      </section>
    </>
  );
}

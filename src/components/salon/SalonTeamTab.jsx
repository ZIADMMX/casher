import { useCallback, useState } from 'react';
import * as salonApi from '../../api/salon.js';
import { money, num } from '../crm/crmFormat.js';
import { HrEmpty, HrStat } from '../hr/HrLayout.jsx';
import { CashIcon, GiftIcon, PercentIcon, UsersIcon } from '../icons/PosIcons.jsx';
import { localDateString } from '../../utils/hrStats.js';
import { SalonAlert } from './SalonParts.jsx';
import { stylistName, summarizeTeam } from './salonFormat.js';
import { useSalonLoad } from './useSalonLoad.js';

const monthStart = () => `${localDateString().slice(0, 8)}01`;

export default function SalonTeamTab() {
  const [range, setRange] = useState({ startDate: monthStart(), endDate: localDateString() });
  const { data, loading, error } = useSalonLoad(useCallback(async () => {
    const [barbers, pool] = await Promise.all([
      salonApi.getSalonBarbersWithStats(range),
      salonApi.getSalonTipPoolSummary(range),
    ]);
    return { barbers: barbers || [], pool: pool || {} };
  }, [range]));
  const barbers = [...(data?.barbers || [])].sort((a, b) => b.totalSales - a.totalSales);
  const totals = summarizeTeam(barbers);
  const setDate = (field) => (event) => event.target.value && setRange((r) => ({ ...r, [field]: event.target.value }));

  return (
    <>
      <section className="hr-stats" aria-label="ملخص الفريق">
        <HrStat Icon={CashIcon} tone="brand" label="مبيعات الخدمات" value={money(totals.sales)} note={`${num(totals.services)} خدمة`} />
        <HrStat Icon={PercentIcon} tone="warning" label="عمولات مستحقة" value={money(totals.commission)} note="مجموع عمولات الحلاقين" />
        <HrStat Icon={GiftIcon} tone="success" label="بقشيش" value={money(totals.tips)} note={`صندوق مشترك: ${money(data?.pool?.total_tip_pool)}`} />
        <HrStat Icon={UsersIcon} tone="info" label="اشتغلوا في الفترة" value={num(totals.active)} total={num(barbers.length)} />
      </section>

      <SalonAlert error={error} />

      <section className="hr-card">
        <header className="hr-card-head">
          <div>
            <h2>الحلاقين والعمولات</h2>
            <p>العمولة بتتحسب من إعداد كل خدمة وقت ما الحلاق يخلّصها على الكرسي.</p>
          </div>
          <div className="salon-toolbar">
            <label className="hr-field"><span>من</span><input className="hr-input" type="date" value={range.startDate} max={range.endDate} onChange={setDate('startDate')} /></label>
            <label className="hr-field"><span>إلى</span><input className="hr-input" type="date" value={range.endDate} min={range.startDate} onChange={setDate('endDate')} /></label>
          </div>
        </header>
        {loading ? <p className="hr-loading">جارٍ تحميل أرقام الفريق...</p> : !barbers.length ? (
          <HrEmpty Icon={UsersIcon} title="مفيش موظفين نشطين" text="ضيف الحلاقين من شاشة فريق العمل علشان عمولاتهم تظهر هنا." />
        ) : (
          <div className="hr-table-wrap">
            <table className="hr-table">
              <thead><tr><th>الحلاق</th><th>الحضور النهارده</th><th>عدد الخدمات</th><th>المبيعات</th><th>العمولة</th><th>البقشيش</th></tr></thead>
              <tbody>
                {barbers.map((b) => (
                  <tr key={b.id} className={b.servicesCount ? undefined : 'is-muted'}>
                    <td><div className="hr-stack"><strong>{stylistName(b)}</strong><small>{b.specialty || b.job_title || b.username}</small></div></td>
                    <td>{b.isCheckedIn ? <span className="hr-pill is-success is-dot">موجود</span> : <span className="hr-pill">مش موجود</span>}</td>
                    <td>{num(b.servicesCount)}</td>
                    <td><strong>{money(b.totalSales)}</strong></td>
                    <td>{money(b.totalCommission)}</td>
                    <td>{money(b.totalTips)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

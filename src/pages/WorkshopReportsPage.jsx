import { useCallback, useEffect, useRef, useState } from 'react';
import { isBridgeAvailable } from '../api/bridge.js';
import * as workshopApi from '../api/enterprise.js';
import * as inventoryApi from '../api/inventory.js';
import Toast from '../components/ui/Toast.jsx';
import LineIcon from '../components/icons/LineIcons.jsx';
import VehiclePlate from '../components/workshop/VehiclePlate.jsx';
import { BranchPicker, RangePicker, Segmented } from '../components/workshop/reports/ReportControls.jsx';
import { AreaChart, Donut, RankBars, money, useCountUp } from '../components/workshop/reports/ReportCharts.jsx';
import { formatRange, presetRange, shortDay } from '../utils/reportDates.js';
import '../styles/workshop.css';
import '../styles/vehicles.css';
import '../styles/workshopReports.css';

const arOrders = (n) => (n === 1 ? 'أمر واحد' : n === 2 ? 'أمران' : n <= 10 ? `${n} أوامر` : `${n} أمرًا`);

function Delta({ value, prev, count }) {
  if (!value && !prev) return <span className="wr-delta is-flat">—</span>;
  if (!prev) return <span className="wr-delta is-up"><i>▲</i>جديد في هذه الفترة</span>;
  const up = value >= prev;
  const text = count ? arOrders(Math.abs(value - prev)) : `${Math.abs(((value - prev) / prev) * 100).toFixed(1)}%`;
  if (value === prev) return <span className="wr-delta is-flat">بدون تغيير عن الفترة السابقة</span>;
  return <span className={`wr-delta ${up ? 'is-up' : 'is-down'}`}><i>{up ? '▲' : '▼'}</i><b>{text}</b> عن الفترة السابقة</span>;
}

function Kpi({ i, title, value, prev, unit, count, loading }) {
  const shown = useCountUp(loading ? 0 : value);
  return (
    <article className="wk-card wr-card wr-kpi" style={{ '--i': i }}>
      <span className="wr-kpi__title">{title}</span>
      {loading ? <span className="wr-skel wr-skel--num" /> : <strong>{money(shown)}<small>{unit}</small></strong>}
      {loading ? <span className="wr-skel wr-skel--line" /> : <Delta value={value} prev={prev} count={count} />}
    </article>
  );
}

function Card({ i, title, aside, className = '', children }) {
  return (
    <section className={`wk-card wr-card ${className}`} style={{ '--i': i }}>
      <header className="wr-card__head"><h2>{title}</h2>{aside}</header>
      {children}
    </section>
  );
}

const SkelRows = ({ n = 5 }) => <div className="wr-skel-rows">{Array.from({ length: n }, (_, k) => <span key={k} className="wr-skel wr-skel--row" style={{ '--i': k }} />)}</div>;
const Empty = ({ children }) => <p className="wk-empty wr-empty">{children}</p>;

export default function WorkshopReportsPage({ onNavigate }) {
  const bridge = isBridgeAvailable();
  const [preset, setPreset] = useState('month');
  const [range, setRange] = useState(() => presetRange('month'));
  const [branch, setBranch] = useState(null);
  const [branches, setBranches] = useState([]);
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rev, setRev] = useState(0);
  const [toast, setToast] = useState(null);
  const request = useRef(0);

  const load = useCallback(async () => {
    if (!bridge) return;
    const id = ++request.current;
    setBusy(true); setError('');
    try {
      const report = await workshopApi.getWorkshopReport({ startDate: range.start, endDate: range.end, branchId: branch });
      if (id !== request.current) return;
      setData(report); setRev((r) => r + 1);
    } catch (err) {
      if (id === request.current) setError(err?.message || 'تعذّر تحميل التقرير');
    } finally {
      if (id === request.current) setBusy(false);
    }
  }, [bridge, range, branch]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!bridge) return;
    inventoryApi.getInventoryBranches().then((list) => setBranches((list || []).filter((b) => b.is_active !== 0))).catch(() => {});
  }, [bridge]);

  function pickPreset(key) { setPreset(key); setRange(presetRange(key)); }
  function pickRange(start, end) { setPreset('custom'); setRange({ start, end }); }

  async function exportExcel() {
    try {
      const res = await workshopApi.exportWorkshopReport({ startDate: range.start, endDate: range.end, branchId: branch });
      if (!res?.canceled) setToast({ type: 'success', message: 'تم تصدير التقرير' });
    } catch (err) { setToast({ type: 'danger', message: err?.message || 'تعذّر التصدير' }); }
  }

  const loading = !data && !error;
  const t = data?.totals; const p = data?.prev;
  const total = t?.orders ?? 0;

  return (
    <section className="wk wr" aria-busy={busy}>
      <i className="wr-orb wr-orb--a" aria-hidden="true" /><i className="wr-orb wr-orb--b" aria-hidden="true" />

      <header className="wk-card wr-card wr-head" style={{ '--i': 0 }}>
        <div className="wr-head__title">
          <h1>تقارير الورشة</h1>
          <p>مقارنة بالفترة السابقة: {data ? formatRange(data.range.prevStart, data.range.prevEnd) : '…'}</p>
        </div>
        <div className="wr-head__controls">
          <Segmented value={preset} onChange={pickPreset} />
          <RangePicker range={range} onApply={pickRange} />
          <BranchPicker branches={branches} value={branch} onChange={setBranch} />
        </div>
        <span className={`wr-progress${busy ? ' is-on' : ''}`} aria-hidden="true" />
      </header>

      {loading && <p className="wr-note"><i className="wr-spin" aria-hidden="true" />جارٍ تحميل بيانات الفترة، قد يستغرق ذلك لحظات.</p>}
      {error && (
        <p className="wk-error wr-error" role="alert">{error} <button type="button" className="wk-btn wk-btn--sm" onClick={load}><LineIcon name="refresh" size={14} /> إعادة المحاولة</button></p>
      )}
      {!bridge && <p className="wk-error">التقارير بتشتغل جوه تطبيق الكاشير بس.</p>}

      <div className={`wr-body${busy && data ? ' is-refreshing' : ''}`}>
        <div className="wr-kpis">
          <Kpi i={1} title="إجمالي الإيراد" unit="ج.م" value={t?.revenue} prev={p?.revenue} loading={loading} />
          <Kpi i={2} title="إيراد العمالة" unit="ج.م" value={t?.labor} prev={p?.labor} loading={loading} />
          <Kpi i={3} title="إيراد قطع الغيار" unit="ج.م" value={t?.parts} prev={p?.parts} loading={loading} />
          <Kpi i={4} title="متوسط قيمة الأمر" unit="ج.م" value={t?.avg} prev={p?.avg} loading={loading} />
          <Kpi i={5} title="الأوامر المكتملة" unit="أمرًا" value={t?.orders} prev={p?.orders} count loading={loading} />
        </div>

        <div className="wr-grid wr-grid--split">
          <Card i={6} title="العمالة مقابل القطع" className="wr-card--donut">
            {loading ? <div className="wr-skel wr-skel--ring" /> : <Donut key={rev} parts={t.parts} labor={t.labor} />}
          </Card>
          <Card i={7} title="الأوامر المكتملة يوميًا" aside={data && <span className="wr-card__hint">متوسط {data.dailyAvg.toFixed(1)} أمر في اليوم</span>}>
            {loading ? <div className="wr-skel wr-skel--chart" /> : (
              <>
                <AreaChart key={rev} daily={data.daily} />
                {data.quietDays.length > 0 && (
                  <p className="wr-foot">أقل الأيام نشاطًا: {data.quietDays.map(shortDay).join(' و')}. الأرقام على المحور الأفقي أيام الفترة.</p>
                )}
              </>
            )}
          </Card>
        </div>

        <div className="wr-grid wr-grid--even">
          <Card i={8} title="أكثر 5 خدمات إيرادًا">
            {loading ? <SkelRows /> : data.services.length ? <RankBars key={rev} rows={data.services} ranked /> : <Empty>مفيش خدمات عمالة مقفولة في الفترة دي.</Empty>}
          </Card>
          <Card i={9} title="أداء الفنيين" aside={<span className="wr-legend"><i className="is-rev" />الإيراد<i className="is-ord" />عدد الأوامر</span>}>
            {loading ? <SkelRows /> : data.mechanics.length ? <RankBars key={rev} rows={data.mechanics} dual /> : <Empty>مفيش أوامر مقفولة في الفترة دي.</Empty>}
          </Card>
        </div>

        <Card
          i={10} title="آخر أوامر الشغل المغلقة" className="wr-card--table"
          aside={<><span className="wr-card__hint">الإجماليات قبل الضريبة</span><button type="button" className="wk-btn is-primary wr-export" onClick={exportExcel} disabled={!total}><LineIcon name="download" size={16} />تصدير Excel</button></>}
        >
          <div className="wr-table" role="table">
            <div className="wr-tr wr-tr--head" role="row">
              <span>رقم الأمر</span><span>الإغلاق</span><span>اللوحة</span><span>العميل</span><span>الفني</span><span>عمالة</span><span>قطع</span><span>الإجمالي</span>
            </div>
            {loading && <SkelRows n={7} />}
            {data && !data.recent.length && <Empty>مفيش أوامر شغل اتقفلت في الفترة دي.</Empty>}
            {data?.recent.map((o, i) => (
              <div key={`${rev}-${o.id}`} className="wr-tr" role="row" style={{ '--i': i }}>
                <b className="wr-tr__no">{o.order_number}</b>
                <span>{shortDay(o.closed_day)}</span>
                <span><VehiclePlate plate={o.plate} city={o.plate_city} kind={o.plate_kind} /></span>
                <span className="wr-tr__who"><strong>{o.customer_name}</strong><small>{[o.make, o.model].filter(Boolean).join(' ')}</small></span>
                <span className="wr-tr__mech">{o.mechanic || '—'}</span>
                <span>{money(o.labor)}</span><span>{money(o.parts)}</span><b>{money(o.total)}</b>
              </div>
            ))}
          </div>
          <footer className="wr-table__foot">
            <span>عرض {data ? data.recent.length : 0} من {total} أمرًا مكتملًا</span>
            {onNavigate && <button type="button" className="wr-link" onClick={() => onNavigate('work-orders')}>عرض كل الأوامر</button>}
          </footer>
        </Card>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </section>
  );
}

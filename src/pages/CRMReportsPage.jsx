import { useCallback, useEffect, useMemo, useState } from 'react';
import * as crmApi from '../api/crm.js';
import * as customersApi from '../api/customers.js';
import CRMHeader from '../components/crm/CRMHeader.jsx';
import {
  BriefcaseIcon, ChartIcon, PercentIcon, RefreshIcon, TrendUpIcon, UserPlusIcon, UsersIcon,
} from '../components/icons/PosIcons.jsx';
import { num } from '../components/crm/crmFormat.js';
import '../styles/crm-overview.css';
import '../styles/crm-reports.css';

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString('ar-EG')} ج.م`;
}

function CRMReportsPage() {
  const [customers, setCustomers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [stages, setStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadReports = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [customerList, opportunityList, leadList, stageList] = await Promise.all([
        customersApi.getAllCustomersWithStats(),
        crmApi.getAllCRMOpportunities(),
        crmApi.getCRMLeads({}),
        crmApi.getCRMPipelineStages(),
      ]);
      setCustomers(Array.isArray(customerList) ? customerList : []);
      setOpportunities(Array.isArray(opportunityList) ? opportunityList : []);
      setLeads(Array.isArray(leadList) ? leadList : []);
      setStages(Array.isArray(stageList) ? stageList : []);
    } catch (loadError) {
      console.error('Failed to load CRM reports:', loadError);
      setError(loadError.message || 'تعذر تحميل تقارير CRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadReports();
  }, [loadReports]);

  const report = useMemo(() => {
    const won = opportunities.filter((item) => item.stage === 'won');
    const lost = opportunities.filter((item) => item.stage === 'lost');
    const open = opportunities.filter((item) => !['won', 'lost'].includes(item.stage));
    const closedCount = won.length + lost.length;
    const stageCounts = stages.map((stage) => {
      const stageOpportunities = opportunities.filter((item) => (
        Number(item.pipeline_stage_id) === Number(stage.id)
        || (!item.pipeline_stage_id && item.stage === stage.stage_key)
      ));
      return {
        ...stage,
        count: stageOpportunities.length,
        value: stageOpportunities.reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
      };
    });

    const sources = new Map();
    leads.forEach((lead) => {
      const source = lead.source || 'غير محدد';
      sources.set(source, (sources.get(source) || 0) + 1);
    });

    const team = new Map();
    opportunities.forEach((opportunity) => {
      const name = opportunity.assigned_username || 'غير معيّن';
      const member = team.get(name) || { name, count: 0, wonValue: 0 };
      member.count += 1;
      if (opportunity.stage === 'won') {
        member.wonValue += Number(opportunity.expected_value) || 0;
      }
      team.set(name, member);
    });

    return {
      openCount: open.length,
      openValue: open.reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
      forecastValue: open.reduce((total, item) => (
        total + (Number(item.expected_value) || 0) * (Number(item.probability) || 0) / 100
      ), 0),
      wonValue: won.reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
      conversionRate: closedCount ? Math.round((won.length / closedCount) * 100) : 0,
      stageCounts,
      sources: [...sources.entries()]
        .map(([source, count]) => ({ source, count }))
        .sort((first, second) => second.count - first.count),
      team: [...team.values()].sort((first, second) => second.wonValue - first.wonValue),
      lossReasons: [...lost.reduce((map, item) => {
        const reason = item.lost_reason?.trim() || 'بدون سبب';
        return map.set(reason, (map.get(reason) || 0) + 1);
      }, new Map())]
        .map(([reason, count]) => ({ reason, count }))
        .sort((first, second) => second.count - first.count),
    };
  }, [leads, opportunities, stages]);

  const show = (value) => (loading ? '—' : value);
  const activeLeads = leads.filter((lead) => !['converted', 'lost'].includes(lead.status)).length;
  const kpis = [
    { label: 'إجمالي جهات الاتصال', Icon: UsersIcon, value: num(customers.length), hint: 'العملاء المسجلون في CRM' },
    { label: 'عملاء محتملون نشطون', Icon: UserPlusIcon, value: num(activeLeads), hint: 'فرص تحتاج إلى متابعة' },
    { label: 'الصفقات المفتوحة', Icon: BriefcaseIcon, value: num(report.openCount), hint: `${formatCurrency(report.openValue)} قيمة متوقعة` },
    { label: 'التوقع المرجّح', Icon: TrendUpIcon, value: formatCurrency(report.forecastValue), hint: 'بحسب احتمالات إغلاق الصفقات' },
    { label: 'معدل نجاح الإغلاق', Icon: PercentIcon, value: `${num(report.conversionRate)}٪`, hint: `${formatCurrency(report.wonValue)} قيمة الصفقات الرابحة` },
  ];

  return (
    <main className="crm-ds crm-reports">
      <CRMHeader
        icon={ChartIcon}
        title="تقارير وتحليلات العملاء"
        subtitle="ملخص العملاء المحتملين والصفقات ومصادر التواصل وأداء الفريق."
      >
        <button type="button" className="crm-ov-btn" onClick={loadReports} disabled={loading}>
          <RefreshIcon size={18} />
          {loading ? 'جارٍ التحديث...' : 'تحديث التقارير'}
        </button>
      </CRMHeader>

      {error && (
        <div className="crm-reports-error" role="alert">
          <span>{error}</span>
          <button type="button" className="crm-ov-btn crm-ov-btn--sm" onClick={loadReports} disabled={loading}>
            إعادة المحاولة
          </button>
        </div>
      )}

      <section className="crm-ov-kpis crm-reports-kpis" aria-label="المؤشرات الرئيسية">
        {kpis.map(({ label, Icon, value, hint }) => (
          <article key={label} className="crm-ov-card crm-ov-kpi">
            <span className="crm-ov-kpi-label">
              <span className="crm-ov-chip"><Icon size={18} /></span>
              {label}
            </span>
            <strong className="crm-ov-kpi-value crm-reports-kpi-value">{show(value)}</strong>
            <span className="crm-ov-hint">{show(hint)}</span>
          </article>
        ))}
      </section>

      <section className="crm-ov-panels crm-reports-panels">
        <ReportPanel
          title="مسار الصفقات"
          subtitle="توزيع الصفقات حسب المرحلة الحالية"
          count={`${num(opportunities.length)} صفقة`}
          rows={report.stageCounts.map((stage) => ({
            key: stage.id, label: stage.label, count: stage.count, meta: `${num(stage.count)} · ${formatCurrency(stage.value)}`,
            tone: stage.outcome === 'won' ? 'won' : stage.outcome === 'lost' ? 'lost' : '',
          }))}
          empty={loading ? 'جارٍ تحميل المراحل...' : 'لا توجد مراحل أو صفقات مسجلة بعد.'}
        />
        <ReportPanel
          title="مصادر العملاء المحتملين"
          subtitle="القنوات التي يصل منها عملاؤك"
          rows={report.sources.slice(0, 7).map(({ source, count }) => ({ key: source, label: source, count, meta: num(count), tone: 'info' }))}
          empty={loading ? 'جارٍ تحميل المصادر...' : 'لا توجد مصادر مسجلة بعد.'}
        />
        <ReportPanel
          title="أسباب خسارة الصفقات"
          subtitle="من السبب اللي بيتكتب وقت نقل الصفقة لخاسرة"
          rows={report.lossReasons.slice(0, 7).map(({ reason, count }) => ({ key: reason, label: reason, count, meta: num(count), tone: 'lost' }))}
          empty={loading ? 'جارٍ التحميل...' : 'مفيش صفقات خاسرة لحد دلوقتي.'}
        />
        <ReportPanel
          title="أداء فريق المبيعات"
          subtitle="قيمة الصفقات الرابحة لكل مسؤول"
          rows={report.team.slice(0, 7).map((member) => ({
            key: member.name, label: member.name, count: member.wonValue,
            meta: `${num(member.count)} صفقة · ${formatCurrency(member.wonValue)}`, tone: 'won',
          }))}
          empty={loading ? 'جارٍ تحميل أداء الفريق...' : 'لا توجد صفقات مسجلة بعد.'}
        />
      </section>
    </main>
  );
}

/** One card of labelled bars, each bar relative to the largest row. */
function ReportPanel({ title, subtitle, count, rows, empty }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <article className="crm-ov-card crm-ov-panel">
      <div className="crm-ov-panel-head">
        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
        {count && <span className="crm-ov-pill">{count}</span>}
      </div>
      {rows.length ? (
        <ul className="crm-ov-bars">
          {rows.map((row) => (
            <li key={row.key} className="crm-ov-bar-row">
              <div className="crm-ov-bar-body">
                <div className="crm-ov-bar-label"><span>{row.label}</span><span>{row.meta}</span></div>
                <div className="crm-ov-track">
                  <div
                    className={`crm-ov-fill ${row.tone ? `crm-ov-fill--${row.tone}` : ''}`}
                    style={{ '--bar-w': `${(row.count / max) * 100}%` }}
                  />
                </div>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="crm-report-empty">{empty}</p>
      )}
    </article>
  );
}

export default CRMReportsPage;

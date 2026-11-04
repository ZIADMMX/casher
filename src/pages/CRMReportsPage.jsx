import { useCallback, useEffect, useMemo, useState } from 'react';
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
        window.electronAPI.getAllCustomersWithStats(),
        window.electronAPI.getAllCRMOpportunities(),
        window.electronAPI.getCRMLeads({}),
        window.electronAPI.getCRMPipelineStages(),
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
    };
  }, [leads, opportunities, stages]);

  const maxStageCount = Math.max(...report.stageCounts.map((stage) => stage.count), 1);

  return (
    <main className="crm-reports">
      <header className="crm-reports-header">
        <div>
          <span className="crm-reports-eyebrow">FOX.CLOUD · CRM</span>
          <h1>تقارير وتحليلات العملاء</h1>
          <p>ملخص العملاء المحتملين والصفقات ومصادر التواصل وأداء الفريق.</p>
        </div>
        <button type="button" className="secondary-btn" onClick={loadReports} disabled={loading}>
          {loading ? 'جارٍ التحديث...' : 'تحديث التقارير'}
        </button>
      </header>

      {error && (
        <div className="crm-reports-error" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary-btn" onClick={loadReports} disabled={loading}>
            إعادة المحاولة
          </button>
        </div>
      )}

      <section className="crm-reports-metrics" aria-label="المؤشرات الرئيسية">
        <article className="crm-report-metric">
          <span>إجمالي جهات الاتصال</span>
          <strong>{loading ? '—' : customers.length.toLocaleString('ar-EG')}</strong>
          <small>العملاء المسجلون في CRM</small>
        </article>
        <article className="crm-report-metric">
          <span>عملاء محتملون نشطون</span>
          <strong>
            {loading ? '—' : leads.filter((lead) => !['converted', 'lost'].includes(lead.status)).length.toLocaleString('ar-EG')}
          </strong>
          <small>فرص تحتاج إلى متابعة</small>
        </article>
        <article className="crm-report-metric">
          <span>الصفقات المفتوحة</span>
          <strong>{loading ? '—' : report.openCount.toLocaleString('ar-EG')}</strong>
          <small>{loading ? '—' : formatCurrency(report.openValue)} قيمة متوقعة</small>
        </article>
        <article className="crm-report-metric crm-report-metric-accent">
          <span>التوقع المرجّح</span>
          <strong>{loading ? '—' : formatCurrency(report.forecastValue)}</strong>
          <small>بحسب احتمالات إغلاق الصفقات</small>
        </article>
        <article className="crm-report-metric">
          <span>معدل نجاح الإغلاق</span>
          <strong>{loading ? '—' : `${report.conversionRate.toLocaleString('ar-EG')}٪`}</strong>
          <small>{loading ? '—' : formatCurrency(report.wonValue)} قيمة الصفقات الرابحة</small>
        </article>
      </section>

      <section className="crm-reports-columns">
        <article className="crm-report-panel crm-report-pipeline">
          <div className="crm-report-panel-heading">
            <div>
              <h2>مسار الصفقات</h2>
              <p>توزيع الفرص حسب المرحلة الحالية</p>
            </div>
            <span className="crm-report-count">{opportunities.length.toLocaleString('ar-EG')} صفقة</span>
          </div>
          {report.stageCounts.length ? (
            <div className="crm-report-stage-list">
              {report.stageCounts.map((stage) => (
                <div className="crm-report-stage" key={stage.id}>
                  <div className="crm-report-stage-meta">
                    <strong>{stage.label}</strong>
                    <span>{stage.count.toLocaleString('ar-EG')} · {formatCurrency(stage.value)}</span>
                  </div>
                  <div className="crm-report-bar-track">
                    <span style={{ width: `${(stage.count / maxStageCount) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="crm-report-empty">{loading ? 'جارٍ تحميل المراحل...' : 'لا توجد مراحل أو صفقات مسجلة بعد.'}</p>
          )}
        </article>

        <article className="crm-report-panel">
          <div className="crm-report-panel-heading">
            <div>
              <h2>مصادر العملاء المحتملين</h2>
              <p>القنوات التي يصل منها عملاؤك</p>
            </div>
          </div>
          {report.sources.length ? (
            <div className="crm-report-list">
              {report.sources.slice(0, 7).map((source) => (
                <div className="crm-report-list-row" key={source.source}>
                  <span>{source.source}</span>
                  <strong>{source.count.toLocaleString('ar-EG')}</strong>
                </div>
              ))}
            </div>
          ) : (
            <p className="crm-report-empty">{loading ? 'جارٍ تحميل المصادر...' : 'لا توجد مصادر مسجلة بعد.'}</p>
          )}
        </article>

        <article className="crm-report-panel">
          <div className="crm-report-panel-heading">
            <div>
              <h2>أداء فريق المبيعات</h2>
              <p>الصفقات المسندة وقيمة الإغلاقات الناجحة</p>
            </div>
          </div>
          {report.team.length ? (
            <div className="crm-report-list">
              {report.team.slice(0, 7).map((member) => (
                <div className="crm-report-list-row crm-report-team-row" key={member.name}>
                  <div>
                    <strong>{member.name}</strong>
                    <small>{member.count.toLocaleString('ar-EG')} صفقة</small>
                  </div>
                  <span>{formatCurrency(member.wonValue)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="crm-report-empty">{loading ? 'جارٍ تحميل أداء الفريق...' : 'لا توجد صفقات مسجلة بعد.'}</p>
          )}
        </article>
      </section>
    </main>
  );
}

export default CRMReportsPage;

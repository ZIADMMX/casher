import { useCallback, useEffect, useMemo, useState } from 'react';
import CustomersPage from './CustomersPage.jsx';
import SalesPipelineBoard from '../components/crm/SalesPipelineBoard.jsx';
import CRMOperations from '../components/crm/CRMOperations.jsx';
import '../styles/crm.css';

const VIEWS = [
  { id: 'overview', label: 'نظرة عامة' },
  { id: 'contacts', label: 'العملاء وCustomer 360°' },
  { id: 'companies', label: 'الشركات والفروع' },
  { id: 'leads', label: 'العملاء المحتملون' },
  { id: 'pipeline', label: 'خط الصفقات (Kanban)' },
  { id: 'tasks', label: 'الأنشطة والمهام' },
  { id: 'fields', label: 'الحقول المخصصة' },
  { id: 'automation', label: 'الأتمتة والتذكيرات' },
];

function formatCurrency(value) {
  return `${Number(value || 0).toLocaleString('ar-EG')} ج.م`;
}

function CRMPage() {
  const [activeView, setActiveView] = useState('overview');
  const [customers, setCustomers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
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
      setPipelineStages(Array.isArray(stageList) ? stageList : []);
    } catch (loadError) {
      console.error('Failed to load CRM overview:', loadError);
      setError(loadError.message || 'تعذر تحميل بيانات CRM');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const metrics = useMemo(() => {
    const won = opportunities.filter((item) => item.stage === 'won');
    const lost = opportunities.filter((item) => item.stage === 'lost');
    const open = opportunities.filter((item) => !['won', 'lost'].includes(item.stage));
    const closedCount = won.length + lost.length;

    return {
      customerCount: customers.length,
      leadCount: leads.filter((item) => item.status !== 'converted' && item.status !== 'lost').length,
      openCount: open.length,
      openValue: open.reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
      forecastValue: open.reduce((total, item) => (
        total + (Number(item.expected_value) || 0) * (Number(item.probability) || 0) / 100
      ), 0),
      wonValue: won.reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
      monthlyWonValue: won
        .filter((item) => item.closed_at?.slice(0, 7) === new Date().toISOString().slice(0, 7))
        .reduce((total, item) => total + (Number(item.expected_value) || 0), 0),
      conversionRate: closedCount ? Math.round((won.length / closedCount) * 100) : 0,
    };
  }, [customers, leads, opportunities]);

  const stageCounts = useMemo(() => (
    pipelineStages.map((stage) => ({
      ...stage,
      count: opportunities.filter((item) => (
        Number(item.pipeline_stage_id) === Number(stage.id)
        || (!item.pipeline_stage_id && item.stage === stage.stage_key)
      )).length,
    }))
  ), [opportunities, pipelineStages]);

  const teamPerformance = useMemo(() => {
    const totals = new Map();
    opportunities.forEach((opportunity) => {
      const name = opportunity.assigned_username || 'غير معيّن';
      const current = totals.get(name) || { name, count: 0, wonValue: 0 };
      current.count += 1;
      if (opportunity.stage === 'won') {
        current.wonValue += Number(opportunity.expected_value) || 0;
      }
      totals.set(name, current);
    });
    return [...totals.values()].sort((first, second) => second.wonValue - first.wonValue);
  }, [opportunities]);

  const leadSources = useMemo(() => {
    const sources = new Map();
    leads.forEach((lead) => {
      const source = lead.source || 'غير محدد';
      sources.set(source, (sources.get(source) || 0) + 1);
    });
    return [...sources.entries()]
      .map(([source, count]) => ({ source, count }))
      .sort((first, second) => second.count - first.count);
  }, [leads]);

  return (
    <div className="crm-page">
      <header className="crm-page-header">
        <div>
          <h1>إدارة علاقات العملاء (Fox CRM)</h1>
          <p>إدارة الحسابات، العملاء المحتملين، مسار الصفقات، والأنشطة في منصة موحدة.</p>
        </div>
        <div className="crm-header-actions">
          <button type="button" className="secondary-btn" onClick={loadOverview} disabled={loading}>
            {loading ? 'جارٍ التحديث...' : 'تحديث البيانات'}
          </button>
        </div>
      </header>

      <nav className="crm-view-tabs" aria-label="أقسام CRM">
        {VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            className={`crm-tab-btn ${activeView === view.id ? 'active-tab-btn' : ''}`}
            aria-pressed={activeView === view.id}
            onClick={() => setActiveView(view.id)}
          >
            {view.label}
          </button>
        ))}
      </nav>

      {activeView === 'contacts' ? (
        <CustomersPage crmMode />
      ) : ['companies', 'leads', 'tasks', 'fields', 'automation'].includes(activeView) ? (
        <CRMOperations section={activeView} />
      ) : activeView === 'pipeline' ? (
        <SalesPipelineBoard />
      ) : (
        <section className="crm-overview" aria-label="ملخص CRM">
          {error && (
            <div className="crm-error-banner crm-overview-error" role="alert">
              <span>{error}</span>
              <button type="button" className="secondary-btn" onClick={loadOverview}>إعادة المحاولة</button>
            </div>
          )}

          <div className="crm-metrics-grid">
            <article className="crm-metric-card">
              <span className="crm-metric-label">العملاء المسجلون</span>
              <strong className="crm-metric-value">{loading ? '—' : metrics.customerCount.toLocaleString('ar-EG')}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">عملاء محتملون (Leads)</span>
              <strong className="crm-metric-value">{loading ? '—' : metrics.leadCount.toLocaleString('ar-EG')}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">الصفقات المفتوحة</span>
              <strong className="crm-metric-value">{loading ? '—' : metrics.openCount.toLocaleString('ar-EG')}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">قيمة الصفقات المفتوحة</span>
              <strong className="crm-metric-value">{loading ? '—' : formatCurrency(metrics.openValue)}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">التوقع المرجّح للمبيعات</span>
              <strong className="crm-metric-value">{loading ? '—' : formatCurrency(metrics.forecastValue)}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">قيمة الصفقات الناجحة</span>
              <strong className="crm-metric-value">{loading ? '—' : formatCurrency(metrics.wonValue)}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">مبيعات صفقات هذا الشهر</span>
              <strong className="crm-metric-value">{loading ? '—' : formatCurrency(metrics.monthlyWonValue)}</strong>
            </article>
            <article className="crm-metric-card">
              <span className="crm-metric-label">معدل الإغلاق الناجح</span>
              <strong className="crm-metric-value">{loading ? '—' : `${metrics.conversionRate.toLocaleString('ar-EG')}٪`}</strong>
            </article>
          </div>

          <div className="crm-overview-columns">
            <section className="crm-overview-panel">
              <div className="crm-panel-heading">
                <div>
                  <h2>توزيع مراحل المبيعات</h2>
                  <p>الفرص المسجلة في خط الصفقات</p>
                </div>
                <button type="button" className="secondary-btn" onClick={() => setActiveView('pipeline')}>
                  فتح اللوحة
                </button>
              </div>
              <div className="crm-stage-list">
                {stageCounts.map((stage) => (
                  <div className="crm-stage-row" key={stage.id}>
                    <span>{stage.label}</span>
                    <strong className="crm-badge open">{loading ? '—' : `${stage.count.toLocaleString('ar-EG')} صفقة`}</strong>
                  </div>
                ))}
              </div>
            </section>

            <section className="crm-overview-panel">
              <div className="crm-panel-heading">
                <div>
                  <h2>مصادر العملاء المحتملين</h2>
                  <p>توزيع الـ Leads حسب القناة</p>
                </div>
              </div>
              {leadSources.length ? (
                <div className="crm-stage-list">
                  {leadSources.slice(0, 8).map((source) => (
                    <div className="crm-stage-row" key={source.source}>
                      <span>{source.source}</span>
                      <strong>{source.count.toLocaleString('ar-EG')} عميل</strong>
                    </div>
                  ))}
                </div>
              ) : <p className="crm-empty-state">لا توجد مصادر مسجلة بعد.</p>}
            </section>

            <section className="crm-overview-panel">
              <div className="crm-panel-heading">
                <div>
                  <h2>أداء فريق المبيعات</h2>
                  <p>قيمة الصفقات الرابحة حسب المسؤول</p>
                </div>
              </div>
              {teamPerformance.length === 0 ? (
                <p className="crm-empty-state">{loading ? 'جارٍ تحميل البيانات...' : 'لا توجد صفقات مسجلة بعد.'}</p>
              ) : (
                <div className="crm-team-list">
                  {teamPerformance.slice(0, 5).map((member) => (
                    <div className="crm-team-row" key={member.name}>
                      <div>
                        <strong>{member.name}</strong>
                        <span className="crm-team-deal-count">({member.count.toLocaleString('ar-EG')} صفقة)</span>
                      </div>
                      <strong className="crm-team-won-value">{formatCurrency(member.wonValue)}</strong>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          <section className="crm-quick-actions">
            <div>
              <h2>ابدأ من سجل العميل الموحد (Customer 360°)</h2>
              <p>سجل التفاعل الكامل، المشتريات، المديونيات، الملاحظات والفرص البيعية المرتبطة بكل عميل.</p>
            </div>
            <button type="button" className="primary-btn" onClick={() => setActiveView('contacts')}>
              فتح سجل العملاء وCustomer 360°
            </button>
          </section>
        </section>
      )}
    </div>
  );
}

export default CRMPage;

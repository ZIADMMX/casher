import { useCallback, useEffect, useMemo, useState } from 'react';
import CustomersPage from './CustomersPage.jsx';
import SalesPipelineBoard from '../components/crm/SalesPipelineBoard.jsx';
import CRMOperations from '../components/crm/CRMOperations.jsx';
import CRMHeader from '../components/crm/CRMHeader.jsx';
import DailyMessagesCard from '../components/DailyMessagesCard.jsx';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import * as crmApi from '../api/crm.js';
import * as customersApi from '../api/customers.js';
import {
  AlertIcon, BarsIcon, BoltIcon, BriefcaseIcon, BuildingIcon, CalendarIcon, CashIcon,
  ChevronSideIcon, ClockIcon, GridIcon, KanbanIcon, PercentIcon, PlusIcon, RefreshIcon,
  SlidersIcon, TrendUpIcon, TrophyIcon, UserIcon, UserPlusIcon, UsersIcon, ArrowUpIcon, ArrowDownIcon,
} from '../components/icons/PosIcons.jsx';
import '../styles/crm.css';
import '../styles/crm-overview.css';

const VIEWS = [
  { id: 'overview', label: 'نظرة عامة', Icon: GridIcon },
  { id: 'contacts', label: 'العملاء و Customer 360°', Icon: UserIcon },
  { id: 'companies', label: 'الشركات والفروع', Icon: BuildingIcon },
  { id: 'leads', label: 'العملاء المحتملون', Icon: UserPlusIcon },
  { id: 'pipeline', label: 'خط الصفقات', Icon: KanbanIcon },
  { id: 'tasks', label: 'الأنشطة والمهام', Icon: CalendarIcon },
  { id: 'fields', label: 'الحقول المخصصة', Icon: SlidersIcon },
  { id: 'automation', label: 'الأتمتة والتذكيرات', Icon: BoltIcon },
];

const DEFAULT_STALE_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

const num = (value) => Number(value || 0).toLocaleString('ar-EG');

function formatCurrency(value) {
  return `${num(value)} ج.م`;
}

// SQLite CURRENT_TIMESTAMP is UTC "YYYY-MM-DD HH:MM:SS".
function parseDbDate(value) {
  if (!value) return null;
  const date = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${String(value).replace(' ', 'T')}Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function monthKey(date) {
  return date.toISOString().slice(0, 7);
}

function initials(name) {
  return String(name).trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join('.');
}

const sumValue = (items) => items.reduce((total, item) => total + (Number(item.expected_value) || 0), 0);

function Money({ value }) {
  return <>{num(value)}<span className="crm-ov-unit">ج.م</span></>;
}

function KpiCard({ icon: Icon, tone, label, value, hint, trend }) {
  return (
    <article className="crm-ov-card crm-ov-kpi">
      <span className="crm-ov-kpi-label">
        <span className={`crm-ov-chip ${tone ? `crm-ov-chip--${tone}` : ''}`}><Icon size={18} /></span>
        {label}
      </span>
      <strong className="crm-ov-kpi-value">{value}</strong>
      <span className={`crm-ov-hint ${trend ? `crm-ov-hint--${trend}` : ''}`}>
        {trend === 'up' && <ArrowUpIcon size={14} />}
        {trend === 'down' && <ArrowDownIcon size={14} />}
        {hint}
      </span>
    </article>
  );
}

function BarRow({ label, meta, percent, tone = 100, variant, labelVariant, avatar }) {
  return (
    <li className="crm-ov-bar-row">
      {avatar}
      <div className="crm-ov-bar-body">
        <div className={`crm-ov-bar-label ${labelVariant ? `crm-ov-bar-label--${labelVariant}` : ''}`}>
          <span>{label}</span>
          <span>{meta}</span>
        </div>
        <div className="crm-ov-track">
          <div
            className={`crm-ov-fill ${variant ? `crm-ov-fill--${variant}` : ''}`}
            style={{ '--bar-w': `${Math.max(0, Math.min(100, percent))}%`, '--bar-tone': `${tone}%` }}
          />
        </div>
      </div>
    </li>
  );
}

function EmptyPanel({ icon: Icon, title, text }) {
  return (
    <div className="crm-ov-empty">
      <span className="crm-ov-chip crm-ov-chip--muted crm-ov-chip--lg"><Icon size={22} /></span>
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  );
}

function CRMPage() {
  const [activeView, setActiveView] = useState('overview');
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  // The CRM sector has no Today page, so today's messages live on its overview instead.
  const isCrmSector = (configuration?.profile?.key || settings?.business_type || settings?.onboarding_sector) === 'crm';
  const [openNewCustomer, setOpenNewCustomer] = useState(false);
  const [customers, setCustomers] = useState([]);
  const [leads, setLeads] = useState([]);
  const [opportunities, setOpportunities] = useState([]);
  const [pipelineStages, setPipelineStages] = useState([]);
  const [automationRules, setAutomationRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [customerList, opportunityList, leadList, stageList, ruleList] = await Promise.all([
        customersApi.getAllCustomersWithStats(),
        crmApi.getAllCRMOpportunities(),
        crmApi.getCRMLeads({}),
        crmApi.getCRMPipelineStages(),
        // Optional: only drives the stale-days threshold and step 3, so it must not block the overview.
        crmApi.getCRMAutomationRules().catch(() => []),
      ]);
      setCustomers(Array.isArray(customerList) ? customerList : []);
      setOpportunities(Array.isArray(opportunityList) ? opportunityList : []);
      setLeads(Array.isArray(leadList) ? leadList : []);
      setPipelineStages(Array.isArray(stageList) ? stageList : []);
      setAutomationRules(Array.isArray(ruleList) ? ruleList : []);
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

  const staleRule = automationRules.find((rule) => rule.trigger_type === 'opportunity_stale');
  const staleDays = Number(staleRule?.config?.days) || DEFAULT_STALE_DAYS;

  const metrics = useMemo(() => {
    const now = new Date();
    const thisMonth = monthKey(now);
    const lastMonth = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)));
    const won = opportunities.filter((item) => item.stage === 'won');
    const lost = opportunities.filter((item) => item.stage === 'lost');
    const open = opportunities.filter((item) => !['won', 'lost'].includes(item.stage));
    const closedCount = won.length + lost.length;
    const wonIn = (key) => sumValue(won.filter((item) => item.closed_at?.slice(0, 7) === key));
    const monthlyWonValue = wonIn(thisMonth);
    const lastMonthWonValue = wonIn(lastMonth);
    const stale = open.filter((item) => {
      const changedAt = parseDbDate(item.last_stage_changed_at || item.updated_at || item.created_at);
      return changedAt && now - changedAt > staleDays * DAY_MS;
    });
    const activeLeads = leads.filter((item) => item.status !== 'converted' && item.status !== 'lost');

    return {
      customerCount: customers.length,
      newCustomersThisMonth: customers.filter((item) => {
        const createdAt = parseDbDate(item.created_at);
        return createdAt && monthKey(createdAt) === thisMonth;
      }).length,
      leadCount: activeLeads.length,
      untouchedLeadCount: activeLeads.filter((item) => item.status === 'new').length,
      openCount: open.length,
      openStageCount: new Set(open.map((item) => item.pipeline_stage_id || item.stage)).size,
      openValue: sumValue(open),
      forecastValue: open.reduce((total, item) => (
        total + (Number(item.expected_value) || 0) * (Number(item.probability) || 0) / 100
      ), 0),
      wonValue: sumValue(won),
      wonCount: won.length,
      closedCount,
      monthlyWonValue,
      monthlyChange: lastMonthWonValue
        ? Math.round(((monthlyWonValue - lastMonthWonValue) / lastMonthWonValue) * 100)
        : null,
      conversionRate: closedCount ? Math.round((won.length / closedCount) * 100) : 0,
      staleCount: stale.length,
      staleValue: sumValue(stale),
    };
  }, [customers, leads, opportunities, staleDays]);

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

  const goTo = (view, { newCustomer = false } = {}) => {
    setOpenNewCustomer(newCustomer);
    setActiveView(view);
  };

  const isEmpty = !loading && !error && !customers.length && !leads.length && !opportunities.length;
  const steps = [
    {
      title: 'سجّل عملاءك',
      text: 'أضف العملاء يدوياً أو استورد ملف Excel جاهز بأسماء وأرقام العملاء.',
      action: 'افتح شاشة العملاء',
      view: 'contacts',
      done: customers.length > 0,
    },
    {
      title: 'اضبط مراحل البيع',
      text: 'المراحل الافتراضية جاهزة: محتمل، مؤهل، عرض سعر، ناجحة، خاسرة. عدّلها على طريقة شغلك.',
      action: 'افتح خط الصفقات',
      view: 'pipeline',
      done: opportunities.length > 0,
    },
    {
      title: 'فعّل التذكير الآلي',
      text: 'خلّي النظام ينبّه المسؤول لما صفقة تقف في مرحلتها أكتر من المدة اللي تحددها.',
      action: 'افتح الأتمتة',
      view: 'automation',
      done: Boolean(staleRule?.is_enabled),
    },
  ];
  const doneSteps = steps.filter((step) => step.done).length;
  const nextStepIndex = steps.findIndex((step) => !step.done);

  const show = (value) => (loading ? '—' : value);
  const maxStage = Math.max(1, ...stageCounts.map((stage) => stage.count));
  const maxSource = Math.max(1, ...leadSources.map((source) => source.count));
  const maxWon = Math.max(1, ...teamPerformance.map((member) => member.wonValue));
  // Fade bars by rank so the list reads like the reference (strongest first).
  const rankTone = (index, count) => (count <= 1 ? 100 : Math.round(100 - (index / (count - 1)) * 55));

  // These views draw their own header (their actions live there) and place the tabs under it.
  // Every view except the overview draws its own header (its actions live there) and places the tabs under it.
  const ownHeader = activeView !== 'overview';
  const tabs = (
    <nav className="crm-ds crm-ov-tabs" aria-label="أقسام CRM">
      {VIEWS.map(({ id, label, Icon }) => (
        <button
          key={id}
          type="button"
          className={`crm-ov-tab ${activeView === id ? 'is-active' : ''}`}
          aria-current={activeView === id ? 'page' : undefined}
          onClick={() => goTo(id)}
        >
          <Icon size={18} />
          {label}
        </button>
      ))}
    </nav>
  );

  return (
    <div className="crm-page">
      {!ownHeader && (
        <CRMHeader
          icon={UsersIcon}
          title="إدارة علاقات العملاء"
          subtitle="الحسابات، العملاء المحتملون، مسار الصفقات والأنشطة في منصة واحدة."
        >
          <button type="button" className="crm-ov-btn" onClick={loadOverview} disabled={loading}>
            <RefreshIcon size={18} />
            {loading ? 'جارٍ التحديث...' : 'تحديث البيانات'}
          </button>
          <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => goTo('contacts', { newCustomer: true })}>
            <PlusIcon size={18} />
            عميل جديد
          </button>
        </CRMHeader>
      )}
      {!ownHeader && tabs}

      {activeView === 'contacts' ? (
        <CustomersPage crmMode crmTabs={tabs} startWithForm={openNewCustomer} />
      ) : ['companies', 'leads', 'tasks', 'fields', 'automation'].includes(activeView) ? (
        <CRMOperations section={activeView} crmTabs={tabs} />
      ) : activeView === 'pipeline' ? (
        <SalesPipelineBoard crmTabs={tabs} />
      ) : (
        <section className="crm-ds crm-ov" aria-label="ملخص CRM">
          {error && (
            <div className="crm-error-banner crm-overview-error" role="alert">
              <span>{error}</span>
              <button type="button" className="secondary-btn" onClick={loadOverview}>إعادة المحاولة</button>
            </div>
          )}

          {isCrmSector && <DailyMessagesCard />}

          {isEmpty && (
            <section className="crm-ov-card crm-ov-start" aria-labelledby="crm-start-title">
              <div className="crm-ov-start-head">
                <div>
                  <h2 id="crm-start-title">ابدأ تشغيل الـ CRM في ٣ خطوات</h2>
                  <p>لسه مفيش بيانات مسجّلة. كل مؤشر تحت هيتحرّك أول ما تخلّص الخطوات دي.</p>
                </div>
                <span className="crm-ov-pill">{num(doneSteps)} من ٣ مكتملة</span>
              </div>
              <ol className="crm-ov-steps">
                {steps.map((step, index) => (
                  <li
                    key={step.view}
                    className={`crm-ov-step ${step.done ? 'is-done' : ''} ${index === nextStepIndex ? 'is-next' : ''}`}
                  >
                    <h3><span className="crm-ov-step-num">{num(index + 1)}</span>{step.title}</h3>
                    <p>{step.text}</p>
                    <button type="button" className="crm-ov-link" onClick={() => goTo(step.view)}>
                      {step.action}
                      <ChevronSideIcon size={16} />
                    </button>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {!loading && metrics.staleCount > 0 && (
            <div className="crm-ov-alert" role="status">
              <span className="crm-ov-chip crm-ov-chip--warning"><AlertIcon size={18} /></span>
              <p>
                <strong>{num(metrics.staleCount)} صفقات واقفة</strong>
                {` في نفس المرحلة أكثر من ${num(staleDays)} أيام، بقيمة ${formatCurrency(metrics.staleValue)}. تواصل مع العملاء دول النهارده.`}
              </p>
              <button type="button" className="crm-ov-btn crm-ov-btn--sm" onClick={() => goTo('pipeline')}>
                عرض الصفقات
              </button>
            </div>
          )}

          <h2 className="crm-ov-section-title">المؤشرات الأساسية</h2>
          <div className="crm-ov-kpis">
            <KpiCard
              icon={UsersIcon}
              label="العملاء المسجلون"
              value={show(num(metrics.customerCount))}
              hint={metrics.newCustomersThisMonth
                ? `+${num(metrics.newCustomersThisMonth)} هذا الشهر`
                : metrics.customerCount ? 'لا عملاء جدد هذا الشهر' : 'لم تبدأ التسجيل بعد'}
              trend={metrics.newCustomersThisMonth ? 'up' : undefined}
            />
            <KpiCard
              icon={UserPlusIcon}
              label="عملاء محتملون (Leads)"
              value={show(num(metrics.leadCount))}
              hint={metrics.leadCount ? `${num(metrics.untouchedLeadCount)} منهم لم تتابع بعد` : 'لا توجد فرص مفتوحة'}
            />
            <KpiCard
              icon={BriefcaseIcon}
              label="الصفقات المفتوحة"
              value={show(num(metrics.openCount))}
              hint={metrics.openCount ? `موزعة على ${num(metrics.openStageCount)} مراحل` : 'لا توجد صفقات جارية'}
            />
            <KpiCard
              icon={CashIcon}
              label="قيمة الصفقات المفتوحة"
              value={show(<Money value={metrics.openValue} />)}
              hint="إجمالي ما هو قيد التفاوض"
            />
            <KpiCard
              icon={TrophyIcon}
              tone="success"
              label="قيمة الصفقات الناجحة"
              value={show(<Money value={metrics.wonValue} />)}
              hint="إيراد محقق من البداية"
            />
            <KpiCard
              icon={TrendUpIcon}
              tone="info"
              label="التوقع المرجّح للمبيعات"
              value={show(<Money value={metrics.forecastValue} />)}
              hint="قيمة الصفقات × نسبة الإغلاق"
            />
            <KpiCard
              icon={CalendarIcon}
              tone="muted"
              label="مبيعات هذا الشهر"
              value={show(<Money value={metrics.monthlyWonValue} />)}
              hint={metrics.monthlyChange === null
                ? 'صفقات أُغلقت خلال الشهر الحالي'
                : `${metrics.monthlyChange >= 0 ? '+' : '−'}${num(Math.abs(metrics.monthlyChange))}٪ عن الشهر الماضي`}
              trend={metrics.monthlyChange === null ? undefined : metrics.monthlyChange >= 0 ? 'up' : 'down'}
            />
            <KpiCard
              icon={PercentIcon}
              tone="muted"
              label="معدل الإغلاق الناجح"
              value={show(<>{num(metrics.conversionRate)}<span className="crm-ov-unit">٪</span></>)}
              hint={metrics.closedCount
                ? `${num(metrics.wonCount)} ناجحة من ${num(metrics.closedCount)} مغلقة`
                : 'ناجحة ÷ (ناجحة + خاسرة)'}
            />
          </div>

          <div className="crm-ov-panels">
            <section className="crm-ov-card crm-ov-panel">
              <div className="crm-ov-panel-head">
                <div>
                  <h2>توزيع مراحل المبيعات</h2>
                  <p>عدد الفرص في كل مرحلة</p>
                </div>
                <button type="button" className="crm-ov-link" onClick={() => goTo('pipeline')}>فتح اللوحة</button>
              </div>
              <ul className="crm-ov-bars">
                {stageCounts.map((stage, index) => {
                  const key = stage.stage_key === 'won' || stage.stage_key === 'lost' ? stage.stage_key : undefined;
                  return (
                    <BarRow
                      key={stage.id}
                      label={stage.label}
                      meta={show(`${num(stage.count)} صفقة`)}
                      percent={(stage.count / maxStage) * 100}
                      tone={key ? 100 : 45 + Math.min(index, 3) * 18}
                      variant={key}
                      labelVariant={key}
                    />
                  );
                })}
              </ul>
            </section>

            <section className="crm-ov-card crm-ov-panel">
              <div className="crm-ov-panel-head">
                <div>
                  <h2>مصادر العملاء المحتملين</h2>
                  <p>من أين يأتي الـ Leads</p>
                </div>
              </div>
              {leadSources.length ? (
                <ul className="crm-ov-bars">
                  {leadSources.slice(0, 6).map((source, index, list) => (
                    <BarRow
                      key={source.source}
                      label={source.source}
                      meta={num(source.count)}
                      percent={(source.count / maxSource) * 100}
                      tone={rankTone(index, list.length)}
                      variant="info"
                    />
                  ))}
                </ul>
              ) : (
                <EmptyPanel
                  icon={ClockIcon}
                  title="لا توجد مصادر مسجلة"
                  text="حدّد مصدر كل عميل محتمل (إعلان، توصية، زيارة) عشان تعرف أي قناة بتجيب فلوس فعلاً."
                />
              )}
            </section>

            <section className="crm-ov-card crm-ov-panel">
              <div className="crm-ov-panel-head">
                <div>
                  <h2>أداء فريق المبيعات</h2>
                  <p>قيمة الصفقات الرابحة حسب المسؤول</p>
                </div>
              </div>
              {teamPerformance.length ? (
                <ul className="crm-ov-bars">
                  {teamPerformance.slice(0, 5).map((member, index, list) => (
                    <BarRow
                      key={member.name}
                      avatar={<span className={`crm-ov-avatar ${index === 0 ? 'is-top' : ''}`}>{initials(member.name)}</span>}
                      label={member.name}
                      meta={num(member.wonValue)}
                      percent={(member.wonValue / maxWon) * 100}
                      tone={rankTone(index, list.length)}
                    />
                  ))}
                </ul>
              ) : (
                <EmptyPanel
                  icon={BarsIcon}
                  title={loading ? 'جارٍ تحميل البيانات...' : 'لا توجد صفقات مسجلة'}
                  text="أسند كل صفقة لمسؤول، وهتشوف هنا ترتيب الفريق بالقيمة المحصّلة."
                />
              )}
            </section>
          </div>
        </section>
      )}
    </div>
  );
}

export default CRMPage;

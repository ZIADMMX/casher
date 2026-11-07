import { useCallback, useEffect, useMemo, useState } from 'react';
import Input from '../ui/Input.jsx';
import Badge from '../ui/Badge.jsx';
import * as crmApi from '../../api/crm.js';
import * as customersApi from '../../api/customers.js';

const LEAD_STATUSES = [
  ['new', 'جديد', 'new'],
  ['contacted', 'تم التواصل', 'contacted'],
  ['qualified', 'مؤهل', 'qualified'],
  ['lost', 'مفقود', 'lost'],
];

function IconBuilding() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>;
}

function IconIndustry() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 20a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8l-7 5V8l-7 5V4a2 2 0 0 0-2-2H2v18Z"/><path d="M17 18h1"/><path d="M12 18h1"/><path d="M7 18h1"/></svg>;
}

function IconPhone() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>;
}

function IconMail() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>;
}

function IconUser() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>;
}

function IconSearch() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
}

function IconTask() {
  return <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>;
}

function getInitials(value) {
  const characters = Array.from(String(value || '').trim()).filter(Boolean);
  return characters.slice(0, 2).join('') || '—';
}

function closeActionMenu(event) {
  event.currentTarget.closest('details')?.removeAttribute('open');
}

function CRMOperations({ section }) {
  const [companies, setCompanies] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [savedFilters, setSavedFilters] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [fieldEntity, setFieldEntity] = useState('customer');
  const [fieldForm, setFieldForm] = useState({ label: '', field_key: '', field_type: 'text', is_required: false });
  const [automationRule, setAutomationRule] = useState({ days: 7, is_enabled: true });
  const [filterName, setFilterName] = useState('');
  const [form, setForm] = useState({});
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeModal, setActiveModal] = useState(null); // 'company' | 'lead' | 'task' | 'field' | null
  const [leadToDelete, setLeadToDelete] = useState(null);

  const loadCompanies = useCallback(async () => {
    try {
      const records = await crmApi.getCRMCompanies();
      setCompanies(records || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  const loadLeads = useCallback(async () => {
    try {
      const records = await crmApi.getCRMLeads({ search, status });
      setLeads(records || []);
    } catch (err) {
      console.error(err);
    }
  }, [search, status]);

  const loadActivities = useCallback(async () => {
    try {
      const records = await crmApi.getCRMActivities({});
      setActivities(records || []);
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      ['companies', 'leads'].includes(section) ? crmApi.getCRMCompanies() : Promise.resolve([]),
      section === 'leads' ? crmApi.getCRMLeads({ search, status }) : Promise.resolve([]),
      section === 'tasks' ? crmApi.getCRMActivities({}) : Promise.resolve([]),
      section === 'tasks' ? customersApi.getAllCustomersWithStats() : Promise.resolve([]),
      section === 'leads' ? crmApi.getCRMSavedFilters('lead') : Promise.resolve([]),
      section === 'fields' ? crmApi.getCRMCustomFields(fieldEntity) : Promise.resolve([]),
      section === 'automation' ? crmApi.getCRMAutomationRules() : Promise.resolve([]),
      ['companies', 'leads', 'tasks'].includes(section) ? crmApi.getCRMAssignees() : Promise.resolve([]),
    ]).then(([companyRows, leadRows, activityRows, customerRows, filters, fields, rules, users]) => {
      if (!active) return;
      setCompanies(companyRows || []);
      setLeads(leadRows || []);
      setActivities(activityRows || []);
      setCustomers(customerRows || []);
      setSavedFilters(filters || []);
      setCustomFields(fields || []);
      const staleRule = (rules || []).find((rule) => rule.trigger_type === 'opportunity_stale');
      if (staleRule) {
        setAutomationRule({ days: staleRule.config.days, is_enabled: Boolean(staleRule.is_enabled) });
      }
      setAssignees(users || []);
    }).catch((loadError) => {
      if (active) setError(loadError.message || 'تعذر تحميل بيانات CRM');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [section, search, status, fieldEntity]);

  const companyOptions = useMemo(() => companies.map((company) => (
    <option value={company.id} key={company.id}>{company.name}</option>
  )), [companies]);

  const assigneeOptions = useMemo(() => assignees.map((user) => (
    <option value={user.id} key={user.id}>
      {[user.first_name, user.last_name].filter(Boolean).join(' ') || user.username}
    </option>
  )), [assignees]);

  const updateForm = (key) => (event) => {
    setForm((current) => ({ ...current, [key]: event.target.value }));
  };

  const openModal = (type, initialData = {}) => {
    setForm(initialData);
    setActiveModal(type);
    setError('');
    setMessage('');
  };

  const closeModal = () => {
    setActiveModal(null);
    setForm({});
  };

  const submitCompany = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (form.id) {
        await crmApi.updateCRMCompany({ ...form, id: Number(form.id) });
      } else {
        await crmApi.createCRMCompany(form);
      }
      closeModal();
      await loadCompanies();
      setMessage('تم حفظ بيانات الشركة بنجاح.');
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الشركة');
    }
  };

  const submitLead = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      if (form.id) {
        await crmApi.updateCRMLead({ ...form, id: Number(form.id) });
      } else {
        await crmApi.createCRMLead(form);
      }
      closeModal();
      await loadLeads();
      setMessage(form.id ? 'تم تحديث بيانات العميل المحتمل.' : 'تم تسجيل العميل المحتمل بنجاح.');
    } catch (saveError) {
      setError(saveError.message || 'تعذر تسجيل العميل المحتمل');
    }
  };

  const deleteLead = async () => {
    if (!leadToDelete) return;
    setError('');
    setMessage('');
    try {
      await crmApi.deleteCRMLead(leadToDelete.id);
      setLeadToDelete(null);
      await loadLeads();
      setMessage('تم حذف العميل المحتمل.');
    } catch (deleteError) {
      setError(deleteError.message || 'تعذر حذف العميل المحتمل');
    }
  };

  const convertLead = async (leadId) => {
    setError('');
    setMessage('');
    try {
      await crmApi.convertCRMLead(leadId);
      await loadLeads();
      setMessage('تم تحويل العميل المحتمل إلى جهة اتصال بنجاح.');
    } catch (convertError) {
      setError(convertError.message || 'تعذر تحويل العميل المحتمل');
    }
  };

  const updateLeadStatus = async (leadId, nextStatus) => {
    try {
      await crmApi.updateCRMLeadStatus(leadId, nextStatus);
      await loadLeads();
    } catch (statusError) {
      setError(statusError.message || 'تعذر تحديث حالة العميل المحتمل');
    }
  };

  const submitActivity = async (event) => {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      await crmApi.createCRMActivity({
        record_type: form.record_type || 'customer',
        record_id: Number(form.record_id),
        activity_type: form.activity_type || 'task',
        title: form.title,
        details: form.details,
        due_at: form.due_at || null,
        owner_user_id: form.owner_user_id || null,
      });
      closeModal();
      await loadActivities();
      setMessage('تم تسجيل النشاط بنجاح.');
    } catch (saveError) {
      setError(saveError.message || 'تعذر تسجيل النشاط');
    }
  };

  const completeActivity = async (id) => {
    try {
      await crmApi.completeCRMActivity(id);
      await loadActivities();
    } catch (completeError) {
      setError(completeError.message || 'تعذر إكمال النشاط');
    }
  };

  const saveFilter = async () => {
    setError('');
    try {
      await crmApi.saveCRMSavedFilter({
        name: filterName,
        entity_type: 'lead',
        filters: { search, status },
      });
      setSavedFilters(await crmApi.getCRMSavedFilters('lead'));
      setFilterName('');
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الفلتر');
    }
  };

  const createCustomField = async (event) => {
    event.preventDefault();
    try {
      await crmApi.createCRMCustomField({
        ...fieldForm,
        entity_type: fieldEntity,
      });
      setFieldForm({ label: '', field_key: '', field_type: 'text', is_required: false });
      closeModal();
      setCustomFields(await crmApi.getCRMCustomFields(fieldEntity));
      setMessage('تم إضافة الحقل المخصص بنجاح.');
    } catch (fieldError) {
      setError(fieldError.message || 'تعذر إنشاء الحقل');
    }
  };

  const saveAutomationRule = async (event) => {
    event.preventDefault();
    try {
      await crmApi.saveCRMStaleOpportunityRule({
        days: Number(automationRule.days),
        is_enabled: automationRule.is_enabled,
      });
      setMessage('تم حفظ قاعدة التذكير الآلي بنجاح.');
    } catch (ruleError) {
      setError(ruleError.message || 'تعذر حفظ قاعدة الأتمتة');
    }
  };

  const exportRows = async (type) => {
    try {
      setError('');
      await crmApi.exportCRMRecords(type);
    } catch (exportError) {
      setError(exportError.message || 'تعذر تصدير البيانات');
    }
  };

  const importLeads = async () => {
    try {
      setError('');
      const result = await crmApi.importCRMLeads();
      if (!result.canceled) {
        await loadLeads();
        setMessage(`تم استيراد ${result.imported} سجل وتخطي ${result.skipped} سجل.`);
        if (result.errors?.length) {
          setError(result.errors.slice(0, 5).map((item) => `السطر ${item.row}: ${item.message}`).join(' | '));
        }
      }
    } catch (importError) {
      setError(importError.message || 'تعذر استيراد الملف');
    }
  };

  const heading = section === 'companies'
    ? 'الشركات والفروع'
    : section === 'leads'
      ? 'العملاء المحتملون'
      : section === 'fields'
        ? 'حقول CRM المخصصة'
        : section === 'automation'
          ? 'الأتمتة والتذكيرات'
        : 'الأنشطة والمهام';

  const subtitle = section === 'companies'
    ? 'إدارة حسابات الشركات والمؤسسات والفروع التابعة لها'
    : section === 'leads'
      ? 'متابعة العملاء المحتملين وتأهيلهم للتحول لصفقات ناجحة'
      : section === 'fields'
        ? 'تخصيص البيانات وإضافة حقول إضافية لجهات الاتصال والصفقات'
        : section === 'automation'
          ? 'إعداد القواعد الذكية والتنبيهات الدورية لتجنب ركود الصفقات'
        : 'تنظيم المهام اليومية، المكالمات والاجتماعات للمتابعة الدورية';

  return (
    <section className="crm-operations">
      {/* Messages */}
      {error && (
        <div className="crm-error-banner" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary-btn" onClick={() => setError('')}>إغلاق</button>
        </div>
      )}
      {message && (
        <div className="crm-success-banner" role="status">
          {message}
        </div>
      )}

      {/* Section 1: Companies */}
      {section === 'companies' && (
        <>
          <div className="crm-toolbar">
            <div className="crm-toolbar-left">
              <div>
                <h2 className="crm-operation-heading">{heading}</h2>
                <p className="crm-operation-description">{subtitle}</p>
              </div>
            </div>
            <div className="crm-toolbar-right">
              <button type="button" className="secondary-btn" onClick={() => exportRows('companies')}>
                تصدير البيانات
              </button>
              <button type="button" className="primary-btn" onClick={() => openModal('company')}>
                + إضافة شركة جديدة
              </button>
            </div>
          </div>

          <div className="crm-table-card">
            {loading ? (
              <div className="crm-empty-state">جارٍ تحميل الشركات...</div>
            ) : companies.length === 0 ? (
              <div className="crm-empty-state">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 21h18M9 8h1m-1 4h1m-1 4h1m4-8h1m-1 4h1m-1 4h1M4 21V4a1 1 0 0 1 1-1h14a1 1 0 0 1 1 1v17" />
                </svg>
                <strong>لا توجد شركات مسجلة بعد</strong>
                <p>ابدأ بإضافة أول شركة أو فرع لتنظيم شبكة عملائك ومؤسساتهم.</p>
                <button type="button" className="primary-btn" onClick={() => openModal('company')}>
                  + إضافة شركة جديدة
                </button>
              </div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>الشركة</th>
                    <th>القطاع</th>
                    <th>الهاتف</th>
                    <th>البريد الإلكتروني</th>
                    <th>المسؤول</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {companies.map((company) => (
                    <tr key={company.id}>
                      <td>
                        <div className="crm-entity-cell">
                          <div className="crm-avatar company" aria-hidden="true">
                            {getInitials(company.name)}
                          </div>
                          <div className="crm-entity-info">
                            <span className="crm-entity-title">{company.name}</span>
                            <span className="crm-entity-subtitle">
                              {company.parent_company_name ? `فرع من: ${company.parent_company_name}` : 'شركة رئيسية'}
                            </span>
                          </div>
                        </div>
                      </td>
                      <td>{company.industry || '—'}</td>
                      <td>{company.phone || '—'}</td>
                      <td>{company.email || '—'}</td>
                      <td>
                        {assignees.find((u) => u.id === company.owner_user_id)?.username || 'المستخدم الحالي'}
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-btn crm-operation-compact-button"
                          onClick={() => openModal('company', {
                            id: company.id,
                            name: company.name,
                            parent_company_id: company.parent_company_id || '',
                            industry: company.industry || '',
                            phone: company.phone || '',
                            email: company.email || '',
                            website: company.website || '',
                            owner_user_id: company.owner_user_id || '',
                          })}
                        >
                          تعديل
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Section 2: Leads */}
      {section === 'leads' && (
        <>
          <div className="crm-toolbar">
            <div className="crm-toolbar-left">
              <div className="crm-search-input-wrap">
                <input
                  aria-label="بحث في العملاء المحتملين"
                  placeholder="بحث بالاسم أو الهاتف أو المصدر..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
                <span className="crm-search-icon">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </span>
              </div>
              <select
                className="crm-select-filter"
                aria-label="تصفية حسب الحالة"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
              >
                <option value="">جميع الحالات</option>
                {LEAD_STATUSES.map(([key, label]) => (
                  <option key={key} value={key}>{label}</option>
                ))}
              </select>

              {savedFilters.length > 0 && (
                <select
                  className="crm-select-filter"
                  aria-label="الفلاتر المحفوظة"
                  defaultValue=""
                  onChange={(event) => {
                    const filter = savedFilters.find((item) => String(item.id) === event.target.value);
                    if (filter) {
                      setSearch(filter.filters.search || '');
                      setStatus(filter.filters.status || '');
                    }
                  }}
                >
                  <option value="">الفلاتر المحفوظة</option>
                  {savedFilters.map((filter) => (
                    <option key={filter.id} value={filter.id}>{filter.name}</option>
                  ))}
                </select>
              )}

              <input
                className="crm-select-filter"
                aria-label="اسم الفلتر"
                placeholder="اسم الفلتر"
                maxLength={60}
                value={filterName}
                onChange={(event) => setFilterName(event.target.value)}
              />
              <button type="button" className="secondary-btn" disabled={!filterName.trim()} onClick={saveFilter}>
                حفظ الفلتر
              </button>
            </div>

            <div className="crm-toolbar-right">
              <button type="button" className="secondary-btn" onClick={importLeads}>
                استيراد Excel / CSV
              </button>
              <button type="button" className="secondary-btn" onClick={() => exportRows('leads')}>
                تصدير
              </button>
              <button type="button" className="primary-btn" onClick={() => openModal('lead')}>
                + عميل محتمل جديد
              </button>
            </div>
          </div>

          <div className="crm-table-card crm-leads-table-card">
            {loading ? (
              <div className="crm-empty-state">جارٍ تحميل العملاء المحتملين...</div>
            ) : leads.length === 0 ? (
              <div className="crm-empty-state">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="8.5" cy="7" r="4" />
                  <line x1="20" y1="8" x2="20" y2="14" />
                  <line x1="23" y1="11" x2="17" y2="11" />
                </svg>
                <strong>لا توجد نتائج مطابقة</strong>
                <p>سجل عميلاً محتملاً جديداً للبدء بمتابعة مراحل التفاوض.</p>
                <button type="button" className="primary-btn" onClick={() => openModal('lead')}>
                  + تسجيل عميل محتمل جديد
                </button>
              </div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>العميل المحتمل</th>
                    <th>الشركة</th>
                    <th>المصدر</th>
                    <th>الحالة</th>
                    <th>المسؤول</th>
                    <th>الإجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map((lead) => {
                    const statusObj = LEAD_STATUSES.find(([key]) => key === lead.status);
                    const statusLabel = lead.status === 'converted' ? 'تم التحويل' : (statusObj ? statusObj[1] : lead.status);
                    const statusVariant = lead.status === 'converted' || lead.status === 'qualified'
                      ? 'success'
                      : lead.status === 'contacted'
                        ? 'warning'
                        : lead.status === 'lost'
                          ? 'danger'
                          : 'info';

                    return (
                      <tr key={lead.id}>
                        <td>
                          <div className="crm-entity-cell">
                            <div className="crm-avatar" aria-hidden="true">
                                {getInitials(lead.name)}
                            </div>
                            <div className="crm-entity-info">
                              <span className="crm-entity-title">{lead.name}</span>
                              <span className="crm-entity-subtitle">{lead.phone || lead.email || 'بدون اتصال'}</span>
                            </div>
                          </div>
                        </td>
                        <td>{lead.company_name || '—'}</td>
                        <td>{lead.source || 'غير محدد'}</td>
                        <td>
                          <Badge variant={statusVariant} className="crm-lead-status-badge">
                            {lead.status === 'converted' && '✓ '}{statusLabel}
                          </Badge>
                        </td>
                        <td>{lead.owner_username || 'المستخدم الحالي'}</td>
                        <td>
                          <details className="crm-row-actions">
                            <summary className="secondary-btn crm-row-actions-trigger">إجراءات</summary>
                            <div className="crm-row-actions-menu" role="group" aria-label={`إجراءات ${lead.name}`}>
                              {lead.status !== 'converted' && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      closeActionMenu(event);
                                      openModal('task', {
                                        record_type: 'lead',
                                        record_id: lead.id,
                                        activity_type: 'call',
                                        title: `مكالمة متابعة: ${lead.name}`,
                                      });
                                    }}
                                  >
                                    تسجيل مكالمة
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      closeActionMenu(event);
                                      openModal('lead', {
                                        id: lead.id,
                                        name: lead.name,
                                        phone: lead.phone || '',
                                        email: lead.email || '',
                                        company_id: lead.company_id || '',
                                        source: lead.source || '',
                                        status: lead.status || 'new',
                                        owner_user_id: lead.owner_user_id || '',
                                        notes: lead.notes || '',
                                      });
                                    }}
                                  >
                                    تعديل البيانات
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(event) => {
                                      closeActionMenu(event);
                                      convertLead(lead.id);
                                    }}
                                  >
                                    تحويل إلى عميل
                                  </button>
                                  <button
                                    type="button"
                                    className="is-danger"
                                    onClick={(event) => {
                                      closeActionMenu(event);
                                      setLeadToDelete({ id: lead.id, name: lead.name });
                                    }}
                                  >
                                    حذف العميل المحتمل
                                  </button>
                                  <label className="crm-row-actions-status">
                                    تغيير الحالة
                                    <select
                                      value={lead.status}
                                      onChange={(event) => {
                                        closeActionMenu(event);
                                        updateLeadStatus(lead.id, event.target.value);
                                      }}
                                    >
                                      {LEAD_STATUSES.map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                      ))}
                                    </select>
                                  </label>
                                </>
                              )}
                              {lead.status === 'converted' && <span className="crm-row-actions-note">تم تحويله بالفعل</span>}
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Section 3: Tasks & Activities */}
      {section === 'tasks' && (
        <>
          <div className="crm-toolbar">
            <div className="crm-toolbar-left">
              <div>
                <h2 className="crm-operation-heading">{heading}</h2>
                <p className="crm-operation-description">{subtitle}</p>
              </div>
            </div>
            <div className="crm-toolbar-right">
              <button type="button" className="secondary-btn" onClick={() => exportRows('activities')}>
                تصدير الأنشطة
              </button>
              <button type="button" className="primary-btn" onClick={() => openModal('task')}>
                + تسجيل نشاط / مهمة جديدة
              </button>
            </div>
          </div>

          <div className="crm-table-card">
            {loading ? (
              <div className="crm-empty-state">جارٍ تحميل المهام والأنشطة...</div>
            ) : activities.length === 0 ? (
              <div className="crm-empty-state">
                <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                </svg>
                <strong>لا توجد أنشطة أو مهام مسجلة</strong>
                <p>سجل مكالماتك ومواعيد اجتماعاتك لتنظيم يومك وزيادة الإنتاجية.</p>
                <button type="button" className="primary-btn" onClick={() => openModal('task')}>
                  + تسجيل أول نشاط
                </button>
              </div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>النشاط</th>
                    <th>النوع</th>
                    <th>الموعد</th>
                    <th>التفاصيل</th>
                    <th>المسؤول</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {activities.map((activity) => (
                    <tr key={activity.id}>
                      <td>
                        <div className="crm-entity-cell">
                          <div className="crm-avatar activity">
                            {activity.activity_type === 'call' ? 'اتصال' : activity.activity_type === 'meeting' ? 'لقاء' : 'مهمة'}
                          </div>
                          <div className="crm-entity-info">
                            <span className="crm-entity-title">{activity.title}</span>
                            <span className="crm-entity-subtitle">{activity.customer_name ? `العميل: ${activity.customer_name}` : 'نشاط داخلي'}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <Badge variant="info">
                          {activity.activity_type === 'call' ? 'مكالمة' : activity.activity_type === 'meeting' ? 'اجتماع' : activity.activity_type === 'email' ? 'بريد' : 'مهمة'}
                        </Badge>
                      </td>
                      <td>{activity.due_at ? new Date(activity.due_at).toLocaleDateString('ar-EG') : 'بدون موعد'}</td>
                      <td className="crm-activity-details-cell">
                        {activity.details || '—'}
                      </td>
                      <td>{activity.owner_username || 'غير معيّن'}</td>
                      <td>
                        {activity.status === 'open' ? (
                          <button
                            type="button"
                            className="secondary-btn crm-complete-button"
                            onClick={() => completeActivity(activity.id)}
                          >
                            ✓ إكمال
                          </button>
                        ) : (
                          <Badge variant="success">مكتمل</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Section 4: Custom Fields */}
      {section === 'fields' && (
        <>
          <div className="crm-toolbar">
            <div className="crm-toolbar-left">
              <label className="crm-form-label crm-filter-label">
                نوع السجل المستهدف:
              </label>
              <select
                className="crm-select-filter"
                value={fieldEntity}
                onChange={(event) => setFieldEntity(event.target.value)}
              >
                <option value="customer">جهات الاتصال (Customers)</option>
                <option value="company">الشركات (Companies)</option>
                <option value="lead">العملاء المحتملون (Leads)</option>
                <option value="opportunity">الصفقات (Opportunities)</option>
              </select>
            </div>
            <div className="crm-toolbar-right">
              <button type="button" className="primary-btn" onClick={() => openModal('field')}>
                + إضافة حقل مخصص
              </button>
            </div>
          </div>

          <div className="crm-table-card">
            {customFields.length === 0 ? (
              <div className="crm-empty-state">
                <p>لا توجد حقول مخصصة لهذا النوع حتى الآن.</p>
                <button type="button" className="primary-btn" onClick={() => openModal('field')}>
                  + إضافة حقل مخصص
                </button>
              </div>
            ) : (
              <table className="crm-table">
                <thead>
                  <tr>
                    <th>اسم الحقل</th>
                    <th>المفتاح البرمجي</th>
                    <th>نوع البيانات</th>
                    <th>الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {customFields.map((field) => (
                    <tr key={field.id}>
                      <td className="crm-custom-field-label">{field.label}</td>
                      <td>
                        <code className="crm-field-key">
                          {field.field_key}
                        </code>
                      </td>
                      <td>{field.field_type}</td>
                      <td>
                        <span className={`crm-badge ${field.is_required ? 'lost' : 'open'}`}>
                          {field.is_required ? 'إلزامي' : 'اختياري'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {/* Section 5: Automation */}
      {section === 'automation' && (
        <div className="crm-automation-container">
          <div className="crm-overview-panel">
            <div className="crm-panel-heading">
              <div>
                <h2>قواعد المتابعة والتذكير الآلي</h2>
                <p>إرسال تنبيهات ذكية للمسؤولين عند ركود الصفقات دون تحديث.</p>
              </div>
            </div>
            <form onSubmit={saveAutomationRule} className="crm-automation-form">
              <div className="crm-form-group">
                <label className="crm-form-label">
                  تنبيه عند توقف الصفقة في نفس المرحلة لأكثر من (بالأيام):
                </label>
                <Input
                  className="crm-form-input"
                  type="number"
                  min="1"
                  max="365"
                  value={automationRule.days}
                  onChange={(event) => setAutomationRule({ ...automationRule, days: event.target.value })}
                  required
                />
              </div>

              <label className="crm-form-checkbox-label">
                <input
                  type="checkbox"
                  checked={automationRule.is_enabled}
                  onChange={(event) => setAutomationRule({ ...automationRule, is_enabled: event.target.checked })}
                />
                <strong>تفعيل إرسال إشعار فوري للمسؤول عند تجاوز المدة</strong>
              </label>

              <div className="crm-automation-info">
                <strong>آلية العمل:</strong> يقوم النظام بالتحقق اليومي من الصفقات المفتوحة، وفي حال لم تتحرك الصفقة للمرحلة التالية خلال المدة المحددة، يُرسل إشعار تلقائي لمدير المبيعات ومسؤول الصفقة لمتابعة العميل.
              </div>

              <div className="crm-details-submit">
                <button type="submit" className="primary-btn">
                  حفظ إعدادات الأتمتة
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODALS
         ========================================================================= */}

      {/* Company Modal */}
      {activeModal === 'company' && (
        <div className="crm-modal-backdrop" onClick={closeModal}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>{form.id ? 'تعديل بيانات الشركة' : 'إضافة شركة / فرع جديد'}</h3>
              <button type="button" className="crm-modal-close" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={submitCompany}>
              <div className="crm-modal-body">
                <div className="crm-form-grid">
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">اسم الشركة <span className="required">*</span></label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconBuilding /></span>
                      <Input className="crm-form-input" value={form.name || ''} onChange={updateForm('name')} required maxLength={150} placeholder="مثال: شركة النور للتجارة" />
                    </div>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">الشركة الأم (إن وجد)</label>
                    <select className="crm-form-select" value={form.parent_company_id || ''} onChange={updateForm('parent_company_id')}>
                      <option value="">بدون شركة أم (رئيسية)</option>
                      {companyOptions}
                    </select>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">القطاع / المجال</label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconIndustry /></span>
                      <Input className="crm-form-input" value={form.industry || ''} onChange={updateForm('industry')} maxLength={100} placeholder="مثال: مقاولات، تجزئة، تكنولوجيا" />
                    </div>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">الهاتف</label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconPhone /></span>
                      <Input className="crm-form-input" type="tel" value={form.phone || ''} onChange={updateForm('phone')} maxLength={30} placeholder="مثال: 010xxxxxxxx" />
                    </div>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">البريد الإلكتروني</label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconMail /></span>
                      <Input className="crm-form-input" type="email" value={form.email || ''} onChange={updateForm('email')} placeholder="contact@company.com" />
                    </div>
                  </div>
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">الموقع الإلكتروني</label>
                    <Input className="crm-form-input" value={form.website || ''} onChange={updateForm('website')} placeholder="https://example.com" />
                  </div>
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">المسؤول عن الحساب</label>
                    <select className="crm-form-select" value={form.owner_user_id || ''} onChange={updateForm('owner_user_id')}>
                      <option value="">المستخدم الحالي تلقائيًا</option>
                      {assigneeOptions}
                    </select>
                  </div>
                </div>
              </div>
              <div className="crm-modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModal}>إلغاء</button>
                <button type="submit" className="primary-btn">{form.id ? 'حفظ التعديلات' : 'إضافة الشركة'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Lead Modal */}
      {activeModal === 'lead' && (
        <div className="crm-modal-backdrop" onClick={closeModal}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>{form.id ? 'تعديل بيانات العميل المحتمل' : 'تسجيل عميل محتمل جديد (Lead)'}</h3>
              <button type="button" className="crm-modal-close" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={submitLead}>
              <div className="crm-modal-body">
                <div className="crm-form-grid">
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">اسم العميل <span className="required">*</span></label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconUser /></span>
                      <Input className="crm-form-input" value={form.name || ''} onChange={updateForm('name')} required maxLength={150} placeholder="مثال: محمد أحمد" />
                    </div>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">رقم الهاتف</label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconPhone /></span>
                      <Input className="crm-form-input" type="tel" value={form.phone || ''} onChange={updateForm('phone')} maxLength={30} placeholder="01xxxxxxxxx" />
                    </div>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">البريد الإلكتروني</label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconMail /></span>
                      <Input className="crm-form-input" type="email" value={form.email || ''} onChange={updateForm('email')} placeholder="name@domain.com" />
                    </div>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">الشركة التابع لها</label>
                    <select className="crm-form-select" value={form.company_id || ''} onChange={updateForm('company_id')}>
                      <option value="">بدون شركة</option>
                      {companyOptions}
                    </select>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">مصدر العميل</label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true"><IconSearch /></span>
                      <Input className="crm-form-input" value={form.source || ''} onChange={updateForm('source')} placeholder="إحالة، إعلان فيسبوك، معرض..." />
                    </div>
                  </div>
                  {form.id && (
                    <div className="crm-form-group">
                      <label className="crm-form-label">حالة العميل المحتمل</label>
                      <select className="crm-form-select" value={form.status || 'new'} onChange={updateForm('status')}>
                        {LEAD_STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                  )}
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">المسؤول عن المتابعة</label>
                    <select className="crm-form-select" value={form.owner_user_id || ''} onChange={updateForm('owner_user_id')}>
                      <option value="">المستخدم الحالي تلقائيًا</option>
                      {assigneeOptions}
                    </select>
                  </div>
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">ملاحظات أولية</label>
                    <textarea className="crm-form-textarea" rows="3" value={form.notes || ''} onChange={updateForm('notes')} maxLength={5000} placeholder="متطلبات العميل واهتماماته..." />
                  </div>
                </div>
              </div>
              <div className="crm-modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModal}>إلغاء</button>
                <button type="submit" className="primary-btn">{form.id ? 'حفظ التعديلات' : 'حفظ العميل المحتمل'}</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Task Modal */}
      {activeModal === 'task' && (
        <div className="crm-modal-backdrop" onClick={closeModal}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>تسجيل نشاط / تذكير جديد</h3>
              <button type="button" className="crm-modal-close" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={submitActivity}>
              <div className="crm-modal-body">
                <div className="crm-form-grid">
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">العميل المعني <span className="required">*</span></label>
                    <select
                      className="crm-form-select"
                      value={form.record_id || ''}
                      onChange={updateForm('record_id')}
                      required
                      disabled={Boolean(form.record_type)}
                    >
                      <option value="">اختر العميل</option>
                      {form.record_type === 'lead'
                        ? leads.filter((lead) => lead.id === form.record_id).map((lead) => (
                          <option key={lead.id} value={lead.id}>{lead.name} (عميل محتمل)</option>
                        ))
                        : customers.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
                    </select>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">نوع النشاط</label>
                    <select className="crm-form-select" value={form.activity_type || 'task'} onChange={updateForm('activity_type')}>
                      <option value="task">مهمة داخلية</option>
                      <option value="call">مكالمة هاتفية</option>
                      <option value="meeting">اجتماع عمل</option>
                      <option value="email">بريد إلكتروني</option>
                    </select>
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">موعد الإنجاز / التذكير</label>
                    <Input className="crm-form-input" type="datetime-local" value={form.due_at || ''} onChange={updateForm('due_at')} />
                  </div>
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">عنوان النشاط <span className="required">*</span></label>
                    <div className="crm-input-with-icon">
                      <span aria-hidden="true">{form.activity_type === 'call' ? <IconPhone /> : <IconTask />}</span>
                      <Input className="crm-form-input" value={form.title || ''} onChange={updateForm('title')} required maxLength={200} placeholder="مثال: متابعة عرض السعر النهائي" />
                    </div>
                  </div>
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">المسؤول</label>
                    <select className="crm-form-select" value={form.owner_user_id || ''} onChange={updateForm('owner_user_id')}>
                      <option value="">المستخدم الحالي تلقائيًا</option>
                      {assigneeOptions}
                    </select>
                  </div>
                  <div className="crm-form-group full-width">
                    <label className="crm-form-label">التفاصيل</label>
                    <textarea className="crm-form-textarea" rows="3" value={form.details || ''} onChange={updateForm('details')} maxLength={5000} placeholder="نقاط المكالمة أو المطلوب تجهيزه..." />
                  </div>
                </div>
              </div>
              <div className="crm-modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModal}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ النشاط</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Field Modal */}
      {activeModal === 'field' && (
        <div className="crm-modal-backdrop" onClick={closeModal}>
          <div className="crm-modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="crm-modal-header">
              <h3>إضافة حقل مخصص لـ {fieldEntity}</h3>
              <button type="button" className="crm-modal-close" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={createCustomField}>
              <div className="crm-modal-body">
                <div className="crm-form-grid">
                  <div className="crm-form-group">
                    <label className="crm-form-label">اسم الحقل بالعربية <span className="required">*</span></label>
                    <Input className="crm-form-input" value={fieldForm.label} onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })} required maxLength={80} placeholder="مثال: الرقم الضريبي" />
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">المفتاح البرمجي (English) <span className="required">*</span></label>
                    <Input className="crm-form-input" value={fieldForm.field_key} onChange={(e) => setFieldForm({ ...fieldForm, field_key: e.target.value })} required pattern="[a-z][a-z0-9_]*" maxLength={40} placeholder="tax_number" />
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">نوع البيانات</label>
                    <select className="crm-form-select" value={fieldForm.field_type} onChange={(e) => setFieldForm({ ...fieldForm, field_type: e.target.value })}>
                      <option value="text">نص (Text)</option>
                      <option value="number">رقم (Number)</option>
                      <option value="date">تاريخ (Date)</option>
                      <option value="boolean">نعم / لا (Boolean)</option>
                    </select>
                  </div>
                  <div className="crm-form-group crm-field-required-group">
                    <label className="crm-form-checkbox-label crm-field-required-label">
                      <input type="checkbox" checked={fieldForm.is_required} onChange={(e) => setFieldForm({ ...fieldForm, is_required: e.target.checked })} />
                      <strong>حقل مطلوب وإلزامي</strong>
                    </label>
                  </div>
                </div>
              </div>
              <div className="crm-modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModal}>إلغاء</button>
                <button type="submit" className="primary-btn">إنشاء الحقل</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {leadToDelete && (
        <div
          className="crm-modal-backdrop crm-delete-backdrop"
          onClick={() => setLeadToDelete(null)}
        >
          <section
            className="crm-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-delete-lead-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="crm-delete-lead-title">حذف العميل المحتمل</h3>
            <p>
              سيتم حذف «{leadToDelete.name}» وسجل أنشطته وملاحظاته ومرفقاته. لا يمكن التراجع عن هذا الإجراء.
            </p>
            {error && <div className="crm-error-banner" role="alert">{error}</div>}
            <div className="crm-drawer-actions">
              <button type="button" className="secondary-btn" onClick={() => setLeadToDelete(null)}>إلغاء</button>
              <button type="button" className="crm-confirm-danger" onClick={deleteLead}>حذف نهائي</button>
            </div>
          </section>
        </div>
      )}
    </section>
  );
}

export default CRMOperations;

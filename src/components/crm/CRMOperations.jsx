import { useCallback, useEffect, useMemo, useState } from 'react';
import Input from '../ui/Input.jsx';
import * as crmApi from '../../api/crm.js';
import * as customersApi from '../../api/customers.js';
import CRMHeader from './CRMHeader.jsx';
import CRMCompaniesGrid from './CRMCompaniesGrid.jsx';
import CRMLeadsList, { LEAD_STATUSES } from './CRMLeadsList.jsx';
import CRMCustomFields, { FIELD_ENTITIES, FIELD_TYPES } from './CRMCustomFields.jsx';
import CRMAutomationPanel, { DEFAULT_STALE_RULE } from './CRMAutomationPanel.jsx';
import CRMActivitiesList from './CRMActivitiesList.jsx';
import CRMModal from './CRMModal.jsx';
import {
  BoltIcon, BuildingIcon, CalendarIcon, DownloadIcon, PlusIcon, SlidersIcon, UploadIcon, UserPlusIcon,
} from '../icons/PosIcons.jsx';

const EMPTY_FIELD_FORM = { label: '', field_key: '', field_type: 'text', is_required: false, optionsText: '' };

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

function CRMOperations({ section, crmTabs = null }) {
  const [companies, setCompanies] = useState([]);
  const [assignees, setAssignees] = useState([]);
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [activities, setActivities] = useState([]);
  const [search, setSearch] = useState('');
  // Lead status, source and owner filter on the client so the status chips can show counts.
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [owner, setOwner] = useState('');
  const [savedFilters, setSavedFilters] = useState([]);
  // All four entity types load together so the side list can show each one's field count.
  const [fieldsByEntity, setFieldsByEntity] = useState({});
  const [fieldEntity, setFieldEntity] = useState('customer');
  const [fieldForm, setFieldForm] = useState(EMPTY_FIELD_FORM);
  const [fieldToDelete, setFieldToDelete] = useState(null);
  const [automationRule, setAutomationRule] = useState(DEFAULT_STALE_RULE);
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
      const records = await crmApi.getCRMLeads({ search });
      setLeads(records || []);
    } catch (err) {
      console.error(err);
    }
  }, [search]);

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
      section === 'leads' ? crmApi.getCRMLeads({ search }) : Promise.resolve([]),
      // Leads show each lead's next open activity.
      ['tasks', 'leads'].includes(section) ? crmApi.getCRMActivities({}) : Promise.resolve([]),
      section === 'tasks' ? customersApi.getAllCustomersWithStats() : Promise.resolve([]),
      section === 'leads' ? crmApi.getCRMSavedFilters('lead') : Promise.resolve([]),
      section === 'fields'
        ? Promise.all(FIELD_ENTITIES.map(({ id }) => crmApi.getCRMCustomFields(id)))
          .then((lists) => Object.fromEntries(FIELD_ENTITIES.map(({ id }, index) => [id, lists[index] || []])))
        : Promise.resolve({}),
      // Leads read the stale-days threshold; it is optional there, so a failure must not hide the list.
      section === 'automation' ? crmApi.getCRMAutomationRules()
        : section === 'leads' ? crmApi.getCRMAutomationRules().catch(() => []) : Promise.resolve([]),
      ['companies', 'leads', 'tasks'].includes(section) ? crmApi.getCRMAssignees() : Promise.resolve([]),
    ]).then(([companyRows, leadRows, activityRows, customerRows, filters, fields, rules, users]) => {
      if (!active) return;
      setCompanies(companyRows || []);
      setLeads(leadRows || []);
      setActivities(activityRows || []);
      setCustomers(customerRows || []);
      setSavedFilters(filters || []);
      setFieldsByEntity(fields || {});
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
  }, [section, search]);

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

  const saveFilter = async (name) => {
    setError('');
    try {
      await crmApi.saveCRMSavedFilter({
        name,
        entity_type: 'lead',
        filters: { search, status, source, owner },
      });
      setSavedFilters(await crmApi.getCRMSavedFilters('lead'));
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ الفلتر');
    }
  };

  const reloadFields = async () => {
    const entityFields = await crmApi.getCRMCustomFields(fieldEntity);
    setFieldsByEntity((current) => ({ ...current, [fieldEntity]: entityFields || [] }));
  };

  const openFieldModal = (field = null) => {
    setFieldForm(field
      ? { ...field, is_required: Boolean(field.is_required), optionsText: (field.options || []).join('\n') }
      : EMPTY_FIELD_FORM);
    openModal('field');
  };

  // One window adds a field or edits one; a choice list takes one choice per line.
  const saveCustomField = async (event) => {
    event.preventDefault();
    const options = fieldForm.field_type === 'select'
      ? fieldForm.optionsText.split('\n').map((line) => line.trim()).filter(Boolean)
      : undefined;
    try {
      if (fieldForm.id) {
        await crmApi.updateCRMCustomField({ id: fieldForm.id, label: fieldForm.label, is_required: fieldForm.is_required, options });
      } else {
        await crmApi.createCRMCustomField({
          label: fieldForm.label,
          field_key: fieldForm.field_key,
          field_type: fieldForm.field_type,
          is_required: fieldForm.is_required,
          options,
          entity_type: fieldEntity,
        });
      }
      setMessage(fieldForm.id ? 'تم تعديل الحقل المخصص.' : 'تم إضافة الحقل المخصص بنجاح.');
      setFieldForm(EMPTY_FIELD_FORM);
      closeModal();
      await reloadFields();
    } catch (fieldError) {
      setError(fieldError.message || 'تعذر حفظ الحقل');
    }
  };

  const deleteCustomField = async () => {
    if (!fieldToDelete) return;
    try {
      await crmApi.deleteCRMCustomField(fieldToDelete.id);
      setFieldToDelete(null);
      await reloadFields();
      setMessage('تم حذف الحقل المخصص وقيمه.');
    } catch (deleteError) {
      setError(deleteError.message || 'تعذر حذف الحقل');
    }
  };

  const moveCustomField = async (field, step) => {
    const ids = (fieldsByEntity[fieldEntity] || []).map((item) => item.id);
    const from = ids.indexOf(field.id);
    const to = from + step;
    if (from < 0 || to < 0 || to >= ids.length) return;
    [ids[from], ids[to]] = [ids[to], ids[from]];
    try {
      const ordered = await crmApi.reorderCRMCustomFields(fieldEntity, ids);
      setFieldsByEntity((current) => ({ ...current, [fieldEntity]: ordered || [] }));
    } catch (orderError) {
      setError(orderError.message || 'تعذر تغيير ترتيب الحقول');
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

  return (
    <section className="crm-operations">
      {section === 'tasks' && (
        <>
          <CRMHeader icon={CalendarIcon} title="الأنشطة والمهام" subtitle="مكالماتك ومواعيدك مترتبة باليوم — كل مهمة مربوطة بعميل أو صفقة.">
            <button type="button" className="crm-ov-btn" onClick={() => exportRows('activities')}>
              <UploadIcon size={18} />
              تصدير الأنشطة
            </button>
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => openModal('task')}>
              <PlusIcon size={18} />
              نشاط / مهمة جديدة
            </button>
          </CRMHeader>
          {crmTabs}
        </>
      )}
      {section === 'companies' && (
        <>
          <CRMHeader
            icon={BuildingIcon}
            title="الشركات والفروع"
            subtitle="كل شركة وتحتها فروعها وجهات الاتصال المرتبطة بيها."
          >
            <button type="button" className="crm-ov-btn" onClick={() => exportRows('companies')}>
              <UploadIcon size={18} />
              تصدير البيانات
            </button>
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => openModal('company')}>
              <PlusIcon size={18} />
              شركة جديدة
            </button>
          </CRMHeader>
          {crmTabs}
        </>
      )}
      {section === 'fields' && (
        <>
          <CRMHeader icon={SlidersIcon} title="الحقول المخصصة" subtitle="ضيف بيانات خاصة بنشاطك على سجلات العملاء والصفقات.">
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => openFieldModal()}>
              <PlusIcon size={18} />
              حقل مخصص جديد
            </button>
          </CRMHeader>
          {crmTabs}
        </>
      )}
      {section === 'automation' && (
        <>
          <CRMHeader icon={BoltIcon} title="الأتمتة والتذكيرات" subtitle="خلّي النظام هو اللي يفكّر المسؤولين بالصفقات الواقفة، بدل المتابعة اليدوية." />
          {crmTabs}
        </>
      )}
      {section === 'leads' && (
        <>
          <CRMHeader
            icon={UserPlusIcon}
            title="العملاء المحتملون"
            subtitle="تابع كل فرصة من أول تواصل لحد ما تتحوّل لصفقة."
          >
            <button type="button" className="crm-ov-btn" onClick={importLeads}>
              <DownloadIcon size={18} />
              استيراد Excel / CSV
            </button>
            <button type="button" className="crm-ov-btn" onClick={() => exportRows('leads')}>
              <UploadIcon size={18} />
              تصدير
            </button>
            <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => openModal('lead')}>
              <PlusIcon size={18} />
              عميل محتمل جديد
            </button>
          </CRMHeader>
          {crmTabs}
        </>
      )}
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
        <CRMCompaniesGrid
          companies={companies}
          loading={loading}
          onAdd={() => openModal('company')}
          onAddBranch={(company) => openModal('company', { parent_company_id: company.id })}
          onEdit={(company) => openModal('company', {
            id: company.id,
            name: company.name,
            parent_company_id: company.parent_company_id || '',
            industry: company.industry || '',
            phone: company.phone || '',
            email: company.email || '',
            website: company.website || '',
            // Not editable in the modal, but the update query writes them, so carry them through.
            address: company.address || '',
            notes: company.notes || '',
            owner_user_id: company.owner_user_id || '',
          })}
        />
      )}

      {/* Section 2: Leads */}
      {section === 'leads' && (
        <CRMLeadsList
          leads={leads}
          activities={activities}
          assignees={assignees}
          loading={loading}
          staleDays={Number(automationRule.days) || 7}
          search={search}
          onSearch={setSearch}
          status={status}
          onStatus={setStatus}
          source={source}
          onSource={setSource}
          owner={owner}
          onOwner={setOwner}
          savedFilters={savedFilters}
          onApplyFilter={(filters) => {
            setSearch(filters.search || '');
            setStatus(filters.status || '');
            setSource(filters.source || '');
            setOwner(filters.owner || '');
          }}
          onSaveFilter={saveFilter}
          onAdd={() => openModal('lead')}
          onLogActivity={(lead) => openModal('task', {
            record_type: 'lead',
            record_id: lead.id,
            activity_type: 'call',
            title: `مكالمة متابعة: ${lead.name}`,
          })}
          onConvert={(lead) => convertLead(lead.id)}
          onEdit={(lead) => openModal('lead', {
            id: lead.id,
            name: lead.name,
            phone: lead.phone || '',
            email: lead.email || '',
            company_id: lead.company_id || '',
            source: lead.source || '',
            status: lead.status || 'new',
            owner_user_id: lead.owner_user_id || '',
            notes: lead.notes || '',
            expected_value: lead.expected_value || '',
          })}
          onDelete={(lead) => setLeadToDelete({ id: lead.id, name: lead.name })}
          onStatusChange={(lead, nextStatus) => updateLeadStatus(lead.id, nextStatus)}
        />
      )}

      {/* Section 3: Tasks & Activities */}
      {section === 'tasks' && (
        <CRMActivitiesList
          activities={activities}
          loading={loading}
          onAdd={() => openModal('task')}
          onComplete={completeActivity}
        />
      )}

      {/* Section 4: Custom Fields */}
      {section === 'fields' && (
        <CRMCustomFields
          entity={fieldEntity}
          onEntity={setFieldEntity}
          fieldsByEntity={fieldsByEntity}
          loading={loading}
          onAdd={() => openFieldModal()}
          onEdit={openFieldModal}
          onDelete={setFieldToDelete}
          onMove={moveCustomField}
        />
      )}

      {/* Section 5: Automation */}
      {section === 'automation' && (
        <CRMAutomationPanel rule={automationRule} onChange={setAutomationRule} onSubmit={saveAutomationRule} />
      )}

      {/* =========================================================================
          MODALS
         ========================================================================= */}

      {/* Company Modal */}
      {activeModal === 'company' && (
        <CRMModal
          icon={BuildingIcon}
          title={form.id ? 'تعديل بيانات الشركة' : 'إضافة شركة / فرع جديد'}
          subtitle="الشركة بتجمع عملاءها وصفقاتها في مكان واحد. الاسم بس هو المطلوب."
          onClose={closeModal}
        >
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
        </CRMModal>
      )}

      {/* Lead Modal */}
      {activeModal === 'lead' && (
        <CRMModal
          icon={UserPlusIcon}
          title={form.id ? 'تعديل بيانات العميل المحتمل' : 'تسجيل عميل محتمل جديد'}
          subtitle="شخص مهتم لسه ما اشتراش. لما يشتري حوّله لعميل من القائمة."
          onClose={closeModal}
        >
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
                  <div className="crm-form-group">
                    <label className="crm-form-label">القيمة المتوقعة (ج.م)</label>
                    <Input className="crm-form-input" type="number" min="0" step="0.01" value={form.expected_value ?? ''} onChange={updateForm('expected_value')} placeholder="0" />
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
        </CRMModal>
      )}

      {/* Task Modal */}
      {activeModal === 'task' && (
        <CRMModal
          icon={CalendarIcon}
          title="تسجيل نشاط / تذكير جديد"
          subtitle="حدد موعد وهيظهر في جدول المتابعة يوم ما ييجي."
          onClose={closeModal}
        >
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
        </CRMModal>
      )}

      {/* Field Modal: add, or edit the label / required / choices of an existing field */}
      {activeModal === 'field' && (
        <CRMModal
          icon={SlidersIcon}
          title={fieldForm.id ? `تعديل الحقل «${fieldForm.label}»` : `إضافة حقل مخصص لـ${FIELD_ENTITIES.find((item) => item.id === fieldEntity)?.label}`}
          subtitle="الحقل هيظهر في ملف كل سجل من النوع ده."
          onClose={closeModal}
        >
            <form onSubmit={saveCustomField}>
              <div className="crm-modal-body">
                <div className="crm-form-grid">
                  <div className="crm-form-group">
                    <label className="crm-form-label">اسم الحقل بالعربية <span className="required">*</span></label>
                    <Input className="crm-form-input" value={fieldForm.label} onChange={(e) => setFieldForm({ ...fieldForm, label: e.target.value })} required maxLength={80} placeholder="مثال: الرقم الضريبي" />
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">المفتاح البرمجي (English) <span className="required">*</span></label>
                    <Input className="crm-form-input" value={fieldForm.field_key} onChange={(e) => setFieldForm({ ...fieldForm, field_key: e.target.value })} required pattern="[a-z][a-z0-9_]*" maxLength={40} placeholder="tax_number" disabled={Boolean(fieldForm.id)} />
                  </div>
                  <div className="crm-form-group">
                    <label className="crm-form-label">نوع البيانات</label>
                    <select className="crm-form-select" value={fieldForm.field_type} onChange={(e) => setFieldForm({ ...fieldForm, field_type: e.target.value })} disabled={Boolean(fieldForm.id)}>
                      {Object.entries(FIELD_TYPES).map(([value, { label }]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                    {fieldForm.id && <small className="crm-form-hint">المفتاح والنوع مش بيتغيروا بعد الإنشاء عشان القيم المحفوظة.</small>}
                  </div>
                  <div className="crm-form-group crm-field-required-group">
                    <label className="crm-form-checkbox-label crm-field-required-label">
                      <input type="checkbox" checked={fieldForm.is_required} onChange={(e) => setFieldForm({ ...fieldForm, is_required: e.target.checked })} />
                      <strong>حقل مطلوب وإلزامي</strong>
                    </label>
                  </div>
                  {fieldForm.field_type === 'select' && (
                    <div className="crm-form-group full-width">
                      <label className="crm-form-label" htmlFor="crm-field-options">الاختيارات (كل اختيار في سطر) <span className="required">*</span></label>
                      <textarea
                        id="crm-field-options"
                        className="crm-form-textarea"
                        rows="4"
                        required
                        value={fieldForm.optionsText}
                        onChange={(e) => setFieldForm({ ...fieldForm, optionsText: e.target.value })}
                        placeholder={'كاش\nآجل\nتحويل بنكي'}
                      />
                    </div>
                  )}
                </div>
              </div>
              <div className="crm-modal-footer">
                <button type="button" className="secondary-btn" onClick={closeModal}>إلغاء</button>
                <button type="submit" className="primary-btn">{fieldForm.id ? 'حفظ التعديل' : 'إنشاء الحقل'}</button>
              </div>
            </form>
        </CRMModal>
      )}

      {fieldToDelete && (
        <div className="crm-modal-backdrop crm-delete-backdrop" onClick={() => setFieldToDelete(null)}>
          <section
            className="crm-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-delete-field-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="crm-delete-field-title">حذف الحقل المخصص</h3>
            <p>
              سيتم حذف الحقل «{fieldToDelete.label}» وكل القيم المسجلة فيه لكل السجلات. لا يمكن التراجع عن هذا الإجراء.
            </p>
            {error && <div className="crm-error-banner" role="alert">{error}</div>}
            <div className="crm-drawer-actions">
              <button type="button" className="secondary-btn" onClick={() => setFieldToDelete(null)}>إلغاء</button>
              <button type="button" className="crm-confirm-danger" onClick={deleteCustomField}>حذف نهائي</button>
            </div>
          </section>
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

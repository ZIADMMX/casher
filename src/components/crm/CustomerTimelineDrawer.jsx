import { useState, useEffect, useCallback } from 'react';
import Input from '../ui/Input.jsx';
import '../../styles/crm.css';

const INTERACTION_TYPES = [
  { value: 'call', label: 'مكالمة هاتفية' },
  { value: 'note', label: 'ملاحظة داخلية' },
  { value: 'message', label: 'رسالة واتساب / نصية' },
  { value: 'complaint', label: 'شكوى / بلاغ' },
  { value: 'offer', label: 'عرض مخصص' }
];

const STAGES = [
  { value: 'lead', label: 'عميل محتمل (Lead)' },
  { value: 'qualified', label: 'مؤهل (Qualified)' },
  { value: 'proposal', label: 'عرض سعر (Proposal)' },
  { value: 'won', label: 'صفقة ناجحة (Won)' },
  { value: 'lost', label: 'صفقة خاسرة (Lost)' }
];

const TIERS = [
  { value: 'Regular', label: 'عادي (Regular)' },
  { value: 'Silver', label: 'فضي (Silver)' },
  { value: 'Gold', label: 'ذهبي (Gold)' },
  { value: 'VIP', label: 'كبار الشخصيات (VIP)' }
];

function RenderItemIcon({ type }) {
  const iconProps = { width: 14, height: 14, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" };
  switch (type) {
    case 'sale':
      return <svg {...iconProps}><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" /></svg>;
    case 'return':
      return <svg {...iconProps}><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg>;
    case 'payment':
      return <svg {...iconProps}><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>;
    case 'debt':
      return <svg {...iconProps}><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>;
    case 'call':
      return <svg {...iconProps}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>;
    case 'note':
      return <svg {...iconProps}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>;
    case 'message':
      return <svg {...iconProps}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
    case 'complaint':
      return <svg {...iconProps}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>;
    case 'offer':
      return <svg {...iconProps}><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>;
    case 'opportunity':
      return <svg {...iconProps}><rect x="2" y="7" width="20" height="14" rx="2" ry="2" /><path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" /></svg>;
    default:
      return <svg {...iconProps}><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><polyline points="13 2 13 9 20 9" /></svg>;
  }
}

function CustomerTimelineDrawer({ customer, onClose, onCustomerUpdated, crmMode = false, isAdmin = false }) {
  const customerId = customer?.id;
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('timeline');
  const [confirmAnonymize, setConfirmAnonymize] = useState(false);
  const [crmNotes, setCrmNotes] = useState([]);
  const [crmAttachments, setCrmAttachments] = useState([]);
  const [crmRelationships, setCrmRelationships] = useState([]);
  const [crmCustomers, setCrmCustomers] = useState([]);
  const [customFields, setCustomFields] = useState([]);
  const [customFieldValues, setCustomFieldValues] = useState({});
  const [relationshipForm, setRelationshipForm] = useState({ to_customer_id: '', relationship_type: 'manager' });
  const [crmAudit, setCrmAudit] = useState([]);
  const [crmTags, setCrmTags] = useState([]);
  const [tagDraft, setTagDraft] = useState('');
  const [noteDraft, setNoteDraft] = useState('');
  const [emailConsent, setEmailConsent] = useState(Boolean(customer?.email_consent));
  const [smsConsent, setSmsConsent] = useState(Boolean(customer?.sms_consent));

  // Interaction Form state
  const [interactionForm, setInteractionForm] = useState({
    type: 'call',
    subject: '',
    description: '',
    follow_up_date: ''
  });

  // Opportunity Form state
  const [oppForm, setOppForm] = useState({
    title: '',
    stage: 'lead',
    expected_value: '',
    expected_close_date: '',
    notes: ''
  });

  // Rating & Tier state
  const [rating, setRating] = useState(customer?.rating || 5);
  const [tier, setTier] = useState(customer?.tier || 'Regular');

  const fetchTimeline = async () => {
    if (!customer?.id) return;
    setLoading(true);
    try {
      const data = await window.electronAPI.getUnifiedTimeline(customer.id);
      setTimeline(data || []);
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
      setError('فشل تحميل السجل الموحد للعميل');
    } finally {
      setLoading(false);
    }
  };

  const fetchCRMDetails = useCallback(async () => {
    if (!crmMode || !customerId) return;
    try {
      const [notes, tags, audit, attachments, relationships, customers, fields, fieldValues] = await Promise.all([
        window.electronAPI.getCRMNotes('customer', customerId),
        window.electronAPI.getCRMRecordTags('customer', customerId),
        window.electronAPI.getCRMAuditLog('customer', customerId),
        window.electronAPI.getCRMAttachments('customer', customerId),
        window.electronAPI.getCRMCustomerRelationships(customerId),
        window.electronAPI.getAllCustomersWithStats(),
        window.electronAPI.getCRMCustomFields('customer'),
        window.electronAPI.getCRMCustomFieldValues('customer', customerId),
      ]);
      setCrmNotes(notes || []);
      setCrmAttachments(attachments || []);
      setCrmRelationships(relationships || []);
      setCrmCustomers(customers || []);
      setCustomFields(fields || []);
      setCustomFieldValues(fieldValues || {});
      setCrmTags(tags || []);
      setTagDraft((tags || []).map((tag) => tag.name).join(', '));
      setCrmAudit(audit || []);
    } catch (detailsError) {
      setError(detailsError.message || 'تعذر تحميل بيانات CRM للعميل');
    }
  }, [crmMode, customerId]);

  useEffect(() => {
    if (!customer?.id) return;
    setLoading(true);
    window.electronAPI.getUnifiedTimeline(customer.id)
      .then(data => setTimeline(data || []))
      .catch(err => {
        console.error('Failed to fetch timeline:', err);
        setError('فشل تحميل السجل الموحد للعميل');
      })
      .finally(() => setLoading(false));

    setRating(customer?.rating || 5);
    setTier(customer?.tier || 'Regular');
    setEmailConsent(Boolean(customer?.email_consent));
    setSmsConsent(Boolean(customer?.sms_consent));
    fetchCRMDetails();
  }, [
    customer?.id,
    customer?.rating,
    customer?.tier,
    customer?.email_consent,
    customer?.sms_consent,
    fetchCRMDetails,
  ]);

  const handleAddInteraction = async (e) => {
    e.preventDefault();
    if (!interactionForm.subject.trim()) return;
    try {
      await window.electronAPI.addCRMInteraction({
        customer_id: customer.id,
        type: interactionForm.type,
        subject: interactionForm.subject,
        details: interactionForm.description,
        follow_up_date: interactionForm.follow_up_date || null
      });
      setInteractionForm({ type: 'call', subject: '', description: '', follow_up_date: '' });
      setActiveTab('timeline');
      await fetchTimeline();
    } catch (err) {
      console.error('Failed to add interaction:', err);
      setError(err.message || 'خطأ أثناء تسجيل التواصل');
    }
  };

  const handleCreateOpportunity = async (e) => {
    e.preventDefault();
    if (!oppForm.title.trim()) return;
    try {
      await window.electronAPI.createCRMOpportunity({
        customer_id: customer.id,
        title: oppForm.title,
        stage: oppForm.stage,
        expected_value: Number(oppForm.expected_value) || 0,
        expected_close_date: oppForm.expected_close_date || null,
        notes: oppForm.notes
      });
      setOppForm({ title: '', stage: 'lead', expected_value: '', expected_close_date: '', notes: '' });
      setActiveTab('timeline');
      await fetchTimeline();
    } catch (err) {
      console.error('Failed to create opportunity:', err);
      setError(err.message || 'خطأ أثناء إنشاء فرصة البيع');
    }
  };

  const handleUpdateRatingAndTier = async (e) => {
    e.preventDefault();
    try {
      await window.electronAPI.updateCustomerRatingAndTier({
        customer_id: customer.id,
        rating,
        tier
      });
      if (onCustomerUpdated) onCustomerUpdated();
      setActiveTab('timeline');
    } catch (err) {
      console.error('Failed to update rating/tier:', err);
      setError(err.message || 'خطأ أثناء تحديث التصنيف');
    }
  };

  const saveCRMDetails = async (event) => {
    event.preventDefault();
    try {
      await Promise.all([
        window.electronAPI.setCRMCustomerConsent(customer.id, {
          email_consent: emailConsent,
          sms_consent: smsConsent,
        }),
        window.electronAPI.setCRMRecordTags({
          record_type: 'customer',
          record_id: customer.id,
          tags: tagDraft.split(',').map((t) => t.trim()).filter(Boolean),
        }),
        window.electronAPI.setCRMCustomFieldValues('customer', customer.id, customFieldValues),
      ]);
      await fetchCRMDetails();
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (saveError) {
      setError(saveError.message || 'تعذر حفظ بيانات CRM');
    }
  };

  const saveCRMNote = async (event) => {
    event.preventDefault();
    try {
      await window.electronAPI.createCRMNote({
        record_type: 'customer',
        record_id: customer.id,
        body: noteDraft,
      });
      setNoteDraft('');
      await fetchCRMDetails();
    } catch (noteError) {
      setError(noteError.message || 'تعذر إضافة الملاحظة');
    }
  };

  const addAttachment = async () => {
    try {
      const result = await window.electronAPI.selectCRMFileAttachment('customer', customer.id);
      if (result && !result.canceled) await fetchCRMDetails();
    } catch (attachmentError) {
      setError(attachmentError.message || 'تعذر حفظ الملف المرفق');
    }
  };

  const openAttachment = async (attachmentId) => {
    try {
      await window.electronAPI.openCRMAttachment(attachmentId);
    } catch (attachmentError) {
      setError(attachmentError.message || 'تعذر فتح الملف المرفق');
    }
  };

  const addRelationship = async (event) => {
    event.preventDefault();
    try {
      await window.electronAPI.createCRMCustomerRelationship({
        from_customer_id: customer.id,
        to_customer_id: Number(relationshipForm.to_customer_id),
        relationship_type: relationshipForm.relationship_type,
      });
      setRelationshipForm({ to_customer_id: '', relationship_type: 'manager' });
      await fetchCRMDetails();
    } catch (relationshipError) {
      setError(relationshipError.message || 'تعذر حفظ العلاقة');
    }
  };

  const anonymizeCustomer = async () => {
    try {
      await window.electronAPI.anonymizeCRMCustomer(customer.id);
      if (onCustomerUpdated) onCustomerUpdated();
      setConfirmAnonymize(false);
      onClose();
    } catch (privacyError) {
      setError(privacyError.message || 'تعذر تنفيذ طلب الخصوصية');
    }
  };

  return (
    <div className="modal-overlay crm-drawer-overlay" onClick={onClose}>
      <div
        className="modal-box crm-drawer-box"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header crm-drawer-header">
          <div>
            <h3 className="crm-drawer-title">
              السجل الموحد للعميل: {customer?.name}
            </h3>
            <div className="crm-drawer-meta">
              <span>الهاتف: {customer?.phone || 'بدون هاتف'}</span>
              <span>التقييم: {customer?.rating || 5} / 5</span>
              <span className="badge badge-primary">{customer?.tier || 'Regular'}</span>
            </div>
          </div>
          <button type="button" className="modal-close-btn" onClick={onClose}>✕</button>
        </div>

        {/* Tab Buttons */}
        <div className="crm-drawer-tabs" role="tablist" aria-label="سجل العميل">
          <button 
            type="button" 
            className={`secondary-btn crm-drawer-tab ${activeTab === 'timeline' ? 'active-tab-btn' : ''}`}
            aria-pressed={activeTab === 'timeline'}
            onClick={() => setActiveTab('timeline')}
          >
            السجل الزمني الموحد (Timeline)
          </button>
          <button 
            type="button" 
            className={`secondary-btn crm-drawer-tab ${activeTab === 'add_interaction' ? 'active-tab-btn' : ''}`}
            aria-pressed={activeTab === 'add_interaction'}
            onClick={() => setActiveTab('add_interaction')}
          >
            + تسجيل تواصل / ملاحظة
          </button>
          <button 
            type="button" 
            className={`secondary-btn crm-drawer-tab ${activeTab === 'add_opportunity' ? 'active-tab-btn' : ''}`}
            aria-pressed={activeTab === 'add_opportunity'}
            onClick={() => setActiveTab('add_opportunity')}
          >
            + فرصة بيع جديدة
          </button>
          <button 
            type="button" 
            className={`secondary-btn crm-drawer-tab ${activeTab === 'edit_rating' ? 'active-tab-btn' : ''}`}
            aria-pressed={activeTab === 'edit_rating'}
            onClick={() => setActiveTab('edit_rating')}
          >
            التقييم والتصنيف
          </button>
          {crmMode && (
            <button
              type="button"
              className={`secondary-btn crm-drawer-tab ${activeTab === 'crm_details' ? 'active-tab-btn' : ''}`}
              aria-pressed={activeTab === 'crm_details'}
              onClick={() => setActiveTab('crm_details')}
            >
              بيانات CRM والخصوصية
            </button>
          )}
        </div>

        {error && (
          <div className="crm-error-banner crm-drawer-error" role="alert">
            {error}
          </div>
        )}

        {/* Body Content */}
        <div className="crm-drawer-body">

          {/* TAB 1: UNIFIED TIMELINE */}
          {activeTab === 'timeline' && (
            <div>
              {loading ? (
                <div className="crm-drawer-loading" role="status">
                  جاري تحميل السجل الزمني الموحد...
                </div>
              ) : timeline.length === 0 ? (
                <div className="crm-empty-state">
                  لا توجد تفاعلات أو سجلات سابقة لهذا العميل.
                </div>
              ) : (
                <div className="crm-timeline">
                  <div className="crm-timeline-line" />

                  {timeline.map((item, idx) => (
                    <div key={`${item.kind}-${item.id}-${idx}`} className="crm-timeline-item">
                      <span className="crm-timeline-marker">
                        <RenderItemIcon type={item.type} />
                      </span>

                      <div className="crm-timeline-card">
                        <div className="crm-timeline-heading">
                          <span className="crm-timeline-title">
                            {item.title}
                          </span>
                          <span className="crm-timeline-date">
                            {new Date(item.created_at).toLocaleString('ar-EG')}
                          </span>
                        </div>

                        {item.details && (
                          <p className="crm-timeline-details">
                            {item.details}
                          </p>
                        )}

                        <div className="crm-timeline-meta">
                          {item.amount != null && item.amount > 0 && (
                            <span className="crm-timeline-amount">
                              {Number(item.amount).toLocaleString()} ج.م
                            </span>
                          )}
                          {item.follow_up_date && (
                            <span className="crm-timeline-followup">
                              تذكير متابعة: {new Date(item.follow_up_date).toLocaleDateString('ar-EG')}
                            </span>
                          )}
                          {item.creator_name && (
                            <span className="crm-timeline-creator">
                              بواسطة: {item.creator_name}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: ADD INTERACTION */}
          {activeTab === 'add_interaction' && (
            <form onSubmit={handleAddInteraction} className="crm-drawer-form">
              <div>
                <label className="crm-drawer-field-label">نوع التفاعل:</label>
                <select 
                  value={interactionForm.type} 
                  onChange={(e) => setInteractionForm({ ...interactionForm, type: e.target.value })}
                  className="crm-drawer-control"
                >
                  {INTERACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="crm-drawer-field-label">الموضوع / العنوان الرئيسي <span className="crm-required">*</span>:</label>
                <input 
                  type="text" 
                  placeholder="مثال: مكالمة استفسار عن منتج جديد، أو متابعة تحصيل"
                  value={interactionForm.subject}
                  onChange={(e) => setInteractionForm({ ...interactionForm, subject: e.target.value })}
                  required
                  className="crm-drawer-control"
                />
              </div>

              <div>
                <label className="crm-drawer-field-label">التفاصيل والملاحظات:</label>
                <textarea 
                  rows="4" 
                  placeholder="اكتب ملخص ما تم مناقشته مع العميل..."
                  value={interactionForm.description}
                  onChange={(e) => setInteractionForm({ ...interactionForm, description: e.target.value })}
                  className="crm-drawer-control"
                />
              </div>

              <div>
                <label className="crm-drawer-field-label">تاريخ تذكير المتابعة القادمة (اختياري):</label>
                <input 
                  type="date" 
                  value={interactionForm.follow_up_date}
                  onChange={(e) => setInteractionForm({ ...interactionForm, follow_up_date: e.target.value })}
                  className="crm-drawer-control"
                />
              </div>

              <div className="crm-drawer-actions">
                <button type="button" className="secondary-btn" onClick={() => setActiveTab('timeline')}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ التفاعل</button>
              </div>
            </form>
          )}

          {/* TAB 3: ADD OPPORTUNITY */}
          {activeTab === 'add_opportunity' && (
            <form onSubmit={handleCreateOpportunity} className="crm-drawer-form">
              <div>
                <label className="crm-drawer-field-label">عنوان صفقة البيع <span className="crm-required">*</span>:</label>
                <input 
                  type="text" 
                  placeholder="مثال: توريد كمية أجهزة للمكتب، أو اتفاقية سنوية"
                  value={oppForm.title}
                  onChange={(e) => setOppForm({ ...oppForm, title: e.target.value })}
                  required
                  className="crm-drawer-control"
                />
              </div>

              <div className="crm-drawer-two-column">
                <div>
                  <label className="crm-drawer-field-label">مرحلة الصفقة:</label>
                  <select 
                    value={oppForm.stage} 
                    onChange={(e) => setOppForm({ ...oppForm, stage: e.target.value })}
                    className="crm-drawer-control"
                  >
                    {STAGES.map(s => (
                      <option key={s.value} value={s.value}>{s.label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="crm-drawer-field-label">القيمة المتوقعة (ج.م):</label>
                  <input 
                    type="number" 
                    min="0" 
                    step="0.01"
                    placeholder="0.00"
                    value={oppForm.expected_value}
                    onChange={(e) => setOppForm({ ...oppForm, expected_value: e.target.value })}
                    className="crm-drawer-control"
                  />
                </div>
              </div>

              <div>
                <label className="crm-drawer-field-label">تاريخ الإغلاق المتوقع:</label>
                <input 
                  type="date" 
                  value={oppForm.expected_close_date}
                  onChange={(e) => setOppForm({ ...oppForm, expected_close_date: e.target.value })}
                  className="crm-drawer-control"
                />
              </div>

              <div>
                <label className="crm-drawer-field-label">ملاحظات ومستجدات الصفقة:</label>
                <textarea 
                  rows="3" 
                  placeholder="ملاحظات حول العرض المقدم أو الشروط..."
                  value={oppForm.notes}
                  onChange={(e) => setOppForm({ ...oppForm, notes: e.target.value })}
                  className="crm-drawer-control"
                />
              </div>

              <div className="crm-drawer-actions">
                <button type="button" className="secondary-btn" onClick={() => setActiveTab('timeline')}>إلغاء</button>
                <button type="submit" className="primary-btn">إنشاء فرصة البيع</button>
              </div>
            </form>
          )}

          {/* TAB 4: RATING AND TIER */}
          {activeTab === 'edit_rating' && (
            <form onSubmit={handleUpdateRatingAndTier} className="crm-drawer-form">
              <div>
                <label className="crm-drawer-field-label">تصنيف العميل (Customer Tier):</label>
                <select 
                  value={tier}
                  onChange={(e) => setTier(e.target.value)}
                  className="crm-drawer-control"
                >
                  {TIERS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="crm-drawer-field-label">تقييم العميل (من 1 إلى 5 نجوم):</label>
                <div className="crm-rating-stars">
                  {[1, 2, 3, 4, 5].map(star => (
                    <span 
                      key={star} 
                      onClick={() => setRating(star)}
                      className={star <= rating ? 'is-selected' : ''}
                    >
                      ★
                    </span>
                  ))}
                  <span className="crm-rating-value">
                    ({rating} نجوم)
                  </span>
                </div>
              </div>

              <div className="crm-drawer-actions">
                <button type="button" className="secondary-btn" onClick={() => setActiveTab('timeline')}>إلغاء</button>
                <button type="submit" className="primary-btn">حفظ التعديلات</button>
              </div>
            </form>
          )}

          {/* TAB 5: CRM DETAILS & PRIVACY */}
          {activeTab === 'crm_details' && crmMode && (
            <div className="crm-details">
              {/* Consent & Tags Card */}
              <div className="crm-overview-panel crm-details-panel">
                <form onSubmit={saveCRMDetails} className="crm-details-form">
                  <h4 className="crm-details-heading">موافقات التواصل والوسوم</h4>
                  
                  <div className="crm-consent-options">
                    <label className="crm-form-checkbox-label">
                      <input type="checkbox" checked={emailConsent} onChange={(event) => setEmailConsent(event.target.checked)} />
                      موافقة التواصل عبر البريد الإلكتروني
                    </label>
                    <label className="crm-form-checkbox-label">
                      <input type="checkbox" checked={smsConsent} onChange={(event) => setSmsConsent(event.target.checked)} />
                      موافقة التواصل عبر الرسائل النصية
                    </label>
                  </div>

                  <div className="crm-form-group">
                    <label className="crm-form-label">الوسوم الحالية: <span className="crm-muted-inline">{crmTags.map((tag) => tag.name).join('، ') || 'لا توجد'}</span></label>
                    <Input className="crm-form-input" value={tagDraft} onChange={(event) => setTagDraft(event.target.value)} placeholder="استبدال الوسوم (افصل بينها بفاصلة)..." />
                  </div>

                  {customFields.length > 0 && (
                    <div className="crm-custom-fields">
                      <h5 className="crm-details-subheading">الحقول المخصصة</h5>
                      <div className="crm-form-grid">
                        {customFields.map((field) => (
                          <div className="crm-form-group" key={field.id}>
                            <label className="crm-form-label">
                              {field.label}
                              {field.is_required ? <span className="required">*</span> : ''}
                            </label>
                            {field.field_type === 'boolean' ? (
                              <label className="crm-form-checkbox-label">
                                <input
                                  type="checkbox"
                                  checked={customFieldValues[field.field_key] === 'true'}
                                  onChange={(event) => setCustomFieldValues({
                                    ...customFieldValues,
                                    [field.field_key]: String(event.target.checked),
                                  })}
                                />
                                نعم / مفعل
                              </label>
                            ) : (
                              <Input
                                className="crm-form-input"
                                type={field.field_type === 'number' || field.field_type === 'date' ? field.field_type : 'text'}
                                value={customFieldValues[field.field_key] || ''}
                                onChange={(event) => setCustomFieldValues({
                                  ...customFieldValues,
                                  [field.field_key]: event.target.value,
                                })}
                                required={Boolean(field.is_required)}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="crm-details-submit">
                    <button type="submit" className="primary-btn">حفظ التغييرات</button>
                  </div>
                </form>
              </div>

              {/* Internal Notes Card */}
              <div className="crm-overview-panel crm-details-panel">
                <form onSubmit={saveCRMNote} className="crm-details-note-form">
                  <h4 className="crm-details-heading">إضافة ملاحظة داخلية</h4>
                  <textarea className="crm-form-textarea" value={noteDraft} onChange={(event) => setNoteDraft(event.target.value)} required maxLength={10000} rows="3" placeholder="ملاحظة خاصة بفريق العمل..." />
                  <div className="crm-details-submit">
                    <button type="submit" className="secondary-btn">تسجيل الملاحظة</button>
                  </div>
                </form>

                <div className="crm-notes-list">
                  <h5 className="crm-details-subheading">الملاحظات السابقة ({crmNotes.length})</h5>
                  {crmNotes.map((note) => (
                    <div key={note.id} className="crm-note-card">
                      <p className="crm-note-body">{note.body}</p>
                      <small className="crm-muted-meta">{note.username || 'المستخدم'} · {new Date(note.created_at).toLocaleString('ar-EG')}</small>
                    </div>
                  ))}
                  {crmNotes.length === 0 && <p className="crm-empty-message">لا توجد ملاحظات داخلية بعد.</p>}
                </div>
              </div>

              {/* Attachments Card */}
              <div className="crm-overview-panel crm-details-panel">
                <div className="crm-attachments-header">
                  <h4 className="crm-details-heading">الملفات والمستندات المرفقة</h4>
                  <button type="button" className="secondary-btn" onClick={addAttachment}>+ إرفاق ملف</button>
                </div>
                <div className="crm-attachments-list">
                  {crmAttachments.map((attachment) => (
                    <div key={attachment.id} className="crm-attachment-row">
                      <button type="button" className="secondary-btn crm-attachment-link" onClick={() => openAttachment(attachment.id)}>
                        {attachment.file_name}
                      </button>
                      <small className="crm-muted-meta">{(attachment.size_bytes / 1024).toFixed(1)} KB · {attachment.created_at}</small>
                    </div>
                  ))}
                  {crmAttachments.length === 0 && <p className="crm-empty-message">لا توجد ملفات مرفقة.</p>}
                </div>
              </div>

              {/* Relationships Card */}
              <div className="crm-overview-panel crm-details-panel">
                <h4 className="crm-details-heading">علاقات وشبكة العميل</h4>
                <form onSubmit={addRelationship} className="crm-relationship-form">
                  <select
                    className="crm-form-select crm-relationship-customer"
                    value={relationshipForm.to_customer_id}
                    onChange={(event) => setRelationshipForm({ ...relationshipForm, to_customer_id: event.target.value })}
                    required
                  >
                    <option value="">اختر العميل المرتبط...</option>
                    {crmCustomers.filter((item) => item.id !== customer.id).map((item) => (
                      <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                  </select>
                  <select
                    className="crm-form-select crm-relationship-type"
                    value={relationshipForm.relationship_type}
                    onChange={(event) => setRelationshipForm({ ...relationshipForm, relationship_type: event.target.value })}
                  >
                    <option value="manager">مدير</option>
                    <option value="partner">شريك</option>
                    <option value="referrer">محيل</option>
                  </select>
                  <button type="submit" className="secondary-btn">ربط العميلين</button>
                </form>

                <div className="crm-relationship-list">
                  {crmRelationships.map((relationship) => (
                    <div key={relationship.id} className="crm-relationship-row">
                      <strong>{relationship.related_customer_name}</strong>
                      <span className="crm-badge open">{relationship.relationship_type === 'manager' ? 'مدير' : relationship.relationship_type === 'partner' ? 'شريك' : 'محيل'}</span>
                    </div>
                  ))}
                  {crmRelationships.length === 0 && <p className="crm-empty-message">لا توجد علاقات مسجلة.</p>}
                </div>
              </div>

              {/* Audit Log Card */}
              <div className="crm-overview-panel crm-details-panel">
                <h4 className="crm-details-heading">سجل التغييرات والتدقيق</h4>
                <div className="crm-audit-list">
                  {crmAudit.slice(0, 8).map((entry) => (
                    <div key={entry.id} className="crm-audit-row">
                      <span>{entry.action} ({entry.username || 'النظام'})</span>
                      <span>{new Date(entry.created_at).toLocaleDateString('ar-EG')}</span>
                    </div>
                  ))}
                  {!crmAudit.length && <p className="crm-empty-message">لا توجد أحداث مسجلة بعد.</p>}
                </div>
              </div>

              {/* Privacy / Anonymize button */}
              {isAdmin && (
                <div className="crm-privacy-actions">
                  <button type="button" className="secondary-btn crm-danger-outline-btn" onClick={() => setConfirmAnonymize(true)}>
                    طلب حذف / إخفاء بيانات العميل (GDPR/خصوصية)
                  </button>
                </div>
              )}
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="modal-footer crm-drawer-footer">
          <button type="button" className="secondary-btn" onClick={onClose}>إغلاق</button>
        </div>
      </div>

      {confirmAnonymize && (
        <div
          className="crm-confirm-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            setConfirmAnonymize(false);
          }}
        >
          <section
            className="crm-confirm-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="crm-anonymize-title"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 id="crm-anonymize-title">تأكيد إخفاء بيانات العميل</h3>
            <p>سيتم إخفاء بيانات الاتصال وتعطيل سجل العميل مع الحفاظ على سجلات البيع المطلوبة محاسبيًا. هل تريد المتابعة؟</p>
            <div className="crm-drawer-actions">
              <button type="button" className="secondary-btn" onClick={() => setConfirmAnonymize(false)}>إلغاء</button>
              <button type="button" className="crm-confirm-danger" onClick={anonymizeCustomer}>تأكيد الإخفاء</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default CustomerTimelineDrawer;

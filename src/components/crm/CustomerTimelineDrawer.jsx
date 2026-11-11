import { useState, useEffect, useCallback } from 'react';
import Input from '../ui/Input.jsx';
import * as crmApi from '../../api/crm.js';
import * as customersApi from '../../api/customers.js';
import {
  BriefcaseIcon, CallIcon, CloseIcon, ClockIcon, ShieldIcon, StarIcon,
} from '../icons/PosIcons.jsx';
import { agoText, daysBetween, initials, money, num, parseDbDate } from './crmFormat.js';
import { openWhatsapp } from '../../utils/whatsapp.js';
import '../../styles/crm.css';
import '../../styles/crm-overview.css';

const INTERACTION_TYPES = [
  { value: 'call', label: 'مكالمة هاتفية' },
  { value: 'note', label: 'ملاحظة داخلية' },
  { value: 'message', label: 'رسالة واتساب / نصية' },
  { value: 'complaint', label: 'شكوى / بلاغ' },
  { value: 'offer', label: 'عرض مخصص' }
];

const STAGES = [
  { value: 'lead', label: 'عميل محتمل' },
  { value: 'qualified', label: 'مؤهل' },
  { value: 'proposal', label: 'عرض سعر' },
  { value: 'won', label: 'صفقة ناجحة' },
  { value: 'lost', label: 'صفقة خاسرة' }
];

// Same labels and tones as the contacts table; the stored values stay English.
const TIERS = [
  { value: 'Regular', label: 'عميل عادي', tone: 'info' },
  { value: 'Silver', label: 'عميل متكرر', tone: 'warning' },
  { value: 'Gold', label: 'عميل مميز', tone: 'success' },
  { value: 'VIP', label: 'كبار العملاء', tone: 'primary' }
];

const TABS = [
  { id: 'timeline', label: 'السجل الزمني', Icon: ClockIcon },
  { id: 'add_interaction', label: 'تسجيل تواصل', Icon: CallIcon },
  { id: 'add_opportunity', label: 'صفقة جديدة', Icon: BriefcaseIcon },
  { id: 'edit_rating', label: 'التقييم والتصنيف', Icon: StarIcon },
  { id: 'crm_details', label: 'بيانات CRM والخصوصية', Icon: ShieldIcon, crmOnly: true },
];

const MARKER_TONES = { sale: 'success', payment: 'info', return: 'warning', debt: 'warning', complaint: 'warning' };
const CONTACT_TYPES = new Set(['call', 'note', 'message', 'complaint', 'offer']);

/** The four numbers on top of the 360° window, from the unified timeline. */
export function summarizeTimeline(timeline, now = new Date()) {
  const summary = { sales: 0, salesTotal: 0, contacts: 0, lastContactDays: null };
  timeline.forEach((item) => {
    if (item.type === 'sale') {
      summary.sales += 1;
      summary.salesTotal += Number(item.amount) || 0;
    } else if (item.type === 'return') {
      summary.salesTotal -= Number(item.amount) || 0;
    }
    if (CONTACT_TYPES.has(item.type)) {
      summary.contacts += 1;
      const at = parseDbDate(item.created_at);
      const days = at ? daysBetween(at, now) : null;
      if (days !== null && (summary.lastContactDays === null || days < summary.lastContactDays)) summary.lastContactDays = days;
    }
  });
  return summary;
}

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
      const data = await crmApi.getUnifiedTimeline(customer.id);
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
        crmApi.getCRMNotes('customer', customerId),
        crmApi.getCRMRecordTags('customer', customerId),
        crmApi.getCRMAuditLog('customer', customerId),
        crmApi.getCRMAttachments('customer', customerId),
        crmApi.getCRMCustomerRelationships(customerId),
        customersApi.getAllCustomersWithStats(),
        crmApi.getCRMCustomFields('customer'),
        crmApi.getCRMCustomFieldValues('customer', customerId),
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
    crmApi.getUnifiedTimeline(customer.id)
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

  // Escape closes the window, unless the privacy confirmation is open on top of it.
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !confirmAnonymize) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose, confirmAnonymize]);

  const handleAddInteraction = async (e) => {
    e.preventDefault();
    if (!interactionForm.subject.trim()) return;
    try {
      await crmApi.addCRMInteraction({
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
      await crmApi.createCRMOpportunity({
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
      await crmApi.updateCustomerRatingAndTier({
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
        crmApi.setCRMCustomerConsent(customer.id, {
          email_consent: emailConsent,
          sms_consent: smsConsent,
        }),
        crmApi.setCRMRecordTags({
          record_type: 'customer',
          record_id: customer.id,
          tags: tagDraft.split(',').map((t) => t.trim()).filter(Boolean),
        }),
        crmApi.setCRMCustomFieldValues('customer', customer.id, customFieldValues),
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
      await crmApi.createCRMNote({
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
      const result = await crmApi.selectCRMFileAttachment('customer', customer.id);
      if (result && !result.canceled) await fetchCRMDetails();
    } catch (attachmentError) {
      setError(attachmentError.message || 'تعذر حفظ الملف المرفق');
    }
  };

  const openAttachment = async (attachmentId) => {
    try {
      await crmApi.openCRMAttachment(attachmentId);
    } catch (attachmentError) {
      setError(attachmentError.message || 'تعذر فتح الملف المرفق');
    }
  };

  const addRelationship = async (event) => {
    event.preventDefault();
    try {
      await crmApi.createCRMCustomerRelationship({
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
      await crmApi.anonymizeCRMCustomer(customer.id);
      if (onCustomerUpdated) onCustomerUpdated();
      setConfirmAnonymize(false);
      onClose();
    } catch (privacyError) {
      setError(privacyError.message || 'تعذر تنفيذ طلب الخصوصية');
    }
  };

  const tierInfo = TIERS.find((item) => item.value === (customer?.tier || 'Regular')) || TIERS[0];
  const customerRating = customer?.rating || 5;
  const summary = summarizeTimeline(timeline);
  const show = (value) => (loading ? '—' : value);

  return (
    <div className="modal-overlay crm-drawer-overlay" onClick={onClose}>
      <div
        className="modal-box crm-drawer-box"
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-drawer-title"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header crm-drawer-header">
          <span className="crm-ov-avatar crm-drawer-avatar" aria-hidden="true">{initials(customer?.name)}</span>
          <div className="crm-drawer-heading">
            <h3 id="crm-drawer-title" className="crm-drawer-title">{customer?.name}</h3>
            <div className="crm-drawer-meta">
              <span className="crm-drawer-phone">{customer?.phone || 'بدون هاتف'}</span>
              <span className={`crm-ct-badge crm-ct-badge--${tierInfo.tone}`}>{tierInfo.label}</span>
              <span className="crm-drawer-stars" role="img" aria-label={`التقييم ${customerRating} من 5`}>
                {[1, 2, 3, 4, 5].map((star) => (
                  <StarIcon key={star} size={14} className={star <= customerRating ? 'is-on' : ''} />
                ))}
              </span>
            </div>
          </div>
          {customer?.phone && (
            <button
              type="button"
              className="crm-ov-btn crm-ov-btn--sm"
              onClick={() => openWhatsapp(customer.phone, `أهلاً ${customer.name}،`)}
            >
              <CallIcon size={16} />
              واتساب
            </button>
          )}
          <button type="button" className="modal-close-btn" aria-label="إغلاق" onClick={onClose}>
            <CloseIcon size={18} />
          </button>
        </div>

        <div className="crm-drawer-summary">
          <div><span>إجمالي المشتريات</span><strong>{show(money(summary.salesTotal))}</strong></div>
          <div><span>عدد الفواتير</span><strong>{show(num(summary.sales))}</strong></div>
          <div><span>مرات التواصل</span><strong>{show(num(summary.contacts))}</strong></div>
          <div>
            <span>آخر تواصل</span>
            <strong>{show(summary.lastContactDays === null ? 'لا يوجد' : agoText(summary.lastContactDays))}</strong>
          </div>
        </div>

        {/* Tab Buttons */}
        <div className="crm-ov-tabs crm-drawer-tabs" role="tablist" aria-label="سجل العميل">
          {TABS.filter((tab) => crmMode || !tab.crmOnly).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              role="tab"
              className={`crm-ov-tab ${activeTab === id ? 'is-active' : ''}`}
              aria-selected={activeTab === id}
              onClick={() => setActiveTab(id)}
            >
              <Icon size={16} />
              {label}
            </button>
          ))}
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
                <div className="crm-ov-empty crm-ct-empty">
                  <span className="crm-ov-chip crm-ov-chip--lg"><ClockIcon size={22} /></span>
                  <strong>لسه مفيش سجل للعميل ده</strong>
                  <p>أي فاتورة أو مكالمة أو ملاحظة هتظهر هنا بالترتيب.</p>
                  <button type="button" className="crm-ov-btn crm-ov-btn--primary" onClick={() => setActiveTab('add_interaction')}>
                    <CallIcon size={18} />
                    تسجيل أول تواصل
                  </button>
                </div>
              ) : (
                <div className="crm-timeline">
                  <div className="crm-timeline-line" />

                  {timeline.map((item, idx) => (
                    <div key={`${item.kind}-${item.id}-${idx}`} className="crm-timeline-item">
                      <span className="crm-timeline-marker">
                        <span className={`crm-ov-chip crm-ov-chip--${MARKER_TONES[item.type] || 'muted'}`}>
                          <RenderItemIcon type={item.type} />
                        </span>
                      </span>

                      <div className="crm-timeline-card">
                        <div className="crm-timeline-heading">
                          <span className="crm-timeline-title">
                            {item.title}
                          </span>
                          <span className="crm-timeline-date">
                            {parseDbDate(item.created_at)?.toLocaleString('ar-EG', { dateStyle: 'medium', timeStyle: 'short' })}
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
                              {money(item.amount)}
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
                <label className="crm-drawer-field-label">نوع التفاعل</label>
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
                <label className="crm-drawer-field-label">الموضوع / العنوان الرئيسي <span className="crm-required">*</span></label>
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
                <label className="crm-drawer-field-label">التفاصيل والملاحظات</label>
                <textarea 
                  rows="4" 
                  placeholder="اكتب ملخص ما تم مناقشته مع العميل..."
                  value={interactionForm.description}
                  onChange={(e) => setInteractionForm({ ...interactionForm, description: e.target.value })}
                  className="crm-drawer-control"
                />
              </div>

              <div>
                <label className="crm-drawer-field-label">تاريخ تذكير المتابعة القادمة (اختياري)</label>
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
                <label className="crm-drawer-field-label">عنوان صفقة البيع <span className="crm-required">*</span></label>
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
                  <label className="crm-drawer-field-label">مرحلة الصفقة</label>
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
                  <label className="crm-drawer-field-label">القيمة المتوقعة (ج.م)</label>
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
                <label className="crm-drawer-field-label">تاريخ الإغلاق المتوقع</label>
                <input 
                  type="date" 
                  value={oppForm.expected_close_date}
                  onChange={(e) => setOppForm({ ...oppForm, expected_close_date: e.target.value })}
                  className="crm-drawer-control"
                />
              </div>

              <div>
                <label className="crm-drawer-field-label">ملاحظات ومستجدات الصفقة</label>
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
                <label className="crm-drawer-field-label">تصنيف العميل</label>
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
                <label className="crm-drawer-field-label">تقييم العميل (من 1 إلى 5 نجوم)</label>
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
                            ) : field.field_type === 'select' ? (
                              <select
                                className="crm-form-select"
                                value={customFieldValues[field.field_key] || ''}
                                onChange={(event) => setCustomFieldValues({
                                  ...customFieldValues,
                                  [field.field_key]: event.target.value,
                                })}
                                required={Boolean(field.is_required)}
                              >
                                <option value="">اختر...</option>
                                {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
                              </select>
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

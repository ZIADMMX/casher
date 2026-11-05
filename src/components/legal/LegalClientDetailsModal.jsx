import { useCallback, useEffect, useMemo, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import '../../styles/legalClientDetails.css';

const EMPTY_POWER = {
  number: '',
  issued_at: '',
  scope: '',
  expires_at: '',
  notes: '',
};

const CONTACT_TYPES = [
  ['call', 'مكالمة'],
  ['message', 'رسالة'],
  ['note', 'ملاحظة'],
  ['complaint', 'شكوى'],
];

const CONTACT_LABELS = Object.fromEntries(CONTACT_TYPES);

function formatDate(value) {
  if (!value) return '—';
  return new Date(`${String(value).slice(0, 10)}T12:00:00`).toLocaleDateString('ar-EG', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getPowerStatus(power) {
  if (!power.expires_at) return { label: 'ساري دون تاريخ انتهاء', className: 'legal-power-active' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(`${power.expires_at}T00:00:00`);
  const remainingDays = Math.ceil((expiry - today) / 86400000);
  if (remainingDays < 0) return { label: 'منتهي', className: 'legal-power-expired' };
  if (remainingDays <= 30) return { label: `ينتهي خلال ${remainingDays} يوم`, className: 'legal-power-warning' };
  return { label: 'ساري', className: 'legal-power-active' };
}

function getCaseStatus(status) {
  const labels = {
    active: 'نشطة',
    adjourned: 'مؤجلة',
    judged: 'صدر فيها حكم',
    closed: 'مغلقة',
    archived: 'مؤرشفة',
  };
  return labels[status] || status || '—';
}

export default function LegalClientDetailsModal({ customer, onClose, onOpenCases }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [cases, setCases] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [powers, setPowers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [powerForm, setPowerForm] = useState(EMPTY_POWER);
  const [editingPowerId, setEditingPowerId] = useState(null);
  const [savingPower, setSavingPower] = useState(false);
  const [contactForm, setContactForm] = useState({ type: 'call', subject: '', details: '', follow_up_date: '' });
  const [savingContact, setSavingContact] = useState(false);

  const loadDetails = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [clientCases, timeline, clientPowers] = await Promise.all([
        legalApi.getCasesByClientId(customer.id),
        legalApi.getLegalClientInteractions(customer.id),
        legalApi.getCustomerPowerOfAttorneys(customer.id),
      ]);
      setCases(Array.isArray(clientCases) ? clientCases : []);
      setContacts(Array.isArray(timeline) ? timeline : []);
      setPowers(Array.isArray(clientPowers) ? clientPowers : []);
    } catch (loadError) {
      console.error('تعذر تحميل ملف الموكل:', loadError);
      setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات الموكل');
    } finally {
      setLoading(false);
    }
  }, [customer.id]);

  useEffect(() => {
    loadDetails();
  }, [loadDetails]);

  const activeCasesCount = useMemo(
    () => cases.filter((legalCase) => ['active', 'adjourned'].includes(legalCase.status)).length,
    [cases]
  );

  function startPowerEdit(power) {
    setEditingPowerId(power.id);
    setPowerForm({
      number: power.number || '',
      issued_at: String(power.issued_at || '').slice(0, 10),
      scope: power.scope || '',
      expires_at: String(power.expires_at || '').slice(0, 10),
      notes: power.notes || '',
    });
    setError('');
    setActiveTab('powers');
  }

  function resetPowerForm() {
    setEditingPowerId(null);
    setPowerForm(EMPTY_POWER);
  }

  async function savePower(event) {
    event.preventDefault();
    setSavingPower(true);
    setError('');
    const data = { ...powerForm, expires_at: powerForm.expires_at || null };
    try {
      if (editingPowerId) {
        await legalApi.updateCustomerPowerOfAttorney(editingPowerId, data);
      } else {
        await legalApi.createCustomerPowerOfAttorney(customer.id, data);
      }
      resetPowerForm();
      const updatedPowers = await legalApi.getCustomerPowerOfAttorneys(customer.id);
      setPowers(updatedPowers || []);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ التوكيل');
    } finally {
      setSavingPower(false);
    }
  }

  async function deletePower(power) {
    if (!window.confirm(`هل تريد حذف التوكيل رقم "${power.number}"؟`)) return;
    setError('');
    try {
      await legalApi.deleteCustomerPowerOfAttorney(power.id);
      setPowers((current) => current.filter((item) => item.id !== power.id));
      if (editingPowerId === power.id) resetPowerForm();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'تعذر حذف التوكيل');
    }
  }

  async function saveContact(event) {
    event.preventDefault();
    if (!contactForm.subject.trim()) return;
    setSavingContact(true);
    setError('');
    try {
      await legalApi.addLegalClientInteraction({
        customer_id: customer.id,
        type: contactForm.type,
        subject: contactForm.subject.trim(),
        details: contactForm.details.trim() || null,
        follow_up_date: contactForm.follow_up_date || null,
      });
      setContactForm({ type: 'call', subject: '', details: '', follow_up_date: '' });
      const legalInteractions = await legalApi.getLegalClientInteractions(customer.id);
      setContacts(Array.isArray(legalInteractions) ? legalInteractions : []);
      setActiveTab('contacts');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر تسجيل التواصل');
    } finally {
      setSavingContact(false);
    }
  }

  return (
    <div className="modal-overlay legal-client-overlay" onClick={onClose}>
      <section
        className="legal-client-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-client-title"
        onClick={(event) => event.stopPropagation()}
        dir="rtl"
      >
        <header className="legal-client-header">
          <div className="legal-client-heading">
            <span className="legal-client-avatar">{customer.name?.trim().charAt(0) || 'م'}</span>
            <div>
              <span className="legal-client-eyebrow">ملف الموكل</span>
              <h2 id="legal-client-title">{customer.name}</h2>
              <p>{customer.phone || 'بدون هاتف'}{customer.email ? ` · ${customer.email}` : ''}</p>
            </div>
          </div>
          <button type="button" className="legal-client-close" onClick={onClose} aria-label="إغلاق">×</button>
        </header>

        <nav className="legal-client-tabs" role="tablist" aria-label="بيانات الموكل">
          {[
            ['overview', `نظرة عامة · ${cases.length}`],
            ['contacts', `سجل التواصل · ${contacts.length}`],
            ['powers', `التوكيلات · ${powers.length}`],
          ].map(([tab, label]) => (
            <button
              type="button"
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              className={activeTab === tab ? 'active' : ''}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </nav>

        {error && <div className="legal-client-error" role="alert">{error}</div>}

        <div className="legal-client-content">
          {loading ? (
            <div className="legal-client-empty" role="status">جاري تحميل ملف الموكل...</div>
          ) : activeTab === 'overview' ? (
            <div className="legal-client-overview">
              <section className="legal-client-contact-card">
                <h3>بيانات التواصل</h3>
                <dl>
                  <div><dt>الاسم</dt><dd>{customer.name}</dd></div>
                  <div><dt>الهاتف</dt><dd>{customer.phone || 'غير مسجل'}</dd></div>
                  <div><dt>البريد الإلكتروني</dt><dd>{customer.email || 'غير مسجل'}</dd></div>
                  <div><dt>تاريخ التسجيل</dt><dd>{formatDate(customer.created_at)}</dd></div>
                  <div><dt>آخر تواصل</dt><dd>{formatDate(contacts[0]?.created_at)}</dd></div>
                </dl>
              </section>
              <section className="legal-client-case-section">
                <div className="legal-client-section-header">
                  <div><h3>قضايا الموكل</h3><p>{activeCasesCount} نشطة أو مؤجلة من إجمالي {cases.length}</p></div>
                  <button type="button" className="legal-client-primary-button" onClick={onOpenCases}>فتح القضايا</button>
                </div>
                {cases.length ? (
                  <div className="legal-client-case-list">
                    {cases.map((legalCase) => (
                      <article key={legalCase.id} className="legal-client-case-card">
                        <div>
                          <strong>{legalCase.case_number}</strong>
                          <span>{legalCase.court_name}{legalCase.circuit_name ? ` · ${legalCase.circuit_name}` : ''}</span>
                          <small>{legalCase.subject}</small>
                        </div>
                        <div className="legal-client-case-meta">
                          <span className={`legal-case-status legal-case-${legalCase.status}`}>{getCaseStatus(legalCase.status)}</span>
                          <span>{legalCase.next_session_date ? `الجلسة: ${formatDate(legalCase.next_session_date)}` : 'لا توجد جلسة قادمة'}</span>
                          <small>المحامي: {legalCase.assigned_lawyer_name || 'غير معين'}</small>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : <div className="legal-client-empty">لا توجد قضايا مسجلة لهذا الموكل.</div>}
              </section>
            </div>
          ) : activeTab === 'contacts' ? (
            <section className="legal-client-contacts">
              <form className="legal-client-form" onSubmit={saveContact}>
                <h3>تسجيل تواصل جديد</h3>
                <div className="legal-client-form-grid">
                  <label>نوع التواصل
                    <select value={contactForm.type} onChange={(event) => setContactForm({ ...contactForm, type: event.target.value })}>
                      {CONTACT_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>الموضوع
                    <input value={contactForm.subject} onChange={(event) => setContactForm({ ...contactForm, subject: event.target.value })} maxLength={200} required />
                  </label>
                  <label>موعد المتابعة (اختياري)
                    <input type="date" value={contactForm.follow_up_date} onChange={(event) => setContactForm({ ...contactForm, follow_up_date: event.target.value })} />
                  </label>
                  <label className="legal-client-wide">تفاصيل التواصل
                    <textarea value={contactForm.details} onChange={(event) => setContactForm({ ...contactForm, details: event.target.value })} rows={3} maxLength={2000} />
                  </label>
                </div>
                <button type="submit" className="legal-client-primary-button" disabled={savingContact}>
                  {savingContact ? 'جارٍ الحفظ...' : 'حفظ التواصل'}
                </button>
              </form>
              <div className="legal-client-timeline">
                <h3>سجل التواصل السابق</h3>
                {contacts.length ? contacts.map((contact) => (
                  <article key={contact.id} className="legal-client-timeline-item">
                    <span className="legal-client-timeline-dot" />
                    <div className="legal-client-timeline-card">
                      <div><strong>{contact.subject}</strong><time>{formatDate(contact.created_at)}</time></div>
                      <span className="legal-contact-type">{CONTACT_LABELS[contact.type] || contact.type || 'تواصل'}</span>
                      {contact.details && <p>{contact.details}</p>}
                      {contact.follow_up_date && <small>متابعة: {formatDate(contact.follow_up_date)}</small>}
                    </div>
                  </article>
                )) : <div className="legal-client-empty">لا يوجد سجل تواصل سابق لهذا الموكل.</div>}
              </div>
            </section>
          ) : (
            <section className="legal-client-powers">
              <form className="legal-client-form" onSubmit={savePower}>
                <div className="legal-client-section-header">
                  <div>
                    <h3>{editingPowerId ? 'تعديل بيانات التوكيل' : 'إضافة توكيل'}</h3>
                    <p>سجّل الرقم والتاريخ والنطاق، وأضف تاريخ الانتهاء إن وُجد.</p>
                  </div>
                </div>
                <div className="legal-client-form-grid">
                  <label>رقم التوكيل *
                    <input value={powerForm.number} onChange={(event) => setPowerForm({ ...powerForm, number: event.target.value })} maxLength={100} required />
                  </label>
                  <label>تاريخ الإصدار *
                    <input type="date" value={powerForm.issued_at} onChange={(event) => setPowerForm({ ...powerForm, issued_at: event.target.value })} required />
                  </label>
                  <label>تاريخ الانتهاء
                    <input type="date" min={powerForm.issued_at || undefined} value={powerForm.expires_at} onChange={(event) => setPowerForm({ ...powerForm, expires_at: event.target.value })} />
                  </label>
                  <label className="legal-client-wide">نطاق التوكيل *
                    <textarea value={powerForm.scope} onChange={(event) => setPowerForm({ ...powerForm, scope: event.target.value })} rows={2} maxLength={2000} required />
                  </label>
                  <label className="legal-client-wide">ملاحظات
                    <textarea value={powerForm.notes} onChange={(event) => setPowerForm({ ...powerForm, notes: event.target.value })} rows={2} maxLength={1000} />
                  </label>
                </div>
                <div className="legal-client-form-actions">
                  <button type="submit" className="legal-client-primary-button" disabled={savingPower}>
                    {savingPower ? 'جارٍ الحفظ...' : editingPowerId ? 'حفظ التعديلات' : 'إضافة التوكيل'}
                  </button>
                  {editingPowerId && <button type="button" className="legal-client-secondary-button" onClick={resetPowerForm}>إلغاء التعديل</button>}
                </div>
              </form>
              <div className="legal-client-power-list">
                {powers.length ? powers.map((power) => {
                  const status = getPowerStatus(power);
                  return (
                    <article key={power.id} className="legal-client-power-card">
                      <header>
                        <div><span className="legal-power-number">توكيل رقم {power.number}</span><span className={`legal-power-status ${status.className}`}>{status.label}</span></div>
                        <div className="legal-power-actions">
                          <button type="button" onClick={() => startPowerEdit(power)}>تعديل</button>
                          <button type="button" onClick={() => deletePower(power)}>حذف</button>
                        </div>
                      </header>
                      <div className="legal-power-dates">
                        <span>الإصدار: <strong>{formatDate(power.issued_at)}</strong></span>
                        <span>الانتهاء: <strong>{formatDate(power.expires_at)}</strong></span>
                      </div>
                      <p><strong>النطاق:</strong> {power.scope}</p>
                      {power.notes && <small>ملاحظات: {power.notes}</small>}
                      {power.created_by_name && <small>سُجّل بواسطة: {power.created_by_name}</small>}
                    </article>
                  );
                }) : <div className="legal-client-empty">لا توجد توكيلات مسجلة لهذا الموكل بعد.</div>}
              </div>
            </section>
          )}
        </div>
      </section>
    </div>
  );
}

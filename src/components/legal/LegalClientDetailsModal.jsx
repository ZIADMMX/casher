import { useCallback, useEffect, useMemo, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import LegalIcon from './LegalIcon.jsx';
import LegalModalShell from './LegalModalShell.jsx';
import '../../styles/legalClientDetails.css';

const EMPTY_POWER = { number: '', issued_at: '', scope: '', expires_at: '', notes: '' };

const CONTACT_TYPES = [
  ['call', 'مكالمة'],
  ['message', 'رسالة'],
  ['note', 'ملاحظة'],
  ['complaint', 'شكوى'],
];
const CONTACT_LABELS = Object.fromEntries(CONTACT_TYPES);

const CASE_STATUS = {
  active: ['متداولة', 'warn'],
  adjourned: ['مؤجلة', 'accent'],
  judged: ['محكوم لصالحه', 'ok'],
  closed: ['مغلقة', 'muted'],
  archived: ['مؤرشفة', 'muted'],
};

const FEE_METHODS = { once: 'دفعة واحدة', installments: 'أقساط', percentage: 'نسبة من الحكم' };

const n = (value) => Number(value || 0).toLocaleString('ar-EG');
const money = (value) => `${n(Math.round(Number(value) || 0))} ج`;

function formatDate(value, options = { year: 'numeric', month: 'long', day: 'numeric' }) {
  if (!value) return '—';
  const date = new Date(`${String(value).slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('ar-EG', options);
}

function relativeTime(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  const days = Math.floor((Date.now() - date.getTime()) / 86400000);
  const time = date.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  if (days <= 0) return `اليوم · ${time}`;
  if (days === 1) return `أمس · ${time}`;
  if (days < 30) return `منذ ${n(days)} أيام`;
  return formatDate(value);
}

function parseProfile(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw) || {}; } catch { return {}; }
}

function powerStatus(power) {
  if (!power?.expires_at) return { label: 'ساري', tone: 'ok' };
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.ceil((new Date(`${power.expires_at}T00:00:00`) - today) / 86400000);
  if (days < 0) return { label: 'منتهي', tone: 'bad' };
  if (days <= 30) return { label: `ينتهي خلال ${n(days)} يوم`, tone: 'warn' };
  return { label: 'ساري', tone: 'ok' };
}

export default function LegalClientDetailsModal({ customer, onClose, onOpenCases, onArchiveChange }) {
  const isArchived = Number(customer.is_active) === 0;
  const [archiving, setArchiving] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [cases, setCases] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [powers, setPowers] = useState([]);
  const [profile, setProfile] = useState(() => parseProfile(customer.legal_profile));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [powerForm, setPowerForm] = useState(EMPTY_POWER);
  const [editingPowerId, setEditingPowerId] = useState(null);
  const [savingPower, setSavingPower] = useState(false);
  const [contactForm, setContactForm] = useState({ type: 'call', subject: '', details: '', follow_up_date: '' });
  const [savingContact, setSavingContact] = useState(false);
  const [editingProfile, setEditingProfile] = useState(null);
  const [copied, setCopied] = useState(false);

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

  useEffect(() => { loadDetails(); }, [loadDetails]);

  const summary = useMemo(() => {
    const open = cases.filter((item) => ['active', 'adjourned'].includes(item.status));
    const contract = cases.reduce((sum, item) => sum + (Number(item.contract_amount) || 0), 0);
    const paid = cases.reduce((sum, item) => sum + (Number(item.paid_amount) || 0), 0);
    return {
      activeCases: open.length,
      upcoming: cases.filter((item) => item.next_session_date).length,
      remaining: open.reduce((sum, item) => sum + Math.max(0, (Number(item.contract_amount) || 0) - (Number(item.paid_amount) || 0)), 0),
      contract,
      paid,
      paidRatio: contract > 0 ? Math.min(100, Math.round((paid / contract) * 100)) : 0,
    };
  }, [cases]);

  const latestPower = powers[0];
  const latestPowerStatus = powerStatus(latestPower);
  const isCompany = profile.kind === 'company';
  const fileCode = customer.fileCode || `CL-${1000 + Number(customer.id)}`;
  const sinceYear = customer.created_at ? new Date(String(customer.created_at).replace(' ', 'T')).getFullYear() : null;

  async function copyPhone() {
    if (!customer.phone) return;
    try {
      await navigator.clipboard.writeText(customer.phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError(`رقم الموكل: ${customer.phone}`);
    }
  }

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
      if (editingPowerId) await legalApi.updateCustomerPowerOfAttorney(editingPowerId, data);
      else await legalApi.createCustomerPowerOfAttorney(customer.id, data);
      resetPowerForm();
      setPowers((await legalApi.getCustomerPowerOfAttorneys(customer.id)) || []);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ التوكيل');
    } finally {
      setSavingPower(false);
    }
  }

  async function toggleArchive() {
    const question = isArchived
      ? `استرجاع الموكل "${customer.name}" من الأرشيف؟`
      : `أرشفة الموكل "${customer.name}"؟ هيختفي من القائمة والإحصائيات، وتقدر تسترجعه من فلتر «الأرشيف».`;
    if (!window.confirm(question)) return;
    setArchiving(true);
    setError('');
    try {
      await legalApi.setLegalClientArchived(customer.id, !isArchived);
      onArchiveChange?.(customer);
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : 'تعذر تحديث حالة الأرشفة');
    } finally {
      setArchiving(false);
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
      const timeline = await legalApi.getLegalClientInteractions(customer.id);
      setContacts(Array.isArray(timeline) ? timeline : []);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر تسجيل التواصل');
    } finally {
      setSavingContact(false);
    }
  }

  async function saveProfile(event) {
    event.preventDefault();
    setError('');
    try {
      const saved = await legalApi.updateLegalClientProfile(customer.id, editingProfile);
      setProfile(saved || { ...profile, ...editingProfile });
      setEditingProfile(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ بيانات الموكل');
    }
  }

  const tabs = [
    ['overview', 'نظرة عامة'],
    ['cases', 'القضايا', cases.length],
    ['contacts', 'سجل التواصل', contacts.length],
    ['powers', 'التوكيلات', powers.length],
    ['fees', 'الأتعاب', cases.filter((item) => Number(item.contract_amount) > 0).length],
  ];

  const caseRow = (legalCase) => {
    const [label, tone] = CASE_STATUS[legalCase.status] || [legalCase.status || '—', 'muted'];
    return (
      <article key={legalCase.id} className="lcd-case">
        <span className="lcd-case-icon"><LegalIcon name="file" size={18} /></span>
        <div className="lcd-case-text">
          <strong>قضية {legalCase.case_number}{legalCase.subject ? ` — ${legalCase.subject}` : ''}</strong>
          <small>{[legalCase.court_name, legalCase.circuit_name].filter(Boolean).join(' · ') || 'بدون محكمة'}</small>
        </div>
        <span className="lcd-case-session">جلسة: {legalCase.next_session_date ? formatDate(legalCase.next_session_date, { weekday: 'long', day: 'numeric', month: 'long' }) : '—'}</span>
        <span className={`lcd-pill lcd-pill--${tone}`}>{label}</span>
      </article>
    );
  };

  return (
    <LegalModalShell onClose={onClose} labelledBy="lcd-title" className="lcd">
      {(requestClose) => (
        <>
          <header className="lcd-head">
            <div className="lcd-heading">
              <span className="lcd-avatar">{customer.name?.trim().charAt(0) || 'م'}</span>
              <div>
                <span className="legal-sheet-eyebrow">ملف الموكل · <bdi>{fileCode}</bdi></span>
                <h2 id="lcd-title">{customer.name}</h2>
                <div className="lcd-badges">
                  <span className="lcd-pill lcd-pill--accent">{isCompany ? 'شركة' : 'فرد'}</span>
                  <span className={`lcd-pill lcd-pill--${profile.status === 'potential' ? 'warn' : 'ok'}`}>
                    <i aria-hidden="true" />{profile.status === 'potential' ? 'موكل محتمل' : 'موكل نشط'}
                  </span>
                  {isArchived && <span className="lcd-pill lcd-pill--warn"><i aria-hidden="true" />مؤرشف</span>}
                  {profile.source && <span className="lcd-pill lcd-pill--gold">مصدره: {profile.source}</span>}
                </div>
              </div>
            </div>
            <div className="lcd-actions">
              <button type="button" className="legal-btn" onClick={copyPhone} disabled={!customer.phone} title={customer.phone ? `نسخ ${customer.phone}` : 'لا يوجد رقم'}>
                <LegalIcon name={copied ? 'check' : 'phone'} size={17} /> {copied ? 'تم نسخ الرقم' : 'اتصال'}
              </button>
              <button type="button" className="legal-btn" onClick={toggleArchive} disabled={archiving}>
                {isArchived ? 'استرجاع من الأرشيف' : 'أرشفة'}
              </button>
              <button type="button" className="legal-btn legal-btn--primary" onClick={() => onOpenCases?.(customer)}>قضية جديدة</button>
              <button type="button" className="legal-x" onClick={requestClose} aria-label="إغلاق"><LegalIcon name="close" size={18} /></button>
            </div>
          </header>

          <nav className="lcd-tabs" role="tablist" aria-label="أقسام ملف الموكل">
            {tabs.map(([tab, label, count]) => (
              <button
                type="button"
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                className={activeTab === tab ? 'is-active' : ''}
                onClick={() => setActiveTab(tab)}
              >
                {label}
                {count !== undefined && <span>{n(count)}</span>}
              </button>
            ))}
          </nav>

          {error && <div className="lcd-error" role="alert">{error}</div>}

          <div className="lcd-content">
            {loading ? (
              <div className="lcd-skeleton" role="status" aria-label="جاري تحميل ملف الموكل">
                <i /><i /><i /><i /><b /><b />
              </div>
            ) : (
              <div className="legal-slide" key={activeTab}>
                {activeTab === 'overview' && (
                  <div className="lcd-overview">
                    <div className="lcd-stats legal-rise">
                      <article><span>قضايا نشطة</span><strong>{n(summary.activeCases)}</strong></article>
                      <article><span>جلسات قادمة</span><strong>{n(summary.upcoming)}</strong></article>
                      <article><span>متبقي أتعاب</span><strong className="is-accent">{n(summary.remaining)}</strong></article>
                      <article><span>عميل منذ</span><strong>{sinceYear ? sinceYear.toLocaleString('ar-EG', { useGrouping: false }) : '—'}</strong></article>
                    </div>

                    <div className="lcd-main legal-rise">
                      <section className="lcd-card">
                        <header className="lcd-card-head">
                          <h3>قضايا الموكل</h3>
                          {cases.length > 0 && <button type="button" className="lcd-link" onClick={() => setActiveTab('cases')}>فتح كل القضايا</button>}
                        </header>
                        {cases.length ? cases.slice(0, 4).map(caseRow) : (
                          <div className="lcd-empty">
                            لا توجد قضايا مسجلة لهذا الموكل.
                            <button type="button" className="legal-btn legal-btn--primary" onClick={() => onOpenCases?.(customer)}>فتح قضية جديدة</button>
                          </div>
                        )}
                      </section>

                      <section className="lcd-card">
                        <header className="lcd-card-head">
                          <h3>سجل التواصل</h3>
                          <button type="button" className="legal-btn" onClick={() => setActiveTab('contacts')}>تسجيل تواصل</button>
                        </header>
                        {contacts.length ? (
                          <ol className="lcd-timeline">
                            {contacts.slice(0, 4).map((contact, index) => (
                              <li key={contact.id} className={index === 0 ? 'is-latest' : ''}>
                                <strong>{CONTACT_LABELS[contact.type] || 'تواصل'}: {contact.subject}</strong>
                                <small>{relativeTime(contact.created_at)}{contact.created_by_name ? ` · ${contact.created_by_name}` : ''}</small>
                              </li>
                            ))}
                          </ol>
                        ) : <div className="lcd-empty">لا يوجد سجل تواصل سابق لهذا الموكل.</div>}
                      </section>
                    </div>

                    <aside className="lcd-side legal-rise">
                      <section className="lcd-card">
                        <header className="lcd-card-head">
                          <h3>البيانات الأساسية</h3>
                          {!editingProfile && (
                            <button type="button" className="lcd-link" onClick={() => setEditingProfile({
                              national_id: profile.national_id || '', profession: profile.profession || '',
                              governorate: profile.governorate || '', address: profile.address || '', owner: profile.owner || '',
                            })}>
                              <LegalIcon name="pencil" size={14} /> تعديل
                            </button>
                          )}
                        </header>
                        {editingProfile ? (
                          <form className="lcd-profile-form" onSubmit={saveProfile}>
                            {[
                              ['national_id', 'الرقم القومي', 14],
                              ['profession', isCompany ? 'النشاط' : 'المهنة', 120],
                              ['governorate', 'المحافظة', 60],
                              ['address', 'العنوان', 300],
                              ['owner', 'المسؤول عن الملف', 120],
                            ].map(([field, label, max]) => (
                              <label key={field}>{label}
                                <input
                                  value={editingProfile[field]}
                                  maxLength={max}
                                  dir={field === 'national_id' ? 'ltr' : undefined}
                                  inputMode={field === 'national_id' ? 'numeric' : undefined}
                                  onChange={(event) => setEditingProfile({ ...editingProfile, [field]: field === 'national_id' ? event.target.value.replace(/\D/g, '') : event.target.value })}
                                />
                              </label>
                            ))}
                            <div className="lcd-form-actions">
                              <button type="submit" className="legal-btn legal-btn--primary">حفظ</button>
                              <button type="button" className="legal-btn" onClick={() => setEditingProfile(null)}>إلغاء</button>
                            </div>
                          </form>
                        ) : (
                          <dl className="lcd-facts">
                            <div><dt>{isCompany ? 'اسم الشركة' : 'الاسم الرباعي'}</dt><dd>{customer.name}</dd></div>
                            <div><dt>الرقم القومي</dt><dd dir="ltr">{profile.national_id || 'غير مسجل'}</dd></div>
                            <div><dt>الهاتف الأساسي{profile.whatsapp_same ? ' / واتساب' : ''}</dt><dd dir="ltr">{customer.phone || 'غير مسجل'}</dd></div>
                            {profile.alt_phone && <div><dt>رقم بديل</dt><dd dir="ltr">{profile.alt_phone}</dd></div>}
                            <div><dt>البريد الإلكتروني</dt><dd dir="ltr">{customer.email || 'غير مسجل'}</dd></div>
                            <div><dt>العنوان</dt><dd>{[profile.address, profile.governorate].filter(Boolean).join(' — ') || 'غير مسجل'}</dd></div>
                            <div><dt>المسؤول عن الملف</dt><dd>{profile.owner || 'غير محدد'}</dd></div>
                          </dl>
                        )}
                      </section>

                      <section className="lcd-card lcd-card--accent">
                        <h3>التوكيل والأتعاب</h3>
                        {latestPower ? (
                          <>
                            <div className="lcd-row"><span>توكيل {latestPower.scope} {latestPower.number}</span><strong className={`is-${latestPowerStatus.tone}`}>{latestPowerStatus.label}</strong></div>
                            <div className="lcd-row"><span>ينتهي في</span><strong>{latestPower.expires_at ? formatDate(latestPower.expires_at) : 'مفتوح المدة'}</strong></div>
                          </>
                        ) : (
                          <div className="lcd-row"><span>التوكيل</span><button type="button" className="lcd-link" onClick={() => setActiveTab('powers')}>إضافة توكيل</button></div>
                        )}
                        <hr />
                        <div className="lcd-row"><span>الأتعاب المتفق عليها</span><strong>{money(summary.contract || profile.fee_amount)}</strong></div>
                        <div className="lcd-row"><span>المحصّل</span><strong>{money(summary.paid || profile.first_payment)}</strong></div>
                        <span className="lcd-meter" aria-hidden="true"><i style={{ transform: `scaleX(${(summary.contract ? summary.paidRatio : (profile.fee_amount ? Math.min(100, ((profile.first_payment || 0) / profile.fee_amount) * 100) : 0)) / 100})` }} /></span>
                      </section>
                    </aside>
                  </div>
                )}

                {activeTab === 'cases' && (
                  <section className="lcd-card">
                    <header className="lcd-card-head">
                      <h3>كل القضايا · {n(cases.length)}</h3>
                      <button type="button" className="legal-btn legal-btn--primary" onClick={() => onOpenCases?.(customer)}>قضية جديدة</button>
                    </header>
                    {cases.length ? <div className="legal-rise">{cases.map(caseRow)}</div> : <div className="lcd-empty">لا توجد قضايا مسجلة لهذا الموكل.</div>}
                  </section>
                )}

                {activeTab === 'contacts' && (
                  <div className="lcd-split">
                    <form className="lcd-card lcd-form" onSubmit={saveContact}>
                      <h3>تسجيل تواصل جديد</h3>
                      <div className="lcd-form-grid">
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
                        <label className="lcd-wide">تفاصيل التواصل
                          <textarea value={contactForm.details} onChange={(event) => setContactForm({ ...contactForm, details: event.target.value })} rows={3} maxLength={2000} />
                        </label>
                      </div>
                      <button type="submit" className="legal-btn legal-btn--primary" disabled={savingContact}>
                        {savingContact ? 'جارٍ الحفظ...' : 'حفظ التواصل'}
                      </button>
                    </form>
                    <section className="lcd-card">
                      <h3>السجل السابق</h3>
                      {contacts.length ? (
                        <ol className="lcd-timeline lcd-timeline--full legal-rise">
                          {contacts.map((contact, index) => (
                            <li key={contact.id} className={index === 0 ? 'is-latest' : ''}>
                              <strong>{CONTACT_LABELS[contact.type] || 'تواصل'}: {contact.subject}</strong>
                              <small>{relativeTime(contact.created_at)}{contact.created_by_name ? ` · ${contact.created_by_name}` : ''}</small>
                              {contact.details && <p>{contact.details}</p>}
                              {contact.follow_up_date && <small className="lcd-follow">متابعة: {formatDate(contact.follow_up_date)}</small>}
                            </li>
                          ))}
                        </ol>
                      ) : <div className="lcd-empty">لا يوجد سجل تواصل سابق لهذا الموكل.</div>}
                    </section>
                  </div>
                )}

                {activeTab === 'powers' && (
                  <div className="lcd-split">
                    <form className="lcd-card lcd-form" onSubmit={savePower}>
                      <h3>{editingPowerId ? 'تعديل بيانات التوكيل' : 'إضافة توكيل'}</h3>
                      <div className="lcd-form-grid">
                        <label>رقم التوكيل *
                          <input value={powerForm.number} onChange={(event) => setPowerForm({ ...powerForm, number: event.target.value })} maxLength={100} required />
                        </label>
                        <label>تاريخ التحرير *
                          <input type="date" value={powerForm.issued_at} onChange={(event) => setPowerForm({ ...powerForm, issued_at: event.target.value })} required />
                        </label>
                        <label>تاريخ الانتهاء
                          <input type="date" min={powerForm.issued_at || undefined} value={powerForm.expires_at} onChange={(event) => setPowerForm({ ...powerForm, expires_at: event.target.value })} />
                        </label>
                        <label className="lcd-wide">نطاق التوكيل *
                          <textarea value={powerForm.scope} onChange={(event) => setPowerForm({ ...powerForm, scope: event.target.value })} rows={2} maxLength={2000} required />
                        </label>
                        <label className="lcd-wide">ملاحظات
                          <textarea value={powerForm.notes} onChange={(event) => setPowerForm({ ...powerForm, notes: event.target.value })} rows={2} maxLength={1000} />
                        </label>
                      </div>
                      <div className="lcd-form-actions">
                        <button type="submit" className="legal-btn legal-btn--primary" disabled={savingPower}>
                          {savingPower ? 'جارٍ الحفظ...' : editingPowerId ? 'حفظ التعديلات' : 'إضافة التوكيل'}
                        </button>
                        {editingPowerId && <button type="button" className="legal-btn" onClick={resetPowerForm}>إلغاء التعديل</button>}
                      </div>
                    </form>
                    <div className="lcd-power-list legal-rise">
                      {powers.length ? powers.map((power) => {
                        const status = powerStatus(power);
                        return (
                          <article key={power.id} className="lcd-card lcd-power">
                            <header className="lcd-card-head">
                              <div>
                                <strong>توكيل رقم {power.number}</strong>
                                <span className={`lcd-pill lcd-pill--${status.tone}`}>{status.label}</span>
                              </div>
                              <div className="lcd-power-actions">
                                <button type="button" className="lcd-link" onClick={() => startPowerEdit(power)}>تعديل</button>
                                <button type="button" className="lcd-link lcd-link--danger" onClick={() => deletePower(power)}>حذف</button>
                              </div>
                            </header>
                            <div className="lcd-power-dates">
                              <span>التحرير: <strong>{formatDate(power.issued_at)}</strong></span>
                              <span>الانتهاء: <strong>{formatDate(power.expires_at)}</strong></span>
                            </div>
                            <p><strong>النطاق:</strong> {power.scope}</p>
                            {power.notes && <small>{power.notes}</small>}
                            {power.created_by_name && <small>سُجّل بواسطة: {power.created_by_name}</small>}
                          </article>
                        );
                      }) : <div className="lcd-empty">لا توجد توكيلات مسجلة لهذا الموكل بعد.</div>}
                    </div>
                  </div>
                )}

                {activeTab === 'fees' && (
                  <div className="lcd-fees">
                    <div className="lcd-stats legal-rise">
                      <article><span>إجمالي الأتعاب</span><strong>{money(summary.contract)}</strong></article>
                      <article><span>المحصّل</span><strong>{money(summary.paid)}</strong></article>
                      <article><span>المتبقي على القضايا المتداولة</span><strong className="is-accent">{money(summary.remaining)}</strong></article>
                      <article><span>نسبة التحصيل</span><strong>{n(summary.paidRatio)}٪</strong></article>
                    </div>
                    {profile.fee_amount ? (
                      <p className="lcd-note">اتفاق الأتعاب المسجل عند فتح الملف: {money(profile.fee_amount)} · {FEE_METHODS[profile.fee_method] || '—'}{profile.first_payment ? ` · أول دفعة ${money(profile.first_payment)}` : ''}</p>
                    ) : null}
                    <section className="lcd-card">
                      <h3>الأتعاب لكل قضية</h3>
                      {cases.length ? (
                        <table className="lcd-fee-table">
                          <thead><tr><th>القضية</th><th>المتفق عليه</th><th>المحصّل</th><th>المتبقي</th><th>التحصيل</th></tr></thead>
                          <tbody>
                            {cases.map((legalCase) => {
                              const contract = Number(legalCase.contract_amount) || 0;
                              const paid = Number(legalCase.paid_amount) || 0;
                              const ratio = contract ? Math.min(100, (paid / contract) * 100) : 0;
                              return (
                                <tr key={legalCase.id}>
                                  <td>{legalCase.case_number}<small>{legalCase.subject}</small></td>
                                  <td>{money(contract)}</td>
                                  <td>{money(paid)}</td>
                                  <td className={contract - paid > 0 ? 'is-accent' : ''}>{money(Math.max(0, contract - paid))}</td>
                                  <td><span className="lcd-meter lcd-meter--sm" aria-hidden="true"><i style={{ transform: `scaleX(${ratio / 100})` }} /></span></td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      ) : <div className="lcd-empty">لا توجد قضايا عليها أتعاب بعد.</div>}
                    </section>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </LegalModalShell>
  );
}

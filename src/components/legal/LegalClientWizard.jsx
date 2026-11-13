import { useEffect, useState } from 'react';
import * as customersApi from '../../api/customers.js';
import * as legalApi from '../../api/legal.js';
import LegalIcon from './LegalIcon.jsx';
import LegalModalShell from './LegalModalShell.jsx';
import '../../styles/legalClientWizard.css';

const DRAFT_KEY = 'fox.legalClientDraft';

const STEPS = [
  { key: 'client', label: 'بيانات الموكل' },
  { key: 'power', label: 'التوكيل', hint: 'رقمه، نوعه (عام/خاص)، جهة التوثيق، تاريخ التحرير والانتهاء.' },
  { key: 'fees', label: 'الأتعاب', hint: 'القيمة المتفق عليها، طريقة السداد (دفعة واحدة/أقساط/نسبة)، وأول دفعة.' },
  { key: 'review', label: 'مراجعة وحفظ', hint: 'مراجعة سريعة، وبعدها تفتح ملف الموكل أو قضية جديدة فورًا.' },
];

const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الشرقية', 'الدقهلية', 'الغربية', 'المنوفية',
  'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف',
  'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'الوادي الجديد',
  'مطروح', 'شمال سيناء', 'جنوب سيناء',
];

const SOURCES = ['إحالة عميل', 'معرفة شخصية', 'إعلان', 'مواقع التواصل', 'زيارة المكتب', 'أخرى'];

const FEE_METHODS = [
  ['once', 'دفعة واحدة'],
  ['installments', 'أقساط'],
  ['percentage', 'نسبة من الحكم'],
];

const EMPTY = {
  kind: 'individual',
  name: '',
  national_id: '',
  profession: '',
  phone: '',
  alt_phone: '',
  whatsapp_same: true,
  email: '',
  governorate: 'القاهرة',
  address: '',
  status: 'active',
  source: '',
  owner: '',
  poa_number: '',
  poa_type: 'عام',
  poa_office: '',
  poa_issued_at: '',
  poa_expires_at: '',
  fee_amount: '',
  fee_method: 'once',
  first_payment: '',
};

// Fields a case file needs before the first statement of claim can be drafted.
const ESSENTIALS = ['name', 'phone', 'national_id', 'address', 'poa_number', 'fee_amount'];

const n = (value) => Number(value || 0).toLocaleString('ar-EG');

function readDraft() {
  try {
    const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
    return saved?.form ? { form: { ...EMPTY, ...saved.form }, step: Number(saved.step) || 0 } : null;
  } catch {
    return null;
  }
}

export function clientCompletion(form) {
  const missing = ESSENTIALS.filter((key) => !String(form[key] ?? '').trim());
  return { percent: Math.round(((ESSENTIALS.length - missing.length) / ESSENTIALS.length) * 100), missing: missing.length };
}

export default function LegalClientWizard({ onClose, onSaved, onOpenClient, onOpenCases }) {
  const [draft] = useState(readDraft);
  const [form, setForm] = useState(draft?.form || EMPTY);
  const [step, setStep] = useState(draft?.step || 0);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState(null);
  const [done, setDone] = useState(false);
  const [lawyers, setLawyers] = useState([]);

  useEffect(() => {
    legalApi.getCaseLawyers()
      .then((rows) => setLawyers(Array.isArray(rows) ? rows : []))
      .catch(() => setLawyers([]));
  }, []);

  const completion = clientCompletion(form);
  const isCompany = form.kind === 'company';
  const set = (field) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((current) => ({ ...current, [field]: value }));
  };

  function validate(index) {
    if (index === 0) {
      if (form.name.trim().length < 3) return isCompany ? 'اكتب اسم الشركة.' : 'اكتب اسم الموكل الرباعي.';
      if (!form.phone.trim()) return 'رقم الهاتف الأساسي مطلوب.';
      if (form.national_id && !/^\d{14}$/.test(form.national_id)) return 'الرقم القومي لازم يكون ١٤ رقم.';
      if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) return 'البريد الإلكتروني مش مكتوب صح.';
    }
    if (index === 1 && (form.poa_number || form.poa_issued_at)) {
      if (!form.poa_number.trim() || !form.poa_issued_at) return 'لو هتسجل التوكيل اكتب رقمه وتاريخ تحريره، أو سيب الخطوة فاضية.';
      if (form.poa_expires_at && form.poa_expires_at < form.poa_issued_at) return 'تاريخ الانتهاء قبل تاريخ التحرير.';
    }
    if (index === 2 && form.fee_amount && Number(form.first_payment || 0) > Number(form.fee_amount)) {
      return 'أول دفعة أكبر من الأتعاب المتفق عليها.';
    }
    return '';
  }

  function goTo(target) {
    if (target > step) {
      for (let index = step; index < target; index += 1) {
        const message = validate(index);
        if (message) { setStep(index); setError(message); return; }
      }
    }
    setError('');
    setStep(target);
  }

  function saveDraft(requestClose) {
    try { localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, step })); } catch { /* storage unavailable */ }
    requestClose();
  }

  async function save() {
    for (let index = 0; index < 3; index += 1) {
      const message = validate(index);
      if (message) { setStep(index); setError(message); return; }
    }
    setSaving(true);
    setError('');
    try {
      // Kept across retries so a failure after the client row exists never creates a duplicate.
      let id = savedId;
      if (!id) {
        const result = await customersApi.addCustomer({
          name: form.name.trim(),
          phone: form.phone.trim() || null,
          email: form.email.trim() || null,
        });
        id = result?.id;
        if (!id) throw new Error('تعذر إنشاء ملف الموكل');
        setSavedId(id);
      }
      await legalApi.updateLegalClientProfile(id, {
        kind: form.kind,
        national_id: form.national_id,
        profession: form.profession,
        alt_phone: form.alt_phone,
        whatsapp_same: form.whatsapp_same,
        governorate: form.governorate,
        address: form.address,
        status: form.status,
        source: form.source,
        owner: form.owner,
        fee_amount: form.fee_amount === '' ? null : Number(form.fee_amount),
        fee_method: form.fee_amount === '' ? null : form.fee_method,
        first_payment: form.first_payment === '' ? null : Number(form.first_payment),
      });
      if (form.poa_number.trim()) {
        await legalApi.createCustomerPowerOfAttorney(id, {
          number: form.poa_number.trim(),
          issued_at: form.poa_issued_at,
          scope: form.poa_type,
          expires_at: form.poa_expires_at || null,
          notes: form.poa_office.trim() ? `جهة التوثيق: ${form.poa_office.trim()}` : null,
        });
        setForm((current) => ({ ...current, poa_number: '' }));
      }
      try { localStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ }
      setDone(true);
      onSaved?.(id);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ الموكل');
    } finally {
      setSaving(false);
    }
  }

  const savedClient = { id: savedId, name: form.name.trim(), phone: form.phone.trim(), email: form.email.trim(), created_at: new Date().toISOString() };

  return (
    <LegalModalShell onClose={onClose} locked={saving} labelledBy="legal-wizard-title" className="lw">
      {(requestClose) => (
        <>
          <header className="legal-sheet-head">
            <div>
              <span className="legal-sheet-eyebrow">الموكلون</span>
              <h2 id="legal-wizard-title">إضافة موكل جديد</h2>
            </div>
            <button type="button" className="legal-x" onClick={requestClose} aria-label="إغلاق" disabled={saving}>
              <LegalIcon name="close" size={18} />
            </button>
          </header>

          <ol className="lw-steps" aria-label={`الخطوة ${step + 1} من ${STEPS.length}`}>
            {STEPS.map((item, index) => (
              <li key={item.key} className={done || index < step ? 'is-done' : index === step ? 'is-current' : ''}>
                <button type="button" onClick={() => !done && goTo(index)} disabled={done || saving} aria-current={index === step ? 'step' : undefined}>
                  <span className="lw-step-dot">{done || index < step ? <LegalIcon name="check" size={14} /> : n(index + 1)}</span>
                  <span className="lw-step-label">{item.label}</span>
                </button>
                {index < STEPS.length - 1 && <i className="lw-step-line" aria-hidden="true"><b /></i>}
              </li>
            ))}
          </ol>

          {done ? (
            <div className="lw-body lw-done legal-rise">
              <span className="lw-done-mark"><LegalIcon name="check" size={34} /></span>
              <h3>تم حفظ ملف {form.name.trim()}</h3>
              <p>الملف جاهز. تقدر تفتحه دلوقتي أو تبدأ قضية جديدة باسمه.</p>
              <div className="lw-done-actions">
                <button type="button" className="legal-btn legal-btn--primary" onClick={() => { onClose(); onOpenCases?.(savedClient); }}>
                  <LegalIcon name="briefcase" size={17} /> فتح قضية جديدة
                </button>
                <button type="button" className="legal-btn" onClick={() => { onClose(); onOpenClient?.(savedClient); }}>
                  <LegalIcon name="file" size={17} /> فتح ملف الموكل
                </button>
                <button type="button" className="legal-btn legal-btn--ghost" onClick={requestClose}>تم</button>
              </div>
            </div>
          ) : (
            <div className="lw-body">
              <div className="lw-main legal-slide" key={step}>
                {step === 0 && (
                  <>
                    <fieldset className="lw-field">
                      <legend>نوع الموكل</legend>
                      <div className="lw-segment" role="radiogroup" aria-label="نوع الموكل">
                        {[['individual', 'فرد'], ['company', 'شركة / كيان اعتباري']].map(([value, label]) => (
                          <button
                            type="button"
                            key={value}
                            role="radio"
                            aria-checked={form.kind === value}
                            className={form.kind === value ? 'is-on' : ''}
                            onClick={() => setForm((current) => ({ ...current, kind: value }))}
                          >
                            {label}
                          </button>
                        ))}
                        <i className="lw-segment-thumb" data-pos={form.kind} aria-hidden="true" />
                      </div>
                    </fieldset>

                    <div className="lw-field">
                      <label htmlFor="lw-name">{isCompany ? 'اسم الشركة' : 'الاسم الرباعي'} <b>*</b></label>
                      <input id="lw-name" className="lw-input lw-input--lg" autoFocus maxLength={180} value={form.name} onChange={set('name')} placeholder={isCompany ? 'مثال: شركة النيل للتوريدات' : 'مثال: أحمد سمير عبد الله محمد'} />
                      <small>{isCompany ? 'الاسم زي ما هو في السجل التجاري.' : 'الاسم بالكامل زي ما هو في البطاقة — بيتكتب في صحف الدعاوى.'}</small>
                    </div>

                    <div className="lw-grid">
                      <div className="lw-field">
                        <label htmlFor="lw-nid">{isCompany ? 'الرقم القومي للممثل القانوني' : 'الرقم القومي'}</label>
                        <input id="lw-nid" className="lw-input" inputMode="numeric" dir="ltr" maxLength={14} value={form.national_id} onChange={(event) => setForm((current) => ({ ...current, national_id: event.target.value.replace(/\D/g, '') }))} placeholder="١٤ رقم" />
                      </div>
                      <div className="lw-field">
                        <label htmlFor="lw-job">{isCompany ? 'النشاط' : 'المهنة'}</label>
                        <input id="lw-job" className="lw-input" maxLength={120} value={form.profession} onChange={set('profession')} placeholder={isCompany ? 'مثال: توريدات' : 'مثال: مهندس'} />
                      </div>
                    </div>

                    <h3 className="lw-section">التواصل</h3>
                    <div className="lw-grid">
                      <div className="lw-field">
                        <label htmlFor="lw-phone">الهاتف الأساسي <b>*</b></label>
                        <input id="lw-phone" className="lw-input" type="tel" dir="ltr" maxLength={40} value={form.phone} onChange={set('phone')} placeholder="+20 100 000 0000" />
                      </div>
                      <div className="lw-field">
                        <label htmlFor="lw-alt">رقم بديل</label>
                        <input id="lw-alt" className="lw-input" type="tel" dir="ltr" maxLength={40} value={form.alt_phone} onChange={set('alt_phone')} placeholder="اختياري" />
                      </div>
                    </div>
                    <label className="lw-check">
                      <input type="checkbox" checked={form.whatsapp_same} onChange={set('whatsapp_same')} />
                      <span aria-hidden="true"><LegalIcon name="check" size={14} /></span>
                      نفس الرقم على واتساب (للتنبيهات بمواعيد الجلسات)
                    </label>
                    <div className="lw-grid">
                      <div className="lw-field">
                        <label htmlFor="lw-email">البريد الإلكتروني</label>
                        <input id="lw-email" className="lw-input" type="email" dir="ltr" maxLength={160} value={form.email} onChange={set('email')} placeholder="name@mail.com" />
                      </div>
                      <div className="lw-field">
                        <label htmlFor="lw-gov">المحافظة</label>
                        <select id="lw-gov" className="lw-input" value={form.governorate} onChange={set('governorate')}>
                          {GOVERNORATES.map((name) => <option key={name}>{name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="lw-field">
                      <label htmlFor="lw-address">العنوان بالكامل</label>
                      <textarea id="lw-address" className="lw-input" rows={3} maxLength={300} value={form.address} onChange={set('address')} placeholder="الشارع، المنطقة، رقم العقار — زي ما هيتكتب في الإعلان" />
                    </div>

                    <h3 className="lw-section">تصنيف الملف</h3>
                    <div className="lw-grid lw-grid--3">
                      <div className="lw-field">
                        <label htmlFor="lw-status">الحالة</label>
                        <select id="lw-status" className="lw-input" value={form.status} onChange={set('status')}>
                          <option value="active">موكل نشط</option>
                          <option value="potential">محتمل (استشارة)</option>
                        </select>
                      </div>
                      <div className="lw-field">
                        <label htmlFor="lw-source">مصدر العميل</label>
                        <select id="lw-source" className="lw-input" value={form.source} onChange={set('source')}>
                          <option value="">غير محدد</option>
                          {SOURCES.map((source) => <option key={source}>{source}</option>)}
                        </select>
                      </div>
                      <div className="lw-field">
                        <label htmlFor="lw-owner">المسؤول عن الملف</label>
                        <select id="lw-owner" className="lw-input" value={form.owner} onChange={set('owner')}>
                          <option value="">بدون</option>
                          {lawyers.map((user) => {
                            const name = user.full_name || user.username;
                            return <option key={user.id} value={name}>{name}</option>;
                          })}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {step === 1 && (
                  <>
                    <p className="lw-lead">سجّل التوكيل الرسمي عشان يظهر في ملف القضية وتوصلك تنبيهات قبل انتهائه. لو لسه مفيش توكيل، سيب الخطوة فاضية.</p>
                    <div className="lw-grid">
                      <div className="lw-field">
                        <label htmlFor="lw-poa">رقم التوكيل</label>
                        <input id="lw-poa" className="lw-input" autoFocus maxLength={100} value={form.poa_number} onChange={set('poa_number')} placeholder="مثال: ٤٤٢١ لسنة ٢٠٢٥" />
                      </div>
                      <fieldset className="lw-field">
                        <legend>نوع التوكيل</legend>
                        <div className="lw-segment" role="radiogroup" aria-label="نوع التوكيل">
                          {['عام', 'خاص'].map((value) => (
                            <button type="button" key={value} role="radio" aria-checked={form.poa_type === value} className={form.poa_type === value ? 'is-on' : ''} onClick={() => setForm((current) => ({ ...current, poa_type: value }))}>
                              توكيل {value}
                            </button>
                          ))}
                          <i className="lw-segment-thumb" data-pos={form.poa_type === 'عام' ? 'individual' : 'company'} aria-hidden="true" />
                        </div>
                      </fieldset>
                    </div>
                    <div className="lw-field">
                      <label htmlFor="lw-office">جهة التوثيق</label>
                      <input id="lw-office" className="lw-input" maxLength={160} value={form.poa_office} onChange={set('poa_office')} placeholder="مثال: مكتب توثيق مدينة نصر" />
                    </div>
                    <div className="lw-grid">
                      <div className="lw-field">
                        <label htmlFor="lw-issued">تاريخ التحرير</label>
                        <input id="lw-issued" className="lw-input" type="date" value={form.poa_issued_at} onChange={set('poa_issued_at')} />
                      </div>
                      <div className="lw-field">
                        <label htmlFor="lw-expires">تاريخ الانتهاء</label>
                        <input id="lw-expires" className="lw-input" type="date" min={form.poa_issued_at || undefined} value={form.poa_expires_at} onChange={set('poa_expires_at')} />
                        <small>سيبه فاضي لو التوكيل مفتوح المدة.</small>
                      </div>
                    </div>
                  </>
                )}

                {step === 2 && (
                  <>
                    <p className="lw-lead">اتفاق الأتعاب بيتسجل في ملف الموكل كمرجع. المدفوعات الفعلية بتتسجل على كل قضية من شاشة القضايا.</p>
                    <div className="lw-field">
                      <label htmlFor="lw-fee">الأتعاب المتفق عليها (ج)</label>
                      <input id="lw-fee" className="lw-input lw-input--lg" type="number" min="0" step="any" dir="ltr" autoFocus value={form.fee_amount} onChange={set('fee_amount')} placeholder="0" />
                    </div>
                    <fieldset className="lw-field">
                      <legend>طريقة السداد</legend>
                      <div className="lw-choices">
                        {FEE_METHODS.map(([value, label]) => (
                          <button type="button" key={value} className={form.fee_method === value ? 'is-on' : ''} aria-pressed={form.fee_method === value} onClick={() => setForm((current) => ({ ...current, fee_method: value }))}>
                            <span><LegalIcon name={value === 'once' ? 'cash' : value === 'installments' ? 'calendar' : 'trend'} size={20} /></span>
                            {label}
                          </button>
                        ))}
                      </div>
                    </fieldset>
                    <div className="lw-field">
                      <label htmlFor="lw-first">أول دفعة (ج)</label>
                      <input id="lw-first" className="lw-input" type="number" min="0" step="any" dir="ltr" value={form.first_payment} onChange={set('first_payment')} placeholder="0" />
                      {Number(form.fee_amount) > 0 && (
                        <small>المتبقي بعد أول دفعة: {n(Math.max(0, Number(form.fee_amount) - Number(form.first_payment || 0)))} ج</small>
                      )}
                    </div>
                  </>
                )}

                {step === 3 && (
                  <div className="lw-review legal-rise">
                    <section className="lw-review-hero">
                      <span className="lw-avatar">{form.name.trim().charAt(0) || 'م'}</span>
                      <div>
                        <strong>{form.name.trim()}</strong>
                        <small>{isCompany ? 'شركة / كيان اعتباري' : 'فرد'} · {form.status === 'potential' ? 'محتمل' : 'موكل نشط'}{form.source ? ` · ${form.source}` : ''}</small>
                      </div>
                    </section>
                    <dl className="lw-review-list">
                      <div><dt>الهاتف</dt><dd dir="ltr">{form.phone || '—'}</dd></div>
                      <div><dt>الرقم القومي</dt><dd dir="ltr">{form.national_id || 'غير مسجل'}</dd></div>
                      <div><dt>البريد</dt><dd dir="ltr">{form.email || 'غير مسجل'}</dd></div>
                      <div><dt>العنوان</dt><dd>{[form.governorate, form.address].filter(Boolean).join(' — ') || 'غير مسجل'}</dd></div>
                      <div><dt>التوكيل</dt><dd>{form.poa_number ? `${form.poa_type} · ${form.poa_number}` : 'بدون توكيل'}</dd></div>
                      <div><dt>الأتعاب</dt><dd>{form.fee_amount ? `${n(form.fee_amount)} ج · ${FEE_METHODS.find(([value]) => value === form.fee_method)?.[1]}` : 'لم يُتفق'}</dd></div>
                      <div><dt>المسؤول</dt><dd>{form.owner || 'بدون'}</dd></div>
                    </dl>
                  </div>
                )}

                {error && <p className="lw-error" role="alert">{error}</p>}
              </div>

              <aside className="lw-side legal-rise">
                <section className="lw-card">
                  <h3>باقي الخطوات</h3>
                  <ol className="lw-next">
                    {STEPS.slice(1).map((item, index) => (
                      <li key={item.key} className={index + 1 <= step ? 'is-done' : ''}>
                        <span>{index + 1 < step ? <LegalIcon name="check" size={13} /> : n(index + 2)}</span>
                        <div><strong>{item.label}</strong><small>{item.hint}</small></div>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="lw-card lw-card--accent">
                  <h3>اكتمال الملف</h3>
                  <div className="lw-meter-head">
                    <strong>{n(completion.percent)}٪</strong>
                    <span>{completion.missing ? `${n(completion.missing)} حقول أساسية ناقصة` : 'كل الحقول الأساسية مكتملة'}</span>
                  </div>
                  <span className="lw-meter" aria-hidden="true"><i style={{ transform: `scaleX(${completion.percent / 100})` }} /></span>
                  <p>الاسم + الهاتف كفاية تحفظ دلوقتي. الرقم القومي والعنوان مطلوبين وقت تجهيز صحيفة الدعوى.</p>
                </section>
              </aside>
            </div>
          )}

          {!done && (
            <footer className="lw-foot">
              <div className="lw-foot-side">
                <button type="button" className="legal-btn" onClick={() => saveDraft(requestClose)} disabled={saving}>حفظ كمسودة</button>
                {step > 0 && <button type="button" className="legal-btn legal-btn--ghost" onClick={() => goTo(step - 1)} disabled={saving}>السابق</button>}
              </div>
              <span className="lw-foot-count">الخطوة {n(step + 1)} من {n(STEPS.length)}</span>
              {step < STEPS.length - 1 ? (
                <button type="button" className="legal-btn legal-btn--primary lw-next-btn" onClick={() => goTo(step + 1)}>
                  التالي: {STEPS[step + 1].label} <LegalIcon name="arrowLeft" size={17} />
                </button>
              ) : (
                <button type="button" className="legal-btn legal-btn--primary lw-next-btn" onClick={save} disabled={saving}>
                  {saving ? 'جارٍ الحفظ...' : 'حفظ الموكل'} <LegalIcon name="check" size={17} />
                </button>
              )}
            </footer>
          )}
        </>
      )}
    </LegalModalShell>
  );
}

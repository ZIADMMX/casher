import { useEffect } from 'react';
import LegalIcon from './LegalIcon.jsx';
import { BILLING_TYPES, CASE_STATUSES, CASE_TYPES, CLIENT_ROLE_LABELS, feeProgress, formatMoney } from '../../utils/legalCases.js';

const lawyerName = (lawyer) => lawyer.full_name || [lawyer.first_name, lawyer.last_name].filter(Boolean).join(' ') || lawyer.username;

/** Create / edit a case file. The parent owns the form state and the save call. */
export default function CaseFormModal({
  form, setForm, editing, courts, customers, lawyers, saving, error, onSubmit, onClose,
}) {
  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));
  const fee = feeProgress(form);
  const billingHint = BILLING_TYPES.find(([key]) => key === form.billing_type)?.[2];
  const manualCourt = !form.court_id;

  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="legal-modal-overlay" onClick={onClose}>
      <div
        className="legal-modal-container case-form-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="case-form-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="case-form-header">
          <span className="case-form-mark"><LegalIcon name="scale" size={22} /></span>
          <div>
            <h2 id="case-form-title">{editing ? 'تعديل بيانات القضية' : 'قيد وتوثيق ملف قضية جديدة'}</h2>
            <p>الحقول المعلّمة بـ * مطلوبة لإتمام القيد</p>
          </div>
          <button type="button" className="case-form-close" aria-label="إغلاق" onClick={onClose}>✕</button>
        </header>

        <form className="case-form" onSubmit={onSubmit}>
          <div className="case-form-body">
            <section className="case-form-section">
              <h3><span>1</span>بيانات الدعوى والمحكمة</h3>
              <div className="case-form-grid">
                <label>
                  <span>رقم القضية الرسمي <b>*</b></span>
                  <input required value={form.case_number} onChange={(e) => update({ case_number: e.target.value })} placeholder="مثال: 1250 لسنة 2026 مدني كلي" />
                </label>
                <label>
                  <span>المحكمة <b>*</b></span>
                  <select
                    value={form.court_id || (form.court_name ? 'manual' : '')}
                    onChange={(e) => {
                      const selectedId = e.target.value;
                      if (!selectedId || selectedId === 'manual') return update({ court_id: '', court_name: '' });
                      const court = courts.find((item) => String(item.id) === selectedId);
                      return update({ court_id: selectedId, court_name: court?.name || form.court_name });
                    }}
                  >
                    <option value="">اختر المحكمة</option>
                    {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
                    {form.court_id && !courts.some((court) => String(court.id) === String(form.court_id)) && (
                      <option value={form.court_id}>{form.court_name} (المحكمة الحالية)</option>
                    )}
                    <option value="manual">إدخال اسم يدويًا</option>
                  </select>
                  {manualCourt && (
                    <input
                      required
                      maxLength={180}
                      aria-label="اسم المحكمة"
                      placeholder="اكتب اسم المحكمة"
                      value={form.court_name}
                      onChange={(e) => update({ court_id: '', court_name: e.target.value })}
                    />
                  )}
                </label>
                <label>
                  <span>الدائرة المختصة</span>
                  <input value={form.circuit_name || ''} onChange={(e) => update({ circuit_name: e.target.value })} placeholder="مثال: دائرة 3 تعويضات" />
                </label>
                <label>
                  <span>نوع القضية <b>*</b></span>
                  <select required value={form.case_type} onChange={(e) => update({ case_type: e.target.value })}>
                    {CASE_TYPES.filter((type) => type.key !== 'all').map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
                  </select>
                </label>
                <label className="wide">
                  <span>موضوع الدعوى والطلبات <b>*</b></span>
                  <textarea required rows="3" value={form.subject} onChange={(e) => update({ subject: e.target.value })} placeholder="ملخص موضوع الدعوى والطلبات الختامية..." />
                  <small>يظهر هذا الملخص في رول الجلسات وفي رأس ملف القضية.</small>
                </label>
              </div>
            </section>

            <section className="case-form-section">
              <h3><span>2</span>أطراف الدعوى</h3>
              <div className="case-form-party client">
                <h4>جانب الموكّل</h4>
                <div className="case-form-grid">
                  <label>
                    <span>الموكّل <b>*</b></span>
                    <select required value={form.client_id} onChange={(e) => update({ client_id: e.target.value })}>
                      <option value="">— اختر الموكّل من القائمة —</option>
                      {customers.map((customer) => (
                        <option key={customer.id} value={customer.id}>{customer.name}{customer.phone ? ` (${customer.phone})` : ''}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>صفة الموكّل في الدعوى <b>*</b></span>
                    <select required value={form.client_role} onChange={(e) => update({ client_role: e.target.value })}>
                      {Object.entries(CLIENT_ROLE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                  <label className="wide">
                    <span>المحامي المسؤول عن الملف <b>*</b></span>
                    <select required value={form.assigned_lawyer_id} onChange={(e) => update({ assigned_lawyer_id: e.target.value })}>
                      <option value="">اختر المحامي</option>
                      {lawyers.map((lawyer) => <option key={lawyer.id} value={lawyer.id}>{lawyerName(lawyer)}</option>)}
                    </select>
                  </label>
                </div>
              </div>
              <div className="case-form-party opponent">
                <h4>الطرف الآخر</h4>
                <div className="case-form-grid">
                  <label>
                    <span>اسم الخصم <b>*</b></span>
                    <input required value={form.opponent_name} onChange={(e) => update({ opponent_name: e.target.value })} placeholder="اسم الخصم أو اسم الشركة" />
                  </label>
                  <label>
                    <span>محامي الخصم</span>
                    <input value={form.opponent_lawyer || ''} onChange={(e) => update({ opponent_lawyer: e.target.value })} placeholder="اسم محامي الخصم إن وُجد" />
                  </label>
                </div>
              </div>
            </section>

            <section className="case-form-section">
              <h3><span>3</span>الأتعاب والتوكيل</h3>
              <div className="case-form-field">
                <span className="case-form-label">نظام الأتعاب <b>*</b></span>
                <div className="case-form-segments" role="radiogroup" aria-label="نظام الأتعاب">
                  {BILLING_TYPES.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      role="radio"
                      aria-checked={form.billing_type === key}
                      className={form.billing_type === key ? 'active' : ''}
                      onClick={() => update({ billing_type: key })}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <small>{billingHint}</small>
              </div>

              <div className="case-form-grid">
                <label>
                  <span>إجمالي أتعاب العقد {form.billing_type === 'fixed' && <b>*</b>}</span>
                  <span className="case-form-suffix">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      required={form.billing_type === 'fixed'}
                      value={form.contract_amount}
                      onChange={(e) => update({ contract_amount: e.target.value })}
                      placeholder="0"
                    />
                    <span>ج.م</span>
                  </span>
                </label>
                {form.billing_type === 'hourly' && (
                  <label>
                    <span>سعر الساعة</span>
                    <span className="case-form-suffix">
                      <input type="number" min="0" step="0.01" value={form.hourly_rate} onChange={(e) => update({ hourly_rate: e.target.value })} placeholder="0" />
                      <span>ج.م</span>
                    </span>
                  </label>
                )}
                {!editing ? (
                  <label>
                    <span>دفعة مقدّمة عند فتح الملف</span>
                    <span className="case-form-suffix">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        max={fee.total > 0 ? fee.total : undefined}
                        value={form.paid_amount}
                        onChange={(e) => update({ paid_amount: e.target.value })}
                        placeholder="0"
                      />
                      <span>ج.م</span>
                    </span>
                  </label>
                ) : (
                  <label>
                    <span>حالة القضية</span>
                    <select value={form.status} onChange={(e) => update({ status: e.target.value })}>
                      {CASE_STATUSES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                  </label>
                )}
              </div>

              <div className="case-form-fee-bar">
                <span>
                  <LegalIcon name="cash" size={17} />
                  {editing
                    ? `المسدد حتى الآن ${formatMoney(fee.paid)} ج.م — يتعدّل من الملف المالي للقضية.`
                    : 'تُسجَّل الدفعة تلقائيًا كحركة مالية في سجل القضية.'}
                </span>
                {fee.total > 0 && <strong>المتبقي: {formatMoney(fee.remaining)} ج.م</strong>}
              </div>

              <label>
                <span>رقم التوكيل ومكتب التوثيق</span>
                <input value={form.power_of_attorney_num || ''} onChange={(e) => update({ power_of_attorney_num: e.target.value })} placeholder="مثال: توكيل رسمي عام قضايا رقم 1452 ب لسنة 2026 توثيق الأهرام" />
              </label>
              <label>
                <span>ملاحظات داخلية</span>
                <textarea rows="3" value={form.notes || ''} onChange={(e) => update({ notes: e.target.value })} placeholder="ملاحظات تظهر لفريق المكتب فقط..." />
              </label>
            </section>
          </div>

          <footer className="case-form-footer">
            {error
              ? <p className="case-form-error" role="alert"><LegalIcon name="alert" size={16} />{error}</p>
              : <p><LegalIcon name="info" size={16} />تقدر تضيف الجلسات والمستندات بعد حفظ الملف مباشرة.</p>}
            <button type="button" className="btn-secondary-legal" onClick={onClose}>إلغاء</button>
            <button type="submit" className="btn-primary-legal" disabled={saving}>
              <LegalIcon name="check" size={17} />
              {saving ? 'جاري الحفظ...' : editing ? 'حفظ التعديلات' : 'حفظ وقيد القضية'}
            </button>
          </footer>
        </form>
      </div>
    </div>
  );
}

import { useEffect, useMemo, useState } from 'react';
import * as payrollApi from '../../api/payroll.js';

const STEPS = ['الفترة والموظفون', 'البدلات والخصومات', 'المراجعة والاعتماد'];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'نقدي من الخزنة' },
  { value: 'bank_transfer', label: 'تحويل بنكي' },
  { value: 'wallet', label: 'محفظة إلكترونية' },
  { value: 'cheque', label: 'شيك' },
];

const RULES = [
  { key: 'advances', title: 'خصم أقساط السلف تلقائيًا', hint: 'النظام يخصم قسط الشهر من كل موظف عليه سلفة نشطة ويقلّل المتبقي.' },
  { key: 'attendance', title: 'احتساب الغياب والتأخير من سجل الحضور', hint: 'قيمة اليوم = الأساسي ÷ ٣٠، والساعة = اليوم ÷ ٨ ساعات. الإجازات المعتمدة لا تُخصم.' },
  { key: 'transport', title: 'إضافة بدل المواصلات الثابت', hint: 'يُضاف لكل موظف حسب البدل المسجل في ملفه، وتقدر تعدّله في الخطوة الجاية.' },
  { key: 'overtime', title: 'احتساب الأوفرتايم', hint: 'الوقت بعد نهاية الوردية بـ١٫٥ من قيمة ساعة العمل العادية.' },
];

export const money = (value) => Number(value || 0).toLocaleString('ar-EG', { maximumFractionDigits: 2 });
export const initial = (name) => (String(name || '?').trim()[0] || '?');

function pad(value) {
  return String(value).padStart(2, '0');
}

function defaultMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
}

function lastDayOf(monthValue) {
  const [year, month] = monthValue.split('-').map(Number);
  return `${monthValue}-${pad(new Date(year, month, 0).getDate())}`;
}

function errorText(error) {
  return error instanceof Error ? error.message : 'حدث خطأ غير متوقع';
}

export default function PayrollWizard({ onClose, onSaved }) {
  const [step, setStep] = useState(0);
  const [monthValue, setMonthValue] = useState(defaultMonth);
  const [paymentDate, setPaymentDate] = useState(() => lastDayOf(defaultMonth()));
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [rules, setRules] = useState({ advances: true, attendance: true, transport: true, overtime: false });
  const [selected, setSelected] = useState(null); // null until the first preview lists the employees
  const [adjustments, setAdjustments] = useState({});
  const [notes, setNotes] = useState('');
  const [preview, setPreview] = useState(null);
  const [previewError, setPreviewError] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [year, month] = monthValue ? monthValue.split('-').map(Number) : [0, 0];
  const userIds = useMemo(() => (selected ? [...selected] : undefined), [selected]);

  useEffect(() => {
    if (!month || !year) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await payrollApi.previewPayrollPeriod({ month, year, rules, user_ids: userIds, adjustments });
        if (cancelled) return;
        setPreview(result);
        setPreviewError('');
        setSelected((current) => current || new Set(result.items.map((item) => item.user_id)));
      } catch (previewFailure) {
        if (!cancelled) setPreviewError(errorText(previewFailure));
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [month, year, rules, userIds, adjustments]);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape' && !saving) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, saving]);

  const items = preview?.items || [];
  const included = items.filter((item) => item.included);
  const totals = preview?.totals;

  function changeMonth(value) {
    setMonthValue(value);
    if (value) setPaymentDate(lastDayOf(value));
  }

  function toggleEmployee(userId) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function setAdjustment(userId, field, value) {
    setAdjustments((current) => ({ ...current, [userId]: { ...current[userId], [field]: value } }));
  }

  function validate() {
    if (!month) return 'اختر شهر المسير.';
    if (preview?.period_exists) return 'يوجد مسير مسجل لهذا الشهر بالفعل.';
    if (!included.length) return 'اختر موظفًا واحدًا على الأقل.';
    return '';
  }

  function next() {
    const problem = validate();
    setError(problem);
    if (!problem) setStep((current) => Math.min(current + 1, STEPS.length - 1));
  }

  async function save(approve) {
    const problem = validate();
    setError(problem);
    if (problem) return;
    setSaving(true);
    try {
      const period = await payrollApi.generatePayrollPeriod({
        month,
        year,
        rules,
        user_ids: userIds,
        adjustments,
        payment_date: paymentDate || null,
        payment_method: paymentMethod,
        notes,
        approve,
      });
      onSaved(period, approve);
    } catch (saveError) {
      setError(errorText(saveError));
      setSaving(false);
    }
  }

  return (
    <div className="pay-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="pay-wizard" role="dialog" aria-modal="true" aria-labelledby="pay-wizard-title" dir="rtl">
        <header className="pay-wizard-header">
          <div>
            <span className="pay-eyebrow">الرواتب والمستحقات</span>
            <h2 id="pay-wizard-title">مسير راتب جديد</h2>
          </div>
          <button type="button" className="pay-close" onClick={onClose} disabled={saving} aria-label="إغلاق">×</button>
        </header>

        <ol className="pay-steps" aria-label={`الخطوة ${step + 1} من ${STEPS.length}`}>
          {STEPS.map((label, index) => (
            <li key={label} className={index < step ? 'is-done' : index === step ? 'is-current' : ''} aria-current={index === step ? 'step' : undefined}>
              <span>{index < step ? '✓' : money(index + 1)}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>

        <div className="pay-wizard-body">
          <div className="pay-wizard-main">
            {(error || previewError) && <p className="pay-alert is-danger" role="alert">{error || previewError}</p>}

            {step === 0 && (
              <>
                <div className="pay-form-grid">
                  <label className="pay-field">
                    <span>شهر المسير <b>*</b></span>
                    <input type="month" value={monthValue} onChange={(event) => changeMonth(event.target.value)} required autoFocus />
                  </label>
                  <label className="pay-field">
                    <span>تاريخ الصرف</span>
                    <input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} />
                  </label>
                  <label className="pay-field">
                    <span>طريقة الصرف</span>
                    <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value)}>
                      {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                    </select>
                  </label>
                </div>
                {preview?.period_exists && <p className="pay-alert is-warning">يوجد مسير مسجل لشهر {preview.period_name.replace('مسير رواتب ', '')} بالفعل. اختر شهرًا آخر.</p>}

                <fieldset className="pay-rules">
                  <legend>قواعد الاحتساب</legend>
                  {RULES.map((rule) => (
                    <label key={rule.key} className="pay-rule">
                      <input
                        type="checkbox"
                        checked={rules[rule.key]}
                        onChange={(event) => setRules((current) => ({ ...current, [rule.key]: event.target.checked }))}
                      />
                      <span>
                        <strong>{rule.title}</strong>
                        <small>{rule.hint}</small>
                      </span>
                    </label>
                  ))}
                </fieldset>

                <div className="pay-section-head">
                  <h3>الموظفون المشمولون</h3>
                  <span>اختير {money(included.length)} من {money(items.length)}</span>
                </div>
                <ul className="pay-employee-list">
                  {!preview && <li className="pay-muted">جارٍ تحميل الموظفين...</li>}
                  {preview && items.length === 0 && <li className="pay-muted">لا يوجد موظفون نشطون.</li>}
                  {items.map((item) => (
                    <li key={item.user_id}>
                      <label>
                        <input type="checkbox" checked={item.included} onChange={() => toggleEmployee(item.user_id)} />
                        <span className="pay-avatar" aria-hidden="true">{initial(item.full_name)}</span>
                        <span className="pay-person">
                          <strong>{item.full_name}</strong>
                          <small>{item.job_title || 'موظف'}</small>
                        </span>
                      </label>
                      <span className="pay-muted">
                        {item.pay_type === 'hourly' ? `${money(item.worked_hours)} ساعة` : 'أساسي'} <b>{money(item.basic_salary)}</b>
                      </span>
                      {item.advance_installment > 0
                        ? <span className="pay-chip is-warning">سلفة · قسط {money(item.advance_installment)}</span>
                        : <span className="pay-muted">—</span>}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {step === 1 && (
              <>
                <p className="pay-muted">عدّل أي موظف يدويًا: حافز، مكافأة، جزاء، أو بدل إضافي. الصافي بيتحدث فورًا.</p>
                <ul className="pay-adjust-list">
                  {included.map((item) => {
                    const adj = adjustments[item.user_id] || {};
                    return (
                      <li key={item.user_id}>
                        <div className="pay-adjust-head">
                          <span className="pay-avatar" aria-hidden="true">{initial(item.full_name)}</span>
                          <span className="pay-person">
                            <strong>{item.full_name}</strong>
                            <small>
                              أساسي {money(item.basic_salary)}
                              {item.absent_days > 0 && ` · غياب ${money(item.absent_days)} يوم`}
                              {item.late_minutes > 0 && ` · تأخير ${money(item.late_minutes)} دقيقة`}
                              {item.overtime_amount > 0 && ` · أوفرتايم ${money(item.overtime_amount)}`}
                              {item.advances_deducted > 0 && ` · قسط سلفة ${money(item.advances_deducted)}`}
                            </small>
                          </span>
                          <span className="pay-net"><small>الصافي</small>{money(item.net_salary)}</span>
                        </div>
                        <div className="pay-adjust-fields">
                          {rules.transport && (
                            <label className="pay-field">
                              <span>بدل مواصلات</span>
                              <input type="number" min="0" step="any" value={adj.transport_allowance ?? item.transport_allowance}
                                onChange={(event) => setAdjustment(item.user_id, 'transport_allowance', event.target.value)} />
                            </label>
                          )}
                          <label className="pay-field">
                            <span>حافز / مكافأة</span>
                            <input type="number" min="0" step="any" placeholder="0" value={adj.bonus ?? ''}
                              onChange={(event) => setAdjustment(item.user_id, 'bonus', event.target.value)} />
                          </label>
                          <label className="pay-field">
                            <span>بدل إضافي</span>
                            <input type="number" min="0" step="any" placeholder="0" value={adj.allowance ?? ''}
                              onChange={(event) => setAdjustment(item.user_id, 'allowance', event.target.value)} />
                          </label>
                          <label className="pay-field">
                            <span>خصم / جزاء</span>
                            <input type="number" min="0" step="any" placeholder="0" value={adj.deduction ?? ''}
                              onChange={(event) => setAdjustment(item.user_id, 'deduction', event.target.value)} />
                          </label>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {rules.transport && <p className="pay-alert">بدل المواصلات اللي تكتبه هنا بيتحفظ في ملف الموظف ويتملي تلقائيًا الشهر الجاي.</p>}
              </>
            )}

            {step === 2 && (
              <>
                <div className="pay-table-scroll">
                  <table className="pay-table">
                    <thead>
                      <tr><th>الموظف</th><th>الأساسي</th><th>بدلات</th><th>غياب/خصم</th><th>قسط سلفة</th><th>الصافي</th></tr>
                    </thead>
                    <tbody>
                      {included.map((item) => (
                        <tr key={item.user_id}>
                          <td><strong>{item.full_name}</strong></td>
                          <td>{money(item.basic_salary)}</td>
                          <td className="is-plus">+{money(item.transport_allowance + item.other_allowances + item.overtime_amount + item.bonus_amount)}</td>
                          <td className="is-minus">−{money(item.absent_deduction + item.deductions_amount)}</td>
                          <td className="is-minus">−{money(item.advances_deducted)}</td>
                          <td><strong>{money(item.net_salary)}</strong></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <label className="pay-field">
                  <span>ملاحظات على المسير</span>
                  <textarea rows="2" maxLength={500} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="مثال: مكافأة نهاية السنة لفريق المبيعات" />
                </label>
                <p className="pay-alert">بعد الاعتماد يتقفل المسير ويبدأ الصرف. لو لسه محتاج تراجع، احفظه كمسودة.</p>
              </>
            )}
          </div>

          <aside className="pay-wizard-aside">
            <section className="pay-estimate">
              <h3>تقدير المسير</h3>
              <dl>
                <div><dt>الرواتب الأساسية</dt><dd>{money(totals?.basic)}</dd></div>
                <div><dt>بدلات</dt><dd className="is-plus">+ {money(totals?.allowances)}</dd></div>
                <div><dt>خصومات غياب</dt><dd className="is-minus">− {money(totals?.attendance_deductions)}</dd></div>
                <div><dt>أقساط سلف</dt><dd className="is-minus">− {money(totals?.advances)}</dd></div>
                <div className="is-total"><dt>الصافي التقديري</dt><dd>{money(totals?.net)}</dd></div>
              </dl>
              <small>الرقم تقديري لحد ما تتقفل بيانات الحضور آخر الشهر.</small>
            </section>
            {step === 0 && (
              <section className="pay-next-steps">
                <h3>الخطوات الجاية</h3>
                <ol>
                  <li><span>٢</span><div><strong>البدلات والخصومات</strong><small>تعديل يدوي لأي موظف: حافز، مكافأة، جزاء، أو بدل إضافي.</small></div></li>
                  <li><span>٣</span><div><strong>المراجعة والاعتماد</strong><small>بعد الاعتماد يتقفل المسير ويبدأ صرف الرواتب.</small></div></li>
                </ol>
              </section>
            )}
          </aside>
        </div>

        <footer className="pay-wizard-footer">
          <button type="button" className="pay-btn" onClick={() => save(false)} disabled={saving}>حفظ كمسودة</button>
          <span>
            {step > 0 && <button type="button" className="pay-link" onClick={() => { setError(''); setStep(step - 1); }} disabled={saving}>السابق</button>}
            الخطوة {money(step + 1)} من {money(STEPS.length)}
          </span>
          {step < STEPS.length - 1 ? (
            <button type="button" className="pay-btn is-primary" onClick={next} disabled={!preview}>
              التالي: {STEPS[step + 1]} <span aria-hidden="true">←</span>
            </button>
          ) : (
            <button type="button" className="pay-btn is-primary" onClick={() => save(true)} disabled={saving}>
              {saving ? 'جارٍ الحفظ...' : 'اعتماد المسير'}
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}

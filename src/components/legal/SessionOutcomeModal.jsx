import { useEffect, useMemo, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import LegalModalShell from './LegalModalShell.jsx';
import LegalIcon from './LegalIcon.jsx';
import '../../styles/sessionOutcome.css';

const OUTCOMES = [
  ['postponed', 'تأجيل'],
  ['verdict_reserved', 'حجز للحكم'],
  ['judged', 'صدور حكم'],
  ['pleaded', 'مرافعة تمت'],
  ['struck', 'شطب'],
  ['not_held', 'لم تنعقد'],
];

const VERDICT_RESULTS = [
  ['favorable', 'لصالح الموكل'],
  ['partial', 'لصالحه جزئيًا'],
  ['unfavorable', 'ضد الموكل'],
];

const NEEDS_NEXT_DATE =new Set(['postponed', 'verdict_reserved', 'not_held']);

const POSTPONE_REASONS = [
  'لتقديم مستندات',
  'لإعلان الخصم',
  'لسماع الشهود',
  'لتقديم مذكرات',
  'لورود تقرير الخبير',
  'لضم ملف',
  'لعذر المحامي',
];

const EXPENSE_TYPES = [
  ['court_fee', 'رسوم محكمة'],
  ['expert_fee', 'رسوم خبير'],
  ['announcement_fee', 'مصاريف إعلان'],
  ['other_expense', 'مصروف آخر'],
];

const CASE_TYPES = {
  civil: 'مدني',
  commercial: 'تجاري',
  criminal: 'جنائي',
  labor: 'عمالي',
  family: 'أسرة',
  administrative: 'إداري',
  inheritance: 'مواريث',
};

const EMPTY_EXPENSE = { description: '', amount: '', type: 'court_fee', paid_by_client: true };

function money(value) {
  return `${Math.round(Number(value) || 0).toLocaleString('ar-EG')} ج.م`;
}

export function sessionTime(value) {
  if (!value) return { clock: '—', period: '' };
  const date = new Date(String(value).replace(' ', 'T'));
  const hour = date.getHours();
  const clock = `${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`
    .replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  return { clock, period: hour < 12 ? 'صباحًا' : hour < 17 ? 'ظهرًا' : 'مساءً' };
}

function historyDate(value) {
  if (!value) return '';
  return new Date(String(value).replace(' ', 'T'))
    .toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function SessionOutcomeModal({ session, onClose, onSaved }) {
  const [caseFile, setCaseFile] = useState(null);
  const [finance, setFinance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [outcome, setOutcome] = useState('postponed');
  const [nextDate, setNextDate] = useState('');
  const [reason, setReason] = useState(POSTPONE_REASONS[0]);
  const [preparation, setPreparation] = useState('');
  const [decision, setDecision] = useState('');
  const [verdictResult, setVerdictResult] = useState('');
  const [expenses, setExpenses] = useState([{ ...EMPTY_EXPENSE }]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      legalApi.getCaseById(session.case_id),
      legalApi.getCaseFinancialBreakdown(session.case_id),
    ])
      .then(([file, breakdown]) => {
        if (cancelled) return;
        setCaseFile(file);
        setFinance(breakdown);
        setError('');
      })
      .catch((loadError) => {
        if (cancelled) return;
        setError(loadError instanceof Error ? loadError.message : 'تعذر تحميل بيانات القضية');
      })
      .finally(() => !cancelled && setLoading(false));
    return () => { cancelled = true; };
  }, [session.case_id]);

  const lastSessions = useMemo(() => (caseFile?.sessions || [])
    .filter((item) => item.id !== session.id && item.decision)
    .slice(0, 2), [caseFile, session.id]);

  const needsNextDate = NEEDS_NEXT_DATE.has(outcome);
  const time = sessionTime(session.session_date);

  function updateExpense(index, patch) {
    setExpenses((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      // keep one blank row at the end so a second expense never needs an extra click
      if (next.every((row) => row.description || row.amount)) next.push({ ...EMPTY_EXPENSE });
      return next;
    });
  }

  async function handleSubmit(event, requestClose) {
    event.preventDefault();
    if (needsNextDate && !nextDate) {
      setError('تاريخ الجلسة القادمة مطلوب');
      return;
    }
    if (outcome === 'judged' && !verdictResult) {
      setError('حدد نتيجة الحكم بالنسبة للموكل');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // the new hearing keeps the time of the one being recorded
      const clock = String(session.session_date).replace(' ', 'T').slice(11, 19) || '09:00:00';
      await legalApi.recordSessionOutcome(session.id, {
        outcome,
        next_session_date: nextDate ? `${nextDate}T${clock}` : null,
        next_session_reason: needsNextDate ? reason : null,
        preparation: preparation.trim() || null,
        decision: decision.trim() || null,
        verdict_result: outcome === 'judged' ? verdictResult : null,
        expenses: expenses
          .filter((row) => Number(row.amount) > 0)
          .map((row) => ({
            type: row.type,
            amount: Number(row.amount),
            description: row.description,
            paid_by_client: row.paid_by_client,
          })),
      });
      setSaving(false);
      onSaved();
      requestClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ إجراء الجلسة');
      setSaving(false);
    }
  }

  return (
    <LegalModalShell onClose={onClose} locked={saving} labelledBy="so-title" className="so">
      {(requestClose) => (
        <form className="so-form" onSubmit={(event) => handleSubmit(event, requestClose)}>
          <header className="legal-sheet-head so-head">
            <span className="so-time">
              <b>{time.clock}</b>
              <small>{time.period}</small>
            </span>
            <div className="so-title">
              <span className="legal-sheet-eyebrow">تسجيل إجراء الجلسة</span>
              <h2 id="so-title">قضية {session.case_number || caseFile?.case_number || '—'} — {caseFile?.subject || session.case_subject || 'جلسة'}</h2>
              <p>
                {session.court_name || caseFile?.court_name || 'محكمة غير محددة'}
                {' · '}{caseFile?.circuit_name || session.circuit_name || 'بدون دائرة'}
                {' · '}الموكل: {session.client_name || caseFile?.client_name || '—'}
              </p>
            </div>
            <button type="button" className="legal-x" onClick={requestClose} aria-label="إغلاق">
              <LegalIcon name="close" size={18} />
            </button>
          </header>

          <div className="so-body">
            <div className="so-main legal-rise">
              <fieldset className="so-field">
                <legend>نتيجة الجلسة <b>*</b></legend>
                <div className="so-choices">
                  {OUTCOMES.map(([key, label]) => (
                    <button
                      key={key}
                      type="button"
                      className={outcome === key ? 'is-active' : ''}
                      aria-pressed={outcome === key}
                      onClick={() => setOutcome(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </fieldset>

              {outcome === 'judged' && (
                <fieldset className="so-field so-panel" key="verdict">
                  <legend>نتيجة الحكم للموكل <b>*</b></legend>
                  <div className="so-choices so-verdict">
                    {VERDICT_RESULTS.map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`is-${key}${verdictResult === key ? ' is-active' : ''}`}
                        aria-pressed={verdictResult === key}
                        onClick={() => setVerdictResult(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              )}

              {needsNextDate && (
                <div className="so-panel" key={outcome}>
                  <div className="so-grid">
                    <label>
                      <span>تاريخ الجلسة القادمة <b>*</b></span>
                      <input type="date" value={nextDate} onChange={(e) => setNextDate(e.target.value)} required />
                    </label>
                    <label>
                      <span>{outcome === 'verdict_reserved' ? 'المطلوب' : 'سبب التأجيل'}</span>
                      <select value={reason} onChange={(e) => setReason(e.target.value)}>
                        {POSTPONE_REASONS.map((item) => <option key={item} value={item}>{item}</option>)}
                      </select>
                    </label>
                  </div>
                  <label className="so-block">
                    <span>المطلوب تجهيزه قبل الجلسة القادمة</span>
                    <input
                      type="text"
                      value={preparation}
                      onChange={(e) => setPreparation(e.target.value)}
                      placeholder="مثال: حافظة مستندات + مذكرة بدفاع"
                    />
                    <small>هيتسجل كمهمة في صفحة اليوم قبل الجلسة بيومين.</small>
                  </label>
                </div>
              )}

              <label className="so-block">
                <span>ما تم في الجلسة</span>
                <textarea
                  rows="4"
                  value={decision}
                  onChange={(e) => setDecision(e.target.value)}
                  placeholder="ملخص سريع للمرافعة أو لما حصل في الجلسة..."
                />
              </label>

              <section className="so-expenses">
                <h3>مصروفات الجلسة</h3>
                <div className="so-expense-head" aria-hidden="true">
                  <span>البيان</span>
                  <span>المبلغ</span>
                  <span>النوع</span>
                  <span>تُخصم من</span>
                </div>
                {expenses.map((row, index) => (
                  <div className="so-expense-row" key={index}>
                    <input
                      type="text"
                      value={row.description}
                      onChange={(e) => updateExpense(index, { description: e.target.value })}
                      placeholder="مثال: رسوم خبير"
                      aria-label="بيان المصروف"
                    />
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={row.amount}
                      onChange={(e) => updateExpense(index, { amount: e.target.value })}
                      placeholder="0"
                      aria-label="المبلغ"
                    />
                    <select value={row.type} onChange={(e) => updateExpense(index, { type: e.target.value })} aria-label="نوع المصروف">
                      {EXPENSE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                    <select
                      value={row.paid_by_client ? 'client' : 'office'}
                      onChange={(e) => updateExpense(index, { paid_by_client: e.target.value === 'client' })}
                      aria-label="تُخصم من"
                    >
                      <option value="client">أمانة الموكل</option>
                      <option value="office">خزنة المكتب</option>
                    </select>
                  </div>
                ))}
                <small className="so-muted">
                  اللي يتخصم من أمانة الموكل بيقلل الرصيد المتاح ({money(finance?.retainer_balance)}).
                </small>
              </section>

              {error && <p className="so-error" role="alert">{error}</p>}
            </div>

            <aside className="so-side legal-rise">
              <section className="so-card">
                <h3>ملخص القضية</h3>
                <dl>
                  <dt>نوع القضية</dt>
                  <dd>{CASE_TYPES[caseFile?.case_type] || caseFile?.case_type || '—'}{caseFile?.subject ? ` — ${caseFile.subject}` : ''}</dd>
                  <dt>قيمة المطالبة</dt>
                  <dd>{money(caseFile?.contract_amount)}</dd>
                  <dt>الخصم</dt>
                  <dd>{caseFile?.opponent_name || session.opponent_name || '—'}</dd>
                  <dt>رصيد أمانة الموكل</dt>
                  <dd>{money(finance?.retainer_balance)}</dd>
                  <dt>المحامي المسؤول</dt>
                  <dd>{session.assigned_lawyer_name || caseFile?.assigned_lawyer_name || 'لم يُعيّن'}</dd>
                </dl>
              </section>

              <section className="so-card">
                <h3>آخر جلستين</h3>
                {loading ? <p className="so-muted so-shimmer">جارٍ التحميل...</p>
                  : lastSessions.length === 0 ? <p className="so-muted">لا توجد جلسات سابقة مسجلة.</p>
                    : (
                      <ol className="so-history">
                        {lastSessions.map((item) => (
                          <li key={item.id}>
                            <strong>{historyDate(item.session_date)}</strong>
                            <p>{item.decision}</p>
                          </li>
                        ))}
                      </ol>
                    )}
              </section>
            </aside>
          </div>

          <footer className="so-foot">
            <button type="button" className="legal-btn" onClick={requestClose} disabled={saving}>إلغاء</button>
            <span>هيتسجل في ملف القضية وسجل تواصل الموكل.</span>
            <button type="submit" className="legal-btn legal-btn--primary so-save" disabled={saving || loading}>
              {saving ? 'جارٍ الحفظ...' : needsNextDate ? 'حفظ وجدولة الجلسة القادمة' : 'حفظ إجراء الجلسة'}
            </button>
          </footer>
        </form>
      )}
    </LegalModalShell>
  );
}

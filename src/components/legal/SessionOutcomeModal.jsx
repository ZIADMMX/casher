import { useEffect, useMemo, useState } from 'react';
import * as legalApi from '../../api/legal.js';
import '../../styles/sessionOutcome.css';

const OUTCOMES = [
  ['postponed', 'تأجيل'],
  ['verdict_reserved', 'حجز للحكم'],
  ['judged', 'صدور حكم'],
  ['pleaded', 'مرافعة تمت'],
  ['struck', 'شطب'],
  ['not_held', 'لم تنعقد'],
];

const NEEDS_NEXT_DATE = new Set(['postponed', 'verdict_reserved', 'not_held']);

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

function sessionTime(value) {
  if (!value) return { clock: '—', period: '' };
  const date = new Date(String(value).replace(' ', 'T'));
  const hour = date.getHours();
  const clock = `${hour % 12 || 12}:${String(date.getMinutes()).padStart(2, '0')}`
    .replace(/\d/g, (d) => '٠١٢٣٤٥٦٧٨٩'[d]);
  return { clock, period: hour < 12 ? 'صباحًا' : 'مساءً' };
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

  function updateExpense(index, patch) {
    setExpenses((prev) => {
      const next = prev.map((row, i) => (i === index ? { ...row, ...patch } : row));
      // keep one blank row at the end so a second expense never needs an extra click
      if (next.every((row) => row.description || row.amount)) next.push({ ...EMPTY_EXPENSE });
      return next;
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (needsNextDate && !nextDate) {
      setError('تاريخ الجلسة القادمة مطلوب');
      return;
    }
    setSaving(true);
    setError('');
    try {
      // the new hearing keeps the time of the one being recorded
      const time = String(session.session_date).replace(' ', 'T').slice(11, 19) || '09:00:00';
      await legalApi.recordSessionOutcome(session.id, {
        outcome,
        next_session_date: nextDate ? `${nextDate}T${time}` : null,
        next_session_reason: needsNextDate ? reason : null,
        preparation: preparation.trim() || null,
        decision: decision.trim() || null,
        expenses: expenses
          .filter((row) => Number(row.amount) > 0)
          .map((row) => ({
            type: row.type,
            amount: Number(row.amount),
            description: row.description,
            paid_by_client: row.paid_by_client,
          })),
      });
      onSaved();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'تعذر حفظ إجراء الجلسة');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="session-outcome-overlay" onClick={onClose}>
      <form className="session-outcome" dir="rtl" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <header className="session-outcome-head">
          <span className="session-outcome-time">
            <b>{sessionTime(session.session_date).clock}</b>
            <small>{sessionTime(session.session_date).period}</small>
          </span>
          <div className="session-outcome-title">
            <span className="session-outcome-eyebrow">تسجيل إجراء الجلسة</span>
            <h2>قضية {session.case_number || caseFile?.case_number || '—'} — {caseFile?.subject || session.case_subject || 'جلسة'}</h2>
            <p>
              {session.court_name || caseFile?.court_name || 'محكمة غير محددة'}
              {' · '}{caseFile?.circuit_name || session.circuit_name || 'بدون دائرة'}
              {' · '}الموكل: {session.client_name || caseFile?.client_name || '—'}
            </p>
          </div>
          <button type="button" className="session-outcome-close" onClick={onClose} aria-label="إغلاق">✕</button>
        </header>

        <div className="session-outcome-body">
          <aside className="session-outcome-side">
            <section className="session-outcome-card">
              <h3>ملخص القضية</h3>
              <dl>
                <dt>نوع القضية</dt>
                <dd>{CASE_TYPES[caseFile?.case_type] || caseFile?.case_type || '—'}</dd>
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

            <section className="session-outcome-card">
              <h3>آخر جلستين</h3>
              {loading ? <p className="session-outcome-muted">جارٍ التحميل...</p>
                : lastSessions.length === 0 ? <p className="session-outcome-muted">لا توجد جلسات سابقة مسجلة.</p>
                  : lastSessions.map((item) => (
                    <div key={item.id} className="session-outcome-history">
                      <strong>{historyDate(item.session_date)}</strong>
                      <p>{item.decision}</p>
                    </div>
                  ))}
            </section>
          </aside>

          <div className="session-outcome-main">
            <fieldset className="session-outcome-field">
              <legend>نتيجة الجلسة <b>*</b></legend>
              <div className="session-outcome-choices">
                {OUTCOMES.map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={outcome === key ? 'active' : ''}
                    aria-pressed={outcome === key}
                    onClick={() => setOutcome(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </fieldset>

            {needsNextDate && (
              <div className="session-outcome-panel">
                <div className="session-outcome-grid">
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
                <label className="session-outcome-block">
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

            <label className="session-outcome-block">
              <span>ما تم في الجلسة</span>
              <textarea
                rows="4"
                value={decision}
                onChange={(e) => setDecision(e.target.value)}
                placeholder="ملخص سريع للمرافعة أو لما حصل في الجلسة..."
              />
            </label>

            <section className="session-outcome-expenses">
              <h3>مصروفات الجلسة</h3>
              <div className="session-outcome-expense-head">
                <span>البيان</span>
                <span>المبلغ</span>
                <span>النوع</span>
                <span>تُخصم من</span>
              </div>
              {expenses.map((row, index) => (
                <div className="session-outcome-expense-row" key={index}>
                  <input
                    type="text"
                    value={row.description}
                    onChange={(e) => updateExpense(index, { description: e.target.value })}
                    placeholder="مثال: رسوم خبير"
                  />
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={row.amount}
                    onChange={(e) => updateExpense(index, { amount: e.target.value })}
                    placeholder="0"
                  />
                  <select value={row.type} onChange={(e) => updateExpense(index, { type: e.target.value })}>
                    {EXPENSE_TYPES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                  </select>
                  <select
                    value={row.paid_by_client ? 'client' : 'office'}
                    onChange={(e) => updateExpense(index, { paid_by_client: e.target.value === 'client' })}
                  >
                    <option value="client">أمانة الموكل</option>
                    <option value="office">خزنة المكتب</option>
                  </select>
                </div>
              ))}
              <small className="session-outcome-muted">
                اللي يتخصم من أمانة الموكل بيقلل الرصيد المتاح ({money(finance?.retainer_balance)}).
              </small>
            </section>

            {error && <p className="session-outcome-error" role="alert">{error}</p>}
          </div>
        </div>

        <footer className="session-outcome-foot">
          <button type="submit" className="session-outcome-save" disabled={saving || loading}>
            {saving ? 'جارٍ الحفظ...' : needsNextDate ? 'حفظ وجدولة الجلسة القادمة' : 'حفظ إجراء الجلسة'}
          </button>
          <span>هيتسجل في ملف القضية وسجل تواصل الموكل.</span>
          <button type="button" className="session-outcome-cancel" onClick={onClose}>إلغاء</button>
        </footer>
      </form>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as shiftsApi from '../../api/shifts.js';
import * as authApi from '../../api/auth.js';
import '../../styles/subscriptionCheckout.css';

// Visa, Vodafone Cash and InstaPay are all non-cash, so they are recorded under the
// "card" shift total; only cash lands in the drawer.
const METHODS = [
  { key: 'cash', label: 'كاش', hint: 'نقدًا في الدرج', backend: 'cash', badge: 'ك' },
  { key: 'visa', label: 'فيزا', hint: 'ماكينة POS', backend: 'card', badge: 'V' },
  { key: 'vodafone', label: 'فودافون كاش', hint: 'محفظة إلكترونية', backend: 'card', badge: 'ف' },
  { key: 'instapay', label: 'إنستاباي', hint: 'تحويل فوري', backend: 'card', badge: 'IP' },
];

const TYPES = [
  { key: 'full', label: 'دفعة كاملة', hint: 'طريقة واحدة' },
  { key: 'split', label: 'تقسيم الدفعة', hint: 'أكثر من طريقة' },
  { key: 'installment', label: 'تقسيط', hint: 'مقدّم + باقي آجل' },
];

const QUICK_ADDS = [500, 1000];
const NUMPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', '00'];

const toCents = (v) => Math.round((Number(v) || 0) * 100);
const fromCents = (c) => c / 100;
const money = (v) => (Number(v) || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });
const isoDay = (offsetDays) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
const clock = () => new Date().toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });

/**
 * Collection screen shown when a member subscribes or renews.
 * onConfirm receives payments [{ method: 'cash'|'card'|'credit', amount, due_date? }]
 * that add up to `price`; it may return a promise (rejections are shown inline).
 */
export default function SubscriptionCheckout({ mode = 'new', customerName, customerPhone, packageName, price, onConfirm, onClose, inline = false }) {
  const total = Number(price) || 0;
  const totalCents = toCents(total);

  const [type, setType] = useState('full');
  const [selected, setSelected] = useState(['cash']);
  const [amounts, setAmounts] = useState({});
  const [active, setActive] = useState('cash');
  const [received, setReceived] = useState('');
  const [dueDate, setDueDate] = useState(isoDay(30));
  const [shift, setShift] = useState(undefined); // undefined = loading, null = none open
  const [shiftError, setShiftError] = useState('');
  const [cashier, setCashier] = useState('');
  const [time, setTime] = useState(clock);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const dialogRef = useRef(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const current = shiftsApi.getCurrentShift.isAvailable() ? await shiftsApi.getCurrentShift() : null;
        if (alive) setShift(current || null);
      } catch (err) {
        // A failed lookup is not "no open shift": say what happened so it is not misread.
        if (alive) { setShift(null); setShiftError(err.message || 'تعذر قراءة بيانات الوردية'); }
      }
      try {
        const session = authApi.getSession.isAvailable() ? await authApi.getSession() : null;
        if (alive && session) setCashier(session.full_name || session.username || '');
      } catch { /* the cashier name is decoration */ }
    })();
    const tick = setInterval(() => setTime(clock()), 30000);
    return () => { alive = false; clearInterval(tick); };
  }, []);

  useEffect(() => {
    if (inline) return undefined; // embedded in a page: no focus grab, no Escape-to-close
    dialogRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape' && !submitting) onClose?.(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inline, onClose, submitting]);

  // ---- amounts per type --------------------------------------------------
  const lineCents = useCallback((key) => {
    if (type === 'full') return selected.includes(key) ? totalCents : 0;
    return selected.includes(key) ? toCents(amounts[key]) : 0;
  }, [type, selected, amounts, totalCents]);

  const paidCents = useMemo(() => selected.reduce((sum, key) => sum + lineCents(key), 0), [selected, lineCents]);
  const remainingCents = totalCents - paidCents;
  const cashCents = lineCents('cash');
  const changeCents = type === 'full' && selected[0] === 'cash' && received !== '' ? toCents(received) - totalCents : 0;

  function changeType(next) {
    if (next === type) return;
    setType(next);
    setError('');
    setAmounts({});
    setReceived('');
    setSelected(next === 'installment' ? [] : [selected[0] || 'cash']);
    setActive(next === 'installment' ? '' : selected[0] || 'cash');
  }

  function pickMethod(key) {
    setError('');
    if (type === 'full') {
      setSelected([key]);
      setActive(key);
      setReceived('');
      return;
    }
    if (selected.includes(key)) {
      const rest = selected.filter((k) => k !== key);
      if (type === 'split' && rest.length === 0) return; // keep at least one method
      setSelected(rest);
      setAmounts((a) => { const next = { ...a }; delete next[key]; return next; });
      setActive(rest[rest.length - 1] || '');
      return;
    }
    // A newly added method starts with what is still unpaid (split) or empty (installment).
    setSelected([...selected, key]);
    setAmounts((a) => ({ ...a, [key]: type === 'split' && remainingCents > 0 ? String(fromCents(remainingCents)) : '' }));
    setActive(key);
  }

  const editable = type === 'full' ? selected[0] === 'cash' : Boolean(active) && selected.includes(active);
  const field = type === 'full' ? received : amounts[active] ?? '';
  const setField = (value) => {
    const clean = String(value).replace(/[^\d.]/g, '').replace(/^0+(?=\d)/, '');
    if (type === 'full') setReceived(clean);
    else if (active) setAmounts((a) => ({ ...a, [active]: clean }));
  };
  const press = (k) => {
    if (!editable) return;
    if (k === 'back') setField(field.slice(0, -1));
    else setField(field + k);
  };
  const quickAdd = (n) => setField(String(fromCents(toCents(field) + n * 100)));
  const fillRest = () => {
    if (type === 'full') setReceived(String(total));
    else setField(String(fromCents(toCents(field) + Math.max(remainingCents, 0))));
  };

  // ---- validation + payload ---------------------------------------------
  const problem = useMemo(() => {
    if (total <= 0) return 'قيمة الباقة غير صالحة';
    if (shift === undefined) return 'جاري قراءة الوردية...';
    if (!shift) return shiftError ? `تعذر قراءة الوردية: ${shiftError}` : 'لا توجد وردية مفتوحة. افتح وردية أولاً ثم أعد المحاولة';
    if (type === 'full') return selected.length === 1 ? '' : 'اختر طريقة الدفع';
    if (selected.some((k) => lineCents(k) <= 0)) return 'أدخل مبلغًا أكبر من صفر لكل طريقة مختارة';
    if (type === 'split') {
      if (selected.length < 1) return 'اختر طريقة دفع';
      return remainingCents === 0 ? '' : `المتبقي ${money(fromCents(remainingCents))} ج.م لازم يتوزّع على الطرق`;
    }
    if (remainingCents <= 0) return 'في التقسيط لازم يتبقى مبلغ آجل. استخدم "دفعة كاملة" للسداد الكامل';
    if (!dueDate) return 'حدّد تاريخ استحقاق المبلغ المتبقي';
    return '';
  }, [total, shift, shiftError, type, selected, lineCents, remainingCents, dueDate]);

  function buildPayments() {
    const byMethod = new Map();
    for (const key of selected) {
      const backend = METHODS.find((m) => m.key === key).backend;
      byMethod.set(backend, (byMethod.get(backend) || 0) + lineCents(key));
    }
    const payments = [...byMethod].map(([method, cents]) => ({ method, amount: fromCents(cents) }));
    if (type === 'installment' && remainingCents > 0) {
      payments.push({ method: 'credit', amount: fromCents(remainingCents), due_date: dueDate });
    }
    return payments;
  }

  async function confirm() {
    if (problem || submitting) return;
    setSubmitting(true);
    setError('');
    try {
      await onConfirm(buildPayments());
    } catch (err) {
      setError(err?.message || 'تعذر إتمام التحصيل');
      setSubmitting(false);
    }
  }

  const summary = type === 'full'
    ? `${METHODS.find((m) => m.key === selected[0])?.label || '—'} · سداد كامل`
    : type === 'split'
      ? `${selected.length} طرق دفع · سداد كامل`
      : `مقدّم ${money(fromCents(paidCents))} · آجل ${money(fromCents(Math.max(remainingCents, 0)))} يستحق ${dueDate || '—'}`;

  const live = shift?.liveTotals;
  const initial = (customerName || '؟').trim().charAt(0);

  return (
    <div className={`sco${inline ? ' sco--inline' : ''}`} role={inline ? undefined : 'presentation'}>
      <div className="sco__dialog" ref={dialogRef} tabIndex={-1} role={inline ? 'region' : 'dialog'} aria-modal={inline ? undefined : 'true'} aria-label="تحصيل الاشتراك">
        <header className="sco__bar">
          <div className="sco__who">
            <span className="sco__who-badge" aria-hidden="true">{(cashier || 'ك').charAt(0)}</span>
            <div>
              <strong>الكاشير</strong>
              <small>{cashier || '—'}</small>
            </div>
          </div>
          <div className="sco__bar-end">
            {shift && <span className="sco__chip">الشيفت مفتوح #{shift.id}</span>}
            <span className="sco__time">{time}</span>
            {!inline && <button type="button" className="sco__close" onClick={onClose} disabled={submitting} aria-label="إغلاق">✕</button>}
          </div>
        </header>

        <div className="sco__body">
          <section className="sco__main sco__glass" aria-label="التحصيل">
            <div className="sco__member">
              <span className="sco__avatar" aria-hidden="true">{initial}</span>
              <div className="sco__member-text">
                <h2>{customerName || 'عميل'}</h2>
                <p>{customerPhone || 'بدون هاتف'} · {packageName}</p>
              </div>
              <span className="sco__badge">{mode === 'renew' ? `تجديد ${packageName}` : `اشتراك جديد`}</span>
            </div>

            <div className="sco__amounts">
              <div><span>إجمالي الفاتورة</span><strong>{money(total)}<small> ج.م</small></strong></div>
              <div><span>المدفوع الآن</span><strong className="is-ok">{money(fromCents(paidCents))}<small> ج.م</small></strong></div>
              <div>
                <span>{remainingCents > 0 ? 'المتبقي' : 'لا يوجد متبقي'}</span>
                <strong className={remainingCents > 0 ? 'is-due' : ''}>{money(fromCents(Math.max(remainingCents, 0)))}<small> ج.م</small></strong>
              </div>
            </div>

            <div className="sco__pad">
              <p className="sco__label" id="sco-type">نوع التحصيل</p>
              <div className="sco__seg" role="group" aria-labelledby="sco-type">
                {TYPES.map((t) => (
                  <button key={t.key} type="button" className={type === t.key ? 'is-on' : ''} aria-pressed={type === t.key} onClick={() => changeType(t.key)}>
                    <b>{t.label}</b><small>{t.hint}</small>
                  </button>
                ))}
              </div>

              <div className="sco__cols">
                <div>
                  <p className="sco__label" id="sco-method">طريقة الدفع{type !== 'full' && ' (اختر واحدة أو أكثر)'}</p>
                  <div className="sco__methods" role="group" aria-labelledby="sco-method">
                    {METHODS.map((m) => {
                      const on = selected.includes(m.key);
                      return (
                        <button key={m.key} type="button" className={`sco__method${on ? ' is-on' : ''}${on && active === m.key && type !== 'full' ? ' is-active' : ''}`} aria-pressed={on}
                          onClick={() => (on && type !== 'full' && active !== m.key ? setActive(m.key) : pickMethod(m.key))}>
                          <span className="sco__method-badge" aria-hidden="true">{m.badge}</span>
                          <span className="sco__method-text"><b>{m.label}</b><small>{type !== 'full' && on ? `${money(amounts[m.key])} ج.م` : m.hint}</small></span>
                        </button>
                      );
                    })}
                  </div>

                  {type === 'installment' && (
                    <label className="sco__due">
                      <span>تاريخ استحقاق المتبقي</span>
                      <input type="date" value={dueDate} min={isoDay(0)} onChange={(e) => setDueDate(e.target.value)} />
                    </label>
                  )}
                  {type === 'split' && <p className="sco__note">اضغط على طريقة مختارة لتعديل مبلغها بلوحة الأرقام.</p>}
                  <p className="sco__note">فيزا وفودافون كاش وإنستاباي تُسجَّل ضمن التحصيل الإلكتروني (بطاقة) على الوردية.</p>
                </div>

                <div className="sco__keys">
                  <p className="sco__label">
                    {type === 'full' ? (selected[0] === 'cash' ? 'المستلم من العميل' : 'المبلغ') : `مبلغ ${METHODS.find((m) => m.key === active)?.label || 'الدفعة'}`}
                  </p>
                  <div className={`sco__amount${editable ? '' : ' is-off'}`}>
                    <input
                      inputMode="decimal"
                      dir="ltr"
                      aria-label="المبلغ"
                      value={type === 'full' && selected[0] !== 'cash' ? String(total) : field}
                      placeholder={type === 'full' && selected[0] === 'cash' ? String(total) : '0'}
                      onChange={(e) => setField(e.target.value)}
                      disabled={!editable}
                    />
                    <span>ج.م</span>
                  </div>
                  {type === 'full' && selected[0] === 'cash' && changeCents > 0 && (
                    <p className="sco__change">الباقي للعميل: <b>{money(fromCents(changeCents))} ج.م</b></p>
                  )}
                  <div className="sco__quick">
                    {QUICK_ADDS.map((n) => <button key={n} type="button" disabled={!editable} onClick={() => quickAdd(n)}>+{n.toLocaleString('en-US')}</button>)}
                    <button type="button" disabled={!editable} onClick={fillRest}>كامل المبلغ</button>
                  </div>
                  <div className="sco__numpad" role="group" aria-label="لوحة الأرقام">
                    {NUMPAD.map((k) => (
                      <button key={k} type="button" disabled={!editable} onClick={() => press(k)} aria-label={k === 'back' ? 'مسح' : k}>{k === 'back' ? '⌫' : k}</button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <footer className="sco__foot">
              <div className="sco__sum">
                <span>{summary}</span>
                {(problem || error) && <em role="alert">{error || problem}</em>}
              </div>
              <button type="button" className="sco__ghost" onClick={onClose} disabled={submitting}>إلغاء</button>
              <button type="button" className="sco__go" onClick={confirm} disabled={Boolean(problem) || submitting}>
                {submitting ? 'جاري التحصيل...' : `✓ تحصيل ${money(fromCents(paidCents))} ج.م`}
              </button>
            </footer>
          </section>

          <aside className="sco__drawer sco__glass" aria-label="درج اليوم">
            <div className="sco__drawer-head"><h3>درج اليوم</h3><small>{live ? `${live.salesCount} معاملة` : '—'}</small></div>
            {live ? (
              <dl>
                <div><dt>رصيد افتتاحي</dt><dd>{money(live.openingCash)} ج.م</dd></div>
                <div><dt>كاش</dt><dd>{money(live.cashSales)} ج.م</dd></div>
                <div><dt>بطاقة / إلكتروني</dt><dd>{money(live.cardSales)} ج.م</dd></div>
                <div><dt>مستحقات غير مدفوعة</dt><dd className="is-due">{money(live.creditSales)} ج.م</dd></div>
                <div className="is-total"><dt>إجمالي التحصيل</dt><dd>{money(live.totalSales)} ج.م</dd></div>
                <div className="is-next"><dt>الكاش المتوقع بعد هذا التحصيل</dt><dd>{money(live.expectedCash + fromCents(cashCents))} ج.م</dd></div>
              </dl>
            ) : (
              <p className="sco__drawer-empty">{shift === undefined ? 'جاري التحميل...' : (shiftError || 'لا توجد وردية مفتوحة')}</p>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

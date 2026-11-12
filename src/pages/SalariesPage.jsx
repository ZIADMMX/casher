import { useCallback, useEffect, useMemo, useState } from 'react';
import { isBridgeAvailable } from '../api/bridge.js';
import * as payrollApi from '../api/payroll.js';
import * as usersApi from '../api/users.js';
import { HrHeader } from '../components/hr/HrLayout.jsx';
import PayrollWizard, { PAYMENT_METHODS, money, initial } from '../components/hr/PayrollWizard.jsx';
import { PlusIcon } from '../components/icons/PosIcons.jsx';
import '../styles/salaries.css';

const MONTH_NAMES = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const FILTERS = [['all', 'الكل'], ['draft', 'مسودة'], ['approved', 'معتمدة'], ['paid', 'مصروف']];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((method) => [method.value, method.label]));

const allowancesOf = (item) => (item.housing_allowance || 0) + (item.transport_allowance || 0) + (item.other_allowances || 0)
  + (item.overtime_amount || 0) + (item.bonus_amount || 0) + (item.commissions_amount || 0);
const deductionsOf = (item) => (item.absent_deduction || 0) + (item.deductions_amount || 0);

function shortDate(value) {
  if (!value) return '';
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' });
}

function periodState(period) {
  if (period.status === 'draft') return { key: 'draft', label: 'مسودة' };
  if (period.status === 'paid') return { key: 'paid', label: 'مصروف' };
  return Number(period.paid_count) > 0 ? { key: 'partial', label: 'صرف جزئي' } : { key: 'approved', label: 'معتمد' };
}

function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export default function SalariesPage({ onNavigate }) {
  const [periods, setPeriods] = useState([]);
  const [details, setDetails] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showWizard, setShowWizard] = useState(false);
  const [payItem, setPayItem] = useState(null);
  const [payMethod, setPayMethod] = useState('cash');
  const [payNotes, setPayNotes] = useState('');
  const [showAdvance, setShowAdvance] = useState(false);
  const [advanceForm, setAdvanceForm] = useState({ user_id: '', amount: '', installments: '1', reason: '' });
  const [printableSlip, setPrintableSlip] = useState(null);

  const loadData = useCallback(async (preferredId) => {
    if (!isBridgeAvailable()) { setLoading(false); return; }
    setLoading(true);
    setError('');
    try {
      const [periodList, advanceList, userList] = await Promise.all([
        payrollApi.getAllPayrollPeriods(),
        payrollApi.getAllSalaryAdvances(),
        usersApi.getAllUsers(),
      ]);
      const safePeriods = Array.isArray(periodList) ? periodList : [];
      setPeriods(safePeriods);
      setAdvances(Array.isArray(advanceList) ? advanceList : []);
      setUsers(Array.isArray(userList) ? userList.filter((user) => user.is_active) : []);
      const targetId = preferredId ?? safePeriods[0]?.id;
      setDetails(targetId ? await payrollApi.getPayrollDetails(targetId) : null);
    } catch (loadError) {
      setError(loadError.message || 'حدث خطأ أثناء تحميل بيانات الرواتب');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function run(action, successText) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await action();
      if (successText) setNotice(successText);
    } catch (actionError) {
      setError(actionError.message || 'تعذر تنفيذ العملية');
    } finally {
      setBusy(false);
    }
  }

  const selectPeriod = (id) => run(async () => setDetails(await payrollApi.getPayrollDetails(id)));

  function approve(period) {
    if (!window.confirm(`اعتماد ${period.period_name}؟ بعد الاعتماد يتقفل المسير ويبدأ الصرف.`)) return;
    run(async () => {
      await payrollApi.approvePayrollPeriod(period.id);
      await loadData(period.id);
    }, 'تم اعتماد المسير.');
  }

  function payAll(period) {
    const remaining = Number(period.employee_count) - Number(period.paid_count);
    const method = METHOD_LABEL[period.payment_method] || METHOD_LABEL.cash;
    if (!window.confirm(`صرف رواتب ${money(remaining)} موظف متبقين في ${period.period_name} (${method})؟`)) return;
    run(async () => {
      await payrollApi.payPayrollPeriod(period.id, {});
      await loadData(period.id);
    }, 'تم صرف كل الرواتب المتبقية.');
  }

  function removeDraft(period) {
    if (!window.confirm(`حذف مسودة ${period.period_name}؟`)) return;
    run(async () => {
      await payrollApi.deletePayrollPeriod(period.id);
      await loadData();
    }, 'تم حذف المسودة.');
  }

  function openPay(item) {
    setPayItem(item);
    setPayMethod(details?.payment_method || 'cash');
    setPayNotes('');
  }

  const confirmPay = (event) => {
    event.preventDefault();
    const item = payItem;
    run(async () => {
      await payrollApi.payEmployeeSalary(item.id, { payment_method: payMethod, paid_amount: item.net_salary, payment_notes: payNotes });
      setPayItem(null);
      await loadData(details.id);
    }, `تم صرف راتب ${item.full_name || item.username}.`);
  };

  const saveAdvance = (event) => {
    event.preventDefault();
    run(async () => {
      await payrollApi.createSalaryAdvance({
        user_id: Number(advanceForm.user_id),
        amount: Number(advanceForm.amount),
        installments: Number(advanceForm.installments) || 1,
        reason: advanceForm.reason,
      });
      setShowAdvance(false);
      setAdvanceForm({ user_id: '', amount: '', installments: '1', reason: '' });
      await loadData(details?.id);
    }, 'تم تسجيل السلفة، وهتتخصم أقساطها من المسيرات الجاية.');
  };

  function printSlip(item) {
    setPrintableSlip({ ...item, periodName: details?.period_name });
    setTimeout(() => window.print(), 200);
  }

  function exportPeriod() {
    const header = ['الموظف', 'الوظيفة', 'الأساسي', 'بدلات', 'غياب/خصم', 'قسط سلفة', 'الصافي', 'الحالة'];
    const lines = details.items.map((item) => [
      item.full_name || item.username, item.job_title, item.basic_salary, allowancesOf(item), deductionsOf(item),
      item.advances_deducted, item.net_salary, item.payment_status === 'paid' ? 'مصروف' : 'بانتظار الصرف',
    ].map(csvCell).join(','));
    const blob = new Blob([`${String.fromCharCode(0xfeff)}${[header.join(','), ...lines].join('\n')}`], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${details.period_name}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  const items = useMemo(() => details?.items || [], [details]);
  const sum = (pick) => items.reduce((total, item) => total + (Number(pick(item)) || 0), 0);
  const paidCount = items.filter((item) => item.payment_status === 'paid').length;
  const unpaidItems = items.filter((item) => item.payment_status !== 'paid');
  const unpaidAmount = unpaidItems.reduce((total, item) => total + (item.net_salary || 0), 0);
  const paidPercent = items.length ? Math.round((paidCount / items.length) * 100) : 0;
  const average = items.length ? (details.total_net || 0) / items.length : 0;

  const previousPeriod = periods[periods.findIndex((period) => period.id === details?.id) + 1];
  const previousAverage = previousPeriod?.employee_count ? previousPeriod.total_net / previousPeriod.employee_count : null;
  const averageChange = previousAverage ? ((average - previousAverage) / previousAverage) * 100 : null;
  const averageBadge = averageChange == null || Math.abs(averageChange) < 1
    ? 'ثابت'
    : `${averageChange > 0 ? '↑' : '↓'} ${money(Math.abs(Math.round(averageChange)))}٪`;

  const activeAdvances = advances.filter((advance) => advance.status === 'approved' && advance.amount - advance.repaid_amount > 0);
  const activeAdvanceTotal = activeAdvances.reduce((total, advance) => total + advance.amount - advance.repaid_amount, 0);
  const advanceEmployees = new Set(activeAdvances.map((advance) => advance.user_id)).size;

  const visiblePeriods = periods.filter((period) => filter === 'all' || (filter === 'approved'
    ? period.status === 'approved'
    : period.status === filter));

  const reviewNotes = [];
  if (details && details.status !== 'paid') {
    if (unpaidItems.length) reviewNotes.push({ tone: 'danger', text: `${money(unpaidItems.length)} موظفين بدون صرف في ${details.period_name} — إجمالي ${money(unpaidAmount)} ج.م.` });
    for (const item of items.filter((row) => row.absent_days > 0)) {
      reviewNotes.push({ tone: 'danger', text: `${item.full_name || item.username} عنده ${money(item.absent_days)} أيام غياب غير مسجلة في الحضور.` });
    }
    for (const advance of activeAdvances) {
      const installment = advance.amount / Math.max(1, advance.installments || 1);
      if (advance.amount - advance.repaid_amount <= installment + 0.01) {
        reviewNotes.push({ tone: 'warning', text: `سلفة ${advance.full_name || advance.username} آخر قسط فيها الشهر الجاي.` });
      }
    }
  }

  const advanceInstallment = Number(advanceForm.amount) > 0
    ? Number(advanceForm.amount) / Math.max(1, Number(advanceForm.installments) || 1)
    : 0;

  return (
    <div className="hr-page">
      <HrHeader
        active="salaries"
        onNavigate={onNavigate}
        title="الرواتب والمستحقات"
        subtitle="أنشئ وتتبع رواتب فريقك والبدلات والسلف في مكان واحد."
        actions={(
          <>
            <button type="button" className="hr-btn" onClick={() => setShowAdvance(true)}>تسجيل سلفة لموظف</button>
            <button type="button" className="hr-btn is-primary" onClick={() => setShowWizard(true)}>
              <PlusIcon size={18} /> مسير راتب جديد
            </button>
          </>
        )}
      />

      <main className="pay-page" dir="rtl">
        {error && <p className="pay-alert is-danger" role="alert">{error}</p>}
        {notice && <p className="pay-alert is-success" role="status">{notice}</p>}

        <section className="pay-stats" aria-label="ملخص الرواتب">
          <article className="pay-stat">
            <header><span>إجمالي المسير الحالي</span>{details && <em className={`pay-chip is-${periodState(details).key}`}>{periodState(details).label}</em>}</header>
            <strong>{money(details?.total_net)} <small>ج.م</small></strong>
            <small>{details ? `${MONTH_NAMES[details.month]} ${details.year}` : 'لا يوجد مسير بعد'}</small>
          </article>
          <article className="pay-stat">
            <header><span>الموظفون المصروف لهم</span><em className="pay-chip">{money(paidPercent)}٪</em></header>
            <strong>{money(paidCount)} / {money(items.length)}</strong>
            <small>متبقي {money(items.length - paidCount)} موظف</small>
          </article>
          <article className="pay-stat">
            <header><span>المتبقي للصرف</span><em className="pay-chip is-danger">مستحق</em></header>
            <strong>{money(unpaidAmount)} <small>ج.م</small></strong>
            <small>على {money(unpaidItems.length)} موظف</small>
          </article>
          <article className="pay-stat">
            <header><span>إجمالي السلف النشطة</span><em className="pay-chip is-warning">جارية</em></header>
            <strong>{money(activeAdvanceTotal)} <small>ج.م</small></strong>
            <small>{money(advanceEmployees)} موظفين · أقساط شهرية</small>
          </article>
          <article className="pay-stat is-success">
            <header><span>متوسط الراتب</span><em className="pay-chip is-paid">{averageBadge}</em></header>
            <strong>{money(Math.round(average))} <small>ج.م</small></strong>
            <small>صافي لكل موظف</small>
          </article>
        </section>

        <div className="pay-layout">
          <div className="pay-column">
            <section className="pay-card">
              <header className="pay-card-head">
                <div>
                  <h2>مسيرات الرواتب الشهرية</h2>
                  <p>اضغط على المسير لعرض كشف حساب موظفيه.</p>
                </div>
                <div className="pay-filters" role="group" aria-label="تصفية المسيرات">
                  {FILTERS.map(([key, label]) => (
                    <button key={key} type="button" className={filter === key ? 'is-active' : ''} aria-pressed={filter === key} onClick={() => setFilter(key)}>{label}</button>
                  ))}
                </div>
              </header>

              <ul className="pay-periods">
                {loading && <li className="pay-empty">جارٍ تحميل مسيرات الرواتب...</li>}
                {!loading && visiblePeriods.length === 0 && (
                  <li className="pay-empty">{periods.length ? 'لا توجد مسيرات بهذه الحالة.' : 'لا توجد مسيرات بعد. اضغط «مسير راتب جديد» لاحتساب رواتب الشهر.'}</li>
                )}
                {visiblePeriods.map((period) => {
                  const state = periodState(period);
                  const count = Number(period.employee_count) || 0;
                  const paid = Number(period.paid_count) || 0;
                  const percent = count ? Math.round((paid / count) * 100) : 0;
                  const meta = period.status === 'draft'
                    ? 'مسودة · لم يعتمد بعد'
                    : period.status === 'paid'
                      ? `${money(count)} موظفين · مغلق ${shortDate(period.payment_date || period.approved_at)}`
                      : `${money(count)} موظفين · أنشئ ${shortDate(period.created_at)}`;
                  return (
                    <li key={period.id} className={`pay-period${details?.id === period.id ? ' is-selected' : ''}${period.status === 'draft' ? ' is-draft' : ''}`}>
                      <button type="button" className="pay-period-main" onClick={() => selectPeriod(period.id)}>
                        <span className={`pay-month${period.status === 'paid' ? ' is-soft' : ''}`}>
                          <strong>{MONTH_NAMES[period.month]}</strong>
                          <small>{money(period.year).replace(/٬/g, '')}</small>
                        </span>
                        <span className="pay-person">
                          <strong>{period.period_name}</strong>
                          <small>{meta}</small>
                        </span>
                        <span className="pay-period-net">
                          <small>صافي المسير</small>
                          <strong>{money(period.total_net)} <small>ج.م</small></strong>
                        </span>
                        <span className="pay-progress">
                          <small><span>مصروف {money(paid)} من {money(count)}</span><span>{money(percent)}٪</span></small>
                          <i><em style={{ inlineSize: `${percent}%` }} /></i>
                        </span>
                      </button>
                      <span className={`pay-chip is-${state.key}`}><i aria-hidden="true" />{state.label}</span>
                      <span className="pay-period-actions">
                        <button type="button" className="pay-btn is-small" onClick={() => selectPeriod(period.id)}>كشف الحساب</button>
                        {period.status === 'draft' && (
                          <>
                            <button type="button" className="pay-btn is-small is-danger" onClick={() => removeDraft(period)} disabled={busy}>حذف</button>
                            <button type="button" className="pay-btn is-small is-primary" onClick={() => approve(period)} disabled={busy}>اعتماد</button>
                          </>
                        )}
                        {period.status === 'approved' && (
                          <button type="button" className="pay-btn is-small is-primary" onClick={() => payAll(period)} disabled={busy}>
                            {paid ? 'استكمال الصرف' : 'صرف الكل'}
                          </button>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </section>

            {details && (
              <section className="pay-card">
                <header className="pay-card-head">
                  <div>
                    <h2>موظفو {details.period_name.replace('مسير رواتب', 'مسير')}</h2>
                    <p>الأساسي + البدلات − الخصومات − قسط السلفة = الصافي</p>
                  </div>
                  <button type="button" className="pay-btn" onClick={exportPeriod} disabled={!items.length}>تصدير المسير</button>
                </header>
                <div className="pay-table-scroll">
                  <table className="pay-table">
                    <thead>
                      <tr>
                        <th>الموظف</th><th>الأساسي</th><th>بدلات</th><th>غياب/تأخير</th><th>قسط سلفة</th><th>الصافي</th><th>الحالة</th><th><span className="pay-sr-only">إجراءات</span></th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => {
                        const isPaid = item.payment_status === 'paid';
                        const allowances = allowancesOf(item);
                        const deductions = deductionsOf(item);
                        return (
                          <tr key={item.id}>
                            <td>
                              <span className="pay-employee">
                                <span className="pay-avatar" aria-hidden="true">{initial(item.full_name || item.username)}</span>
                                <span className="pay-person">
                                  <strong>{item.full_name || item.username}</strong>
                                  <small>{item.job_title || 'موظف'}</small>
                                </span>
                              </span>
                            </td>
                            <td>{money(item.basic_salary)}</td>
                            <td className="is-plus">{allowances ? `+${money(allowances)}` : '—'}</td>
                            <td className="is-minus">{deductions ? `−${money(deductions)}` : '—'}</td>
                            <td className="is-minus">{item.advances_deducted ? `−${money(item.advances_deducted)}` : '—'}</td>
                            <td><strong>{money(item.net_salary)}</strong></td>
                            <td>
                              <span className={`pay-chip ${isPaid ? 'is-paid' : 'is-warning'}`}>
                                {isPaid ? `مصروف${item.payment_method ? ` · ${METHOD_LABEL[item.payment_method] || ''}` : ''}` : details.status === 'draft' ? 'مسودة' : 'بانتظار الصرف'}
                              </span>
                            </td>
                            <td>
                              <span className="pay-row-actions">
                                {!isPaid && details.status !== 'draft' && (
                                  <button type="button" className="pay-btn is-small is-primary" onClick={() => openPay(item)}>صرف</button>
                                )}
                                <button type="button" className="pay-btn is-small" onClick={() => printSlip(item)}>إيصال</button>
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td>الإجمالي · {money(items.length)} موظفين</td>
                        <td>{money(sum((i) => i.basic_salary))}</td>
                        <td className="is-plus">{money(sum(allowancesOf))}</td>
                        <td className="is-minus">{money(sum(deductionsOf))}</td>
                        <td className="is-minus">{money(sum((i) => i.advances_deducted))}</td>
                        <td>{money(details.total_net)}</td>
                        <td colSpan="2" />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </section>
            )}
          </div>

          <aside className="pay-aside">
            {details && (
              <section className="pay-card">
                <header className="pay-card-head"><div><h3>تفصيل مسير الشهر</h3><p>{MONTH_NAMES[details.month]} {details.year}</p></div></header>
                <dl className="pay-breakdown">
                  <div><dt>إجمالي الرواتب الأساسية</dt><dd>{money(sum((i) => i.basic_salary))}</dd></div>
                  <div><dt>بدلات (مواصلات وإضافي)</dt><dd className="is-plus">+ {money(sum(allowancesOf))}</dd></div>
                  <div><dt>خصومات غياب وتأخير</dt><dd className="is-minus">− {money(sum(deductionsOf))}</dd></div>
                  <div><dt>أقساط السلف</dt><dd className="is-minus">− {money(sum((i) => i.advances_deducted))}</dd></div>
                  <div className="is-total"><dt>الصافي المستحق</dt><dd>{money(details.total_net)} <small>ج.م</small></dd></div>
                </dl>
              </section>
            )}

            <section className="pay-card">
              <header className="pay-card-head"><h3>السلف النشطة</h3><em className="pay-chip is-warning">{money(activeAdvances.length)}</em></header>
              {activeAdvances.length === 0 ? (
                <p className="pay-empty">لا توجد سلف نشطة.</p>
              ) : (
                <ul className="pay-advances">
                  {activeAdvances.map((advance) => {
                    const installments = Math.max(1, advance.installments || 1);
                    const remaining = advance.amount - advance.repaid_amount;
                    return (
                      <li key={advance.id}>
                        <span className="pay-avatar" aria-hidden="true">{initial(advance.full_name || advance.username)}</span>
                        <span className="pay-person">
                          <strong>{advance.full_name || advance.username}</strong>
                          <small>{money(advance.amount)} على {money(installments)} أقساط · القسط {money(Math.round(advance.amount / installments))}</small>
                        </span>
                        <span className="pay-advance-left">باقي {money(remaining)}</span>
                        <i><em style={{ inlineSize: `${Math.round((advance.repaid_amount / advance.amount) * 100)}%` }} /></i>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            {reviewNotes.length > 0 && (
              <section className="pay-review">
                <h3>{details.status === 'draft' ? 'قبل ما تعتمد المسير' : 'قبل ما تقفل المسير'}</h3>
                <ul>
                  {reviewNotes.map((note) => <li key={note.text} className={`is-${note.tone}`}>{note.text}</li>)}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </main>

      {showWizard && (
        <PayrollWizard
          onClose={() => setShowWizard(false)}
          onSaved={(period, approved) => {
            setShowWizard(false);
            setNotice(approved ? `تم اعتماد ${period.period_name}.` : `تم حفظ ${period.period_name} كمسودة.`);
            loadData(period.id);
          }}
        />
      )}

      {payItem && (
        <div className="pay-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setPayItem(null); }}>
          <form className="pay-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-item-title" onSubmit={confirmPay} dir="rtl">
            <header className="pay-wizard-header">
              <div><span className="pay-eyebrow">صرف راتب</span><h2 id="pay-item-title">{payItem.full_name || payItem.username}</h2></div>
              <button type="button" className="pay-close" onClick={() => setPayItem(null)} aria-label="إغلاق">×</button>
            </header>
            <div className="pay-dialog-body">
              <p className="pay-amount-box"><span>الصافي المستحق</span><strong>{money(payItem.net_salary)} ج.م</strong></p>
              <label className="pay-field">
                <span>طريقة الصرف</span>
                <select value={payMethod} onChange={(event) => setPayMethod(event.target.value)}>
                  {PAYMENT_METHODS.map((method) => <option key={method.value} value={method.value}>{method.label}</option>)}
                </select>
              </label>
              <label className="pay-field">
                <span>ملاحظات الصرف</span>
                <input value={payNotes} maxLength={300} onChange={(event) => setPayNotes(event.target.value)} placeholder="رقم الحوالة أو ملاحظات التسليم..." />
              </label>
            </div>
            <footer className="pay-wizard-footer">
              <button type="button" className="pay-btn" onClick={() => setPayItem(null)}>إلغاء</button>
              <button type="submit" className="pay-btn is-primary" disabled={busy}>تأكيد الصرف</button>
            </footer>
          </form>
        </div>
      )}

      {showAdvance && (
        <div className="pay-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAdvance(false); }}>
          <form className="pay-dialog" role="dialog" aria-modal="true" aria-labelledby="pay-advance-title" onSubmit={saveAdvance} dir="rtl">
            <header className="pay-wizard-header">
              <div><span className="pay-eyebrow">الرواتب والمستحقات</span><h2 id="pay-advance-title">تسجيل سلفة لموظف</h2></div>
              <button type="button" className="pay-close" onClick={() => setShowAdvance(false)} aria-label="إغلاق">×</button>
            </header>
            <div className="pay-dialog-body">
              <label className="pay-field">
                <span>الموظف <b>*</b></span>
                <select value={advanceForm.user_id} onChange={(event) => setAdvanceForm({ ...advanceForm, user_id: event.target.value })} required autoFocus>
                  <option value="">اختر موظفًا</option>
                  {users.map((user) => <option key={user.id} value={user.id}>{user.full_name || user.username}{user.job_title ? ` — ${user.job_title}` : ''}</option>)}
                </select>
              </label>
              <div className="pay-form-grid is-two">
                <label className="pay-field">
                  <span>مبلغ السلفة (ج.م) <b>*</b></span>
                  <input type="number" min="1" step="any" value={advanceForm.amount} onChange={(event) => setAdvanceForm({ ...advanceForm, amount: event.target.value })} required />
                </label>
                <label className="pay-field">
                  <span>عدد الأقساط الشهرية</span>
                  <input type="number" min="1" max="60" step="1" value={advanceForm.installments} onChange={(event) => setAdvanceForm({ ...advanceForm, installments: event.target.value })} />
                </label>
              </div>
              {advanceInstallment > 0 && <p className="pay-alert">القسط الشهري حوالي {money(Math.round(advanceInstallment))} ج.م، بيتخصم من كل مسير لحد ما السلفة تخلص (بحد أقصى نص الأساسي).</p>}
              <label className="pay-field">
                <span>السبب</span>
                <input value={advanceForm.reason} maxLength={300} onChange={(event) => setAdvanceForm({ ...advanceForm, reason: event.target.value })} placeholder="سلفة طارئة، مصاريف مدارس..." />
              </label>
            </div>
            <footer className="pay-wizard-footer">
              <button type="button" className="pay-btn" onClick={() => setShowAdvance(false)}>إلغاء</button>
              <button type="submit" className="pay-btn is-primary" disabled={busy}>حفظ السلفة</button>
            </footer>
          </form>
        </div>
      )}

      {printableSlip && (
        <div className="printable-payslip-area">
          <h2>إيصال استلام راتب</h2>
          <p>{printableSlip.periodName}</p>
          <table>
            <tbody>
              <tr><td><strong>اسم الموظف:</strong> {printableSlip.full_name || printableSlip.username}</td><td><strong>المسمى الوظيفي:</strong> {printableSlip.job_title || 'موظف'}</td></tr>
              <tr><td><strong>الراتب الأساسي:</strong> {money(printableSlip.basic_salary)} ج.م</td><td><strong>البدلات والحوافز:</strong> +{money(allowancesOf(printableSlip))} ج.م</td></tr>
              <tr><td><strong>الغياب والخصومات:</strong> −{money(deductionsOf(printableSlip))} ج.م</td><td><strong>قسط السلفة:</strong> −{money(printableSlip.advances_deducted)} ج.م</td></tr>
              <tr><td colSpan="2"><h3>الصافي المستلم: {money(printableSlip.net_salary)} ج.م</h3></td></tr>
            </tbody>
          </table>
          <div className="printable-payslip-signatures">
            <span>توقيع الموظف المستلم: .....................</span>
            <span>توقيع الإدارة / المحاسب: .....................</span>
          </div>
        </div>
      )}
    </div>
  );
}

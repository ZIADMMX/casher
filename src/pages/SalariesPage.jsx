import React, { useState, useEffect, useCallback } from 'react';
import '../styles/salaries.css';

const MONTHS = [
  { value: 1, label: 'يناير' },
  { value: 2, label: 'فبراير' },
  { value: 3, label: 'مارس' },
  { value: 4, label: 'أبريل' },
  { value: 5, label: 'مايو' },
  { value: 6, label: 'يونيو' },
  { value: 7, label: 'يوليو' },
  { value: 8, label: 'أغسطس' },
  { value: 9, label: 'سبتمبر' },
  { value: 10, label: 'أكتوبر' },
  { value: 11, label: 'نوفمبر' },
  { value: 12, label: 'ديسمبر' },
];

export default function SalariesPage() {
  const [activeTab, setActiveTab] = useState('periods'); // 'periods' | 'advances'
  const [periods, setPeriods] = useState([]);
  const [selectedPeriod, setSelectedPeriod] = useState(null);
  const [advances, setAdvances] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Modals
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [newPeriodMonth, setNewPeriodMonth] = useState(new Date().getMonth() + 1);
  const [newPeriodYear, setNewPeriodYear] = useState(new Date().getFullYear());
  const [newPeriodNotes, setNewPeriodNotes] = useState('');

  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedItemToPay, setSelectedItemToPay] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [paymentNotes, setPaymentNotes] = useState('');

  const [showAdvanceModal, setShowAdvanceModal] = useState(false);
  const [advanceUserId, setAdvanceUserId] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');

  const [printableSlip, setPrintableSlip] = useState(null);

  const loadData = useCallback(async (preferredPeriodId = null) => {
    setLoading(true);
    setError('');
    try {
      const api = window.electronAPI;
      if (!api) return;

      const [periodList, advList, userList] = await Promise.all([
        api.getAllPayrollPeriods ? api.getAllPayrollPeriods() : [],
        api.getAllSalaryAdvances ? api.getAllSalaryAdvances() : [],
        api.getAllUsers ? api.getAllUsers() : [],
      ]);

      const safePeriods = Array.isArray(periodList) ? periodList : [];
      setPeriods(safePeriods);
      setAdvances(Array.isArray(advList) ? advList : []);
      setUsers(Array.isArray(userList) ? userList : []);

      const targetPeriodId = preferredPeriodId ?? safePeriods[0]?.id;
      if (targetPeriodId && api.getPayrollDetails) {
        const details = await api.getPayrollDetails(targetPeriodId);
        setSelectedPeriod(details || null);
      } else {
        setSelectedPeriod(null);
      }
    } catch (err) {
      console.error('Failed to load payroll data:', err);
      setError(err.message || 'حدث خطأ أثناء تحميل بيانات الرواتب');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSelectPeriod = async (periodId) => {
    try {
      setLoading(true);
      const details = await window.electronAPI.getPayrollDetails(periodId);
      setSelectedPeriod(details);
    } catch (err) {
      setError(err.message || 'تعذر تحميل تفاصيل المسير');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePeriod = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      const res = await window.electronAPI.generatePayrollPeriod({
        month: newPeriodMonth,
        year: newPeriodYear,
        notes: newPeriodNotes,
      });
      setSelectedPeriod(res);
      setShowGenerateModal(false);
      setSuccessMsg('تم إنشاء مسير الرواتب واحتساب المستحقات بنجاح 🎉');
      await loadData(res?.id);
    } catch (err) {
      setError(err.message || 'فشل إنشاء مسير الرواتب');
    } finally {
      setLoading(false);
    }
  };

  const handlePaySalary = async (e) => {
    e.preventDefault();
    if (!selectedItemToPay) return;
    try {
      setError('');
      await window.electronAPI.payEmployeeSalary(selectedItemToPay.id, {
        payment_method: paymentMethod,
        paid_amount: selectedItemToPay.net_salary,
        payment_notes: paymentNotes,
      });
      setShowPayModal(false);
      setSelectedItemToPay(null);
      setSuccessMsg(`تم صرف راتب الموظف (${selectedItemToPay.full_name}) بنجاح 💵`);
      await loadData(selectedPeriod?.id);
    } catch (err) {
      setError(err.message || 'فشل إتمام عملية الصرف');
    }
  };

  const handleCreateAdvance = async (e) => {
    e.preventDefault();
    if (!advanceUserId || !advanceAmount) return;
    try {
      setError('');
      await window.electronAPI.createSalaryAdvance({
        user_id: Number(advanceUserId),
        amount: Number(advanceAmount),
        reason: advanceReason,
      });
      setShowAdvanceModal(false);
      setAdvanceUserId('');
      setAdvanceAmount('');
      setAdvanceReason('');
      setSuccessMsg('تم تسجيل السلفة بنجاح وسيتم خصمها في المسير القادم 📝');
      await loadData(selectedPeriod?.id);
    } catch (err) {
      setError(err.message || 'فشل تسجيل السلفة');
    }
  };

  const handlePrintSlip = (item) => {
    setPrintableSlip({
      ...item,
      periodName: selectedPeriod?.period_name,
    });
    setTimeout(() => {
      window.print();
    }, 200);
  };

  // إحصائيات سريعة
  const totalNet = selectedPeriod?.total_net || 0;
  const paidCount = selectedPeriod?.items?.filter(i => i.payment_status === 'paid').length || 0;
  const totalEmployees = selectedPeriod?.items?.length || 0;
  const unpaidAmount = selectedPeriod?.items?.filter(i => i.payment_status !== 'paid')
    .reduce((sum, i) => sum + (i.net_salary || 0), 0) || 0;

  return (
    <div className="salaries-page-container">
      {/* Header Card */}
      <div className="salaries-header-card">
        <div className="salaries-title-wrap">
          <div className="salaries-title-icon">👛</div>
          <div>
            <h1>نظام الرواتب والمستحقات</h1>
            <p>أنشئ وتتبع رواتب فريقك والبدلات والسلف في مكان واحد</p>
          </div>
        </div>

        <div className="salaries-actions-group">
          <button
            type="button"
            className="secondary-btn-salaries"
            onClick={() => setShowAdvanceModal(true)}
          >
            + تسجيل سلفة لموظف
          </button>
          <button
            type="button"
            className="primary-btn-salaries"
            onClick={() => setShowGenerateModal(true)}
          >
            + مسير راتب جديد
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div style={{ background: '#FEE2E2', border: '1px solid #FECACA', color: '#DC2626', padding: '10px 16px', borderRadius: '10px', fontSize: '13px' }}>
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div style={{ background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#15803D', padding: '10px 16px', borderRadius: '10px', fontSize: '13px' }}>
          {successMsg}
        </div>
      )}

      {/* Stats KPI */}
      <div className="salaries-stats-grid">
        <div className="salary-stat-card">
          <div className="stat-icon-bubble stat-icon-blue">💰</div>
          <div className="stat-meta">
            <span className="label">إجمالي المسير الحالي</span>
            <span className="value">
              {totalNet.toLocaleString()} <span className="unit">ج.م</span>
            </span>
          </div>
        </div>

        <div className="salary-stat-card">
          <div className="stat-icon-bubble stat-icon-green">👥</div>
          <div className="stat-meta">
            <span className="label">الموظفين المصروف لهم</span>
            <span className="value">{paidCount} / {totalEmployees}</span>
          </div>
        </div>

        <div className="salary-stat-card">
          <div className="stat-icon-bubble stat-icon-amber">⏳</div>
          <div className="stat-meta">
            <span className="label">المتبقي للصرف</span>
            <span className="value">
              {unpaidAmount.toLocaleString()} <span className="unit">ج.م</span>
            </span>
          </div>
        </div>

        <div className="salary-stat-card">
          <div className="stat-icon-bubble stat-icon-purple">📑</div>
          <div className="stat-meta">
            <span className="label">إجمالي السلف النشطة</span>
            <span className="value">
              {advances.filter(a => a.status === 'approved').reduce((sum, a) => sum + (a.amount - a.repaid_amount), 0).toLocaleString()} <span className="unit">ج.م</span>
            </span>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="salaries-nav-tabs">
        <button
          type="button"
          className={`salaries-nav-tab ${activeTab === 'periods' ? 'active' : ''}`}
          onClick={() => setActiveTab('periods')}
        >
          📅 مسيرات الرواتب الشهرية
        </button>
        <button
          type="button"
          className={`salaries-nav-tab ${activeTab === 'advances' ? 'active' : ''}`}
          onClick={() => setActiveTab('advances')}
        >
          🤝 سجل السلف والخصومات ({advances.length})
        </button>
      </div>

      {/* TAB 1: Periods & Details */}
      {activeTab === 'periods' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Periods Selector Bar */}
          <div className="salaries-card">
            <div className="salaries-card-header">
              <h3 className="salaries-card-title">المسيرات المتاحة</h3>
              <span style={{ fontSize: '12px', color: '#64748B' }}>
                اضغط على المسير لعرض كشف حساب موظفيه
              </span>
            </div>

            {loading ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#64748B' }}>
                جاري تحميل مسيرات الرواتب...
              </div>
            ) : periods.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '30px', color: '#94A3B8' }}>
                لا توجد مسيرات رواتب سابقة. اضغط &ldquo;+ مسير راتب جديد&rdquo; لاحتساب رواتب هذا الشهر.
              </div>
            ) : (
              <div className="periods-grid">
                {periods.map((p) => {
                  const isSelected = selectedPeriod?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      className={`period-card ${isSelected ? 'selected' : ''}`}
                      onClick={() => handleSelectPeriod(p.id)}
                    >
                      <div className="period-card-top">
                        <span className="period-name">{p.period_name}</span>
                        <span className={`status-badge ${p.status}`}>
                          {p.status === 'paid' ? 'تم الصرف بالكامل 🟢' : p.status === 'approved' ? 'معتمد 🟡' : 'مسودة ⚪'}
                        </span>
                      </div>

                      <div className="period-metrics">
                        <div className="metric-item">
                          <span className="metric-label">الموظفين</span>
                          <span className="metric-val">{p.paid_count || 0} / {p.employee_count || 0}</span>
                        </div>
                        <div className="metric-item">
                          <span className="metric-label">إجمالي الصافي</span>
                          <span className="metric-val net">{p.total_net?.toLocaleString() || 0} ج.م</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Selected Period Items Table */}
          {selectedPeriod && (
            <div className="salaries-card">
              <div className="salaries-card-header">
                <div>
                  <h3 className="salaries-card-title">
                    كشف رواتب: {selectedPeriod.period_name}
                  </h3>
                  <span style={{ fontSize: '12px', color: '#64748B' }}>
                    تاريخ المسير: {selectedPeriod.start_date} إلى {selectedPeriod.end_date}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="secondary-btn-salaries"
                    onClick={() => window.print()}
                  >
                    🖨️ طباعة المسير بالكامل
                  </button>
                </div>
              </div>

              <div className="salaries-table-wrapper">
                <table className="salaries-table">
                  <thead>
                    <tr>
                      <th>الموظف</th>
                      <th>الراتب الأساسي</th>
                      <th>العمولات المكتسبة</th>
                      <th>غياب وخصومات</th>
                      <th>سلف مخصومة</th>
                      <th>صافي الراتب المستحق</th>
                      <th>حالة الدفع</th>
                      <th>إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedPeriod.items?.map((item) => {
                      const isPaid = item.payment_status === 'paid';
                      return (
                        <tr key={item.id}>
                          <td>
                            <div className="emp-name-cell">
                              <strong>{item.full_name || item.username}</strong>
                              <span>{item.job_title || 'موظف'}</span>
                            </div>
                          </td>
                          <td>{item.basic_salary?.toLocaleString()} ج.م</td>
                          <td style={{ color: '#16A34A', fontWeight: 'bold' }}>
                            +{item.commissions_amount?.toLocaleString() || 0} ج.م
                          </td>
                          <td style={{ color: '#DC2626' }}>
                            -{((item.deductions_amount || 0) + (item.absent_deduction || 0)).toLocaleString()} ج.م
                            {item.absent_days > 0 && <small> ({item.absent_days} يوم)</small>}
                          </td>
                          <td style={{ color: '#D97706' }}>
                            -{item.advances_deducted?.toLocaleString() || 0} ج.م
                          </td>
                          <td>
                            <span className="net-salary-pill">
                              {item.net_salary?.toLocaleString()} ج.م
                            </span>
                          </td>
                          <td>
                            <span className={`status-badge ${isPaid ? 'paid' : 'draft'}`}>
                              {isPaid ? `تم الصرف (${item.payment_method === 'cash' ? 'نقداً' : 'تحويل'})` : 'بانتظار الصرف'}
                            </span>
                          </td>
                          <td>
                            <div style={{ display: 'flex', gap: '6px' }}>
                              {!isPaid && (
                                <button
                                  type="button"
                                  className="action-btn-sm btn-pay-cash"
                                  onClick={() => {
                                    setSelectedItemToPay(item);
                                    setShowPayModal(true);
                                  }}
                                >
                                  💵 صرف
                                </button>
                              )}
                              <button
                                type="button"
                                className="action-btn-sm btn-print-slip"
                                onClick={() => handlePrintSlip(item)}
                                title="طباعة إيصال راتب (Payslip)"
                              >
                                📄 إيصال
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Advances */}
      {activeTab === 'advances' && (
        <div className="salaries-card">
          <div className="salaries-card-header">
            <h3 className="salaries-card-title">سجل سلف الموظفين</h3>
            <button
              type="button"
              className="primary-btn-salaries"
              onClick={() => setShowAdvanceModal(true)}
            >
              + إضافة سلفة
            </button>
          </div>

          <div className="salaries-table-wrapper">
            <table className="salaries-table">
              <thead>
                <tr>
                  <th>الموظف</th>
                  <th>تاريخ السلفة</th>
                  <th>المبلغ الإجمالي</th>
                  <th>المسدد منها</th>
                  <th>المتبقي</th>
                  <th>السبب / ملاحظات</th>
                  <th>الحالة</th>
                </tr>
              </thead>
              <tbody>
                {advances.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: '#94A3B8' }}>
                      لا توجد سلف مسجلة حالياً
                    </td>
                  </tr>
                ) : (
                  advances.map((adv) => (
                    <tr key={adv.id}>
                      <td><strong>{adv.full_name || adv.username}</strong></td>
                      <td>{adv.request_date}</td>
                      <td>{adv.amount?.toLocaleString()} ج.م</td>
                      <td style={{ color: '#16A34A' }}>{adv.repaid_amount?.toLocaleString()} ج.م</td>
                      <td style={{ color: '#DC2626', fontWeight: 'bold' }}>
                        {(adv.amount - adv.repaid_amount)?.toLocaleString()} ج.م
                      </td>
                      <td>{adv.reason || '-'}</td>
                      <td>
                        <span className={`status-badge ${adv.status === 'recovered' ? 'paid' : 'approved'}`}>
                          {adv.status === 'recovered' ? 'تم السداد بالكامل' : 'سارية'}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal 1: Generate Payroll Period */}
      {showGenerateModal && (
        <div className="salaries-modal-overlay">
          <div className="salaries-modal-box">
            <div className="salaries-modal-header">
              <h3>إنشاء مسير رواتب جديد</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowGenerateModal(false)}>✕</button>
            </div>
            <form onSubmit={handleGeneratePeriod}>
              <div className="salaries-modal-body">
                <div className="form-group-salaries">
                  <label>الشهر</label>
                  <select
                    className="form-select-salaries"
                    value={newPeriodMonth}
                    onChange={(e) => setNewPeriodMonth(Number(e.target.value))}
                  >
                    {MONTHS.map((m) => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group-salaries">
                  <label>السنة</label>
                  <input
                    type="number"
                    className="form-input-salaries"
                    value={newPeriodYear}
                    onChange={(e) => setNewPeriodYear(Number(e.target.value))}
                  />
                </div>

                <div className="form-group-salaries">
                  <label>ملاحظات على المسير (اختياري)</label>
                  <input
                    type="text"
                    className="form-input-salaries"
                    placeholder="مثال: مسير شهر أكتوبر مع مكافآت المبيعات"
                    value={newPeriodNotes}
                    onChange={(e) => setNewPeriodNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="salaries-modal-footer">
                <button type="button" className="secondary-btn-salaries" onClick={() => setShowGenerateModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn-salaries">احتساب وإنشاء المسير</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Pay Salary to Employee */}
      {showPayModal && selectedItemToPay && (
        <div className="salaries-modal-overlay">
          <div className="salaries-modal-box">
            <div className="salaries-modal-header">
              <h3>صرف راتب: {selectedItemToPay.full_name}</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowPayModal(false)}>✕</button>
            </div>
            <form onSubmit={handlePaySalary}>
              <div className="salaries-modal-body">
                <div style={{ background: '#F8FAFC', padding: '12px', borderRadius: '10px', display: 'flex', justifyContent: 'space-between' }}>
                  <span>المبلغ الصافي المستحق:</span>
                  <strong style={{ fontSize: '16px', color: '#8a6a20' }}>
                    {selectedItemToPay.net_salary?.toLocaleString()} ج.م
                  </strong>
                </div>

                <div className="form-group-salaries">
                  <label>طريقة الصرف</label>
                  <select
                    className="form-select-salaries"
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value)}
                  >
                    <option value="cash">💵 نقداً من خزينة المحل / الدرج</option>
                    <option value="bank_transfer">🏦 تحويل بنكي / فودافون كاش / محفظة</option>
                    <option value="cheque">📝 شيك بنكي</option>
                  </select>
                </div>

                <div className="form-group-salaries">
                  <label>ملاحظات الصرف</label>
                  <input
                    type="text"
                    className="form-input-salaries"
                    placeholder="رقم الحوالة أو ملاحظات التسليم..."
                    value={paymentNotes}
                    onChange={(e) => setPaymentNotes(e.target.value)}
                  />
                </div>
              </div>
              <div className="salaries-modal-footer">
                <button type="button" className="secondary-btn-salaries" onClick={() => setShowPayModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn-salaries">تأكيد الصرف الآن</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Add Advance */}
      {showAdvanceModal && (
        <div className="salaries-modal-overlay">
          <div className="salaries-modal-box">
            <div className="salaries-modal-header">
              <h3>تسجيل سلفة لموظف</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowAdvanceModal(false)}>✕</button>
            </div>
            <form onSubmit={handleCreateAdvance}>
              <div className="salaries-modal-body">
                <div className="form-group-salaries">
                  <label>اختر الموظف</label>
                  <select
                    className="form-select-salaries"
                    value={advanceUserId}
                    onChange={(e) => setAdvanceUserId(e.target.value)}
                    required
                  >
                    <option value="">-- اختر موظفاً --</option>
                    {users.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.full_name || u.username} ({u.job_title || 'موظف'})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group-salaries">
                  <label>مبلغ السلفة (ج.م)</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input-salaries"
                    placeholder="مثال: 500"
                    value={advanceAmount}
                    onChange={(e) => setAdvanceAmount(e.target.value)}
                    required
                  />
                </div>

                <div className="form-group-salaries">
                  <label>سبب السلفة</label>
                  <input
                    type="text"
                    className="form-input-salaries"
                    placeholder="سلفة طارئة، قسط، إلخ..."
                    value={advanceReason}
                    onChange={(e) => setAdvanceReason(e.target.value)}
                  />
                </div>
              </div>
              <div className="salaries-modal-footer">
                <button type="button" className="secondary-btn-salaries" onClick={() => setShowAdvanceModal(false)}>إلغاء</button>
                <button type="submit" className="primary-btn-salaries">حفظ السلفة</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Printable Payslip Hidden Area */}
      {printableSlip && (
        <div className="printable-payslip-area" style={{ display: 'none' }}>
          <div style={{ border: '2px solid #000', padding: '20px', borderRadius: '10px' }}>
            <h2 style={{ textAlign: 'center', margin: '0 0 10px' }}>إيصال استلام راتب (Payslip)</h2>
            <p style={{ textAlign: 'center', margin: '0 0 20px' }}>{printableSlip.periodName}</p>
            <hr />
            <table style={{ width: '100%', marginTop: '15px', borderCollapse: 'collapse' }}>
              <tbody>
                <tr>
                  <td><strong>اسم الموظف:</strong> {printableSlip.full_name}</td>
                  <td><strong>المسمى الوظيفي:</strong> {printableSlip.job_title || 'موظف'}</td>
                </tr>
                <tr>
                  <td><strong>الراتب الأساسي:</strong> {printableSlip.basic_salary} ج.م</td>
                  <td><strong>العمولات والمكافآت:</strong> +{printableSlip.commissions_amount} ج.م</td>
                </tr>
                <tr>
                  <td><strong>الغياب والخصومات:</strong> -{printableSlip.deductions_amount + printableSlip.absent_deduction} ج.م</td>
                  <td><strong>السلف المخصومة:</strong> -{printableSlip.advances_deducted} ج.م</td>
                </tr>
                <tr>
                  <td colSpan="2" style={{ paddingTop: '15px' }}>
                    <h3 style={{ margin: 0 }}>الصافي المستلم: {printableSlip.net_salary} ج.م</h3>
                  </td>
                </tr>
              </tbody>
            </table>
            <div style={{ marginTop: '40px', display: 'flex', justifyContent: 'space-between' }}>
              <div>توقيع الموظف المستلم: .....................</div>
              <div>توقيع الإدارة / المحاسب: .....................</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

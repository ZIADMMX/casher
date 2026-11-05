import { useState, useEffect, useMemo, useCallback } from 'react';
import ShiftReportPrint from '../components/ShiftReportPrint.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as authApi from '../api/auth.js';
import * as shiftsApi from '../api/shifts.js';

const EXPENSE_CATEGORIES = [
  'نثريات ومصروفات عامة',
  'بوفيه وضيافة ومشروبات',
  'صيانة وإصلاحات',
  'مواصلات وشحن سريع',
  'شراء مستلزمات للمحل',
  'أخرى',
];

const CURRENCY_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1];

export default function ShiftsPage() {
  const [activeShift, setActiveShift] = useState(null);
  const [shiftsList, setShiftsList] = useState([]);
  const [kpis, setKpis] = useState({
    closedShiftsCount: 0,
    totalSalesVolume: 0,
    totalShortage: 0,
    totalOverage: 0,
    totalExpensesAmount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showOpenModal, setShowOpenModal] = useState(false);
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [previewReport, setPreviewReport] = useState(null); // { shift, reportType: 'Z' | 'X' }
  const [isPrinting, setIsPrinting] = useState(false);

  // Form states
  const [sessionUser, setSessionUser] = useState(null);
  const [lastClosedShift, setLastClosedShift] = useState(null);
  const [openingShiftType, setOpeningShiftType] = useState('morning');
  const [openingPosStation] = useState('الدرج الرئيسي - POS 1');
  const [openingCashInput, setOpeningCashInput] = useState('');
  const [openUseBreakdown, setOpenUseBreakdown] = useState(false);
  const [openCashBreakdown, setOpenCashBreakdown] = useState({
    200: '',
    100: '',
    50: '',
    20: '',
    10: '',
    5: '',
    1: '',
  });
  const [safetyChecked, setSafetyChecked] = useState(true);
  const [openNotesInput, setOpenNotesInput] = useState('');

  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseNotes, setExpenseNotes] = useState('');

  const [actualCashInput, setActualCashInput] = useState('');
  const [useBreakdown, setUseBreakdown] = useState(false);
  const [cashBreakdown, setCashBreakdown] = useState({
    200: '',
    100: '',
    50: '',
    20: '',
    10: '',
    5: '',
    1: '',
  });
  const [closeNotesInput, setCloseNotesInput] = useState('');
  const [formError, setFormError] = useState('');
  const [actionSuccessMsg, setActionSuccessMsg] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      if (isBridgeAvailable()) {
        const results = await Promise.allSettled([
          shiftsApi.getCurrentShift.isAvailable() ? shiftsApi.getCurrentShift() : Promise.resolve(null),
          shiftsApi.getAllShifts.isAvailable() ? shiftsApi.getAllShifts() : Promise.resolve([]),
          shiftsApi.getShiftsKPIs.isAvailable() ? shiftsApi.getShiftsKPIs() : Promise.resolve(null),
          shiftsApi.getLastClosedShift.isAvailable() ? shiftsApi.getLastClosedShift() : Promise.resolve(null),
          authApi.getSession.isAvailable() ? authApi.getSession() : Promise.resolve(null),
        ]);

        const current = results[0].status === 'fulfilled' ? results[0].value : null;
        const all = results[1].status === 'fulfilled' ? results[1].value : [];
        const kpiData = results[2].status === 'fulfilled' ? results[2].value : null;
        const lastClosed = results[3].status === 'fulfilled' ? results[3].value : null;
        const sess = results[4].status === 'fulfilled' ? results[4].value : null;

        setActiveShift(current || null);
        setShiftsList(Array.isArray(all) ? all : []);
        if (kpiData) setKpis(kpiData);
        setLastClosedShift(lastClosed || null);
        setSessionUser(sess || null);
      }
    } catch (err) {
      console.error('خطأ في تحميل بيانات الورديات:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // حساب المجموع التلقائي عند استخدام تفقيط الفئات النقدية للاستلام (Open)
  const openBreakdownCalculatedTotal = useMemo(() => {
    return CURRENCY_DENOMINATIONS.reduce((sum, denom) => {
      const count = Number(openCashBreakdown[denom] || 0);
      return sum + denom * count;
    }, 0);
  }, [openCashBreakdown]);

  // حساب المجموع التلقائي عند استخدام تفقيط الفئات النقدية للإغلاق (Close)
  const breakdownCalculatedTotal = useMemo(() => {
    return CURRENCY_DENOMINATIONS.reduce((sum, denom) => {
      const count = Number(cashBreakdown[denom] || 0);
      return sum + denom * count;
    }, 0);
  }, [cashBreakdown]);

  const showNotification = (msg) => {
    setActionSuccessMsg(msg);
    setTimeout(() => setActionSuccessMsg(''), 4000);
  };

  const handleOpenStartModal = () => {
    const currentHour = new Date().getHours();
    setOpeningShiftType(currentHour < 16 ? 'morning' : 'evening');
    setOpenUseBreakdown(false);
    setOpenCashBreakdown({ 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: '' });
    setSafetyChecked(true);
    setFormError('');
    setShowOpenModal(true);
  };

  // فتح وردية جديدة
  const handleOpenShift = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const amount = Number(openUseBreakdown ? openBreakdownCalculatedTotal : (openingCashInput || 0));
      if (isNaN(amount) || amount < 0) {
        setFormError('الرجاء إدخال عهدة نقدية صحيحة');
        return;
      }
      await shiftsApi.openShift({
        openingCash: amount,
        shiftType: openingShiftType,
        posStation: openingPosStation,
        notes: openNotesInput,
        openingCashBreakdown: openUseBreakdown ? openCashBreakdown : null,
      });
      setShowOpenModal(false);
      setOpeningCashInput('');
      setOpenNotesInput('');
      setOpenCashBreakdown({ 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: '' });
      setOpenUseBreakdown(false);
      showNotification('تم استلام الدرج وبدء الوردية بنجاح 🟢');
      loadData();
    } catch (err) {
      setFormError(err.message || 'فشل فتح الوردية');
    }
  };

  // تسجيل مصروف من الدرج
  const handleAddExpense = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const amt = Number(expenseAmount);
      if (isNaN(amt) || amt <= 0) {
        setFormError('الرجاء إدخال مبلغ مصروف صحيح أكبر من الصفر');
        return;
      }
      await shiftsApi.addShiftExpense({
        amount: amt,
        category: expenseCategory,
        notes: expenseNotes,
      });
      setShowExpenseModal(false);
      setExpenseAmount('');
      setExpenseNotes('');
      showNotification('تم تسجيل المصروف وخصمه من الدرج بنجاح 💸');
      loadData();
    } catch (err) {
      setFormError(err.message || 'فشل تسجيل المصروف');
    }
  };

  // إغلاق الوردية (Z-Report)
  const handleCloseShift = async (e) => {
    e.preventDefault();
    setFormError('');
    try {
      const actual = Number(useBreakdown ? breakdownCalculatedTotal : actualCashInput);
      if (isNaN(actual) || actual < 0) {
        setFormError('الرجاء إدخال النقدية الفعلية الموجودة في الدرج');
        return;
      }

      const closed = await shiftsApi.closeShift({
        actualCash: actual,
        cashBreakdown: useBreakdown ? cashBreakdown : null,
        notes: closeNotesInput,
      });

      setShowCloseModal(false);
      setActualCashInput('');
      setCloseNotesInput('');
      setCashBreakdown({ 200: '', 100: '', 50: '', 20: '', 10: '', 5: '', 1: '' });
      setUseBreakdown(false);

      // فتح نافذة Z-Report تلقائياً للطباعة
      setPreviewReport({ shift: closed, reportType: 'Z' });
      showNotification('تم إغلاق وتقفيل الوردية ومطابقة الدرج بنجاح 🔒');
      loadData();
    } catch (err) {
      setFormError(err.message || 'فشل إغلاق الوردية');
    }
  };

  // استعراض تقرير استطلاعي (X-Report)
  const handleShowXReport = async () => {
    try {
      const rep = await shiftsApi.getShiftXReport();
      if (rep) {
        setPreviewReport({ shift: rep, reportType: 'X' });
      }
    } catch (err) {
      alert(err.message || 'فشل استخراج التقرير الاستطلاعي');
    }
  };

  // استعراض تقرير وردية سابقة
  const handleViewShiftDetails = async (shiftId) => {
    try {
      const rep = await shiftsApi.getShiftById(shiftId);
      if (rep) {
        setPreviewReport({ shift: rep, reportType: 'Z' });
      }
    } catch {
      alert('فشل عرض تفاصيل الوردية');
    }
  };

  // طباعة التقرير
  const handlePrint = () => {
    setIsPrinting(true);
    setTimeout(() => {
      window.print();
      setIsPrinting(false);
    }, 150);
  };

  // التصفية والبحث
  const filteredShifts = useMemo(() => {
    let list = shiftsList;
    if (sessionUser && sessionUser.role !== 'admin') {
      list = list.filter((s) => s.user_id === sessionUser.id);
    }
    return list.filter((s) => {
      const matchesStatus =
        filterStatus === 'all' ||
        (filterStatus === 'open' && s.status === 'open') ||
        (filterStatus === 'closed' && s.status === 'closed') ||
        (filterStatus === 'shortage' && s.status === 'closed' && Number(s.cash_difference || 0) < 0) ||
        (filterStatus === 'overage' && s.status === 'closed' && Number(s.cash_difference || 0) > 0);

      const q = searchTerm.trim().toLowerCase();
      const matchesSearch =
        !q ||
        String(s.id).includes(q) ||
        (s.cashier_username && s.cashier_username.toLowerCase().includes(q)) ||
        (s.opened_by_name && s.opened_by_name.toLowerCase().includes(q));

      return matchesStatus && matchesSearch;
    });
  }, [shiftsList, sessionUser, filterStatus, searchTerm]);

  return (
    <div className="shifts-page-container">
      {/* Toast Notification */}
      {actionSuccessMsg && (
        <div style={{
          background: '#DCFCE7',
          color: '#15803D',
          border: '1px solid #86EFAC',
          padding: '12px 18px',
          borderRadius: '12px',
          marginBottom: '18px',
          fontWeight: '700',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          boxShadow: '0 4px 12px rgba(22, 163, 74, 0.1)'
        }}>
          <span>✓</span>
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Header Row */}
      <div className="page-header-row">
        <div>
          <h1>
            <span>⏰</span> إدارة الورديات وتقارير التقفيل (Z-Report)
          </h1>
          <p className="page-subtitle">
            متابعة حركة الدرج، العهد النقدية، المصروفات، ومطابقة النقدية الفعلية لحماية أموال المتجر ومنع العجز
          </p>
        </div>

        <div className="header-action-group">
          {activeShift ? (
            <>
              <button
                type="button"
                className="warning-btn"
                onClick={() => {
                  setFormError('');
                  setShowExpenseModal(true);
                }}
              >
                <span>💸</span> سحب مصروف من الدرج
              </button>
            {sessionUser?.role === 'admin' && (
              <button
                type="button"
                className="secondary-btn"
                onClick={handleShowXReport}
              >
                <span>📊</span> تقرير استطلاعي (X-Report)
              </button>
            )}
              <button
                type="button"
                className="danger-btn"
                onClick={() => {
                  setFormError('');
                  setShowCloseModal(true);
                }}
              >
                <span>🔒</span> إغلاق الوردية (Z-Report)
              </button>
            </>
          ) : (
            <button
              type="button"
              className="primary-btn"
              onClick={handleOpenStartModal}
            >
              <span>🟢</span> فتح وردية جديدة واستلام الدرج
            </button>
          )}
        </div>
      </div>

      {/* KPI Stats Cards - Admin Only */}
      {sessionUser?.role === 'admin' && (
        <div className="fox-stats-row">
          <div className="fox-stat-card blue">
            <div className="stat-icon">💰</div>
            <span className="stat-label">مبيعات الورديات المغلقة</span>
            <span className="stat-value">{kpis.totalSalesVolume?.toLocaleString('ar-EG')} ج.م</span>
            <span className="stat-sub">{kpis.closedShiftsCount} وردية مكتملة ومقفلة</span>
          </div>

          <div className="fox-stat-card rose">
            <div className="stat-icon">⚠️</div>
            <span className="stat-label">إجمالي العجز المسجل</span>
            <span className="stat-value" style={{ color: kpis.totalShortage > 0 ? '#DC2626' : '#64748B' }}>
              {kpis.totalShortage?.toLocaleString('ar-EG')} ج.م
            </span>
            <span className="stat-sub">نقص مالي مرصود على الكاشيرية</span>
          </div>

          <div className="fox-stat-card emerald">
            <div className="stat-icon">📈</div>
            <span className="stat-label">إجمالي الفائض / الزيادات</span>
            <span className="stat-value" style={{ color: kpis.totalOverage > 0 ? '#15803D' : '#64748B' }}>
              {kpis.totalOverage?.toLocaleString('ar-EG')} ج.م
            </span>
            <span className="stat-sub">فائض نقدي مسجل فوق المبيعات</span>
          </div>

          <div className="fox-stat-card amber">
            <div className="stat-icon">💸</div>
            <span className="stat-label">مصروفات ونثريات الدرج</span>
            <span className="stat-value" style={{ color: '#D97706' }}>
              {kpis.totalExpensesAmount?.toLocaleString('ar-EG')} ج.م
            </span>
            <span className="stat-sub">سحوبات مسجلة خلال الورديات</span>
          </div>
        </div>
      )}

      {/* Active Shift Hero Card */}
      {activeShift ? (
        <div className="active-shift-hero">
          <div className="shift-hero-top">
            <div className="shift-hero-info">
              <div className="shift-hero-avatar">
                <span>👤</span>
              </div>
              <div className="shift-hero-title-wrap">
                <h3>
                  <span>الوردية الحالية نشطة (وردية #{activeShift.id})</span>
                  <span className="badge-open">
                    <span className="shift-live-dot" style={{ display: 'inline-block' }}></span> جارية الآن
                  </span>
                  <span style={{
                    fontSize: '12px',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    background: activeShift.shift_type === 'evening' ? '#EEF2FF' : '#FEF3C7',
                    color: activeShift.shift_type === 'evening' ? '#4338CA' : '#B45309',
                    fontWeight: '700'
                  }}>
                    {activeShift.shift_type === 'evening' ? '🌙 مسائية' : '☀️ صباحية'}
                  </span>
                </h3>
                <p className="page-subtitle" style={{ margin: 0 }}>
                  المسؤول: <strong style={{ color: '#0F172A' }}>{activeShift.cashier_username || activeShift.opened_by_name}</strong> | المحطة: <strong>{activeShift.pos_station || 'الدرج الرئيسي'}</strong> | وقت الاستلام: {new Date(activeShift.start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} ({new Date(activeShift.start_time).toLocaleDateString('ar-EG')})
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '8px' }}>
              {sessionUser?.role === 'admin' && (
                <button
                  type="button"
                  className="secondary-btn"
                  style={{ padding: '8px 14px', fontSize: '12.5px' }}
                  onClick={handleShowXReport}
                >
                  <span>📊</span> معاينة X
                </button>
              )}
              <button
                type="button"
                className="danger-btn"
                style={{ padding: '8px 16px', fontSize: '12.5px' }}
                onClick={() => {
                  setFormError('');
                  setShowCloseModal(true);
                }}
              >
                <span>🔒</span> تقفيل الدرج
              </button>
            </div>
          </div>

          <div className="shift-hero-metrics">
            <div className="shift-metric-item">
              <span className="shift-metric-lbl">العهدة الابتدائية (الفكة)</span>
              <span className="shift-metric-val">{Number(activeShift.opening_cash || 0).toFixed(2)} ج.م</span>
            </div>
            <div className="shift-metric-item">
              <span className="shift-metric-lbl">مبيعات الكاش (+)</span>
              <span className="shift-metric-val green">+{Number(activeShift.liveTotals?.cashSales || 0).toFixed(2)} ج.م</span>
            </div>
            <div className="shift-metric-item">
              <span className="shift-metric-lbl">مصروفات الدرج (-)</span>
              <span className="shift-metric-val red">-{Number(activeShift.liveTotals?.totalExpenses || 0).toFixed(2)} ج.م</span>
            </div>
            {Number(activeShift.liveTotals?.cashExchangeNet || 0) !== 0 && (
              <div className="shift-metric-item">
                <span className="shift-metric-lbl">صافي فروق الاستبدال النقدية</span>
                <span className={`shift-metric-val ${activeShift.liveTotals.cashExchangeNet > 0 ? 'green' : 'red'}`}>
                  {activeShift.liveTotals.cashExchangeNet > 0 ? '+' : ''}
                  {Number(activeShift.liveTotals.cashExchangeNet).toFixed(2)} ج.م
                </span>
              </div>
            )}
            {sessionUser?.role === 'admin' && (
              <div className="shift-metric-item" style={{ background: '#F0F9FF', padding: '6px 12px', borderRadius: '8px' }}>
                <span className="shift-metric-lbl" style={{ color: '#0369A1' }}>النقدية المفترضة بالدرج (=)</span>
                <span className="shift-metric-val blue">{Number(activeShift.liveTotals?.expectedCash || 0).toFixed(2)} ج.م</span>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="active-shift-empty">
          <div className="shift-empty-icon">
            <span>⚠️</span>
          </div>
          <div>
            <h3 style={{ margin: '0 0 4px 0', fontSize: '17px', color: '#0F172A', fontWeight: '800' }}>
              الدرج مغلق حالياً ولا توجد وردية مفتوحة
            </h3>
            <p style={{ margin: 0, color: '#64748B', fontSize: '13.5px' }}>
              قم بفتح وردية جديدة وتسجيل العهدة الابتدائية لبدء تسجيل المبيعات ومطابقة النقدية بدقة.
            </p>
          </div>
          <button
            type="button"
            className="primary-btn"
            style={{ marginTop: '6px' }}
            onClick={handleOpenStartModal}
          >
            <span>🟢</span> فتح وردية واستلام الدرج الآن
          </button>
        </div>
      )}

      {/* Shifts History Table Card */}
      <div className="table-card">
        <div className="table-toolbar">
          <div>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '800', color: '#0F172A' }}>
              سجل وتاريخ الورديات السابقة
            </h3>
            <span style={{ fontSize: '12px', color: '#64748B' }}>
              عرض كافة تفاصيل التقفيل وتقارير Z-Report السابقة
            </span>
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div className="search-box-wrap">
              <span>🔍</span>
              <input
                type="text"
                placeholder="بحث برقم الوردية أو اسم الكاشير..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <select
              className="filter-select"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">جميع الحالات</option>
              <option value="open">الورديات المفتوحة</option>
              <option value="closed">الورديات المقفلة</option>
              <option value="shortage">الورديات التي بها عجز 🔴</option>
              <option value="overage">الورديات التي بها زيادة 🟢</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#94A3B8' }}>
            جاري تحميل سجل الورديات...
          </div>
        ) : filteredShifts.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '50px', color: '#64748B' }}>
            لا توجد أي ورديات مسجلة تطابق معايير البحث
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="shifts-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>الكاشير المسؤول</th>
                  <th>وقت البدء</th>
                  <th>وقت الإغلاق</th>
                  <th>العهدة</th>
                  <th>مبيعات الكاش</th>
                  <th>الفيزا والآجل</th>
                  <th>المصروفات</th>
                  <th>المتوقع</th>
                  <th>الفعلي</th>
                  <th>نتيجة المطابقة</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredShifts.map((s) => {
                  const isClosed = s.status === 'closed';
                  const diff = Number(s.cash_difference || 0);

                  return (
                    <tr key={s.id}>
                      <td>
                        <strong style={{ color: '#F2600C' }}>#{s.id}</strong>
                        <div style={{ fontSize: '10.5px', color: s.shift_type === 'evening' ? '#4F46E5' : '#D97706', fontWeight: '700' }}>
                          {s.shift_type === 'evening' ? '🌙 مسائية' : '☀️ صباحية'}
                        </div>
                      </td>
                      <td>
                        <span style={{ fontWeight: 700, color: '#0F172A' }}>
                          {s.cashier_username || s.opened_by_name}
                        </span>
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748B' }}>
                        {new Date(s.start_time).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' })}
                      </td>
                      <td style={{ fontSize: '12px', color: '#64748B' }}>
                        {s.end_time ? new Date(s.end_time).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' }) : 'جارية...'}
                      </td>
                      <td style={{ fontWeight: 600 }}>{Number(s.opening_cash || 0).toFixed(2)}</td>
                      <td style={{ color: '#15803D', fontWeight: 700 }}>
                        {Number(s.total_cash_sales || 0).toFixed(2)}
                      </td>
                      <td style={{ color: '#0369A1' }}>
                        {(Number(s.total_card_sales || 0) + Number(s.total_credit_sales || 0)).toFixed(2)}
                      </td>
                      <td style={{ color: '#DC2626', fontWeight: 600 }}>{Number(s.total_expenses || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 700 }}>{Number(s.expected_cash || 0).toFixed(2)}</td>
                      <td style={{ fontWeight: 800 }}>
                        {s.actual_cash != null ? Number(s.actual_cash).toFixed(2) : '-'}
                      </td>
                      <td>
                        {!isClosed ? (
                          <span className="badge-open">قيد التشغيل</span>
                        ) : diff === 0 ? (
                          <span className="badge-match">مطابقة 100% ✓</span>
                        ) : diff < 0 ? (
                          <span className="badge-shortage">عجز {Math.abs(diff).toFixed(2)} ج.م</span>
                        ) : (
                          <span className="badge-overage">زيادة +{diff.toFixed(2)} ج.م</span>
                        )}
                      </td>
                      <td>
                        <span className={isClosed ? 'badge-neutral' : 'badge-match'}>
                          {isClosed ? 'مقفلة' : 'مفتوحة'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="secondary-btn"
                          style={{ padding: '6px 12px', fontSize: '12px' }}
                          onClick={() => handleViewShiftDetails(s.id)}
                          title="عرض تقرير Z-Report وطباعته"
                        >
                          <span>📄 تقرير Z</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: فتح وردية جديدة متطورة */}
      {showOpenModal && (
        <div className="modal-overlay" onClick={() => setShowOpenModal(false)}>
          <div className="modal-box" style={{ maxWidth: '560px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🟢 استلام الدرج وبدء وردية جديدة</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowOpenModal(false)}>×</button>
            </div>

            <form onSubmit={handleOpenShift}>
              <div className="modal-body">
                {formError && <div className="form-error-banner">{formError}</div>}

                {/* Staff & Station Info Grid */}
                <div className="shift-staff-grid">
                  <div className="shift-meta-item">
                    <span className="shift-meta-label">👤 مستلم الوردية</span>
                    <strong className="shift-meta-val">
                      {sessionUser?.username || 'الكاشير'}
                      <span style={{ fontSize: '10px', background: '#E2E8F0', padding: '1px 5px', borderRadius: '4px', color: '#475569' }}>
                        {sessionUser?.role === 'admin' ? 'مدير' : 'كاشير'}
                      </span>
                    </strong>
                  </div>
                  <div className="shift-meta-item">
                    <span className="shift-meta-label">🏬 نقطة البيع</span>
                    <strong className="shift-meta-val">{openingPosStation}</strong>
                  </div>
                  <div className="shift-meta-item">
                    <span className="shift-meta-label">🕒 توقيت الاستلام</span>
                    <strong className="shift-meta-val" style={{ fontFamily: 'Space Grotesk' }}>
                      {new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </strong>
                  </div>
                </div>

                {/* Handover from Previous Shift Banner (if exists) */}
                {lastClosedShift && (
                  <div className="shift-handover-card">
                    <div className="shift-handover-info">
                      <div className="shift-handover-icon">📦</div>
                      <div className="shift-handover-texts">
                        <h5>آخر وردية مغلقة: #{lastClosedShift.id} ({lastClosedShift.closed_by_username || lastClosedShift.cashier_username || 'كاشير'})</h5>
                        <p>
                          العهدة النقدية المتبقية: <strong>{Number(lastClosedShift.actual_cash || 0).toFixed(2)} ج.م</strong>
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="shift-handover-btn"
                      onClick={() => {
                        const val = Number(lastClosedShift.actual_cash || 0);
                        setOpeningCashInput(val > 0 ? String(val) : '0');
                        setOpenUseBreakdown(false);
                      }}
                    >
                      ⚡ استلام نفس العهدة
                    </button>
                  </div>
                )}

                {/* Shift Type (Morning / Evening only) */}
                <div className="form-group">
                  <label className="form-label">فترة الوردية (الشيفت)</label>
                  <div className="shift-type-pills">
                    <button
                      type="button"
                      className={`shift-type-btn ${openingShiftType === 'morning' ? 'active morning' : ''}`}
                      onClick={() => setOpeningShiftType('morning')}
                    >
                      <span>☀️</span> وردية صباحية
                    </button>
                    <button
                      type="button"
                      className={`shift-type-btn ${openingShiftType === 'evening' ? 'active evening' : ''}`}
                      onClick={() => setOpeningShiftType('evening')}
                    >
                      <span>🌙</span> وردية مسائية
                    </button>
                  </div>
                </div>

                {/* Opening Cash Input & Presets */}
                <div className="form-group">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label className="form-label" style={{ margin: 0 }}>
                      العهدة النقدية الابتدائية (الفكة في الدرج) <span style={{ color: '#EF4444' }}>*</span>
                    </label>
                    <button
                      type="button"
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#F2600C',
                        fontSize: '12.5px',
                        fontWeight: '700',
                        cursor: 'pointer'
                      }}
                      onClick={() => setOpenUseBreakdown(!openUseBreakdown)}
                    >
                      {openUseBreakdown ? '⌨️ إدخال يدوي مباشر' : '🧮 حاسبة تفقيط الفئات'}
                    </button>
                  </div>

                  {/* Quick Presets */}
                  <div className="quick-presets-row">
                    {[0, 200, 300, 500, 1000].map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        className="preset-chip"
                        onClick={() => {
                          setOpeningCashInput(String(preset));
                          setOpenUseBreakdown(false);
                        }}
                      >
                        {preset === 0 ? 'بدون فكة (0)' : `${preset} ج.م`}
                      </button>
                    ))}
                  </div>

                  {!openUseBreakdown ? (
                    <div style={{ position: 'relative' }}>
                      <input
                        type="number"
                        step="0.5"
                        min="0"
                        className="form-input form-input-lg"
                        placeholder="500"
                        value={openingCashInput}
                        onChange={(e) => setOpeningCashInput(e.target.value)}
                        required
                        autoFocus
                      />
                      <span style={{
                        position: 'absolute',
                        left: '14px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: '#64748B',
                        fontWeight: '700',
                        fontSize: '13px'
                      }}>
                        ج.م
                      </span>
                    </div>
                  ) : (
                    /* Denominations breakdown */
                    <div className="denominations-card" style={{ marginTop: '8px' }}>
                      <span className="denom-title">💰 تفقيط فئات الفكة النقدية:</span>
                      <div className="denom-grid">
                        {CURRENCY_DENOMINATIONS.map((denom) => (
                          <div key={denom} className="denom-row">
                            <span className="denom-label">{denom} ج.م:</span>
                            <input
                              type="number"
                              min="0"
                              className="denom-input"
                              placeholder="0"
                              value={openCashBreakdown[denom] || ''}
                              onChange={(e) => {
                                const val = e.target.value.replace(/\D/g, '');
                                setOpenCashBreakdown((prev) => ({ ...prev, [denom]: val }));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                      <div className="denom-total-box">
                        <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>إجمالي الفكة المحسوب:</span>
                        <strong style={{ color: '#15803D', fontSize: '16px', fontFamily: 'Space Grotesk' }}>
                          {openBreakdownCalculatedTotal.toFixed(2)} ج.م
                        </strong>
                      </div>
                    </div>
                  )}
                  <span className="form-helper" style={{ marginTop: '6px' }}>
                    أدخل المبلغ المتوفر في الدرج لحظة استلام الشيفت قبل أول عملية بيع.
                  </span>
                </div>

                {/* Safety & Checklist */}
                <div className="checklist-card">
                  <label className="checklist-label">
                    <input
                      type="checkbox"
                      className="checklist-checkbox"
                      checked={safetyChecked}
                      onChange={(e) => setSafetyChecked(e.target.checked)}
                    />
                    <span>✅ تم فحص وسلامة الدرج وطابعة الفواتير وجهاز الباركود وتجهيزات الكاشير</span>
                  </label>
                </div>

                {/* Notes */}
                <div className="form-group">
                  <label className="form-label">ملاحظات الاستلام (اختياري)</label>
                  <textarea
                    className="form-input"
                    placeholder="أي ملاحظات حول استلام الوردية وحالة الدرج..."
                    rows="2"
                    value={openNotesInput}
                    onChange={(e) => setOpenNotesInput(e.target.value)}
                  ></textarea>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setShowOpenModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="primary-btn">
                  تأكيد استلام الدرج وبدء الوردية 🟢
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: تسجيل مصروف من الدرج */}
      {showExpenseModal && (
        <div className="modal-overlay" onClick={() => setShowExpenseModal(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>💸 سحب وتسجيل مصروف من الدرج</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowExpenseModal(false)}>×</button>
            </div>

            <form onSubmit={handleAddExpense}>
              <div className="modal-body">
                {formError && <div className="form-error-banner">{formError}</div>}

                <div className="form-group">
                  <label className="form-label">
                    المبلغ المسحوب <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0.5"
                    className="form-input form-input-lg"
                    placeholder="50"
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    required
                    autoFocus
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">بند أو تصنيف المصروف</label>
                  <select
                    className="form-input"
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value)}
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">البيان / تفاصيل المصروف</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="مثال: شاي وقهوة للضيوف، شراء أدوات نظافة..."
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setShowExpenseModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="warning-btn">
                  خصم المصروف من الدرج 💸
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: إغلاق الوردية Z-Report والعد الأعمى */}
      {showCloseModal && (
        <div className="modal-overlay" onClick={() => setShowCloseModal(false)}>
          <div className="modal-box" style={{ maxWidth: '520px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>🔒 تقفيل الوردية وإصدار تقرير (Z-Report)</h3>
              <button type="button" className="modal-close-btn" onClick={() => setShowCloseModal(false)}>×</button>
            </div>

            <form onSubmit={handleCloseShift}>
              <div className="modal-body">
                {formError && <div className="form-error-banner">{formError}</div>}

                <div style={{
                  background: '#F0F9FF',
                  border: '1px solid #BAE6FD',
                  padding: '12px 14px',
                  borderRadius: '12px'
                }}>
                  <strong style={{ color: '#0369A1', fontSize: '13.5px' }}>نظام العد الأعمى (Blind Count):</strong>
                  <p style={{ margin: '4px 0 0 0', fontSize: '12.5px', color: '#475569' }}>
                    قم بعد المبلغ الكاش الفعلي الموجود في الدرج حالياً وأدخله هنا. سيقوم النظام بعمل مطابقة فورية وكشف أي عجز أو زيادة وإصدار تقرير Z-Report نهائي.
                  </p>
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <label className="form-label" style={{ margin: 0 }}>
                    النقدية الفعلية بالدرج <span style={{ color: '#EF4444' }}>*</span>
                  </label>
                  <button
                    type="button"
                    style={{
                      background: 'none',
                      border: 'none',
                      color: '#F2600C',
                      fontSize: '12.5px',
                      fontWeight: '700',
                      cursor: 'pointer'
                    }}
                    onClick={() => setUseBreakdown(!useBreakdown)}
                  >
                    {useBreakdown ? '⌨️ إدخال يدوي مباشر' : '💵 استخدام عداد الفئات النقدية'}
                  </button>
                </div>

                {!useBreakdown ? (
                  <div className="form-group">
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      className="form-input form-input-lg"
                      placeholder="المبلغ الفعلي..."
                      value={actualCashInput}
                      onChange={(e) => setActualCashInput(e.target.value)}
                      required
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="denominations-card">
                    <div className="denominations-grid">
                      {CURRENCY_DENOMINATIONS.map((denom) => (
                        <div key={denom} className="denom-row">
                          <span className="denom-lbl">{denom} ج.م ×</span>
                          <input
                            type="number"
                            min="0"
                            className="denom-input"
                            placeholder="0"
                            value={cashBreakdown[denom]}
                            onChange={(e) => {
                              const val = e.target.value;
                              setCashBreakdown((prev) => ({ ...prev, [denom]: val }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <div className="denom-total-box">
                      <span style={{ fontSize: '12.5px', color: '#64748B', fontWeight: '600' }}>إجمالي العد المحسوب:</span>
                      <strong style={{ color: '#15803D', fontSize: '16px', fontFamily: 'Space Grotesk' }}>
                        {breakdownCalculatedTotal.toFixed(2)} ج.م
                      </strong>
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label">ملاحظات التقفيل (اختياري)</label>
                  <textarea
                    className="form-input"
                    placeholder="أي ملاحظات حول الوردية أو تسليم الدرج..."
                    rows="2"
                    value={closeNotesInput}
                    onChange={(e) => setCloseNotesInput(e.target.value)}
                  ></textarea>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="secondary-btn" onClick={() => setShowCloseModal(false)}>
                  إلغاء
                </button>
                <button type="submit" className="danger-btn">
                  تأكيد تقفيل الوردية وإصدار Z-Report 🔒
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: معاينة وطباعة تقرير الوردية Z / X */}
      {previewReport && (
        <div className="modal-overlay" onClick={() => setPreviewReport(null)}>
          <div className="modal-box" style={{ maxWidth: '540px', borderRadius: '16px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', margin: 0 }}>
                {previewReport.reportType === 'Z' || previewReport.shift.status === 'closed'
                  ? '🧾 تقرير التقفيل النهائي (Z-Report)'
                  : '📊 تقرير استطلاعي للوردية (X-Report)'}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => setPreviewReport(null)}>×</button>
            </div>

            <div style={{
              maxHeight: '72vh',
              overflowY: 'auto',
              padding: '18px 20px',
              background: '#F1F5F9'
            }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '14px',
                padding: '18px 20px',
                boxShadow: '0 4px 14px rgba(0,0,0,0.06)',
                border: '1px solid #E2E8F0'
              }}>
                <ShiftReportPrint shift={previewReport.shift} reportType={previewReport.reportType} />
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '14px 20px' }}>
              <button type="button" className="secondary-btn" onClick={() => setPreviewReport(null)}>
                إغلاق
              </button>
              <button
                type="button"
                className="primary-btn"
                style={{ padding: '10px 22px', fontSize: '14px', fontWeight: '700' }}
                onClick={handlePrint}
                disabled={isPrinting}
              >
                <span>🖨️</span> طباعة التقرير الحراري
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

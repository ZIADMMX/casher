import { useState, useEffect, useMemo, useCallback } from 'react';
import ShiftReportPrint from '../components/ShiftReportPrint.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as authApi from '../api/auth.js';
import * as shiftsApi from '../api/shifts.js';
import LineIcon from '../components/icons/LineIcons.jsx';
import '../styles/shiftsPage.css';

const EXPENSE_CATEGORIES = [
  'نثريات ومصروفات عامة',
  'بوفيه وضيافة ومشروبات',
  'صيانة وإصلاحات',
  'مواصلات وشحن سريع',
  'شراء مستلزمات للمحل',
  'أخرى',
];

// Notes and coins, in pounds; 0.5 and 0.25 are the 50 and 25 piastre coins.
const CURRENCY_DENOMINATIONS = [200, 100, 50, 20, 10, 5, 1, 0.5, 0.25];
const denomLabel = (d) => (d < 1 ? `${d * 100} ق` : `${d} ج`);
const emptyBreakdown = () => Object.fromEntries(CURRENCY_DENOMINATIONS.map((d) => [d, '']));

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
  const [openCashBreakdown, setOpenCashBreakdown] = useState(emptyBreakdown);
  const [safetyChecked, setSafetyChecked] = useState(true);
  const [openNotesInput, setOpenNotesInput] = useState('');

  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [expenseNotes, setExpenseNotes] = useState('');

  const [actualCashInput, setActualCashInput] = useState('');
  const [useBreakdown, setUseBreakdown] = useState(true);
  const [cashBreakdown, setCashBreakdown] = useState(emptyBreakdown);
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
    setOpenCashBreakdown(emptyBreakdown());
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
      setOpenCashBreakdown(emptyBreakdown());
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
      setCashBreakdown(emptyBreakdown());
      setUseBreakdown(true);

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

  const isAdmin = sessionUser?.role === 'admin';
  const live = activeShift?.liveTotals;
  const expectedCash = Number(live?.expectedCash || 0);
  // Blind count: only admins see the expected cash and the resulting difference while counting.
  const countedCash = Number(useBreakdown ? breakdownCalculatedTotal : actualCashInput) || 0;
  const countedDiff = Math.round((countedCash - expectedCash) * 100) / 100;

  return (
    <div className="shifts-page-container shp">
      {actionSuccessMsg && (
        <div className="shp-toast" role="status">
          <LineIcon name="checkCircle" size={20} />
          <span>{actionSuccessMsg}</span>
        </div>
      )}

      {/* Header */}
      <header className="shp-card shp-head">
        <div className="shp-head__title">
          <span className="shp-tile"><LineIcon name="clock" size={28} /></span>
          <div>
            <h1>إدارة الورديات وتقارير التقفيل <em>(Z-Report)</em></h1>
            <p>متابعة حركة الدرج، العهد النقدية، المصروفات، ومطابقة النقدية الفعلية لحماية أموال المتجر ومنع العجز</p>
          </div>
        </div>

        <div className="shp-actions">
          {activeShift ? (
            <>
              <button type="button" className="shp-btn" onClick={() => { setFormError(''); setShowExpenseModal(true); }}>
                <LineIcon name="download" /> سحب مصروف من الدرج
              </button>
              {isAdmin && (
                <button type="button" className="shp-btn" onClick={handleShowXReport}>
                  <LineIcon name="chart" /> تقرير استطلاعي (X-Report)
                </button>
              )}
              <button type="button" className="shp-btn shp-btn--primary" onClick={() => { setFormError(''); setShowCloseModal(true); }}>
                <LineIcon name="lock" /> إغلاق الوردية (Z-Report)
              </button>
            </>
          ) : (
            <button type="button" className="shp-btn shp-btn--primary" onClick={handleOpenStartModal}>
              <LineIcon name="unlock" /> فتح وردية جديدة واستلام الدرج
            </button>
          )}
        </div>
      </header>

      {/* KPIs: admin only */}
      {isAdmin && (
        <section className="shp-kpis" aria-label="مؤشرات الورديات">
          <article className="shp-card shp-kpi shp-kpi--orange">
            <span className="shp-kpi__icon"><LineIcon name="stopwatch" size={22} /></span>
            <span className="shp-kpi__label">مبيعات الورديات المغلقة</span>
            <span className="shp-kpi__value">{(kpis.totalSalesVolume || 0).toLocaleString('en-US')}<small>ج.م</small></span>
            <span className="shp-kpi__sub">{kpis.closedShiftsCount} وردية مكتملة ومقفلة</span>
          </article>
          <article className="shp-card shp-kpi shp-kpi--red">
            <span className="shp-kpi__icon"><LineIcon name="alert" size={22} /></span>
            <span className="shp-kpi__label">إجمالي العجز المسجل</span>
            <span className="shp-kpi__value">{(kpis.totalShortage || 0).toLocaleString('en-US')}<small>ج.م</small></span>
            <span className="shp-kpi__sub">نقص مالي مرصود على الكاشيرية</span>
          </article>
          <article className="shp-card shp-kpi shp-kpi--green">
            <span className="shp-kpi__icon"><LineIcon name="trendUp" size={22} /></span>
            <span className="shp-kpi__label">إجمالي الفائض / الزيادات</span>
            <span className="shp-kpi__value">{(kpis.totalOverage || 0).toLocaleString('en-US')}<small>ج.م</small></span>
            <span className="shp-kpi__sub">فائض نقدي مسجل فوق المبيعات</span>
          </article>
          <article className="shp-card shp-kpi shp-kpi--blue">
            <span className="shp-kpi__icon"><LineIcon name="banknote" size={22} /></span>
            <span className="shp-kpi__label">مصروفات ونثريات الدرج</span>
            <span className="shp-kpi__value">{(kpis.totalExpensesAmount || 0).toLocaleString('en-US')}<small>ج.م</small></span>
            <span className="shp-kpi__sub">سحوبات مسجلة خلال الورديات</span>
          </article>
        </section>
      )}

      {/* Current shift */}
      {activeShift ? (
        <section className="shp-card shp-current" aria-label="الوردية الحالية">
          <div className="shp-current__top">
            <div className="shp-current__who">
              <span className="shp-avatar"><LineIcon name="user" size={26} /></span>
              <div>
                <h3>
                  <span>الوردية الحالية نشطة (وردية #{activeShift.id})</span>
                  <span className="shp-chip shp-chip--live">جارية الآن</span>
                  <span className={`shp-chip ${activeShift.shift_type === 'evening' ? 'shp-chip--night' : 'shp-chip--day'}`}>
                    <LineIcon name={activeShift.shift_type === 'evening' ? 'moon' : 'sun'} size={14} />
                    {activeShift.shift_type === 'evening' ? 'مسائية' : 'صباحية'}
                  </span>
                </h3>
                <p className="shp-current__meta">
                  المسؤول: <b>{activeShift.cashier_username || activeShift.opened_by_name}</b>
                  <i>|</i>المحطة: <b>{activeShift.pos_station || 'الدرج الرئيسي'}</b>
                  <i>|</i>وقت الاستلام: {new Date(activeShift.start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })} — {new Date(activeShift.start_time).toLocaleDateString('ar-EG')}
                </p>
              </div>
            </div>

            <div className="shp-actions">
              {isAdmin && (
                <button type="button" className="shp-btn shp-btn--sm" onClick={handleShowXReport}>
                  <LineIcon name="eye" size={16} /> معاينة X
                </button>
              )}
              <button type="button" className="shp-btn shp-btn--primary shp-btn--sm" onClick={() => { setFormError(''); setShowCloseModal(true); }}>
                <LineIcon name="briefcase" size={16} /> تقفيل الدرج
              </button>
            </div>
          </div>

          <div className="shp-metrics">
            <div className="shp-metric">
              <span>العهدة الابتدائية (الفكة)</span>
              <strong>{Number(activeShift.opening_cash || 0).toFixed(2)}<small>ج.م</small></strong>
            </div>
            <div className="shp-metric shp-metric--green">
              <span>مبيعات الكاش (+)</span>
              <strong>+{Number(live?.cashSales || 0).toFixed(2)}<small>ج.م</small></strong>
            </div>
            <div className="shp-metric shp-metric--red">
              <span>مصروفات الدرج (-)</span>
              <strong>-{Number(live?.totalExpenses || 0).toFixed(2)}<small>ج.م</small></strong>
            </div>
            {Number(live?.cashExchangeNet || 0) !== 0 && (
              <div className={`shp-metric ${live.cashExchangeNet > 0 ? 'shp-metric--green' : 'shp-metric--red'}`}>
                <span>صافي فروق الاستبدال النقدية</span>
                <strong>{live.cashExchangeNet > 0 ? '+' : ''}{Number(live.cashExchangeNet).toFixed(2)}<small>ج.م</small></strong>
              </div>
            )}
            {isAdmin && (
              <div className="shp-metric shp-metric--brand">
                <span>النقدية المفترضة بالدرج (=)</span>
                <strong>{expectedCash.toFixed(2)}<small>ج.م</small></strong>
              </div>
            )}
          </div>
        </section>
      ) : (
        <section className="shp-card shp-empty" aria-label="لا توجد وردية مفتوحة">
          <span className="shp-tile"><LineIcon name="alert" size={26} /></span>
          <div>
            <h3>الدرج مغلق حالياً ولا توجد وردية مفتوحة</h3>
            <p>قم بفتح وردية جديدة وتسجيل العهدة الابتدائية لبدء تسجيل المبيعات ومطابقة النقدية بدقة.</p>
          </div>
          <button type="button" className="shp-btn shp-btn--primary" onClick={handleOpenStartModal}>
            <LineIcon name="unlock" /> فتح وردية واستلام الدرج الآن
          </button>
        </section>
      )}

      {/* History */}
      <section className="shp-card shp-history" aria-label="سجل الورديات">
        <div className="shp-history__bar">
          <div>
            <h3>سجل وتاريخ الورديات السابقة</h3>
            <span>عرض كافة تفاصيل التقفيل وتقارير Z-Report السابقة</span>
          </div>
          <div className="shp-filters">
            <label className="shp-search">
              <LineIcon name="search" size={18} />
              <input type="text" placeholder="بحث برقم الوردية أو اسم الكاشير..." aria-label="بحث في الورديات" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
            </label>
            <select className="shp-select" aria-label="تصفية الحالة" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
              <option value="all">جميع الحالات</option>
              <option value="open">الورديات المفتوحة</option>
              <option value="closed">الورديات المقفلة</option>
              <option value="shortage">الورديات التي بها عجز</option>
              <option value="overage">الورديات التي بها زيادة</option>
            </select>
          </div>
        </div>

        {loading ? (
          <div className="shp-state">جاري تحميل سجل الورديات...</div>
        ) : filteredShifts.length === 0 ? (
          <div className="shp-state">لا توجد أي ورديات مسجلة تطابق معايير البحث</div>
        ) : (
          <div className="shp-table-wrap">
            <table className="shp-table">
              <thead>
                <tr>
                  <th>#</th><th>الكاشير المسؤول</th><th>وقت البدء</th><th>وقت الإغلاق</th><th>العهدة</th><th>مبيعات الكاش</th>
                  <th>الفيزا والآجل</th><th>المصروفات</th><th>المتوقع</th><th>الفعلي</th><th>نتيجة المطابقة</th><th>الحالة</th><th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filteredShifts.map((s) => {
                  const isClosed = s.status === 'closed';
                  const diff = Number(s.cash_difference || 0);
                  const night = s.shift_type === 'evening';
                  const fmtDate = (v) => new Date(v).toLocaleString('ar-EG', { dateStyle: 'short', timeStyle: 'short' });
                  return (
                    <tr key={s.id}>
                      <td>
                        <div className="shp-id">
                          <b>#{s.id}</b>
                          <small className={night ? 'is-night' : ''}><LineIcon name={night ? 'moon' : 'sun'} size={12} />{night ? 'مسائية' : 'صباحية'}</small>
                        </div>
                      </td>
                      <td><b>{s.cashier_username || s.opened_by_name}</b></td>
                      <td className="shp-time">{fmtDate(s.start_time)}</td>
                      <td className="shp-time">{s.end_time ? fmtDate(s.end_time) : <span className="shp-live">جارية...</span>}</td>
                      <td>{Number(s.opening_cash || 0).toFixed(2)}</td>
                      <td className="shp-num--green">{Number(s.total_cash_sales || 0).toFixed(2)}</td>
                      <td className="shp-num--blue">{(Number(s.total_card_sales || 0) + Number(s.total_credit_sales || 0)).toFixed(2)}</td>
                      <td className="shp-num--red">{Number(s.total_expenses || 0).toFixed(2)}</td>
                      <td><b>{Number(s.expected_cash || 0).toFixed(2)}</b></td>
                      <td><b>{s.actual_cash != null ? Number(s.actual_cash).toFixed(2) : '—'}</b></td>
                      <td>
                        {!isClosed ? (
                          <span className="shp-chip shp-chip--open"><LineIcon name="clock" size={13} /> قيد التشغيل</span>
                        ) : diff === 0 ? (
                          <span className="shp-chip shp-chip--good"><LineIcon name="check" size={13} /> مطابقة 100%</span>
                        ) : diff < 0 ? (
                          <span className="shp-chip shp-chip--bad">عجز {Math.abs(diff).toFixed(2)} ج.م</span>
                        ) : (
                          <span className="shp-chip shp-chip--good">زيادة +{diff.toFixed(2)} ج.م</span>
                        )}
                      </td>
                      <td>
                        <span className={`shp-chip ${isClosed ? 'shp-chip--muted' : 'shp-chip--ok'}`}>
                          <LineIcon name={isClosed ? 'lock' : 'unlock'} size={13} /> {isClosed ? 'مقفلة' : 'مفتوحة'}
                        </span>
                      </td>
                      <td>
                        <button type="button" className="shp-btn shp-btn--sm" onClick={() => handleViewShiftDetails(s.id)} title="عرض تقرير Z-Report وطباعته">
                          <LineIcon name="file" size={15} /> تقرير Z
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && filteredShifts.length > 0 && (
          <div className="shp-foot">
            <span>عرض {filteredShifts.length === 1 ? 'وردية واحدة' : `${filteredShifts.length} وردية`}{activeShift ? ' — وردية نشطة لم تُقفل بعد' : ''}</span>
            <span>آخر تحديث: <b>الآن</b></span>
          </div>
        )}
      </section>

      {/* MODAL: open a shift */}
      {showOpenModal && (
        <ShiftSheet
          width={660}
          icon="unlock"
          title="استلام الدرج وبدء وردية جديدة"
          subtitle="سجّل العهدة الابتدائية وابدأ تسجيل المبيعات على هذه الوردية"
          error={formError}
          onClose={() => setShowOpenModal(false)}
          onSubmit={handleOpenShift}
          footer={<button type="submit" className="shp-btn shp-btn--primary"><LineIcon name="unlock" /> تأكيد استلام الدرج وبدء الوردية</button>}
        >
          <div className="shm-meta">
            <div>
              <span><LineIcon name="user" size={14} /> مستلم الوردية</span>
              <strong>{sessionUser?.username || 'الكاشير'}<small>{isAdmin ? 'مدير' : 'كاشير'}</small></strong>
            </div>
            <div>
              <span><LineIcon name="store" size={14} /> نقطة البيع</span>
              <strong>{openingPosStation}</strong>
            </div>
            <div>
              <span><LineIcon name="clock" size={14} /> توقيت الاستلام</span>
              <strong>{new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</strong>
            </div>
          </div>

          {lastClosedShift && (
            <div className="shm-handover">
              <div>
                <span className="shp-avatar"><LineIcon name="box" size={22} /></span>
                <div>
                  <h5>آخر وردية مغلقة: #{lastClosedShift.id} ({lastClosedShift.closed_by_username || lastClosedShift.cashier_username || 'كاشير'})</h5>
                  <p>العهدة النقدية المتبقية: <strong>{Number(lastClosedShift.actual_cash || 0).toFixed(2)} ج.م</strong></p>
                </div>
              </div>
              <button
                type="button"
                className="shp-btn shp-btn--sm"
                onClick={() => {
                  const val = Number(lastClosedShift.actual_cash || 0);
                  setOpeningCashInput(val > 0 ? String(val) : '0');
                  setOpenUseBreakdown(false);
                }}
              >
                <LineIcon name="bolt" size={15} /> استلام نفس العهدة
              </button>
            </div>
          )}

          <div className="shm-field">
            <span>فترة الوردية (الشيفت)</span>
            <div className="shm-pills" role="group" aria-label="فترة الوردية">
              <button type="button" className={`shm-pill${openingShiftType === 'morning' ? ' is-on' : ''}`} aria-pressed={openingShiftType === 'morning'} onClick={() => setOpeningShiftType('morning')}>
                <LineIcon name="sun" /> وردية صباحية
              </button>
              <button type="button" className={`shm-pill${openingShiftType === 'evening' ? ' is-on' : ''}`} aria-pressed={openingShiftType === 'evening'} onClick={() => setOpeningShiftType('evening')}>
                <LineIcon name="moon" /> وردية مسائية
              </button>
            </div>
          </div>

          <div className="shm-field">
            <div className="shm-row">
              <span>العهدة النقدية الابتدائية (الفكة في الدرج) <em>*</em></span>
              <button type="button" className="shm-link" onClick={() => setOpenUseBreakdown(!openUseBreakdown)}>
                {openUseBreakdown ? 'إدخال المبلغ مباشرة' : 'حاسبة تفقيط الفئات'}
              </button>
            </div>

            <div className="shm-chips">
              {[0, 200, 300, 500, 1000].map((preset) => (
                <button key={preset} type="button" className="shm-chip" onClick={() => { setOpeningCashInput(String(preset)); setOpenUseBreakdown(false); }}>
                  {preset === 0 ? 'بدون فكة (0)' : `${preset} ج.م`}
                </button>
              ))}
            </div>

            {!openUseBreakdown ? (
              <input
                type="number" step="0.5" min="0" className="shm-input shm-input--lg" placeholder="500" aria-label="العهدة الابتدائية"
                value={openingCashInput} onChange={(e) => setOpeningCashInput(e.target.value)} required autoFocus
              />
            ) : (
              <>
                <DenominationGrid breakdown={openCashBreakdown} onChange={(denom, val) => setOpenCashBreakdown((prev) => ({ ...prev, [denom]: val.replace(/\D/g, '') }))} />
                <div className="shm-total shm-total--ok">
                  <span>إجمالي الفكة المحسوب</span>
                  <strong>{openBreakdownCalculatedTotal.toFixed(2)}<small>ج.م</small></strong>
                </div>
              </>
            )}
            <span className="shm-help">أدخل المبلغ المتوفر في الدرج لحظة استلام الشيفت قبل أول عملية بيع.</span>
          </div>

          <label className="shm-check">
            <input type="checkbox" checked={safetyChecked} onChange={(e) => setSafetyChecked(e.target.checked)} />
            <span>تم فحص سلامة الدرج وطابعة الفواتير وجهاز الباركود وتجهيزات الكاشير</span>
          </label>

          <label className="shm-field">
            <span>ملاحظات الاستلام (اختياري)</span>
            <textarea placeholder="أي ملاحظات حول استلام الوردية وحالة الدرج..." rows="2" value={openNotesInput} onChange={(e) => setOpenNotesInput(e.target.value)} />
          </label>
        </ShiftSheet>
      )}

      {/* MODAL: expense */}
      {showExpenseModal && (
        <ShiftSheet
          width={560}
          icon="download"
          title="سحب وتسجيل مصروف من الدرج"
          subtitle="يُخصم المبلغ من النقدية المتوقعة بالدرج ويظهر في تقرير الوردية"
          error={formError}
          onClose={() => setShowExpenseModal(false)}
          onSubmit={handleAddExpense}
          footer={<button type="submit" className="shp-btn shp-btn--primary"><LineIcon name="download" /> خصم المصروف من الدرج</button>}
        >
          <label className="shm-field">
            <span>المبلغ المسحوب <em>*</em></span>
            <input type="number" step="0.5" min="0.5" className="shm-input shm-input--lg" placeholder="50" value={expenseAmount} onChange={(e) => setExpenseAmount(e.target.value)} required autoFocus />
          </label>
          <label className="shm-field">
            <span>بند أو تصنيف المصروف</span>
            <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)}>
              {EXPENSE_CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
            </select>
          </label>
          <label className="shm-field">
            <span>البيان / تفاصيل المصروف</span>
            <input type="text" className="shm-input" placeholder="مثال: شاي وقهوة للضيوف، شراء أدوات نظافة..." value={expenseNotes} onChange={(e) => setExpenseNotes(e.target.value)} />
          </label>
        </ShiftSheet>
      )}

      {/* MODAL: close shift (Z-Report) */}
      {showCloseModal && (
        <ShiftSheet
          width={900}
          icon="briefcase"
          title={<>تقفيل الدرج وإصدار تقرير <em>Z-Report</em></>}
          subtitle={isAdmin ? 'عدّ النقدية الفعلية بالدرج فئة بفئة، والنظام يحسب العجز أو الفائض تلقائياً' : 'عدّ النقدية الفعلية بالدرج فئة بفئة (عدّ أعمى: تتم المطابقة بعد التأكيد)'}
          error={formError}
          onClose={() => setShowCloseModal(false)}
          onSubmit={handleCloseShift}
          hint={<><LineIcon name="info" size={16} /> بعد التأكيد تُقفل الوردية نهائياً ولا يمكن التعديل عليها</>}
          footer={<button type="submit" className="shp-btn shp-btn--primary"><LineIcon name="printer" /> تأكيد التقفيل وطباعة Z</button>}
        >
          {isAdmin && (
            <div className="shm-summary">
              <div className="shp-metric">
                <span>العهدة الابتدائية</span>
                <strong>{Number(activeShift?.opening_cash || 0).toFixed(2)}</strong>
              </div>
              <div className="shp-metric shp-metric--green">
                <span>مبيعات الكاش (+)</span>
                <strong>+{Number(live?.cashSales || 0).toFixed(2)}</strong>
              </div>
              <div className="shp-metric shp-metric--red">
                <span>المصروفات (−)</span>
                <strong>−{Number(live?.totalExpenses || 0).toFixed(2)}</strong>
              </div>
              <div className="shp-metric shp-metric--brand">
                <span>المتوقع بالدرج (=)</span>
                <strong>{expectedCash.toFixed(2)}</strong>
              </div>
            </div>
          )}

          <div className="shm-row">
            <h3 className="shm-section"><LineIcon name="banknote" size={18} /> عدّ فئات النقدية الفعلية</h3>
            <button type="button" className="shm-link" onClick={() => setUseBreakdown(!useBreakdown)}>
              {useBreakdown ? 'إدخال الإجمالي مباشرة' : 'استخدام عداد الفئات'}
            </button>
          </div>

          {useBreakdown ? (
            <DenominationGrid breakdown={cashBreakdown} onChange={(denom, val) => setCashBreakdown((prev) => ({ ...prev, [denom]: val }))} />
          ) : (
            <label className="shm-field">
              <span>النقدية الفعلية بالدرج <em>*</em></span>
              <input type="number" step="0.5" min="0" className="shm-input shm-input--lg" placeholder="المبلغ الفعلي..." value={actualCashInput} onChange={(e) => setActualCashInput(e.target.value)} required autoFocus />
            </label>
          )}

          <div className="shm-totals">
            {isAdmin && (
              <div className="shm-total">
                <span>المتوقع بالدرج</span>
                <strong>{expectedCash.toFixed(2)}<small>ج.م</small></strong>
              </div>
            )}
            <div className="shm-total shm-total--brand">
              <span>النقدية الفعلية المعدودة</span>
              <strong>{countedCash.toFixed(2)}<small>ج.م</small></strong>
            </div>
            {isAdmin && (
              <div className={`shm-total ${countedDiff < 0 ? 'shm-total--bad' : 'shm-total--good'}`}>
                <span>{countedDiff < 0 ? 'عجز في الدرج' : countedDiff > 0 ? 'فائض في الدرج' : 'الدرج مطابق'}</span>
                <strong>{countedDiff > 0 ? '+' : countedDiff < 0 ? '−' : ''}{Math.abs(countedDiff).toFixed(2)}<small>ج.م</small></strong>
              </div>
            )}
          </div>

          <label className="shm-field">
            <span>ملاحظات التقفيل (سبب العجز أو الفائض إن وجد)</span>
            <textarea placeholder="أي ملاحظات حول الوردية أو تسليم الدرج..." rows="2" value={closeNotesInput} onChange={(e) => setCloseNotesInput(e.target.value)} />
          </label>
        </ShiftSheet>
      )}

      {/* MODAL: preview / print Z or X report (keeps the print classes the print CSS relies on) */}
      {previewReport && (
        <div className="modal-overlay" onClick={() => setPreviewReport(null)}>
          <div className="modal-box shm-report" style={{ maxWidth: '560px', borderRadius: '24px' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header" style={{ padding: '16px 20px' }}>
              <h3 style={{ fontSize: '17px', fontWeight: '800', margin: 0 }}>
                {previewReport.reportType === 'Z' || previewReport.shift.status === 'closed'
                  ? 'تقرير التقفيل النهائي (Z-Report)'
                  : 'تقرير استطلاعي للوردية (X-Report)'}
              </h3>
              <button type="button" className="modal-close-btn" onClick={() => setPreviewReport(null)} aria-label="إغلاق">×</button>
            </div>

            <div className="shm-preview">
              <div>
                <ShiftReportPrint shift={previewReport.shift} reportType={previewReport.reportType} />
              </div>
            </div>

            <div className="modal-footer" style={{ padding: '14px 20px' }}>
              <button type="button" className="shp-btn" onClick={() => setPreviewReport(null)}>إغلاق</button>
              <button type="button" className="shp-btn shp-btn--primary" onClick={handlePrint} disabled={isPrinting}>
                <LineIcon name="printer" /> طباعة التقرير الحراري
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- local building blocks ------------------------------------------------

// Shared modal shell: gradient sheet, icon tile, title, scrolling body and a sticky footer.
function ShiftSheet({ width = 820, icon, title, subtitle, error, hint, onClose, onSubmit, footer, children }) {
  return (
    <div className="shm-overlay" onClick={onClose}>
      <form className="shm" style={{ '--shm-w': `${width}px` }} onClick={(e) => e.stopPropagation()} onSubmit={onSubmit} role="dialog" aria-modal="true">
        <header className="shm__head">
          <span className="shp-tile"><LineIcon name={icon} size={26} /></span>
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="shm-close" onClick={onClose} aria-label="إغلاق"><LineIcon name="x" size={20} /></button>
        </header>
        <div className="shm__body">
          {error && <div className="shm-error" role="alert">{error}</div>}
          {children}
        </div>
        <footer className="shm__foot">
          <span className="shm__hint">{hint}</span>
          <button type="button" className="shp-btn" onClick={onClose}>إلغاء</button>
          {footer}
        </footer>
      </form>
    </div>
  );
}

// One cell per denomination: tag, count input and the running subtotal.
function DenominationGrid({ breakdown, onChange }) {
  return (
    <div className="shm-denoms">
      {CURRENCY_DENOMINATIONS.map((denom) => {
        const count = Number(breakdown[denom] || 0);
        return (
          <div key={denom} className="shm-denom">
            <span className="shm-denom__tag">{denomLabel(denom)}</span>
            <input type="number" min="0" inputMode="numeric" placeholder="0" aria-label={`عدد فئة ${denomLabel(denom)}`} value={breakdown[denom] || ''} onChange={(e) => onChange(denom, e.target.value)} />
            <span className="shm-denom__x" aria-hidden="true">×</span>
            <span className="shm-denom__sub">{(denom * count).toFixed(2)}</span>
          </div>
        );
      })}
    </div>
  );
}

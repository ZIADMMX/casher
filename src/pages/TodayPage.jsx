import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import LawFirmTodayPage from '../components/legal/LawFirmTodayPage.jsx';
import ShiftOpenModal from '../components/pos/ShiftOpenModal.jsx';
import ShiftCloseModal from '../components/pos/ShiftCloseModal.jsx';
import DailyMessagesCard from '../components/DailyMessagesCard.jsx';
import {
  ArrowDownIcon, ArrowUpIcon, BagIcon, BoltIcon, CalendarIcon, CarIcon, CardIcon, CashIcon,
  CheckIcon, ClockIcon, LockIcon, PlusIcon, PulseIcon, ReceiptIcon, RefreshIcon, ScaleIcon,
  SearchIcon, StarIcon, StoreIcon, UnlockIcon, UsersIcon,
} from '../components/icons/PosIcons.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as customersApi from '../api/customers.js';
import * as groceryApi from '../api/grocery.js';
import * as inventoryApi from '../api/inventory.js';
import * as reportsApi from '../api/reports.js';
import * as salonApi from '../api/salon.js';
import * as shiftsApi from '../api/shifts.js';
import { whatsappUrl } from '../utils/whatsapp.js';
import '../styles/today.css';

const DAY_MS = 24 * 60 * 60 * 1000;
const CLOSED_STATUSES = new Set(['completed', 'converted', 'cancelled', 'no_show']);

// YYYY-MM-DD in local time (toISOString is UTC and flips the day near midnight).
const localDate = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// One shape for both appointment tables (generic services + salon chairs).
function normalizeAppointment(a) {
  const start = a.start_at ? new Date(a.start_at) : new Date(`${a.appointment_date}T${a.start_time}`);
  const end = a.end_at ? new Date(a.end_at) : new Date(`${a.appointment_date}T${a.end_time}`);
  return {
    id: a.id,
    customer: a.customer_name || 'عميل',
    phone: a.customer_phone || '',
    service: a.service_name || '',
    resource: a.resource_name || a.chair_name || '',
    estimate: Number(a.price ?? a.service_price ?? 0),
    status: a.status,
    start,
    end,
    createdAt: a.created_at ? new Date(a.created_at) : start,
  };
}

// Today's schedule, bookings still awaiting the customer's OK, and open jobs past their end time.
export function bucketAppointments(appointments, now) {
  const todayStr = localDate(now);
  const valid = appointments.filter((a) => !Number.isNaN(a.start.getTime()));
  const open = valid.filter((a) => !CLOSED_STATUSES.has(a.status));
  return {
    schedule: valid.filter((a) => localDate(a.start) === todayStr && a.status !== 'cancelled'),
    pending: open.filter((a) => a.status === 'booked' && a.end >= now),
    late: open.filter((a) => a.end < now),
  };
}

export { whatsappUrl };

const PAYMENT_LABELS = { card: 'شبكة', credit: 'آجل', wallet: 'محفظة' };

// Booking sectors (workshop, salon, gym) get appointment cards; every other sector
// (supermarket, retail, cafe, spare parts, custom...) runs on stock, expiry and best sellers.
const STOCK_CARDS = {
  mode: 'stock',
  scheduleCardTitle: 'الأكثر مبيعاً اليوم',
  scheduleCardSubtitle: 'أعلى المنتجات في الإيراد',
  scheduleUnit: 'منتجات',
  scheduleEmptyTitle: 'لسه مفيش مبيعات النهارده',
  scheduleEmptyDesc: 'أول ما تسجّل فواتير، المنتجات الأكثر مبيعاً هتظهر هنا بالكمية والإيراد.',
  receiveBtn: 'استلام بضاعة من مورد',
  receiveRoute: 'suppliers',
  subBtn1: 'المنتجات',
  subBtn1Route: 'products',
  subBtn2: 'العملاء',
  pendingCardTitle: 'منتجات قربت تخلص',
  pendingEmptyTitle: 'المخزون كويس',
  pendingEmptyDesc: 'المنتجات اللي كميتها وصلت لحد إعادة الطلب هتظهر هنا.',
  lateCardTitle: 'صلاحية قربت تنتهي',
  lateEmptyText: 'مفيش منتجات منتهية أو قربت تنتهي خلال ٧ أيام',
};

const APPOINTMENT_CARDS = {
  mode: 'appointments',
  receiveRoute: 'appointments',
  subBtn1Route: 'appointments',
  subBtn2: 'العملاء',
};

export function sectorTermsFor(profileKey) {
  switch (profileKey) {
    case 'auto_workshop':
    case 'maintenance':
      return {
        ...APPOINTMENT_CARDS,
        Icon: CarIcon,
        title: 'الحالة اليومية للورشة',
        subtitle: 'ورشة صيانة وإصلاح السيارات',
        invoiceLabel: 'فاتورة صيانة',
        newBillBtn: 'فاتورة صيانة جديدة',
        receiveBtn: 'استلام سيارة جديدة',
        scheduleCardTitle: 'جدول اليوم',
        scheduleCardSubtitle: 'استلام وفحص السيارات',
        scheduleUnit: 'سيارات',
        scheduleEmptyTitle: 'لا توجد سيارات مجدولة اليوم',
        scheduleEmptyDesc: 'استلم سيارة صيانة جديدة وافتح أمر إصلاح ليظهر هنا بوقت التسليم المتوقع.',
        doneLabel: 'تم التسليم',
        subBtn1: 'أوامر الإصلاح',
        pendingCardTitle: 'بانتظار موافقة العميل',
        pendingEmptyTitle: 'لا توجد سيارات معلقة',
        pendingEmptyDesc: 'السيارات اللي بتحتاج موافقة العميل على التكلفة هتظهر هنا.',
        lateCardTitle: 'متأخرة عن موعد التسليم',
        lateEmptyText: 'جميع السيارات ضمن الجدول الزمني المحدد',
        lateVerb: 'تتسلم',
        counter1: 'فواتير الصيانة اليوم',
        counter2: 'متوسط قيمة الفاتورة',
      };
    case 'salon_barbershop':
      return {
        ...APPOINTMENT_CARDS,
        Icon: StarIcon,
        title: 'الحالة اليومية للصالون',
        subtitle: 'صالون تجميل وعناية وحلاقة',
        invoiceLabel: 'فاتورة خدمة',
        newBillBtn: 'فاتورة خدمة جديدة',
        receiveBtn: 'حجز موعد جديد',
        scheduleCardTitle: 'جدول اليوم',
        scheduleCardSubtitle: 'حجوزات ومواعيد الكراسي',
        scheduleUnit: 'حجوزات',
        scheduleEmptyTitle: 'لا توجد حجوزات مجدولة اليوم',
        scheduleEmptyDesc: 'سجّل موعد حجز جديد لعميل أو ابدأ تقديم خدمة على الكرسي لتظهر هنا.',
        doneLabel: 'تم الإنجاز',
        subBtn1: 'الحجوزات',
        pendingCardTitle: 'حجوزات بانتظار التأكيد',
        pendingEmptyTitle: 'لا توجد حجوزات معلقة',
        pendingEmptyDesc: 'الحجوزات والمواعيد بانتظار تأكيد العميل هتظهر هنا.',
        lateCardTitle: 'مواعيد متأخرة',
        lateEmptyText: 'جميع المواعيد ضمن الجدول الزمني المحدد',
        lateVerb: 'تخلص',
        counter1: 'فواتير الخدمات اليوم',
        counter2: 'متوسط قيمة الخدمة',
      };
    case 'subscriptions_gym':
      return {
        ...APPOINTMENT_CARDS,
        Icon: BoltIcon,
        title: 'الحالة اليومية للنادي',
        subtitle: 'نادي الجيم واللياقة والأنشطة الرياضية',
        invoiceLabel: 'اشتراك',
        newBillBtn: 'اشتراك / مبيعات جديدة',
        receiveBtn: 'حجز حصة جديدة',
        scheduleCardTitle: 'جدول اليوم',
        scheduleCardSubtitle: 'حصص وتدريبات اليوم',
        scheduleUnit: 'حصص',
        scheduleEmptyTitle: 'لا توجد حصص مجدولة اليوم',
        scheduleEmptyDesc: 'جدول حصة تدريبية لتظهر هنا بموعدها المحدد.',
        doneLabel: 'تم الحضور',
        subBtn1: 'الاشتراكات',
        subBtn1Route: 'subscriptions',
        subBtn2: 'الأعضاء',
        pendingCardTitle: 'حصص بانتظار التأكيد',
        pendingEmptyTitle: 'لا توجد حصص معلقة',
        pendingEmptyDesc: 'الحصص اللي لسه محتاجة تأكيد من المشترك هتظهر هنا.',
        lateCardTitle: 'حصص متأخرة',
        lateEmptyText: 'جميع الحصص في موعدها',
        lateVerb: 'تخلص',
        counter1: 'مبيعات واشتراكات اليوم',
        counter2: 'متوسط قيمة الاشتراك',
      };
    case 'cafe_restaurant':
      return {
        ...STOCK_CARDS,
        Icon: BagIcon,
        title: 'الحالة اليومية للمطعم',
        subtitle: 'المطاعم والكافيهات وضيافة المشروبات',
        invoiceLabel: 'طلب',
        newBillBtn: 'طلب بيع جديد',
        scheduleCardTitle: 'الأكثر طلباً اليوم',
        scheduleCardSubtitle: 'أعلى الأصناف في الإيراد',
        scheduleUnit: 'أصناف',
        pendingCardTitle: 'خامات قربت تخلص',
        subBtn1: 'شاشة المطبخ',
        subBtn1Route: 'kitchen',
        counter1: 'طلبات اليوم',
        counter2: 'متوسط قيمة الطلب',
      };
    case 'grocery':
      return {
        ...STOCK_CARDS,
        Icon: BagIcon,
        title: 'الحالة اليومية للسوبر ماركت',
        subtitle: 'سوبر ماركت ومواد غذائية',
        invoiceLabel: 'فاتورة بيع',
        newBillBtn: 'فاتورة بيع جديدة',
        counter1: 'فواتير المبيعات اليوم',
        counter2: 'متوسط قيمة الفاتورة',
      };
    case 'spare_parts':
      return {
        ...STOCK_CARDS,
        Icon: CarIcon,
        title: 'الحالة اليومية للمحل',
        subtitle: 'قطع غيار السيارات',
        invoiceLabel: 'فاتورة بيع',
        newBillBtn: 'فاتورة بيع جديدة',
        counter1: 'فواتير المبيعات اليوم',
        counter2: 'متوسط قيمة الفاتورة',
      };
    default:
      return {
        ...STOCK_CARDS,
        Icon: StoreIcon,
        title: 'الحالة اليومية للمتجر',
        subtitle: 'مبيعات وتجارة التجزئة',
        invoiceLabel: 'فاتورة بيع',
        newBillBtn: 'فاتورة بيع جديدة',
        counter1: 'فواتير المبيعات اليوم',
        counter2: 'متوسط قيمة الفاتورة',
      };
  }
}

function SectorTodayPage({ onNavigate, currentUser }) {
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  const { user: contextUser } = useUser();
  const sessionUser = currentUser || contextUser;

  const rawKey = configuration?.profile?.key
    || settings?.business_type
    || settings?.onboarding_sector
    || 'retail';
  const profileKey = rawKey === 'salon' ? 'salon_barbershop' : rawKey;

  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState(() => new Date());
  const [currentShift, setCurrentShift] = useState(null);
  const [lastClosedShift, setLastClosedShift] = useState(null);
  const [shiftXReport, setShiftXReport] = useState(null);
  const [shiftExpenses, setShiftExpenses] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [expiryAlerts, setExpiryAlerts] = useState([]);
  const [topSelling, setTopSelling] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [todaySummary, setTodaySummary] = useState({ totalSales: 0, invoiceCount: 0 });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [transactionFilter, setTransactionFilter] = useState('all');
  const [isShiftOpenModalVisible, setIsShiftOpenModalVisible] = useState(false);
  const [isShiftCloseModalVisible, setIsShiftCloseModalVisible] = useState(false);

  const sectorTerms = useMemo(() => sectorTermsFor(profileKey), [profileKey]);
  const stockMode = sectorTerms.mode === 'stock';

  const loadDailyData = useCallback(async () => {
    setLoading(true);
    setNow(new Date());
    try {
      if (!isBridgeAvailable()) return;

      const today = new Date();
      const todayStr = localDate(today);

      const [shift, lastShift, custsList] = await Promise.all([
        shiftsApi.getCurrentShift.isAvailable() ? shiftsApi.getCurrentShift().catch(() => null) : null,
        shiftsApi.getLastClosedShift.isAvailable() ? shiftsApi.getLastClosedShift().catch(() => null) : null,
        customersApi.getAllCustomersWithStats.isAvailable() ? customersApi.getAllCustomersWithStats().catch(() => []) : [],
      ]);
      setCurrentShift(shift);
      setLastClosedShift(lastShift);
      setCustomers(Array.isArray(custsList) ? custsList : []);

      // Stock sectors: items at reorder level, plus batches expired or expiring within 7 days.
      if (stockMode) {
        const [low, expiring, expired] = await Promise.all([
          inventoryApi.getInventoryStock.isAvailable() ? inventoryApi.getInventoryStock({ lowStockOnly: true }).catch(() => []) : [],
          groceryApi.getGroceryExpiringBatches.isAvailable() ? groceryApi.getGroceryExpiringBatches(7).catch(() => []) : [],
          groceryApi.getGroceryExpiredBatches.isAvailable() ? groceryApi.getGroceryExpiredBatches().catch(() => []) : [],
        ]);
        setLowStock(Array.isArray(low) ? low : []);
        setExpiryAlerts([...(Array.isArray(expired) ? expired : []), ...(Array.isArray(expiring) ? expiring : [])]);
      }

      // Last 30 days too, so jobs that should have been handed over earlier still show as late.
      let appts = [];
      if (stockMode) {
        appts = [];
      } else if (profileKey === 'salon_barbershop' && salonApi.getSalonAppointments.isAvailable()) {
        appts = await salonApi.getSalonAppointments({ date: todayStr }).catch(() => []);
      } else if (inventoryApi.getAppointments.isAvailable()) {
        appts = await inventoryApi.getAppointments({
          from: localDate(new Date(today.getTime() - 30 * DAY_MS)),
          to: localDate(new Date(today.getTime() + DAY_MS)),
        }).catch(() => []);
      }
      setAppointments(Array.isArray(appts) ? appts.map(normalizeAppointment) : []);

      let shiftX = null;
      if (shift?.id) {
        shiftX = shiftsApi.getShiftXReport.isAvailable() ? await shiftsApi.getShiftXReport(shift.id).catch(() => null) : null;
        const expenses = shiftsApi.getShiftExpenses.isAvailable() ? await shiftsApi.getShiftExpenses(shift.id).catch(() => []) : [];
        setShiftExpenses(Array.isArray(expenses) ? expenses : []);
      } else {
        setShiftExpenses([]);
      }
      setShiftXReport(shiftX);

      const report = reportsApi.getReports.isAvailable() ? await reportsApi.getReports('today').catch(() => null) : null;
      setTodaySummary({
        totalSales: Number(report?.totalSales ?? shiftX?.totalSales ?? 0),
        invoiceCount: Number(report?.invoiceCount ?? shiftX?.salesCount ?? 0),
      });
      setRecentInvoices(Array.isArray(report?.recentInvoices) ? report.recentInvoices : []);
      setTopSelling(Array.isArray(report?.topSelling) ? report.topSelling : []);
    } catch (err) {
      console.error('فشل جلب بيانات اليوم:', err);
    } finally {
      setLoading(false);
    }
  }, [profileKey, stockMode]);

  useEffect(() => {
    loadDailyData();
  }, [loadDailyData]);

  const handleOpenShift = async ({ openingCash, shiftType, posStation, notes }) => {
    if (!shiftsApi.openShift.isAvailable()) return;
    await shiftsApi.openShift({ opening_cash: openingCash, shift_type: shiftType, pos_station: posStation, notes });
    setIsShiftOpenModalVisible(false);
    await loadDailyData();
  };

  const handleCloseShift = async ({ actualCash, cashBreakdown, notes }) => {
    if (!shiftsApi.closeShift.isAvailable() || !currentShift?.id) return;
    await shiftsApi.closeShift(currentShift.id, { actual_cash: actualCash, cash_breakdown: cashBreakdown, notes });
    setIsShiftCloseModalVisible(false);
    await loadDailyData();
  };

  const isShiftOpen = Boolean(currentShift && !currentShift.end_time);

  const finances = useMemo(() => {
    const totalInflow = Number(todaySummary.totalSales || shiftXReport?.totalSales || 0);
    const cashSales = Number(shiftXReport?.cashSales || 0);
    const cardSales = Number(shiftXReport?.cardSales || 0);
    const openingCash = Number(currentShift?.opening_cash || shiftXReport?.openingCash || 0);
    const totalOutflow = Number(
      shiftXReport?.totalExpenses ?? shiftExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    );
    const refunds = Number(shiftXReport?.totalRefunds || 0);
    const netCashflow = totalInflow - totalOutflow - refunds;
    const currentDrawerCash = Number(
      shiftXReport?.expectedCash ?? Math.max(0, openingCash + cashSales - totalOutflow - refunds)
    );
    const invoiceCount = todaySummary.invoiceCount || shiftXReport?.salesCount || 0;
    const averageInvoice = invoiceCount > 0 ? totalInflow / invoiceCount : 0;
    return { totalInflow, cashSales, cardSales, totalOutflow, netCashflow, openingCash, currentDrawerCash, invoiceCount, averageInvoice };
  }, [todaySummary, shiftXReport, currentShift, shiftExpenses]);

  const fmtMoney = (amount) => Number(amount || 0).toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtNum = (n) => Number(n || 0).toLocaleString('ar-EG');
  const fmtTime = (date) => {
    const d = date instanceof Date ? date : new Date(date);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' });
  };
  const fmtAgo = (date) => {
    const mins = Math.max(0, Math.round((now - date) / 60000));
    if (mins < 60) return `منذ ${fmtNum(mins)} دقيقة`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return hrs === 2 ? 'منذ ساعتين' : `منذ ${fmtNum(hrs)} ساعة`;
    return `منذ ${fmtNum(Math.round(hrs / 24))} يوم`;
  };

  const shiftDurationText = useMemo(() => {
    if (!currentShift?.start_time) return '';
    const diffMs = Math.max(0, now - new Date(currentShift.start_time));
    if (Number.isNaN(diffMs)) return '';
    const hrs = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `مرّ عليها ${fmtNum(hrs)} ساعات ${fmtNum(mins)} دقيقة`;
  }, [currentShift, now]);

  const { schedule, pending, late } = useMemo(() => bucketAppointments(appointments, now), [appointments, now]);
  const pendingCount = stockMode ? lowStock.length : pending.length;
  const lateCount = stockMode ? expiryAlerts.length : late.length;

  // Sidebar list: best sellers for stock sectors, today's bookings for the others.
  const sideRows = stockMode
    ? topSelling.map((p) => ({
      key: p.productId,
      title: p.productName,
      sub: [`${fmtNum(p.qtySold)} قطعة`, p.categoryName].filter(Boolean).join(' • '),
      badge: `${fmtMoney(p.revenue)} ج.م`,
      done: false,
    }))
    : schedule.map((a) => {
      const done = a.status === 'completed' || a.status === 'converted';
      return {
        key: a.id,
        title: a.customer,
        sub: [a.resource, a.service].filter(Boolean).join(' • '),
        badge: done ? sectorTerms.doneLabel : fmtTime(a.start),
        done,
      };
    });

  const allTimelineTransactions = useMemo(() => {
    const list = recentInvoices.map((inv) => ({
      id: `inv-${inv.id}`,
      type: 'inflow',
      typeLabel: 'دخل',
      title: `${sectorTerms.invoiceLabel} • ${inv.customerName || 'عميل نقدي'}`,
      amount: Number(inv.total_amount || 0),
      time: inv.created_at,
      paymentMethod: PAYMENT_LABELS[inv.payment_method] || 'نقدي',
      badgeClass: 'inflow',
    }));
    for (const exp of shiftExpenses) {
      const isWithdraw = exp.category === 'withdraw' || (exp.notes && exp.notes.includes('عهدة'));
      list.push({
        id: `exp-${exp.id}`,
        type: 'outflow',
        typeLabel: isWithdraw ? 'سحب' : 'مصروف',
        title: exp.notes || exp.category || 'مصروفات نثرية',
        amount: Number(exp.amount || 0),
        time: exp.created_at,
        paymentMethod: 'نقدي',
        badgeClass: isWithdraw ? 'withdraw' : 'outflow',
      });
    }
    return list.sort((a, b) => new Date(b.time) - new Date(a.time));
  }, [recentInvoices, shiftExpenses, sectorTerms]);

  const inflowCount = allTimelineTransactions.filter((t) => t.type === 'inflow').length;
  const outflowCount = allTimelineTransactions.length - inflowCount;
  const displayedTransactions = transactionFilter === 'all'
    ? allTimelineTransactions
    : allTimelineTransactions.filter((t) => t.type === transactionFilter);

  // shortcut: customer stats carry no last-purchase date, so "needs follow-up" = older than
  // 30 days with at most one invoice; switch to last purchase once the stats expose it.
  const customerHealth = useMemo(() => {
    const age = (c) => (c.created_at ? (now - new Date(c.created_at)) / DAY_MS : Infinity);
    const newCount = customers.filter((c) => age(c) <= 7).length;
    const activeCount = customers.filter((c) => age(c) > 7 && Number(c.invoiceCount) >= 2).length;
    const atRiskCount = customers.filter((c) => age(c) > 30 && Number(c.invoiceCount) <= 1).length;
    return { total: customers.length, newCount, activeCount, atRiskCount };
  }, [customers, now]);
  const healthPct = (n) => (customerHealth.total ? `${Math.round((n / customerHealth.total) * 100)}%` : '0%');

  const fullArabicDate = now.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const { Icon: SectorIcon } = sectorTerms;
  const money = (value) => (isShiftOpen
    ? <>{fmtMoney(value)} <small>ج.م</small></>
    : <>-,-- <small>ج.م</small></>);

  if (loading) {
    return (
      <div className="today-page loading-screen">
        <div className="today-spinner-box">
          <div className="today-spinner-ring" />
          <p className="today-loading-text">جاري إعداد تقرير وسجل حركات اليوم...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="today-page">
      {/* 1. Dark hero: header, shift banner, cash-flow cards */}
      <div className={`today-top-dark-container ${isShiftOpen ? 'is-open' : ''}`}>
        <div className="today-top-header-bar">
          <div className="today-header-right">
            <div className="today-sector-icon-box"><SectorIcon size={22} /></div>
            <div className="today-title-group">
              <h1 className="today-main-heading">{sectorTerms.title}</h1>
              <p className="today-sub-heading">
                <span>{sectorTerms.subtitle}</span>
                <span>•</span>
                <span>{fullArabicDate}</span>
              </p>
            </div>
          </div>

          <div className="today-header-actions">
            {isShiftOpen ? (
              <button type="button" className="btn-today-orange" onClick={() => onNavigate('pos')}>
                <PlusIcon size={18} /> {sectorTerms.newBillBtn}
              </button>
            ) : (
              <button type="button" className="btn-today-outline-dark" onClick={() => onNavigate('reports')}>
                <CalendarIcon size={18} /> تغيير اليوم
              </button>
            )}
            <button type="button" className="btn-today-outline-dark" onClick={loadDailyData}>
              <RefreshIcon size={18} /> تحديث
            </button>
          </div>
        </div>

        <div className="today-shift-status-row">
          <div className="shift-status-details">
            <div className={`shift-status-icon-box ${isShiftOpen ? 'open' : 'closed'}`}>
              {isShiftOpen ? <UnlockIcon size={20} /> : <LockIcon size={20} />}
            </div>
            <div className="shift-status-text">
              <h4>
                {isShiftOpen
                  ? `الوردية مفتوحة • الكاشير ${currentShift?.cashier_username || sessionUser?.full_name || sessionUser?.username || 'المسؤول'}`
                  : 'الوردية مغلقة حالياً'}
              </h4>
              <p>
                {isShiftOpen
                  ? `بدأت ${fmtTime(currentShift.start_time)} • عهدة البداية ${fmtMoney(finances.openingCash)} ج.م${shiftDurationText ? ` • ${shiftDurationText}` : ''}`
                  : 'مفيش حركة بتتسجل دلوقتي. افتح الوردية وحدّد عهدة بداية الدرج عشان تبدأ تسجّل الفواتير والمقبوضات.'}
              </p>
            </div>
          </div>
          {isShiftOpen ? (
            <button type="button" className="btn-today-outline-dark btn-today-lg" onClick={() => setIsShiftCloseModalVisible(true)}>
              تقفيل الوردية وجرد الدرج
            </button>
          ) : (
            <button type="button" className="btn-today-orange btn-today-lg" onClick={() => setIsShiftOpenModalVisible(true)}>
              <UnlockIcon size={20} /> افتح الوردية
            </button>
          )}
        </div>

        <div className="today-financial-section">
          <div className="today-financial-section-label">حركة التدفق المالي المباشر لليوم</div>
          <div className="today-financial-cards-grid">
            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-card-icon inflow"><ArrowDownIcon size={18} /></span>
                <span>الدواخل</span>
              </div>
              <div className={`stat-card-amount ${isShiftOpen ? '' : 'placeholder'}`}>{money(finances.totalInflow)}</div>
              <div className="stat-card-subtitle">إجمالي المقبوضات ومبيعات اليوم</div>
              <div className="stat-card-footer">
                <span>نقدي {isShiftOpen ? fmtMoney(finances.cashSales) : '-,--'}</span>
                <span>شبكة {isShiftOpen ? fmtMoney(finances.cardSales) : '-,--'}</span>
              </div>
            </div>

            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-card-icon outflow"><ArrowUpIcon size={18} /></span>
                <span>الخوارج</span>
              </div>
              <div className={`stat-card-amount ${isShiftOpen ? '' : 'placeholder'}`}>{money(finances.totalOutflow)}</div>
              <div className="stat-card-subtitle">المصروفات وسحوبات العهدة</div>
              <div className="stat-card-footer">
                <span>{fmtNum(shiftExpenses.length)} حركات سحب نقدي</span>
              </div>
            </div>

            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-card-icon net"><ScaleIcon size={18} /></span>
                <span>صافي اليوم</span>
              </div>
              <div className={`stat-card-amount ${isShiftOpen ? (finances.netCashflow >= 0 ? 'positive' : 'negative') : 'placeholder'}`}>
                {money(finances.netCashflow)}
              </div>
              <div className="stat-card-subtitle">الدواخل ناقص الخوارج</div>
              <div className="stat-card-footer">
                {!isShiftOpen || finances.netCashflow === 0 ? (
                  <span>لا يوجد فائض أو عجز</span>
                ) : finances.netCashflow > 0 ? (
                  <span className="positive-text"><CheckIcon size={14} /> فائض مالي إيجابي</span>
                ) : (
                  <span className="negative-text">عجز {fmtMoney(-finances.netCashflow)} ج.م</span>
                )}
              </div>
            </div>

            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-card-icon drawer"><CardIcon size={18} /></span>
                <span>النقدية في الدرج</span>
              </div>
              <div className={`stat-card-amount ${isShiftOpen ? '' : 'placeholder'}`}>{money(finances.currentDrawerCash)}</div>
              <div className="stat-card-subtitle">الرصيد المفترض عند الجرد</div>
              <div className="stat-card-footer">
                <span>عهدة البداية {isShiftOpen ? fmtMoney(finances.openingCash) : '-,--'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Body: main column + sidebar */}
      <div className="today-main-columns">
        <div className="today-main-area">
          <div className="today-top-two-cards">
            <div className="today-white-card">
              <div className="today-white-card-header">
                <h3 className="card-title-with-icon">
                  <span className="card-header-icon"><SearchIcon size={18} /></span>
                  <span>{sectorTerms.pendingCardTitle}</span>
                </h3>
                <span className={`card-header-pill ${pendingCount ? 'pill-orange' : ''}`}>{fmtNum(pendingCount)}</span>
              </div>
              {pendingCount === 0 ? (
                <div className="empty-state-notice">
                  <h4 className="empty-state-title">{sectorTerms.pendingEmptyTitle}</h4>
                  <p className="empty-state-subtext">{sectorTerms.pendingEmptyDesc}</p>
                </div>
              ) : (
                <div className="pending-items-list">
                  {stockMode && lowStock.slice(0, 6).map((item) => (
                    <div key={`${item.warehouse_id}-${item.variant_id}`} className="pending-item-card">
                      <div className="pending-item-info">
                        <h5>{[item.product_name, item.size, item.color].filter(Boolean).join(' • ')}</h5>
                        <p>{item.warehouse_name} • حد الطلب {fmtNum(item.reorder_level)}</p>
                      </div>
                      <span className={`pending-item-badge ${Number(item.quantity) <= 0 ? 'is-danger' : ''}`}>
                        {Number(item.quantity) <= 0 ? 'نفد' : `باقي ${fmtNum(item.quantity)}`}
                      </span>
                    </div>
                  ))}
                  {!stockMode && pending.map((a) => (
                    <div key={a.id} className="pending-item-card">
                      <div className="pending-item-info">
                        <h5>{a.customer}{a.resource ? ` • ${a.resource}` : ''}</h5>
                        <p>{a.service}{a.estimate > 0 ? ` • تقدير ${fmtMoney(a.estimate)} ج.م` : ''}</p>
                      </div>
                      <span className="pending-item-badge">{fmtAgo(a.createdAt)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className={`today-white-card ${lateCount ? 'is-warning' : ''}`}>
              <div className="today-white-card-header">
                <h3 className="card-title-with-icon">
                  <span className="card-header-icon"><ClockIcon size={18} /></span>
                  <span>{sectorTerms.lateCardTitle}</span>
                </h3>
                <span className={`card-header-pill ${lateCount ? 'pill-orange' : ''}`}>{fmtNum(lateCount)}</span>
              </div>
              {lateCount === 0 ? (
                <div className="green-status-banner">
                  <span className="green-check-icon"><CheckIcon size={18} /></span>
                  <span>{sectorTerms.lateEmptyText}</span>
                </div>
              ) : (
                <div className="pending-items-list">
                  {stockMode && expiryAlerts.slice(0, 4).map((b) => (
                    <div key={b.id} className="late-order-box">
                      <h4 className="late-order-title">{b.product_name}</h4>
                      <p className="late-order-desc">
                        {b.days_expired != null
                          ? `انتهت صلاحيتها من ${fmtNum(b.days_expired)} يوم`
                          : Number(b.days_remaining) === 0 ? 'بتنتهي النهارده' : `باقي ${fmtNum(b.days_remaining)} يوم على انتهاء الصلاحية`}
                        {` • الكمية ${fmtNum(b.quantity)}`}
                        {b.batch_number ? ` • تشغيلة ${b.batch_number}` : ''}
                      </p>
                      <div className="late-order-buttons">
                        <button type="button" className="btn-sm-outline" onClick={() => onNavigate('products')}>
                          افتح المنتجات
                        </button>
                      </div>
                    </div>
                  ))}
                  {!stockMode && late.map((a) => (
                    <div key={a.id} className="late-order-box">
                      <h4 className="late-order-title">{a.customer}{a.resource ? ` • ${a.resource}` : ''}</h4>
                      <p className="late-order-desc">
                        كان المفروض {sectorTerms.lateVerb} {localDate(a.end) === localDate(now) ? 'النهارده'
                          : localDate(a.end) === localDate(new Date(now.getTime() - DAY_MS)) ? 'أمس'
                            : a.end.toLocaleDateString('ar-EG', { weekday: 'long' })} {fmtTime(a.end)}
                        {' • '}متأخرة {fmtAgo(a.end).replace('منذ ', '')}
                        {a.service ? ` • ${a.service}` : ''}
                      </p>
                      <div className="late-order-buttons">
                        {a.phone && (
                          <button type="button" className="btn-sm-outline primary" onClick={() => window.open(whatsappUrl(a.phone), '_blank')}>
                            بلّغ العميل
                          </button>
                        )}
                        <button type="button" className="btn-sm-outline" onClick={() => onNavigate('appointments')}>
                          عدّل الموعد
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <DailyMessagesCard />

          <div className="today-white-card customer-health-card">
            <div className="today-white-card-header">
              <h3 className="card-title-with-icon">
                <span className="card-header-icon"><UsersIcon size={18} /></span>
                <span>صحة وتفاعل العملاء</span>
              </h3>
              <span className="card-header-text">إجمالي {fmtNum(customerHealth.total)} عميل</span>
            </div>
            <div className="customer-health-grid">
              {[
                { label: 'زبائن جدد (آخر 7 أيام)', value: customerHealth.newCount, tone: 'orange' },
                { label: 'عملاء دائمون ونشطون', value: customerHealth.activeCount, tone: 'green' },
                { label: 'بحاجة لإعادة تواصل', value: customerHealth.atRiskCount, tone: 'gray' },
              ].map((s) => (
                <div key={s.tone} className="health-stat-col">
                  <div className="health-label-row">
                    <span className={`health-dot ${s.tone}`} />
                    <span>{s.label}</span>
                  </div>
                  <div className="health-number-val">{fmtNum(s.value)}</div>
                  <div className="health-line-track">
                    <div className={`health-line-fill ${s.tone}`} style={{ width: healthPct(s.value) }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="today-white-card tx-card">
            <div className="today-white-card-header">
              <h3 className="card-title-with-icon">
                <span className="card-header-icon"><ReceiptIcon size={18} /></span>
                <span>سجل حركات اليوم</span>
              </h3>
              <div className="transactions-filter-pills" role="tablist">
                {[
                  ['all', 'الكل', allTimelineTransactions.length],
                  ['inflow', 'الدواخل', inflowCount],
                  ['outflow', 'الخوارج', outflowCount],
                ].map(([key, label, count]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={transactionFilter === key}
                    className={`tx-pill-btn ${transactionFilter === key ? 'active' : ''}`}
                    onClick={() => setTransactionFilter(key)}
                  >
                    {label} {fmtNum(count)}
                  </button>
                ))}
              </div>
            </div>

            {displayedTransactions.length === 0 ? (
              <div className="tx-empty-state">
                <div className="tx-pulse-icon-box"><PulseIcon size={22} /></div>
                <h4>لا توجد معاملات مسجلة اليوم</h4>
                <p>أول ما تفتح الوردية وتسجّل فاتورة أو مصروف، هتلاقي كل حركة هنا بوقتها وطريقة الدفع.</p>
              </div>
            ) : (
              <div className="tx-table-container">
                <table className="today-tx-table">
                  <thead>
                    <tr>
                      <th>الوقت</th>
                      <th>البيان</th>
                      <th>النوع</th>
                      <th>طريقة الدفع</th>
                      <th>المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{fmtTime(tx.time)}</td>
                        <td><strong>{tx.title}</strong></td>
                        <td><span className={`tx-type-badge ${tx.badgeClass}`}>{tx.typeLabel}</span></td>
                        <td>{tx.paymentMethod}</td>
                        <td className={tx.type === 'inflow' ? 'tx-amount-green' : 'tx-amount-red'}>{fmtMoney(tx.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="today-sidebar-area">
          <div className="today-white-card">
            <div className="today-white-card-header" style={{ marginBottom: 4 }}>
              <h3 className="card-title-with-icon">
                <span className="card-header-icon"><SectorIcon size={18} /></span>
                <span>{sectorTerms.scheduleCardTitle}</span>
              </h3>
              {sideRows.length > 0 && (
                <span className="card-header-text">{fmtNum(sideRows.length)} {sectorTerms.scheduleUnit}</span>
              )}
            </div>
            <div className="schedule-sub-label">{sectorTerms.scheduleCardSubtitle}</div>

            {sideRows.length === 0 ? (
              <div className="schedule-empty-center">
                <div className="schedule-empty-icon-circle"><SectorIcon size={24} /></div>
                <h4>{sectorTerms.scheduleEmptyTitle}</h4>
                <p>{sectorTerms.scheduleEmptyDesc}</p>
              </div>
            ) : (
              <div className="schedule-active-list">
                {sideRows.map((row) => (
                  <div key={row.key} className="schedule-active-item">
                    <div className="schedule-item-right">
                      <h5>{row.title}</h5>
                      <p>{row.sub}</p>
                    </div>
                    <span className={`schedule-time-badge ${row.done ? 'badge-green' : ''}`}>{row.badge}</span>
                  </div>
                ))}
              </div>
            )}

            <div className="schedule-card-buttons">
              <button type="button" className="btn-full-orange" onClick={() => onNavigate(isShiftOpen ? sectorTerms.receiveRoute : 'pos')}>
                <PlusIcon size={18} /> {isShiftOpen ? sectorTerms.receiveBtn : sectorTerms.newBillBtn}
              </button>
              {!isShiftOpen && (
                <div className="schedule-two-buttons">
                  <button type="button" className="btn-sub-outline" onClick={() => onNavigate(sectorTerms.subBtn1Route)}>
                    {sectorTerms.subBtn1}
                  </button>
                  <button type="button" className="btn-sub-outline" onClick={() => onNavigate('customers')}>
                    {sectorTerms.subBtn2}
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="today-white-card sidebar-counters-card">
            <h3 className="card-title-with-icon" style={{ marginBottom: 16 }}>عدّادات اليوم</h3>
            <div className="sidebar-counters-list">
              {[
                { Icon: ReceiptIcon, label: sectorTerms.counter1, value: fmtNum(finances.invoiceCount) },
                { Icon: CashIcon, label: sectorTerms.counter2, value: fmtNum(Math.round(finances.averageInvoice)) },
                { Icon: ArrowUpIcon, label: 'حركات السحب النثري', value: fmtNum(shiftExpenses.length) },
              ].map(({ Icon, label, value }) => (
                <div key={label} className="sidebar-counter-row">
                  <div className="counter-label-group">
                    <span className="counter-row-icon"><Icon size={16} /></span>
                    <span>{label}</span>
                  </div>
                  <div className="counter-val-bold">{value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ShiftOpenModal
        isOpen={isShiftOpenModalVisible}
        onClose={() => setIsShiftOpenModalVisible(false)}
        onOpenShift={handleOpenShift}
        sessionUser={sessionUser}
        lastClosedShift={lastClosedShift}
      />
      <ShiftCloseModal
        isOpen={isShiftCloseModalVisible}
        onClose={() => setIsShiftCloseModalVisible(false)}
        onCloseShift={handleCloseShift}
      />
    </div>
  );
}

export default function TodayPage({ onNavigate, currentUser }) {
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key
    || settings?.business_type
    || settings?.onboarding_sector;

  if (profileKey === 'law_firm') {
    return <LawFirmTodayPage onNavigate={onNavigate} currentUser={currentUser} />;
  }
  return <SectorTodayPage onNavigate={onNavigate} currentUser={currentUser} />;
}

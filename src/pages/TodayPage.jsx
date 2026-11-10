import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import { useUser } from '../contexts/UserContext.jsx';
import LawFirmTodayPage from '../components/legal/LawFirmTodayPage.jsx';
import ShiftOpenModal from '../components/pos/ShiftOpenModal.jsx';
import ShiftCloseModal from '../components/pos/ShiftCloseModal.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as customersApi from '../api/customers.js';
import * as inventoryApi from '../api/inventory.js';
import * as reportsApi from '../api/reports.js';
import * as salonApi from '../api/salon.js';
import * as shiftsApi from '../api/shifts.js';
import * as subscriptionsApi from '../api/subscriptions.js';
import '../styles/today.css';

function SectorTodayPage({ onNavigate, currentUser }) {
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  const { user: contextUser } = useUser();
  const sessionUser = currentUser || contextUser;

  // Normalized sector / business profile key
  const rawKey = configuration?.profile?.key
    || settings?.business_type
    || settings?.onboarding_sector
    || 'auto_workshop';
  const profileKey = rawKey === 'salon' ? 'salon_barbershop' : rawKey;

  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(null);
  const [lastClosedShift, setLastClosedShift] = useState(null);
  const [shiftXReport, setShiftXReport] = useState(null);
  const [shiftExpenses, setShiftExpenses] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [todaySummary, setTodaySummary] = useState({ totalSales: 0, invoiceCount: 0, profit: 0 });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [transactionFilter, setTransactionFilter] = useState('all'); // 'all' | 'inflow' | 'outflow'

  // Modals state
  const [isShiftOpenModalVisible, setIsShiftOpenModalVisible] = useState(false);
  const [isShiftCloseModalVisible, setIsShiftCloseModalVisible] = useState(false);

  // Dynamic Sector Content Configuration
  const sectorTerms = useMemo(() => {
    switch (profileKey) {
      case 'auto_workshop':
      case 'spare_parts':
      case 'maintenance':
        return {
          icon: '🚘',
          title: 'الحالة اليومية للورشة',
          subtitle: 'ورشة صيانة وإصلاح السيارات',
          newBillBtn: 'فاتورة صيانة جديدة',
          receiveBtn: 'استلام سيارة جديدة',
          scheduleCardTitle: 'جدول اليوم',
          scheduleCardSubtitle: 'استلام وفحص السيارات',
          scheduleUnit: 'سيارات',
          scheduleEmptyTitle: 'لا توجد سيارات مجدولة اليوم',
          scheduleEmptyDesc: 'استلم سيارة صيانة جديدة وافتح أمر إصلاح ليظهر هنا بوقت التسليم المتوقع.',
          subBtn1: 'أوامر الإصلاح',
          subBtn2: 'العملاء',
          pendingCardTitle: 'سيارات بانتظار الفحص والموافقة',
          pendingEmptyTitle: 'لا توجد سيارات معلقة',
          pendingEmptyDesc: 'السيارات اللي بتحتاج موافقة العميل على التكلفة هتظهر هنا.',
          lateCardTitle: 'أوامر متأخرة عن موعد التسليم',
          lateEmptyText: 'جميع السيارات ضمن الجدول الزمني المحدد',
          counter1: 'فواتير الصيانة اليوم',
          counter2: 'متوسط قيمة الفاتورة',
          counter3: 'حركات السحب النثري',
          // Sample items for demonstration when real list is empty
          sampleSchedule: [
            { id: 1, title: 'هيونداي النترا', sub: 'ر س 4281 • تحت الفحص', badge: '9:00 ص', isGreen: false },
            { id: 2, title: 'تويوتا كورولا', sub: 'ق ن 9034 • في انتظار الموافقة', badge: '11:30 ص', isGreen: false },
            { id: 3, title: 'نيسان صني', sub: 'ل ط 3320 • 2:15 م', badge: 'تم التسليم', isGreen: true },
          ],
          samplePending: [
            { id: 1, title: 'هيونداي النترا • ر س 4281', sub: 'تغيير طقم فرامل • تقدير: 2,400 ج.م', time: 'منذ ساعتين' },
            { id: 2, title: 'تويوتا كورولا • ق ن 9034', sub: 'إصلاح كمبيوتر المحرك • تقدير: 3,100 ج.م', time: 'منذ 40 دقيقة' },
          ],
          sampleLate: {
            title: 'كيا سبورتاج • ب ع 7712',
            desc: 'كان المفروض تتسلم أمس 5:00 م • متأخرة 18 ساعة • في انتظار قطعة غيار',
          },
        };

      case 'salon_barbershop':
        return {
          icon: '✂️',
          title: 'الحالة اليومية للصالون',
          subtitle: 'صالون تجميل وعناية وحلاقة',
          newBillBtn: 'فاتورة خدمة جديدة',
          receiveBtn: 'حجز موعد جديد',
          scheduleCardTitle: 'جدول اليوم',
          scheduleCardSubtitle: 'حجوزات ومواعيد الكراسي',
          scheduleUnit: 'حجوزات',
          scheduleEmptyTitle: 'لا توجد حجوزات مجدولة اليوم',
          scheduleEmptyDesc: 'سجّل موعد حجز جديد لعميل أو ابدأ تقديم خدمة على الكرسي لتظهر هنا.',
          subBtn1: 'الحجوزات',
          subBtn2: 'العملاء',
          pendingCardTitle: 'حجوزات بانتظار التأكيد',
          pendingEmptyTitle: 'لا توجد حجوزات معلقة',
          pendingEmptyDesc: 'الحجوزات والمواعيد بانتظار تأكيد العميل هتظهر هنا.',
          lateCardTitle: 'مواعيد متأخرة أو قيد الانتظار',
          lateEmptyText: 'جميع المواعيد ضمن الجدول الزمني المحدد',
          counter1: 'فواتير الخدمات اليوم',
          counter2: 'متوسط قيمة الخدمة',
          counter3: 'حركات السحب النثري',
          sampleSchedule: [
            { id: 1, title: 'كريم أحمد', sub: 'تصفيف وقص شعر • كرسي 1', badge: '10:00 ص', isGreen: false },
            { id: 2, title: 'محمد فتحي', sub: 'عناية بالبشرة وحلاقة • كرسي 2', badge: '12:00 م', isGreen: false },
            { id: 3, title: 'عمر نبيل', sub: 'باكيدج عريس كامل • VIP', badge: 'تم الإنجاز', isGreen: true },
          ],
          samplePending: [
            { id: 1, title: 'سامح محمود • حجز باقة عريس', sub: 'تأكيد موعد الجمعة القادمة', time: 'منذ ساعة' },
          ],
          sampleLate: {
            title: 'أحمد سعيد • موعد 2:00 م',
            desc: 'تأخر العميل 45 دقيقة عن الحجز المحدد',
          },
        };

      case 'cafe_restaurant':
        return {
          icon: '☕',
          title: 'الحالة اليومية للمطعم',
          subtitle: 'المطاعم والكافيهات وضيافة المشروبات',
          newBillBtn: 'طلب بيع جديد',
          receiveBtn: 'طلب صالة / دليفري',
          scheduleCardTitle: 'جدول اليوم',
          scheduleCardSubtitle: 'طلبات وحجوزات الطاولات',
          scheduleUnit: 'طلبات',
          scheduleEmptyTitle: 'لا توجد طلبات معلقة اليوم',
          scheduleEmptyDesc: 'افتح الكاشير السريع وابدأ بتسجيل أول أوردر صالة أو سفري.',
          subBtn1: 'شاشة المطبخ',
          subBtn2: 'العملاء',
          pendingCardTitle: 'طلبات معلقة بالمطبخ والبار',
          pendingEmptyTitle: 'لا توجد طلبات معلقة بالمطبخ',
          pendingEmptyDesc: 'الطلبات قيد التحضير في المحطات هتظهر هنا.',
          lateCardTitle: 'طلبات متأخرة عن وقت التوصيل',
          lateEmptyText: 'جميع الطلبات تسير وفق وقت التحضير المحدد',
          counter1: 'طلبات اليوم',
          counter2: 'متوسط قيمة الطلب',
          counter3: 'حركات السحب النثري',
          sampleSchedule: [
            { id: 1, title: 'طاولة 4 • صالة', sub: '2 برجر لحم + بطاطس ومشروبات', badge: '1:15 م', isGreen: false },
            { id: 2, title: 'أوردر دليفري • كريم', sub: 'وجبة عائلية مشويات', badge: '2:00 م', isGreen: false },
            { id: 3, title: 'طاولة 1 • تيك أواي', sub: 'قهوة اسبريسو ومياه', badge: 'تم التسليم', isGreen: true },
          ],
          samplePending: [
            { id: 1, title: 'طلب #104 • دليفري', sub: 'بانتظار موافقة الكابتن على العنوان', time: 'منذ 20 دقيقة' },
          ],
          sampleLate: {
            title: 'طلب #98 • توصيل خارجي',
            desc: 'تأخر المندوب 15 دقيقة عن وقت التسليم التقديري',
          },
        };

      case 'subscriptions_gym':
        return {
          icon: '🏋️‍♂️',
          title: 'الحالة اليومية للنادي',
          subtitle: 'نادي الجيم واللياقة والأنشطة الرياضية',
          newBillBtn: 'اشتراك / مبيعات جديدة',
          receiveBtn: 'تسجيل مشترك جديد',
          scheduleCardTitle: 'جدول اليوم',
          scheduleCardSubtitle: 'حصص وتدريبات اليوم',
          scheduleUnit: 'حصص',
          scheduleEmptyTitle: 'لا توجد حصص مجدولة اليوم',
          scheduleEmptyDesc: 'سجّل مشتركاً جديداً أو جدول حصة تدريبية لتظهر هنا بموعدها المحدد.',
          subBtn1: 'الاشتراكات',
          subBtn2: 'الأعضاء',
          pendingCardTitle: 'عضويات بانتظار التجديد',
          pendingEmptyTitle: 'لا توجد عضويات معلقة',
          pendingEmptyDesc: 'المشتركون أصحاب الاشتراكات المنتهية هيظهروا هنا للمتابعة.',
          lateCardTitle: 'أقساط وعضويات متأخرة السداد',
          lateEmptyText: 'جميع العضويات سارية ومسددة بالكامل',
          counter1: 'حضور واشتراكات اليوم',
          counter2: 'متوسط قيمة الاشتراك',
          counter3: 'حركات السحب النثري',
          sampleSchedule: [
            { id: 1, title: 'أحمد إبراهيم', sub: 'تدريب خاص PT • مع الكابتن رامي', badge: '11:00 ص', isGreen: false },
            { id: 2, title: 'محمود حسن', sub: 'تجديد اشتراك 3 شهور VIP', badge: '1:30 م', isGreen: false },
            { id: 3, title: 'يوسف طارق', sub: 'حصة لياقة عامة', badge: 'تم الحضور', isGreen: true },
          ],
          samplePending: [
            { id: 1, title: 'كابتن هاني • اشتراك سنوي', sub: 'بانتظار تأكيد تجديد العضوية', time: 'منذ يوم' },
          ],
          sampleLate: {
            title: 'عضوية #312 • اشتراك شهري',
            desc: 'متأخر عن السداد 5 أيام - تنبيه تجديد مطلوب',
          },
        };

      case 'grocery':
      case 'retail':
      default:
        return {
          icon: '🛒',
          title: 'الحالة اليومية للمتجر',
          subtitle: 'مبيعات وتجارة التجزئة والتوريدات',
          newBillBtn: 'فاتورة بيع جديدة',
          receiveBtn: 'استلام طلبيات جديدة',
          scheduleCardTitle: 'جدول اليوم',
          scheduleCardSubtitle: 'طلبيات وتوريدات اليوم',
          scheduleUnit: 'طلبيات',
          scheduleEmptyTitle: 'لا توجد طلبيات مجدولة اليوم',
          scheduleEmptyDesc: 'سجّل طلبية جديدة أو ابدأ البيع المباشر عبر الكاشير السريع.',
          subBtn1: 'المبيعات',
          subBtn2: 'العملاء',
          pendingCardTitle: 'فواتير وشحنات بانتظار الاعتماد',
          pendingEmptyTitle: 'لا توجد طلبيات معلقة',
          pendingEmptyDesc: 'الشحنات والتوريدات التي تحتاج إلى تسليم أو اعتماد هتظهر هنا.',
          lateCardTitle: 'شحنات متأخرة عن موعد التسليم',
          lateEmptyText: 'جميع الطلبيات والشحنات ضمن موعد التسليم المحدد',
          counter1: 'فواتير المبيعات اليوم',
          counter2: 'متوسط قيمة الفاتورة',
          counter3: 'حركات السحب النثري',
          sampleSchedule: [
            { id: 1, title: 'طلبية جملة #241', sub: 'شركة النور للمواد الغذائية • تسليم مخزن', badge: '10:00 ص', isGreen: false },
            { id: 2, title: 'فاتورة شحن #242', sub: 'العميل: حسام الدين • شحن للمنزل', badge: '12:30 م', isGreen: false },
            { id: 3, title: 'طلبية واردة #190', sub: 'توريد ألبان ومنتجات طازجة', badge: 'تم الاستلام', isGreen: true },
          ],
          samplePending: [
            { id: 1, title: 'فاتورة توريد #55 • مورد الأهرام', sub: 'بانتظار فحص الاستلام ومطابقة الباركود', time: 'منذ ساعتين' },
          ],
          sampleLate: {
            title: 'شحنة #103 • المحلة الكبرى',
            desc: 'تأخرت شركة الشحن عن موعد الاستلام التقديري 4 ساعات',
          },
        };
    }
  }, [profileKey]);

  // Load daily live data
  const loadDailyData = useCallback(async () => {
    setLoading(true);
    try {
      if (!isBridgeAvailable()) return;

      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Core Shift & Entity loading
      const [shift, lastShift, subsList, custsList] = await Promise.all([
        shiftsApi.getCurrentShift.isAvailable() ? shiftsApi.getCurrentShift().catch(() => null) : null,
        shiftsApi.getLastClosedShift.isAvailable() ? shiftsApi.getLastClosedShift().catch(() => null) : null,
        subscriptionsApi.getAllSubscriptions.isAvailable() ? subscriptionsApi.getAllSubscriptions().catch(() => []) : [],
        customersApi.getAllCustomersWithStats.isAvailable() ? customersApi.getAllCustomersWithStats().catch(() => []) : [],
      ]);

      setCurrentShift(shift);
      setLastClosedShift(lastShift);
      setSubscriptions(Array.isArray(subsList) ? subsList : []);
      setCustomers(Array.isArray(custsList) ? custsList : []);

      // 2. Load Appointments based on profile
      let appts = [];
      if (profileKey === 'salon_barbershop' && salonApi.getSalonAppointments.isAvailable()) {
        try {
          appts = await salonApi.getSalonAppointments({ date: todayStr });
        } catch {
          appts = [];
        }
      } else if (inventoryApi.getAppointments.isAvailable()) {
        try {
          appts = await inventoryApi.getAppointments();
        } catch {
          appts = [];
        }
      }
      setAppointments(Array.isArray(appts) ? appts : []);

      // 3. Shift X-Report and Cashflow (الدواخل والخوارج)
      let shiftX = null;
      let expenses = [];
      if (shift?.id) {
        if (shiftsApi.getShiftXReport.isAvailable()) {
          try {
            shiftX = await shiftsApi.getShiftXReport(shift.id);
            setShiftXReport(shiftX);
          } catch {
            setShiftXReport(null);
          }
        }
        if (shiftsApi.getShiftExpenses.isAvailable()) {
          try {
            expenses = await shiftsApi.getShiftExpenses(shift.id);
            setShiftExpenses(Array.isArray(expenses) ? expenses : []);
          } catch {
            setShiftExpenses([]);
          }
        }
      } else {
        setShiftXReport(null);
        setShiftExpenses([]);
      }

      // 4. Financial Report for Today
      if (reportsApi.getReports.isAvailable()) {
        try {
          const report = await reportsApi.getReports('today');
          if (report) {
            setTodaySummary({
              totalSales: Number(report.totalSales ?? shiftX?.totalSales ?? 0),
              invoiceCount: Number(report.invoiceCount ?? shiftX?.salesCount ?? 0),
              profit: Number(report.estimatedProfit ?? 0),
            });
            if (Array.isArray(report.recentInvoices)) {
              setRecentInvoices(report.recentInvoices);
            }
          }
        } catch {
          if (shiftX) {
            setTodaySummary({
              totalSales: Number(shiftX.totalSales || 0),
              invoiceCount: Number(shiftX.salesCount || 0),
              profit: 0,
            });
          }
        }
      }
    } catch (err) {
      console.error('فشل جلب بيانات اليوم:', err);
    } finally {
      setLoading(false);
    }
  }, [profileKey]);

  useEffect(() => {
    loadDailyData();
  }, [loadDailyData]);

  // Handle Opening Shift
  const handleOpenShift = async ({ openingCash, shiftType, posStation, notes }) => {
    if (!shiftsApi.openShift.isAvailable()) return;
    await shiftsApi.openShift({
      opening_cash: openingCash,
      shift_type: shiftType,
      pos_station: posStation,
      notes,
    });
    setIsShiftOpenModalVisible(false);
    await loadDailyData();
  };

  // Handle Closing Shift
  const handleCloseShift = async ({ actualCash, cashBreakdown, notes }) => {
    if (!shiftsApi.closeShift.isAvailable() || !currentShift?.id) return;
    await shiftsApi.closeShift(currentShift.id, {
      actual_cash: actualCash,
      cash_breakdown: cashBreakdown,
      notes,
    });
    setIsShiftCloseModalVisible(false);
    await loadDailyData();
  };

  const isShiftOpen = Boolean(currentShift && !currentShift.end_time);

  // Financial figures calculation
  const finances = useMemo(() => {
    const totalInflow = Number(todaySummary.totalSales || shiftXReport?.totalSales || 0);
    const cashSales = Number(shiftXReport?.cashSales || 0);
    const cardSales = Number(shiftXReport?.cardSales || 0);
    const openingCash = Number(currentShift?.opening_cash || shiftXReport?.openingCash || 0);

    const totalOutflow = Number(
      shiftXReport?.totalExpenses ??
      shiftExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0)
    );
    const refunds = Number(shiftXReport?.totalRefunds || 0);
    const netCashflow = totalInflow - totalOutflow - refunds;
    const currentDrawerCash = Number(
      shiftXReport?.expectedCash ??
      Math.max(0, openingCash + cashSales - totalOutflow - refunds)
    );

    const invoiceCount = todaySummary.invoiceCount || shiftXReport?.salesCount || 0;
    const averageInvoice = invoiceCount > 0 ? (totalInflow / invoiceCount) : 0;

    return {
      totalInflow,
      cashSales,
      cardSales,
      totalOutflow,
      refunds,
      netCashflow,
      openingCash,
      currentDrawerCash,
      invoiceCount,
      averageInvoice,
    };
  }, [todaySummary, shiftXReport, currentShift, shiftExpenses]);

  // Elapsed shift duration
  const shiftDurationText = useMemo(() => {
    if (!currentShift?.start_time) return '';
    try {
      const start = new Date(currentShift.start_time);
      const now = new Date();
      const diffMs = Math.max(0, now - start);
      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
      return `مر عليها ${diffHrs} ساعات ${diffMins} دقيقة`;
    } catch {
      return '';
    }
  }, [currentShift]);

  // Timeline Transactions
  const allTimelineTransactions = useMemo(() => {
    const list = [];

    // Inflows (Invoices)
    for (const inv of recentInvoices) {
      list.push({
        id: `inv-${inv.id}`,
        type: 'inflow',
        typeLabel: 'دخل',
        title: `فاتورة صيانة - ${inv.customer_name || 'زبون نقدي'} ${inv.invoice_number ? `#${inv.invoice_number}` : ''}`,
        amount: Number(inv.final_amount ?? inv.total_amount ?? 0),
        time: inv.created_at || new Date().toISOString(),
        paymentMethod: inv.payment_method === 'card' ? 'شبكة' : 'نقدي',
        badgeClass: 'inflow',
      });
    }

    // Outflows (Expenses / Drawer withdrawals)
    for (const exp of shiftExpenses) {
      const isWithdraw = exp.category === 'withdraw' || (exp.notes && exp.notes.includes('عهدة'));
      list.push({
        id: `exp-${exp.id}`,
        type: 'outflow',
        typeLabel: isWithdraw ? 'سحب' : 'مصروف',
        title: exp.notes ? `${isWithdraw ? 'سحب عهدة' : 'مصروف'} - ${exp.notes}` : `${exp.category || 'نثريات مصاريف'}`,
        amount: Number(exp.amount || 0),
        time: exp.created_at || new Date().toISOString(),
        paymentMethod: 'نقدي',
        badgeClass: isWithdraw ? 'withdraw' : 'outflow',
      });
    }

    // Sort descending by time
    list.sort((a, b) => new Date(b.time) - new Date(a.time));
    return list;
  }, [recentInvoices, shiftExpenses]);

  // Filtered transactions
  const displayedTransactions = useMemo(() => {
    if (transactionFilter === 'inflow') {
      return allTimelineTransactions.filter((t) => t.type === 'inflow');
    }
    if (transactionFilter === 'outflow') {
      return allTimelineTransactions.filter((t) => t.type === 'outflow');
    }
    return allTimelineTransactions;
  }, [allTimelineTransactions, transactionFilter]);

  // Customer Segmentation
  const customerHealth = useMemo(() => {
    const total = customers.length || (isShiftOpen ? 1 : 0);
    const newCount = customers.filter((c) => {
      if (!c.created_at) return false;
      const created = new Date(c.created_at);
      const diffDays = (new Date() - created) / (1000 * 60 * 60 * 24);
      return diffDays <= 7;
    }).length || (isShiftOpen ? 1 : 0);

    const activeCount = Math.max(0, total - newCount);
    return {
      total,
      newCount,
      activeCount,
      atRiskCount: 0,
    };
  }, [customers, isShiftOpen]);

  // Formatter helpers
  const fmtMoney = (amount) => {
    const num = Number(amount || 0);
    return num.toLocaleString('ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };

  const fmtTime = (dateStr) => {
    try {
      return new Date(dateStr).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  // Full Arabic Date
  const fullArabicDate = useMemo(() => {
    const d = new Date();
    return d.toLocaleDateString('ar-EG', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }, []);

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
      {/* ====================================================================
          1. TOP DARK CONTAINER (Header Bar + Shift Banner + 4 Financial Cards)
          ==================================================================== */}
      <div className="today-top-dark-container">
        {/* Top Header Bar */}
        <div className="today-top-header-bar">
          {/* Right: Sector Icon + Title + Date */}
          <div className="today-header-right">
            <div className="today-sector-icon-box">
              {sectorTerms.icon}
            </div>
            <div className="today-title-group">
              <div className="today-title-line">
                <h1 className="today-main-heading">{sectorTerms.title}</h1>
                {isShiftOpen && <span className="today-demo-pill">بيانات توضيحية</span>}
              </div>
              <p className="today-sub-heading">
                <span>{sectorTerms.subtitle}</span>
                <span>•</span>
                <span>{fullArabicDate}</span>
              </p>
            </div>
          </div>

          {/* Left: Action Buttons */}
          <div className="today-header-actions">
            {!isShiftOpen ? (
              <>
                <button
                  type="button"
                  className="btn-today-outline-dark"
                  onClick={loadDailyData}
                >
                  📅 تغيير اليوم
                </button>
                <button
                  type="button"
                  className="btn-today-outline-dark"
                  onClick={loadDailyData}
                >
                  🔄 تحديث
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className="btn-today-orange"
                  onClick={() => onNavigate('pos')}
                >
                  + {sectorTerms.newBillBtn}
                </button>
                <button
                  type="button"
                  className="btn-today-outline-dark"
                  onClick={loadDailyData}
                >
                  🔄 تحديث
                </button>
              </>
            )}
          </div>
        </div>

        {/* Shift Status Row */}
        <div className="today-shift-status-row">
          <div className="shift-status-details">
            <div className={`shift-status-icon-box ${isShiftOpen ? 'open' : 'closed'}`}>
              {isShiftOpen ? '🔒' : '🔒'}
            </div>
            <div className="shift-status-text">
              <h4>
                {isShiftOpen
                  ? `الوردية مفتوحة - الكاشير ${currentShift?.cashier_username || sessionUser?.username || 'المسؤول'}`
                  : 'الوردية مغلقة حالياً'}
              </h4>
              <p>
                {isShiftOpen
                  ? `بدأت ${currentShift?.start_time ? fmtTime(currentShift.start_time) : '8:00 ص'} • عهدة البداية: ${fmtMoney(finances.openingCash)} ج.م ${shiftDurationText ? `• ${shiftDurationText}` : ''}`
                  : 'مفيش حركة بتتسجل دلوقتي، افتح الوردية وحدد عهدة بداية الدرج عشان تبدأ تستلم وتسجل مقبوضات.'}
              </p>
            </div>
          </div>

          <div>
            {!isShiftOpen ? (
              <button
                type="button"
                className="btn-today-orange"
                onClick={() => setIsShiftOpenModalVisible(true)}
              >
                🔓 افتح الوردية
              </button>
            ) : (
              <button
                type="button"
                className="btn-today-outline-dark"
                onClick={() => setIsShiftCloseModalVisible(true)}
              >
                تقفيل الوردية وجرد الدرج
              </button>
            )}
          </div>
        </div>

        {/* 4 Financial Cards Section */}
        <div className="today-financial-section">
          <div className="today-financial-section-label">
            حركة التدفق المالي المباشر لليوم
          </div>

          <div className="today-financial-cards-grid">
            {/* Card 1: الدواخل (Inflows) */}
            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-tag-badge inflow">
                  <span>الدواخل</span>
                  <span>↓</span>
                </span>
                <span className="stat-header-icon" style={{ color: '#10b981' }}>💰</span>
              </div>
              <div className={`stat-card-amount ${!isShiftOpen ? 'placeholder' : ''}`}>
                {isShiftOpen ? `${fmtMoney(finances.totalInflow)} ج.م` : '- - - ج.م'}
              </div>
              <div className="stat-card-subtitle">
                إجمالي المقبوضات ومبيعات اليوم
              </div>
              <div className="stat-card-footer">
                <span>نقدي: {isShiftOpen ? fmtMoney(finances.cashSales) : '-'}</span>
                <span>•</span>
                <span>شبكة: {isShiftOpen ? fmtMoney(finances.cardSales) : '-'}</span>
              </div>
            </div>

            {/* Card 2: الخوارج (Outflows) */}
            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-tag-badge outflow">
                  <span>الخوارج</span>
                  <span>↑</span>
                </span>
                <span className="stat-header-icon" style={{ color: '#f43f5e' }}>💸</span>
              </div>
              <div className={`stat-card-amount ${!isShiftOpen ? 'placeholder' : ''}`}>
                {isShiftOpen ? `${fmtMoney(finances.totalOutflow)} ج.م` : '- - - ج.م'}
              </div>
              <div className="stat-card-subtitle">
                المصروفات وسحوبات العهدة
              </div>
              <div className="stat-card-footer">
                <span>{isShiftOpen ? `${shiftExpenses.length} حركات سحب نقدي` : 'حركة سحب نقدي: -'}</span>
              </div>
            </div>

            {/* Card 3: صافي اليوم (Net) */}
            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-tag-badge net">
                  <span>صافي اليوم</span>
                  <span>⚖️</span>
                </span>
                <span className="stat-header-icon" style={{ color: '#60a5fa' }}>📊</span>
              </div>
              <div className={`stat-card-amount ${!isShiftOpen ? 'placeholder' : ''}`}>
                {isShiftOpen ? `${fmtMoney(finances.netCashflow)} ج.م` : '- - - ج.م'}
              </div>
              <div className="stat-card-subtitle">
                الدواخل ناقص الخوارج
              </div>
              <div className="stat-card-footer">
                {isShiftOpen && finances.netCashflow >= 0 ? (
                  <span className="positive-text">✓ فائض مالي إيجابي</span>
                ) : (
                  <span>لا يوجد فائض أو عجز</span>
                )}
              </div>
            </div>

            {/* Card 4: النقدية في الدرج (Cash in Drawer) */}
            <div className="financial-stat-card">
              <div className="stat-card-header">
                <span className="stat-tag-badge drawer">
                  <span>النقدية في الدرج</span>
                  <span>▤</span>
                </span>
                <span className="stat-header-icon" style={{ color: '#fb923c' }}>🏦</span>
              </div>
              <div className={`stat-card-amount ${!isShiftOpen ? 'placeholder' : ''}`}>
                {isShiftOpen ? `${fmtMoney(finances.currentDrawerCash)} ج.م` : '- - - ج.م'}
              </div>
              <div className="stat-card-subtitle">
                الرصيد المفترض عند الجرد
              </div>
              <div className="stat-card-footer">
                <span>عهدة البداية: {isShiftOpen ? fmtMoney(finances.openingCash) : '-'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ====================================================================
          2. MAIN BODY (Right Main Content + Left Sidebar)
          ==================================================================== */}
      <div className="today-main-columns">
        {/* ── RIGHT MAIN CONTENT AREA ───────────────────────────────── */}
        <div className="today-main-area">
          {/* Top Row: Two Cards Side-by-Side */}
          <div className="today-top-two-cards">
            {/* Card 1: Pending Approval */}
            <div className="today-white-card">
              <div className="today-white-card-header">
                <h3 className="card-title-with-icon">
                  <span className="card-header-icon">🔍</span>
                  <span>{sectorTerms.pendingCardTitle}</span>
                </h3>
                <span className={`card-header-pill ${isShiftOpen ? 'pill-orange' : ''}`}>
                  {isShiftOpen ? '2' : '•'}
                </span>
              </div>

              {!isShiftOpen ? (
                <div className="empty-state-notice">
                  <h4 className="empty-state-title">{sectorTerms.pendingEmptyTitle}</h4>
                  <p className="empty-state-subtext">{sectorTerms.pendingEmptyDesc}</p>
                </div>
              ) : (
                <div className="pending-items-list">
                  {sectorTerms.samplePending.map((item) => (
                    <div key={item.id} className="pending-item-card">
                      <div className="pending-item-info">
                        <h5>{item.title}</h5>
                        <p>{item.sub}</p>
                      </div>
                      <span className="pending-item-badge">{item.time}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Card 2: Late / Overdue Orders */}
            <div className="today-white-card">
              <div className="today-white-card-header">
                <h3 className="card-title-with-icon">
                  <span className="card-header-icon">⏱</span>
                  <span>{sectorTerms.lateCardTitle}</span>
                </h3>
                <span className={`card-header-pill ${isShiftOpen ? 'pill-orange' : ''}`}>
                  {isShiftOpen ? '1' : '•'}
                </span>
              </div>

              {!isShiftOpen ? (
                <div className="green-status-banner">
                  <span className="green-check-icon">✓</span>
                  <span>{sectorTerms.lateEmptyText}</span>
                </div>
              ) : (
                <div className="late-order-box">
                  <h4 className="late-order-title">{sectorTerms.sampleLate.title}</h4>
                  <p className="late-order-desc">{sectorTerms.sampleLate.desc}</p>
                  <div className="late-order-buttons">
                    <button type="button" className="btn-sm-outline">بلغ العميل</button>
                    <button type="button" className="btn-sm-outline">عدل الموعد</button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Middle Card: Customer Health */}
          <div className="today-white-card customer-health-card">
            <div className="today-white-card-header">
              <h3 className="card-title-with-icon">
                <span className="card-header-icon" style={{ color: '#d85a1a' }}>👥</span>
                <span>صحة وتفاعل العملاء</span>
              </h3>
              <span className="card-header-pill">
                إجمالي {customerHealth.total} عميل
              </span>
            </div>

            <div className="customer-health-grid">
              {/* Column 1: New Customers */}
              <div className="health-stat-col">
                <div className="health-label-row">
                  <span className="health-dot orange" />
                  <span>زبائن جدد (آخر 7 أيام)</span>
                </div>
                <div className="health-number-val">
                  {isShiftOpen ? customerHealth.newCount : '1'}
                </div>
                <div className="health-line-track">
                  <div className="health-line-fill orange" style={{ width: '100%' }} />
                </div>
              </div>

              {/* Column 2: Active Loyal Customers */}
              <div className="health-stat-col">
                <div className="health-label-row">
                  <span className="health-dot green" />
                  <span>عملاء دائمون ونشطون</span>
                </div>
                <div className="health-number-val" style={{ color: '#6b7280' }}>
                  {isShiftOpen && customerHealth.activeCount > 0 ? customerHealth.activeCount : '•'}
                </div>
                <div className="health-line-track">
                  <div className="health-line-fill green" style={{ width: isShiftOpen && customerHealth.activeCount > 0 ? '60%' : '0%' }} />
                </div>
              </div>

              {/* Column 3: Re-engagement needed */}
              <div className="health-stat-col">
                <div className="health-label-row">
                  <span className="health-dot blue" />
                  <span>بحاجة لإعادة تواصل</span>
                </div>
                <div className="health-number-val" style={{ color: '#6b7280' }}>
                  •
                </div>
                <div className="health-line-track">
                  <div className="health-line-fill blue" style={{ width: '0%' }} />
                </div>
              </div>
            </div>
          </div>

          {/* Bottom Card: Daily Transactions Log */}
          <div className="today-white-card">
            <div className="today-white-card-header">
              <h3 className="card-title-with-icon">
                <span className="card-header-icon">📓</span>
                <span>سجل حركات اليوم</span>
              </h3>

              {/* Filter Tabs */}
              <div className="transactions-filter-pills">
                <button
                  type="button"
                  className={`tx-pill-btn ${transactionFilter === 'all' ? 'active' : ''}`}
                  onClick={() => setTransactionFilter('all')}
                >
                  الكل {isShiftOpen ? (allTimelineTransactions.length || 7) : '•'}
                </button>
                <button
                  type="button"
                  className={`tx-pill-btn ${transactionFilter === 'inflow' ? 'active' : ''}`}
                  onClick={() => setTransactionFilter('inflow')}
                >
                  الدواخل {isShiftOpen ? (allTimelineTransactions.filter((t) => t.type === 'inflow').length || 3) : '•'}
                </button>
                <button
                  type="button"
                  className={`tx-pill-btn ${transactionFilter === 'outflow' ? 'active' : ''}`}
                  onClick={() => setTransactionFilter('outflow')}
                >
                  الخوارج {isShiftOpen ? (allTimelineTransactions.filter((t) => t.type === 'outflow').length || 4) : '•'}
                </button>
              </div>
            </div>

            {/* Empty or Loaded state */}
            {!isShiftOpen && allTimelineTransactions.length === 0 ? (
              <div className="tx-empty-state">
                <div className="tx-pulse-icon-box">
                  <span>📈</span>
                </div>
                <h4>لا توجد معاملات مسجلة اليوم</h4>
                <p>أول ما تفتح الوردية وتسجل فاتورة أو مصروف، هتلاقي كل حركة هنا بوقتها وطريقة الدفع.</p>
              </div>
            ) : (
              <div className="tx-table-container">
                <table className="today-tx-table">
                  <thead>
                    <tr>
                      <th style={{ width: '12%' }}>الوقت</th>
                      <th style={{ width: '42%' }}>البيان</th>
                      <th style={{ width: '14%' }}>النوع</th>
                      <th style={{ width: '16%' }}>طريقة الدفع</th>
                      <th style={{ width: '16%' }}>المبلغ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* If live data exists, display it; otherwise, display sample data matching image */}
                    {displayedTransactions.length > 0 ? (
                      displayedTransactions.map((tx) => (
                        <tr key={tx.id}>
                          <td>{fmtTime(tx.time)}</td>
                          <td><strong>{tx.title}</strong></td>
                          <td>
                            <span className={`tx-type-badge ${tx.badgeClass}`}>
                              {tx.typeLabel}
                            </span>
                          </td>
                          <td>{tx.paymentMethod}</td>
                          <td className={tx.type === 'inflow' ? 'tx-amount-green' : 'tx-amount-red'}>
                            {fmtMoney(tx.amount)}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <>
                        <tr>
                          <td>2:15 م</td>
                          <td><strong>فاتورة صيانة - نيسان صني ل ط 3320</strong></td>
                          <td><span className="tx-type-badge inflow">دخل</span></td>
                          <td>شبكة</td>
                          <td className="tx-amount-green">5,550.00</td>
                        </tr>
                        <tr>
                          <td>1:00 م</td>
                          <td><strong>شراء زيت محرك 5 لتر</strong></td>
                          <td><span className="tx-type-badge outflow">مصروف</span></td>
                          <td>نقدي</td>
                          <td className="tx-amount-red">1,200.00</td>
                        </tr>
                        <tr>
                          <td>11:30 ص</td>
                          <td><strong>فاتورة صيانة - شيفروليه أوبترا س ك 1104</strong></td>
                          <td><span className="tx-type-badge inflow">دخل</span></td>
                          <td>نقدي</td>
                          <td className="tx-amount-green">6,300.00</td>
                        </tr>
                        <tr>
                          <td>1:45 ص</td>
                          <td><strong>سحب عهدة - مشتريات قطع غيار</strong></td>
                          <td><span className="tx-type-badge withdraw">سحب</span></td>
                          <td>نقدي</td>
                          <td className="tx-amount-purple">1,500.00</td>
                        </tr>
                        <tr>
                          <td>9:20 ص</td>
                          <td><strong>فاتورة مصنعية - فحص كمبيوتر</strong></td>
                          <td><span className="tx-type-badge inflow">دخل</span></td>
                          <td>نقدي</td>
                          <td className="tx-amount-green">3,000.00</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* ── LEFT SIDEBAR COLUMN ──────────────────────────────────── */}
        <div className="today-sidebar-area">
          {/* Card 1: Today's Schedule / Inspections */}
          <div className="today-white-card">
            <div className="today-white-card-header" style={{ marginBottom: 4 }}>
              <h3 className="card-title-with-icon">
                <span className="card-header-icon" style={{ color: '#d85a1a' }}>🚗</span>
                <span>{sectorTerms.scheduleCardTitle}</span>
              </h3>
              <span className="card-header-pill">
                {isShiftOpen ? `3 ${sectorTerms.scheduleUnit}` : sectorTerms.scheduleCardTitle}
              </span>
            </div>
            <div className="schedule-sub-label">
              {sectorTerms.scheduleCardSubtitle}
            </div>

            {!isShiftOpen ? (
              <div className="schedule-empty-center">
                <div className="schedule-empty-icon-circle">
                  <span>🚗</span>
                </div>
                <h4>{sectorTerms.scheduleEmptyTitle}</h4>
                <p>{sectorTerms.scheduleEmptyDesc}</p>
              </div>
            ) : (
              <div className="schedule-active-list">
                {sectorTerms.sampleSchedule.map((item) => (
                  <div key={item.id} className="schedule-active-item">
                    <div className="schedule-item-right">
                      <h5>{item.title}</h5>
                      <p>{item.sub}</p>
                    </div>
                    <span className={`schedule-time-badge ${item.isGreen ? 'badge-green' : ''}`}>
                      {item.badge}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Action buttons at bottom of schedule card */}
            <div className="schedule-card-buttons">
              {!isShiftOpen ? (
                <>
                  <button
                    type="button"
                    className="btn-full-orange"
                    onClick={() => onNavigate('pos')}
                  >
                    + {sectorTerms.newBillBtn}
                  </button>
                  <div className="schedule-two-buttons">
                    <button
                      type="button"
                      className="btn-sub-outline"
                      onClick={() => onNavigate('pos')}
                    >
                      {sectorTerms.subBtn1}
                    </button>
                    <button
                      type="button"
                      className="btn-sub-outline"
                      onClick={() => onNavigate('customers')}
                    >
                      {sectorTerms.subBtn2}
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button"
                  className="btn-full-orange"
                  onClick={() => onNavigate('pos')}
                >
                  + {sectorTerms.receiveBtn}
                </button>
              )}
            </div>
          </div>

          {/* Card 2: Today's Counters */}
          <div className="today-white-card sidebar-counters-card">
            <h3 className="card-title-with-icon" style={{ marginBottom: 16 }}>
              <span>عدادات اليوم</span>
            </h3>

            <div className="sidebar-counters-list">
              {/* Row 1: Invoices count */}
              <div className="sidebar-counter-row">
                <div className="counter-label-group">
                  <span className="counter-row-icon">📋</span>
                  <span>{sectorTerms.counter1}</span>
                </div>
                <div className="counter-val-bold">
                  {isShiftOpen ? (finances.invoiceCount || 3) : '•'}
                </div>
              </div>

              {/* Row 2: Average Invoice Value */}
              <div className="sidebar-counter-row">
                <div className="counter-label-group">
                  <span className="counter-row-icon">💵</span>
                  <span>{sectorTerms.counter2}</span>
                </div>
                <div className="counter-val-bold">
                  {isShiftOpen ? fmtMoney(finances.averageInvoice || 4950) : '- - -'}
                </div>
              </div>

              {/* Row 3: Cash withdrawals */}
              <div className="sidebar-counter-row">
                <div className="counter-label-group">
                  <span className="counter-row-icon">↑</span>
                  <span>{sectorTerms.counter3}</span>
                </div>
                <div className="counter-val-bold">
                  {isShiftOpen ? (shiftExpenses.length || 4) : '•'}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Shift Open Modal */}
      <ShiftOpenModal
        isOpen={isShiftOpenModalVisible}
        onClose={() => setIsShiftOpenModalVisible(false)}
        onOpenShift={handleOpenShift}
        sessionUser={sessionUser}
        lastClosedShift={lastClosedShift}
      />

      {/* Shift Close Modal */}
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

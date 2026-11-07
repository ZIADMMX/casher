import { useState, useEffect, useCallback, useMemo } from 'react';
import { useBusinessProfile } from '../contexts/BusinessProfileContext.jsx';
import { useSettings } from '../contexts/SettingsContext.jsx';
import LawFirmTodayPage from '../components/legal/LawFirmTodayPage.jsx';
import { isBridgeAvailable } from '../api/bridge.js';
import * as customersApi from '../api/customers.js';
import * as inventoryApi from '../api/inventory.js';
import * as reportsApi from '../api/reports.js';
import * as salonApi from '../api/salon.js';
import * as shiftsApi from '../api/shifts.js';
import * as subscriptionsApi from '../api/subscriptions.js';
import '../styles/today.css';

function SectorTodayPage({ onNavigate }) {
  const { configuration } = useBusinessProfile();
  
  // Normalize profile key (supports salon, salon_barbershop, barbershop)
  const rawKey = configuration?.profile?.key || 'salon_barbershop';
  const profileKey = rawKey === 'salon' ? 'salon_barbershop' : rawKey;

  const [loading, setLoading] = useState(true);
  const [currentShift, setCurrentShift] = useState(null);
  const [shiftXReport, setShiftXReport] = useState(null);
  const [shiftExpenses, setShiftExpenses] = useState([]);
  const [subscriptions, setSubscriptions] = useState([]);
  const [appointments, setAppointments] = useState([]);
  const [salonChairs, setSalonChairs] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [todaySummary, setTodaySummary] = useState({ totalSales: 0, invoiceCount: 0, profit: 0 });
  const [recentInvoices, setRecentInvoices] = useState([]);
  const [transactionFilter, setTransactionFilter] = useState('all'); // 'all' | 'inflow' | 'outflow'

  // Load all daily metrics, shift cashflow, and sector-specific operational data
  const loadDailyData = useCallback(async () => {
    setLoading(true);
    try {
      if (!isBridgeAvailable()) return;

      const todayStr = new Date().toISOString().split('T')[0];

      // 1. Parallel loading of core entities
      const [shift, subsList, custsList, chairsList] = await Promise.all([
        shiftsApi.getCurrentShift.isAvailable() ? shiftsApi.getCurrentShift().catch(() => null) : null,
        subscriptionsApi.getAllSubscriptions.isAvailable() ? subscriptionsApi.getAllSubscriptions().catch(() => []) : [],
        customersApi.getAllCustomersWithStats.isAvailable() ? customersApi.getAllCustomersWithStats().catch(() => []) : [],
        salonApi.getAllSalonChairs.isAvailable() ? salonApi.getAllSalonChairs().catch(() => []) : [],
      ]);

      setCurrentShift(shift);
      setSubscriptions(Array.isArray(subsList) ? subsList : []);
      setCustomers(Array.isArray(custsList) ? custsList : []);
      setSalonChairs(Array.isArray(chairsList) ? chairsList : []);

      // 2. Load Appointments based on sector
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

      // 3. Shift X-Report and Cashflow (الدواخل والخوارج والدرج)
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
      }

      // 4. Financial Report for Today (Recent Invoices & Totals)
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
          // If reports fail or non-admin, rely on shift totals
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

  // Financial Figures (الدواخل والخوارج وصندوق النقدية)
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

    return {
      totalInflow,
      cashSales,
      cardSales,
      totalOutflow,
      refunds,
      netCashflow,
      openingCash,
      currentDrawerCash,
      invoiceCount: todaySummary.invoiceCount,
    };
  }, [todaySummary, shiftXReport, currentShift, shiftExpenses]);

  // Unified Chronological Timeline (سجل الحركات: الدواخل والخوارج)
  const allTimelineTransactions = useMemo(() => {
    const list = [];

    // 1. Inflows (فواتير المبيعات / الخدمات)
    for (const inv of recentInvoices) {
      list.push({
        id: `inv-${inv.id}`,
        type: 'inflow',
        typeLabel: 'فاتورة خدمة / مبيعات',
        title: `فاتورة #${inv.invoice_number || inv.id}`,
        subTitle: inv.customer_name || 'زبون نقدي',
        amount: Number(inv.final_amount ?? inv.total_amount ?? 0),
        time: inv.created_at || new Date().toISOString(),
        paymentMethod: inv.payment_method === 'card' ? 'شبكة / بطاقة 💳' : 'نقدي 💵',
        badgeClass: 'badge-inflow',
      });
    }

    // 2. Outflows (المصروفات وسحوبات الدرج)
    for (const exp of shiftExpenses) {
      list.push({
        id: `exp-${exp.id}`,
        type: 'outflow',
        typeLabel: 'سحب مصروف من الدرج',
        title: `مصروف: ${exp.category || 'نثريات'}`,
        subTitle: exp.notes ? `${exp.notes} • مسؤول: ${exp.username || 'كاشير'}` : `مسؤول: ${exp.username || 'كاشير'}`,
        amount: Number(exp.amount || 0),
        time: exp.created_at || new Date().toISOString(),
        paymentMethod: 'سحب نقدي من الدرج 💸',
        badgeClass: 'badge-outflow',
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

  // Profile-specific configurations & terms (Isolated Sector Personalities)
  const profileConfig = useMemo(() => {
    switch (profileKey) {
      case 'salon_barbershop':
        return {
          name: 'صالونات وتجميل وحلاقة (Salon & Barber)',
          icon: '✂️',
          doorOpenText: 'الصالون مفتوح.. أهلاً بزبائن اليوم ومواعيد التصفيف والعناية!',
          doorClosedText: 'الصالون مغلق لليوم.. راجع إيرادات الخدمات والعمولات ودرج النقدية',
          metric1Label: 'خدمات / زبائن اليوم',
          metric1Value: finances.invoiceCount,
          metric2Label: 'إجمالي إيرادات اليوم',
          metric2Value: finances.totalInflow,
          metric3Label: 'الكراسي المشغولة',
          metric3Value: salonChairs.filter((c) => c.status === 'busy' || c.status === 'in_service').length,
          pendingCardTitle: 'كراسي ومحطات العمل',
          pendingEmptyText: salonChairs.length > 0 ? null : 'لا توجد كراسي مسجلة بالنظام',
          expiringCardTitle: 'حجوزات بانتظار التأكيد',
          expiringEmptyText: appointments.filter((a) => a.status === 'booked' || a.status === 'pending').length > 0
            ? `${appointments.filter((a) => a.status === 'booked' || a.status === 'pending').length} حجوزات بانتظار التأكيد`
            : 'جميع الحجوزات مؤكدة وجاهزة',
          scheduleTitle: 'جدول حجوزات ومواعيد الصالون لليوم',
          scheduleEmptyTitle: 'لا توجد حجوزات مسجلة اليوم',
          scheduleEmptySub: 'سجّل موعد حجز جديد لعميل أو ابدأ تقديم خدمة على الكرسي',
          btn1Text: 'حجز موعد جديد ✂️',
          btn1Action: () => onNavigate('appointments'),
          btn2Text: 'نقطة البيع (POS)',
          btn2Action: () => onNavigate('pos'),
        };

      case 'law_firm':
        return {
          name: 'مكاتب محاماة واستشارات قانونية (Law Firm)',
          icon: '⚖️',
          doorOpenText: 'المكتب مفتوح.. نسعد بخدمة الموكلين ومتابعة القضايا والجلسات!',
          doorClosedText: 'المكتب مغلق لليوم.. راجع أتعاب واستشارات اليوم وصندوق المصروفات',
          metric1Label: 'جلسات اليوم القضائية',
          metric1Value: appointments.length,
          metric2Label: 'أتعاب اليوم المحصلة',
          metric2Value: finances.totalInflow,
          metric3Label: 'استشارات قيد المتابعة',
          metric3Value: appointments.filter((a) => a.status === 'pending' || a.status === 'scheduled').length,
          pendingCardTitle: 'جلسات المحاكم القادمة',
          pendingEmptyText: 'لا توجد جلسات محاكم مسجلة لليوم',
          expiringCardTitle: 'استشارات وملفات عاجلة',
          expiringEmptyText: 'لا توجد ملفات متأخرة أو استشارات معلقة',
          scheduleTitle: 'جدول الجلسات والمواعيد القضائية لليوم',
          scheduleEmptyTitle: 'لا توجد جلسات أو مواعيد مسجلة اليوم',
          scheduleEmptySub: 'سجّل ملف قضية جديد أو حدد موعد استشارة لموكّل',
          btn1Text: 'ملف قضية جديد ⚖️',
          btn1Action: () => onNavigate('cases'),
          btn2Text: 'جدول المواعيد',
          btn2Action: () => onNavigate('appointments'),
        };

      case 'subscriptions_gym':
        return {
          name: 'نادي الجيم واللياقة (Gym & Fitness)',
          icon: '🏋️‍♂️',
          doorOpenText: 'الأبواب مفتوحة للنادي.. استقبل الأبطال وحصص التدريب!',
          doorClosedText: 'الأبواب مغلقة لليوم.. احصِ اشتراكات وعضويات اليوم وراجع الصندوق',
          metric1Label: 'حضور واشتراكات اليوم',
          metric1Value: appointments.length || finances.invoiceCount,
          metric2Label: 'إيرادات اليوم',
          metric2Value: finances.totalInflow,
          metric3Label: 'حصص قيد التأكيد',
          metric3Value: appointments.filter((a) => a.status === 'pending').length,
          pendingCardTitle: 'حصص وتدريبات قيد التأكيد',
          pendingEmptyText: 'لا توجد تأكيدات تدريب معلقة لليوم',
          expiringCardTitle: 'عضويات تنتهي قريباً',
          expiringEmptyText: subscriptions.filter((s) => s.status === 'expired' || s.remaining_credits <= 2).length > 0
            ? `${subscriptions.filter((s) => s.status === 'expired' || s.remaining_credits <= 2).length} عضويات بحاجة للمتابعة`
            : 'جميع العضويات سارية ومستقرة',
          scheduleTitle: 'جدول حصص وتدريبات اليوم',
          scheduleEmptyTitle: 'لا توجد حصص مجدولة لليوم',
          scheduleEmptySub: 'سجّل مشتركاً جديداً أو جدول فصلاً تدريبياً',
          btn1Text: 'تسجيل مشترك جديد 🏋️',
          btn1Action: () => onNavigate('subscriptions'),
          btn2Text: 'جدولة حصة تدريب',
          btn2Action: () => onNavigate('appointments'),
        };

      case 'auto_workshop':
      case 'maintenance':
        return {
          name: 'ورشة صيانة وإصلاح السيارات (Auto Workshop)',
          icon: '🚘',
          doorOpenText: 'الورشة مفتوحة وجاهزة لاستقبال السيارات وأوامر الإصلاح!',
          doorClosedText: 'الورشة مغلقة لليوم.. احصِ أوامر الصيانة والمصنعيات والقطع',
          metric1Label: 'فواتير الصيانة اليوم',
          metric1Value: finances.invoiceCount,
          metric2Label: 'إيرادات الصيانة',
          metric2Value: finances.totalInflow,
          metric3Label: 'حركات السحب النثري',
          metric3Value: shiftExpenses.length,
          pendingCardTitle: 'سيارات بانتظار الفحص والموافقة',
          pendingEmptyText: 'لا توجد سيارات معلقة بانتظار الموافقة',
          expiringCardTitle: 'أوامر متأخرة عن موعد التسليم',
          expiringEmptyText: 'جميع السيارات ضمن الجدول الزمني المحدد',
          scheduleTitle: 'جدول استلام وفحص السيارات اليوم',
          scheduleEmptyTitle: 'لا توجد سيارات مجدولة اليوم',
          scheduleEmptySub: 'استلم سيارة صيانة جديدة وافتح أمر إصلاح',
          btn1Text: 'فاتورة صيانة جديدة 🔧',
          btn1Action: () => onNavigate('pos'),
          btn2Text: 'العملاء',
          btn2Action: () => onNavigate('customers'),
        };

      case 'cafe_restaurant':
        return {
          name: 'المطاعم والكافيهات (Cafe & Food)',
          icon: '☕',
          doorOpenText: 'الكافيه والمطعم مفتوح.. نسعد بخدمة الزبائن والطلبات اليوم!',
          doorClosedText: 'الكافيه مغلق لليوم.. احصِ مبيعات الوردية وراجع الصندوق',
          metric1Label: 'طلبات اليوم',
          metric1Value: finances.invoiceCount,
          metric2Label: 'إجمالي المبيعات',
          metric2Value: finances.totalInflow,
          metric3Label: 'حركات السحب النثري',
          metric3Value: shiftExpenses.length,
          pendingCardTitle: 'طلبات معلقة بالمطبخ والبار',
          pendingEmptyText: 'لا توجد طلبات معلقة بالمطبخ حالياً',
          expiringCardTitle: 'مكونات قاربت على النفاد',
          expiringEmptyText: 'مخزون المكونات والمشروبات كافٍ ومستقر',
          scheduleTitle: 'جدول طلبات الصالة والدليفري اليوم',
          scheduleEmptyTitle: 'لا توجد طلبات معلقة لليوم',
          scheduleEmptySub: 'ابدأ بتسجيل طلب جديد عبر شاشة الكاشير السريع',
          btn1Text: 'نقطة البيع (POS)',
          btn1Action: () => onNavigate('pos'),
          btn2Text: 'شاشة المطبخ (KDS)',
          btn2Action: () => onNavigate('kitchen'),
        };

      case 'grocery':
        return {
          name: 'السوبرماركت والبقالة (Supermarket)',
          icon: '🛒',
          doorOpenText: 'المتجر مفتوح.. نسعد بخدمة زوار ومشتريات اليوم!',
          doorClosedText: 'المتجر مغلق لليوم.. احصِ مبيعات الكاشير وراجع العهدة',
          metric1Label: 'عدد الفواتير',
          metric1Value: finances.invoiceCount,
          metric2Label: 'مبيعات اليوم',
          metric2Value: finances.totalInflow,
          metric3Label: 'حركات السحب النثري',
          metric3Value: shiftExpenses.length,
          pendingCardTitle: 'فواتير توريد قيد الاعتماد',
          pendingEmptyText: 'لا توجد فواتير توريد معلقة',
          expiringCardTitle: 'أصناف قاربت على انتهاء الصلاحية',
          expiringEmptyText: 'جميع المنتجات صالحة وآمنة',
          scheduleTitle: 'جدول استلام الموردين والطلبيات',
          scheduleEmptyTitle: 'لا توجد طلبيات مجدولة اليوم',
          scheduleEmptySub: 'ابدأ البيع عبر الكاشير السريع أو سجل فاتورة توريد',
          btn1Text: 'نقطة البيع (POS)',
          btn1Action: () => onNavigate('pos'),
          btn2Text: 'جرد سريع',
          btn2Action: () => onNavigate('branches'),
        };

      default: // retail, custom, etc.
        return {
          name: 'المتجر والتجزئة (Retail)',
          icon: '🛍️',
          doorOpenText: 'الأبواب مفتوحة للمتجر.. يوم مبيعات مبارك ومكاسب وفيرة!',
          doorClosedText: 'الأبواب مغلقة لليوم.. احصِ مكاسب اليوم وراجع الصندوق',
          metric1Label: 'فواتير اليوم',
          metric1Value: finances.invoiceCount,
          metric2Label: 'إجمالي اليوم',
          metric2Value: finances.totalInflow,
          metric3Label: 'حركات السحب النثري',
          metric3Value: shiftExpenses.length,
          pendingCardTitle: 'طلبات شحن وتوصيل معلقة',
          pendingEmptyText: 'لا توجد طلبات معلقة لليوم',
          expiringCardTitle: 'أصناف قاربت على النفاد',
          expiringEmptyText: 'المخزون كافٍ ولا توجد نواقص حرجة',
          scheduleTitle: 'جدول طلبيات وشحنات اليوم',
          scheduleEmptyTitle: 'لا شيء مجدول بعد',
          scheduleEmptySub: 'أضف طلب توصيل جديد أو ابدأ البيع المباشر',
          btn1Text: 'نقطة البيع (POS)',
          btn1Action: () => onNavigate('pos'),
          btn2Text: 'العملاء',
          btn2Action: () => onNavigate('customers'),
        };
    }
  }, [profileKey, appointments, finances, subscriptions, salonChairs, shiftExpenses, onNavigate]);

  // Customer Segmentation
  const customerHealth = useMemo(() => {
    const newCount =
      customers.filter((c) => {
        if (!c.created_at) return false;
        const created = new Date(c.created_at);
        const diffDays = (new Date() - created) / (1000 * 60 * 60 * 24);
        return diffDays <= 7;
      }).length || 1;

    const activeCount = Math.max(0, customers.length - newCount);
    return {
      total: customers.length || 1,
      newCount,
      activeCount,
      atRiskCount: 0,
      inactiveCount: 0,
      churnedCount: 0,
    };
  }, [customers]);

  const isShiftOpen = Boolean(currentShift && !currentShift.end_time);

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
      {/* 1. TOP BANNER & SHIFT STATUS */}
      <div className="today-top-banner">
        <div className="today-banner-greeting">
          <h1 className="today-greeting-title">
            <span className="door-status-icon">{isShiftOpen ? '🟢' : '🚪'}</span>
            <span>{isShiftOpen ? profileConfig.doorOpenText : profileConfig.doorClosedText}</span>
          </h1>
          <div className="today-greeting-subtitle">
            <span className={`shift-pill ${isShiftOpen ? 'shift-open' : 'shift-closed'}`}>
              {isShiftOpen ? 'الوردية مفتوحة ونشطة' : 'الوردية مغلقة حالياً'}
            </span>
            <span className="bullet-sep">•</span>
            <span className="today-profile-badge">
              <span>{profileConfig.icon}</span>
              <span>{profileConfig.name}</span>
            </span>
            {isShiftOpen && currentShift?.cashier_username && (
              <>
                <span className="bullet-sep">•</span>
                <span className="shift-cashier-tag">
                  👤 الكاشير: {currentShift.cashier_username}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="today-top-metrics">
          <div className="today-metric-box">
            <span className="today-metric-value">{profileConfig.metric3Value}</span>
            <span className="today-metric-label">{profileConfig.metric3Label}</span>
          </div>

          <div className="today-metric-box">
            <span className="today-metric-value currency text-emerald">
              EGP {Number(profileConfig.metric2Value || 0).toFixed(2)}
            </span>
            <span className="today-metric-label">{profileConfig.metric2Label}</span>
          </div>

          <div className="today-metric-box">
            <span className="today-metric-value text-sky">{profileConfig.metric1Value}</span>
            <span className="today-metric-label">{profileConfig.metric1Label}</span>
          </div>
        </div>
      </div>

      {/* 2. COMPREHENSIVE DAILY CASHFLOW SUMMARY (تقرير الدواخل والخوارج والصندوق) */}
      <div className="today-cashflow-banner">
        <div className="cashflow-header-row">
          <div className="cashflow-header-title">
            <span className="cashflow-icon">📊</span>
            <div>
              <h3>تقرير حركة التدفق المالي المباشر لليوم</h3>
              <p>بيان كامل لجميع المقبوضات (الدواخل)، المسحوبات والمصروفات (الخوارج)، ورصيد الصندوق</p>
            </div>
          </div>
          <div className="cashflow-date-badge">
            <span>📅 {new Date().toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span>
          </div>
        </div>

        <div className="cashflow-cards-grid">
          {/* Card 1: Inflows (الدواخل) */}
          <div className="cashflow-card card-inflow">
            <div className="card-top">
              <span className="card-pill pill-inflow">الدواخل ↙</span>
              <span className="card-icon-sign">💰</span>
            </div>
            <div className="card-amount text-emerald">
              EGP {finances.totalInflow.toFixed(2)}
            </div>
            <div className="card-desc">
              إجمالي المقبوضات ومبيعات اليوم
            </div>
            <div className="card-sub-breakdown">
              <span>💵 نقدي: {finances.cashSales.toFixed(2)} ج.م</span>
              <span>•</span>
              <span>💳 شبكة: {finances.cardSales.toFixed(2)} ج.م</span>
            </div>
          </div>

          {/* Card 2: Outflows (الخوارج) */}
          <div className="cashflow-card card-outflow">
            <div className="card-top">
              <span className="card-pill pill-outflow">الخوارج ↗</span>
              <span className="card-icon-sign">💸</span>
            </div>
            <div className="card-amount text-rose">
              EGP {finances.totalOutflow.toFixed(2)}
            </div>
            <div className="card-desc">
              إجمالي المصروفات وسحوبات العهدة
            </div>
            <div className="card-sub-breakdown">
              <span>{shiftExpenses.length} حركة سحب نقدي</span>
              {finances.refunds > 0 && <span>• مرتجع: {finances.refunds.toFixed(2)} ج.م</span>}
            </div>
          </div>

          {/* Card 3: Net Cashflow (الصافي) */}
          <div className="cashflow-card card-net">
            <div className="card-top">
              <span className="card-pill pill-net">صافي اليوم 💼</span>
              <span className="card-icon-sign">⚖️</span>
            </div>
            <div className={`card-amount ${finances.netCashflow >= 0 ? 'text-sky' : 'text-rose'}`}>
              EGP {finances.netCashflow.toFixed(2)}
            </div>
            <div className="card-desc">
              صافي حركة اليوم (الدواخل - الخوارج)
            </div>
            <div className="card-sub-breakdown">
              <span>{finances.netCashflow >= 0 ? '✓ فائض مالي إيجابي' : '⚠️ عجز نقدي'}</span>
            </div>
          </div>

          {/* Card 4: Drawer Cash (الدرج والصندوق) */}
          <div className="cashflow-card card-drawer">
            <div className="card-top">
              <span className="card-pill pill-drawer">الدرج والصندوق 🏦</span>
              <span className="card-icon-sign">🏷️</span>
            </div>
            <div className="card-amount text-orange">
              EGP {finances.currentDrawerCash.toFixed(2)}
            </div>
            <div className="card-desc">
              النقدية الحالية المفترضة في الدرج
            </div>
            <div className="card-sub-breakdown">
              <span>عهدة البداية: {finances.openingCash.toFixed(2)} ج.م</span>
            </div>
          </div>
        </div>
      </div>

      {/* 3. MAIN OPERATIONAL GRID (SECTOR SCHEDULE & SIDE CARDS) */}
      <div className="today-main-grid">
        {/* SIDEBAR COLUMN */}
        <div className="today-sidebar-col">
          {/* Card 1: Chairs & Stations (for Salon) or Pending Approvals */}
          {profileKey === 'salon_barbershop' ? (
            <div className="today-card">
              <div className="today-card-header">
                <h3 className="today-card-title">
                  <span className="icon-wrap">✂️</span>
                  <span>كراسي ومحطات العمل</span>
                </h3>
                <span className="badge-count">{salonChairs.length} كراسي</span>
              </div>
              <div className="salon-chairs-list">
                {salonChairs.length === 0 ? (
                  <div className="today-card-empty-note">لا توجد كراسي مسجلة حالياً</div>
                ) : (
                  salonChairs.map((chair) => (
                    <div key={chair.id} className="chair-item-row">
                      <div className="chair-info">
                        <span className="chair-name">{chair.name}</span>
                        <span className="chair-stylist">
                          {chair.default_stylist_name ? `المصفف: ${chair.default_stylist_name}` : 'كرسي متاح للجميع'}
                        </span>
                      </div>
                      <span className={`chair-status-pill status-${chair.status || 'available'}`}>
                        {chair.status === 'busy' || chair.status === 'in_service' ? '🔵 مشغول' : '🟢 متاح'}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          ) : (
            <div className="today-card">
              <div className="today-card-header">
                <h3 className="today-card-title">
                  <span className="icon-wrap">📅</span>
                  <span>{profileConfig.pendingCardTitle}</span>
                </h3>
              </div>
              <div className="today-card-empty-note">
                {profileConfig.pendingEmptyText || 'لا توجد عناصر معلقة لليوم'}
              </div>
            </div>
          )}

          {/* Card 2: Expiring Soon or Pending Bookings */}
          <div className="today-card">
            <div className="today-card-header">
              <h3 className="today-card-title">
                <span className="icon-wrap text-orange">⏰</span>
                <span>{profileConfig.expiringCardTitle}</span>
              </h3>
            </div>
            <div className="today-card-empty-note">
              {profileConfig.expiringEmptyText}
            </div>
          </div>

          {/* Card 3: Customer Health (Dark Themed) */}
          <div className="today-card customer-health-card">
            <div className="today-card-header">
              <h3 className="today-card-title">
                <span className="icon-wrap text-orange">🧡</span>
                <span>صحة وتفاعل العملاء</span>
              </h3>
              <span className="health-total-badge">{customerHealth.total} الإجمالي</span>
            </div>

            <div className="today-health-progress-bar" />

            <div className="today-health-statuses">
              <div className="today-health-row active">
                <span className="today-health-label">
                  <span>✨</span>
                  <span>زبائن جدد (آخر 7 أيام)</span>
                </span>
                <span className="today-health-count text-emerald">{customerHealth.newCount}</span>
              </div>

              <div className="today-health-row">
                <span className="today-health-label">
                  <span>🟢</span>
                  <span>عملاء دائمون ونشطون</span>
                </span>
                <span className="today-health-count text-sky">{customerHealth.activeCount}</span>
              </div>

              <div className="today-health-row">
                <span className="today-health-label">
                  <span>⚠️</span>
                  <span>بحاجة لإعادة تواصل</span>
                </span>
                <span className="today-health-count text-muted">{customerHealth.atRiskCount}</span>
              </div>
            </div>
          </div>
        </div>

        {/* CENTER AREA - SECTOR SCHEDULE & OPERATIONS */}
        <div className="today-schedule-card">
          <div className="today-schedule-header">
            <h2 className="today-schedule-title">
              <span>📅</span>
              <span>{profileConfig.scheduleTitle}</span>
            </h2>
            <div className="schedule-header-actions">
              <button
                type="button"
                className="today-btn-primary"
                onClick={profileConfig.btn1Action}
              >
                <span>➕</span>
                <span>{profileConfig.btn1Text}</span>
              </button>
            </div>
          </div>

          {/* Render Sector-Specific Schedule */}
          {profileKey === 'salon_barbershop' && appointments.length > 0 ? (
            <div className="today-schedule-items-list">
              {appointments.map((apt) => (
                <div key={apt.id} className="today-schedule-row">
                  <div className="today-schedule-row-left">
                    <span className="today-schedule-time">
                      ⏰ {apt.start_time || apt.appointment_time || '00:00'}
                    </span>
                    <div className="today-schedule-details">
                      <h4>{apt.customer_name || 'عميل'}</h4>
                      <p>
                        {apt.service_name ? `الخدمة: ${apt.service_name}` : 'خدمة صالون'}
                        {apt.chair_name ? ` • الكرسي: ${apt.chair_name}` : ''}
                        {apt.stylist_name ? ` • المصفف: ${apt.stylist_name}` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="schedule-row-right">
                    <span className="schedule-price-tag">
                      {apt.service_price || apt.price || 0} ج.م
                    </span>
                    <span className={`today-list-item-badge status-${apt.status || 'booked'}`}>
                      {apt.status === 'confirmed' ? '✓ مؤكد' : apt.status === 'in_service' ? '✂️ قيد الخدمة' : 'محجوز'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : profileKey === 'subscriptions_gym' && appointments.length > 0 ? (
            <div className="today-schedule-items-list">
              {appointments.map((apt) => (
                <div key={apt.id} className="today-schedule-row">
                  <div className="today-schedule-row-left">
                    <span className="today-schedule-time">
                      ⏰ {apt.appointment_time || '00:00'}
                    </span>
                    <div className="today-schedule-details">
                      <h4>{apt.client_name || apt.customer_name || 'مشترك'}</h4>
                      <p>{apt.trainer_name ? `الكابتن: ${apt.trainer_name}` : 'حصة عامة'}</p>
                    </div>
                  </div>
                  <span className="today-list-item-badge">{apt.status || 'مؤكد'}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="today-schedule-empty">
              <div className="today-empty-icon-box">
                <span>{profileConfig.icon}</span>
              </div>
              <h3 className="today-empty-title">{profileConfig.scheduleEmptyTitle}</h3>
              <p className="today-empty-subtext">{profileConfig.scheduleEmptySub}</p>

              <div className="today-schedule-actions">
                <button
                  type="button"
                  className="today-btn-primary"
                  onClick={profileConfig.btn1Action}
                >
                  <span>➕</span>
                  <span>{profileConfig.btn1Text}</span>
                </button>

                <button
                  type="button"
                  className="today-btn-outline"
                  onClick={profileConfig.btn2Action}
                >
                  <span>📋</span>
                  <span>{profileConfig.btn2Text}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. COMPREHENSIVE DAILY TRANSACTIONS TIMELINE (سجل حركات اليوم: الدواخل والخوارج) */}
      <div className="today-bottom-card">
        <div className="today-bottom-header">
          <div className="bottom-title-wrap">
            <h3 className="today-bottom-title">
              <span>📜</span>
              <span>سجل حركات اليوم من البداية حتى النهاية (الدواخل والخوارج)</span>
            </h3>
            <span className="total-tx-pill">{allTimelineTransactions.length} معاملة مسجلة</span>
          </div>

          <div className="today-bottom-filter-box">
            {/* Filter Tabs */}
            <div className="tx-filter-tabs">
              <button
                type="button"
                className={`tx-tab ${transactionFilter === 'all' ? 'active' : ''}`}
                onClick={() => setTransactionFilter('all')}
              >
                الكل ({allTimelineTransactions.length})
              </button>
              <button
                type="button"
                className={`tx-tab tab-inflow ${transactionFilter === 'inflow' ? 'active' : ''}`}
                onClick={() => setTransactionFilter('inflow')}
              >
                الدواخل ↙ ({allTimelineTransactions.filter((t) => t.type === 'inflow').length})
              </button>
              <button
                type="button"
                className={`tx-tab tab-outflow ${transactionFilter === 'outflow' ? 'active' : ''}`}
                onClick={() => setTransactionFilter('outflow')}
              >
                الخوارج ↗ ({allTimelineTransactions.filter((t) => t.type === 'outflow').length})
              </button>
            </div>
          </div>
        </div>

        {displayedTransactions.length === 0 ? (
          <div className="today-transactions-empty">
            <span className="empty-tx-icon">📭</span>
            <p>لا توجد معاملات مسجلة في هذا التبويب اليوم حتى الآن.</p>
          </div>
        ) : (
          <div className="today-transactions-table-wrap">
            <table className="today-transactions-table">
              <thead>
                <tr>
                  <th style={{ width: '12%' }}>الوقت</th>
                  <th style={{ width: '16%' }}>نوع الحركة</th>
                  <th style={{ width: '28%' }}>البيان والتفاصيل</th>
                  <th style={{ width: '16%' }}>طريقة المعاملة</th>
                  <th style={{ width: '14%' }}>القيمة</th>
                  <th style={{ width: '14%' }}>الأثر المالي</th>
                </tr>
              </thead>
              <tbody>
                {displayedTransactions.map((tx) => (
                  <tr key={tx.id} className={`tx-row row-${tx.type}`}>
                    <td className="tx-time-cell">
                      ⏰ {new Date(tx.time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td>
                      <span className={`tx-type-tag ${tx.badgeClass}`}>
                        {tx.type === 'inflow' ? '↙ وارد' : '↗ منصرف'}
                      </span>
                    </td>
                    <td>
                      <div className="tx-details-cell">
                        <strong className="tx-title">{tx.title}</strong>
                        <span className="tx-sub">{tx.subTitle}</span>
                      </div>
                    </td>
                    <td className="tx-method-cell">
                      <span>{tx.paymentMethod}</span>
                    </td>
                    <td className="tx-amount-cell">
                      <strong className={`tx-amount-val ${tx.type === 'inflow' ? 'val-inflow' : 'val-outflow'}`}>
                        {tx.type === 'inflow' ? '+' : '-'}{tx.amount.toFixed(2)} ج.م
                      </strong>
                    </td>
                    <td>
                      <span className={`tx-impact-pill ${tx.type === 'inflow' ? 'impact-in' : 'impact-out'}`}>
                        {tx.type === 'inflow' ? 'زيادة بالخزينة' : 'خصم من العهدة'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default function TodayPage({ onNavigate }) {
  const { configuration } = useBusinessProfile();
  const { settings } = useSettings();
  const profileKey = configuration?.profile?.key
    || settings?.business_type
    || settings?.onboarding_sector;
  if (profileKey === 'law_firm') {
    return <LawFirmTodayPage onNavigate={onNavigate} />;
  }
  return <SectorTodayPage onNavigate={onNavigate} />;
}

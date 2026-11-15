import SalesReportsView from './SalesReportsView.jsx';
import GymReportExtras from './GymReportExtras.jsx';

// The gym's reports page: the same sales report, worded for a club (income/collections/trainers/packages)
// and topped with subscription-health panels. The POS "top products" table is dropped in favour of the
// revenue-by-package panel, since a gym's income is subscriptions, not item sales.
const GYM_LEX = {
  title: 'تقارير النادي',
  netSales: 'صافي دخل الاشتراكات',
  netSalesFoot: 'بعد خصم الاستردادات',
  profit: 'صافي الربح التقديري',
  invoices: 'عدد التحصيلات',
  invoiceUnit: 'إيصال',
  invoicesPerDay: 'إيصال / يوم',
  avgInvoice: 'متوسط التحصيل',
  returns: 'الاستردادات والخصومات',
  trendTitle: 'منحى الدخل',
  trendTotal: 'إجمالي الدخل',
  emptyPeriod: 'لا يوجد دخل في هذه الفترة',
  paymentsTitle: 'طرق التحصيل',
  paymentsSub: 'توزيع الدخل حسب طريقة التحصيل',
  creditLine: 'تحصيل آجل في الفترة',
  staffTitle: 'أداء المدربين',
  staffUnit: 'إيصال',
  ledgerTitle: 'أحدث التحصيلات',
  invoiceNoCol: 'رقم الإيصال',
  searchPlaceholder: 'ابحث برقم الإيصال أو العضو أو الموظف أو المبلغ',
};

export default function GymReportsView({ onNavigate }) {
  return (
    <SalesReportsView
      onNavigate={onNavigate}
      lexicon={GYM_LEX}
      hideTopItems
      extraPanels={<GymReportExtras onNavigate={onNavigate} />}
    />
  );
}

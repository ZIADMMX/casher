import { useSettings } from '../../contexts/SettingsContext.jsx';
import { amountInWords } from '../../utils/arabicAmountWords.js';
import { PAYMENT_METHODS, money, initial } from './PayrollWizard.jsx';

const MONTH_NAMES = ['', 'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const METHOD_LABEL = Object.fromEntries(PAYMENT_METHODS.map((method) => [method.value, method.label]));
const EXPECTED_WORK_DAYS = 26; // نفس القيمة المستخدمة في احتساب المسير (payroll.service.js)

const DASH = '—';
const cell = (value) => (Number(value) ? money(value) : DASH);

function longDate(value) {
  if (!value) return DASH;
  const date = new Date(String(value).replace(' ', 'T'));
  return Number.isNaN(date.getTime())
    ? DASH
    : date.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * قسيمة راتب جاهزة للطباعة لموظف واحد في مسير محدد.
 * مخفية على الشاشة، وهي الوحيدة اللي بتتطبع (انظر @media print في salaries.css).
 */
export default function PayslipPrint({ item, period, user, advance }) {
  const { settings } = useSettings();
  if (!item || !period) return null;

  const name = item.full_name || item.username || user?.full_name || 'موظف';
  // بدون فاصلة آلاف: السنة ٢٠٢٦ مش ٢٬٠٢٦
  const monthLabel = `${MONTH_NAMES[period.month]} ${Number(period.year).toLocaleString('ar-EG', { useGrouping: false })}`;
  const slipNumber = `PS-${period.year}-${String(period.month).padStart(2, '0')}-${String(item.user_id).padStart(3, '0')}`;
  const hourly = (user?.pay_type || item.pay_type) === 'hourly';
  const workedDays = Math.max(0, EXPECTED_WORK_DAYS - (Number(item.absent_days) || 0));

  const earnings = [
    ['الراتب الأساسي', hourly ? 'بالساعة' : 'شهري ثابت', item.basic_salary],
    ['بدل مواصلات', 'بدل ثابت شهري', item.transport_allowance],
    ['بدل إضافي', 'مُضاف يدويًا في المسير', item.other_allowances],
    ['حافز أداء', 'مكافأة على المسير', item.bonus_amount],
    Number(item.overtime_amount) ? ['أوفرتايم', 'ساعات إضافية بـ١٫٥ من قيمة الساعة', item.overtime_amount] : null,
    Number(item.commissions_amount) ? ['عمولات', 'عمولات مبيعات', item.commissions_amount] : null,
    Number(item.housing_allowance) ? ['بدل سكن', 'بدل ثابت شهري', item.housing_allowance] : null,
  ].filter(Boolean);
  const totalEarnings = earnings.reduce((total, [, , value]) => total + (Number(value) || 0), 0);

  const installments = Math.max(1, Number(advance?.installments) || 1);
  const advanceDetail = advance
    ? `قسط شهري من سلفة ${money(advance.amount)} على ${money(installments)} أقساط`
    : 'لا يوجد';
  const deductions = [
    ['قسط سلفة', advanceDetail, item.advances_deducted],
    ['خصم غياب', item.absent_days ? `${money(item.absent_days)} يوم غياب غير مبرر` : 'لا يوجد', item.absent_deduction],
    ['خصم / جزاء', Number(item.deductions_amount) ? 'خصم يدوي على المسير' : 'لا يوجد', item.deductions_amount],
  ];
  const totalDeductions = deductions.reduce((total, [, , value]) => total + (Number(value) || 0), 0);

  const advanceRemaining = advance ? Math.max(0, advance.amount - advance.repaid_amount) : 0;
  const installmentValue = advance ? advance.amount / installments : 0;

  return (
    <div className="printable-payslip-area" dir="rtl">
      <header className="payslip-top">
        <div className="payslip-brand">
          <span className="payslip-logo" aria-hidden="true">
            {settings?.store_logo
              ? <img src={settings.store_logo} alt="" />
              : initial(settings?.store_name || 'ش')}
          </span>
          <div>
            <strong>{settings?.store_name || 'اسم المنشأة'}</strong>
            <small>
              {[settings?.store_tagline, settings?.store_address, settings?.store_phone].filter(Boolean).join(' · ')
                || 'بيانات المنشأة غير مسجلة في الإعدادات'}
            </small>
          </div>
        </div>
        <div className="payslip-serial">
          <small>رقم القسيمة للطباعة</small>
          <strong>{slipNumber}</strong>
        </div>
      </header>

      <h2 className="payslip-title">قسيمة راتب — {monthLabel}</h2>
      <p className="payslip-period">
        عن الفترة من {longDate(period.start_date)} إلى {longDate(period.end_date)}
        {' — '}
        {item.paid_at
          ? `تاريخ الصرف ${longDate(item.paid_at)}.`
          : period.payment_date
            ? `تاريخ الصرف المقرر ${longDate(period.payment_date)}.`
            : 'لم يُصرف بعد.'}
      </p>

      <h3 className="payslip-heading">بيانات الموظف</h3>
      <table className="payslip-table is-info">
        <tbody>
          <tr>
            <th>اسم الموظف</th><td>{name}</td>
            <th>كود الموظف</th><td>EMP-{String(item.user_id).padStart(3, '0')}</td>
          </tr>
          <tr>
            <th>الوظيفة</th><td>{item.job_title || user?.job_title || 'موظف'}</td>
            <th>تاريخ التسجيل</th><td>{longDate(user?.created_at)}</td>
          </tr>
          <tr>
            <th>أيام العمل</th>
            <td>{hourly ? 'يُحتسب بالساعة' : `${money(workedDays)} من ${money(EXPECTED_WORK_DAYS)} يوم`}</td>
            <th>طريقة الصرف</th>
            <td>{METHOD_LABEL[item.payment_method || period.payment_method] || METHOD_LABEL.cash}</td>
          </tr>
        </tbody>
      </table>

      <h3 className="payslip-heading">المستحقات</h3>
      <table className="payslip-table is-amounts">
        <thead><tr><th>البند</th><th>التفصيل</th><th>المبلغ</th></tr></thead>
        <tbody>
          {earnings.map(([label, detail, value]) => (
            <tr key={label}><th>{label}</th><td>{detail}</td><td>{cell(value)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><th>إجمالي المستحقات</th><td /><td>{money(totalEarnings)}</td></tr></tfoot>
      </table>

      <h3 className="payslip-heading">الاستقطاعات</h3>
      <table className="payslip-table is-amounts">
        <thead><tr><th>البند</th><th>التفصيل</th><th>المبلغ</th></tr></thead>
        <tbody>
          {deductions.map(([label, detail, value]) => (
            <tr key={label}><th>{label}</th><td>{detail}</td><td>{cell(value)}</td></tr>
          ))}
        </tbody>
        <tfoot><tr><th>إجمالي الاستقطاعات</th><td /><td>{money(totalDeductions)}</td></tr></tfoot>
      </table>

      <div className="payslip-net">
        <div>
          <strong>صافي المستحق</strong>
          <small>إجمالي المستحقات − إجمالي الاستقطاعات</small>
        </div>
        <b>{money(item.net_salary)} <span>ج.م</span></b>
      </div>
      <p className="payslip-words">{amountInWords(item.net_salary)}</p>

      {advance && (
        <>
          <h3 className="payslip-heading">رصيد السلفة بعد الخصم</h3>
          <table className="payslip-table">
            <thead><tr><th>أصل السلفة</th><th>المسدد</th><th>المتبقي</th><th>الأقساط المتبقية</th></tr></thead>
            <tbody>
              <tr>
                <td>{money(advance.amount)}</td>
                <td>{money(advance.repaid_amount)}</td>
                <td>{money(advanceRemaining)}</td>
                <td>{money(Math.ceil(advanceRemaining / Math.max(1, installmentValue)))} أقساط</td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      <div className="payslip-signatures">
        <span>توقيع الموظف بالاستلام</span>
        <span>اعتماد الإدارة</span>
      </div>
      <p className="payslip-foot">
        قسيمة صادرة آليًا من نظام إدارة المنشأة. في حال وجود اعتراض يُرجى مراجعة شؤون الموظفين خلال سبعة أيام من تاريخ الصرف.
      </p>
    </div>
  );
}

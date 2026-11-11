// Display helpers for the case files table. Amounts are EGP; session dates are local "YYYY-MM-DDTHH:mm".
export const CLIENT_ROLE_LABELS = {
  plaintiff: 'مدعٍ',
  defendant: 'مدعى عليه',
  appellant: 'مستأنف',
  appellee: 'مستأنف ضده',
};

export const CASE_TYPES = [
  { key: 'all', label: 'جميع الأنواع' },
  { key: 'civil', label: 'مدني وتعويضات' },
  { key: 'commercial', label: 'تجاري وشركات' },
  { key: 'criminal', label: 'جنائي وجنح' },
  { key: 'labor', label: 'عمالي ومنازعات عمل' },
  { key: 'family', label: 'أسرة وأحوال شخصية' },
  { key: 'contracts', label: 'استشارات وعقود' },
];

export const BILLING_TYPES = [
  ['fixed', 'مقطوعة', 'مبلغ واحد متفق عليه لكل مراحل التقاضي.'],
  ['hourly', 'بالساعة', 'الأتعاب تُحسب من ساعات العمل المسجلة على الملف.'],
  ['contingency', 'نسبة من المحكوم به', 'نسبة من قيمة الحكم، ويمكن تسجيل مقدم أتعاب الآن.'],
];

export const CASE_STATUSES = [
  ['active', 'متداولة'],
  ['adjourned', 'مؤجلة'],
  ['judged', 'محكوم بها'],
  ['appealed', 'مستأنفة'],
  ['closed', 'منتهية'],
];

export const formatMoney = (value) => Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 });

/** Paid vs agreed fees; `percent` is clamped to 0..100 for the progress bar. */
export function feeProgress({ contract_amount: contract, paid_amount: paidValue } = {}) {
  const total = Math.max(Number(contract) || 0, 0);
  const paid = Math.max(Number(paidValue) || 0, 0);
  const remaining = Math.max(total - paid, 0);
  return {
    total,
    paid,
    remaining,
    percent: total ? Math.min(100, Math.round((paid / total) * 100)) : 0,
    settled: total > 0 && remaining === 0,
  };
}

function parseLocalDate(value) {
  const date = new Date(String(value || '').replace(' ', 'T'));
  return Number.isNaN(date.getTime()) ? null : date;
}

/** '2026-11-14T10:00' -> { label: '14 نوفمبر', note: 'مرافعة' }; without a session the note explains why. */
export function nextSessionInfo(legalCase, now = new Date()) {
  const date = parseLocalDate(legalCase?.next_session_date);
  if (date) {
    const options = { day: 'numeric', month: 'long' };
    if (date.getFullYear() !== now.getFullYear()) options.year = 'numeric';
    return {
      label: date.toLocaleDateString('ar-EG-u-nu-latn', options),
      note: legalCase.next_session_reason || 'جلسة',
    };
  }
  const notes = {
    judged: 'صدر الحكم',
    closed: 'الملف منتهٍ',
    appealed: 'بانتظار جلسة الاستئناف',
  };
  return { label: null, note: notes[legalCase?.status] || 'بانتظار تحديد جلسة' };
}

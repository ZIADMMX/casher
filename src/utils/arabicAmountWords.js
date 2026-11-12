// تفقيط المبالغ بالعربي لقسائم الرواتب والإيصالات المطبوعة.

const ONES = ['', 'واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة',
  'أحد عشر', 'اثنا عشر', 'ثلاثة عشر', 'أربعة عشر', 'خمسة عشر', 'ستة عشر', 'سبعة عشر', 'ثمانية عشر', 'تسعة عشر'];
const TENS = ['', '', 'عشرون', 'ثلاثون', 'أربعون', 'خمسون', 'ستون', 'سبعون', 'ثمانون', 'تسعون'];
const HUNDREDS = ['', 'مائة', 'مئتان', 'ثلاثمائة', 'أربعمائة', 'خمسمائة', 'ستمائة', 'سبعمائة', 'ثمانمائة', 'تسعمائة'];

// [مفرد، مثنى، جمع] لكل خانة
const SCALES = [null, ['ألف', 'ألفان', 'آلاف'], ['مليون', 'مليونان', 'ملايين'], ['مليار', 'ملياران', 'مليارات']];

const MAX = 1_000_000_000_000; // أكبر من كده مش بيتفقّط

function underThousand(number) {
  const parts = [];
  const hundreds = Math.floor(number / 100);
  const rest = number % 100;
  if (hundreds) parts.push(HUNDREDS[hundreds]);
  if (rest < 20) {
    if (rest) parts.push(ONES[rest]);
  } else {
    const unit = rest % 10;
    const ten = TENS[Math.floor(rest / 10)];
    parts.push(unit ? `${ONES[unit]} و${ten}` : ten);
  }
  return parts.join(' و');
}

/** العدد الصحيح بالحروف: 13000 -> "ثلاثة عشر ألف". */
export function integerInWords(value) {
  const number = Math.floor(Math.abs(Number(value) || 0));
  if (number === 0) return 'صفر';
  if (number >= MAX) return String(number);

  const groups = [];
  for (let rest = number, index = 0; rest > 0; rest = Math.floor(rest / 1000), index += 1) {
    const group = rest % 1000;
    if (!group) continue;
    const scale = SCALES[index];
    if (!scale) groups.unshift(underThousand(group));
    else if (group === 1) groups.unshift(scale[0]);
    else if (group === 2) groups.unshift(scale[1]);
    else groups.unshift(`${underThousand(group)} ${group <= 10 ? scale[2] : scale[0]}`);
  }
  return groups.join(' و');
}

/**
 * المبلغ كامل بصيغة القسيمة: "فقط ثلاثة عشر ألف جنيه مصري لا غير."
 * الكسور بتتقرّب لأقرب قرش.
 */
export function amountInWords(value, currency = 'جنيه مصري') {
  const amount = Math.round((Number(value) || 0) * 100) / 100;
  const negative = amount < 0;
  const absolute = Math.abs(amount);
  const pounds = Math.floor(absolute);
  const piasters = Math.round((absolute - pounds) * 100);

  let text = `${integerInWords(pounds)} ${currency}`;
  if (piasters) text += ` و${integerInWords(piasters)} قرشًا`;
  return `فقط ${negative ? 'سالب ' : ''}${text} لا غير.`;
}

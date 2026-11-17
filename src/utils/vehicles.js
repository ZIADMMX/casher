const AR = '٠١٢٣٤٥٦٧٨٩';

export const toArabicDigits = (s) => String(s ?? '').replace(/\d/g, (d) => AR[d]);

/** "قنر3481" -> { letters: 'ق ن ر', digits: '٣٤٨١' } (letters on the right, digits on the left, like the metal plate). */
export function splitPlate(plate) {
  const raw = String(plate || '');
  const digits = (raw.match(/[0-9٠-٩]+/g) || []).join('');
  const letters = raw.replace(/[0-9٠-٩\s-]/g, '').split('').join(' ');
  return { letters, digits: toArabicDigits(digits.replace(/[٠-٩]/g, (d) => AR.indexOf(d))) };
}

export const PLATE_KINDS = {
  private: { label: 'ملاكي', tone: 'blue' },
  authority: { label: 'هيئة وطنية', tone: 'green', city: 'هيئة وطنية' },
  military: { label: 'القوات المسلحة', tone: 'black', city: 'القوات المسلحة' },
};

export const GOVERNORATES = [
  'القاهرة', 'الجيزة', 'الإسكندرية', 'القليوبية', 'الدقهلية', 'الشرقية', 'الغربية', 'المنوفية',
  'البحيرة', 'كفر الشيخ', 'دمياط', 'بورسعيد', 'الإسماعيلية', 'السويس', 'الفيوم', 'بني سويف',
  'المنيا', 'أسيوط', 'سوهاج', 'قنا', 'الأقصر', 'أسوان', 'البحر الأحمر', 'مطروح', 'شمال سيناء', 'جنوب سيناء',
];

// Colours the car dot next to its name. Unknown colours fall back to grey.
export const CAR_COLORS = {
  أبيض: '#E8E4DF', أسود: '#2B2B2B', فضي: '#BFC3C7', رمادي: '#8A8F94', أحمر: '#D94B3A',
  أزرق: '#2F5BA8', أخضر: '#3F8F5B', أصفر: '#E0B72B', بيج: '#D9C7A8', برتقالي: '#E8833A', بني: '#7A5638', ذهبي: '#C8A24A',
};
export const carColorHex = (name) => CAR_COLORS[Object.keys(CAR_COLORS).find((k) => String(name || '').includes(k))] || '#C9BDB2';

export const NEXT_TONE = { overdue: 'bad', soon: 'warn', ok: 'ok', none: 'blue' };

export const km = (v) => `${(Number(v) || 0).toLocaleString('en-US')} كم`;
export const longDate = (v) => (v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('ar-EG-u-nu-latn', { day: 'numeric', month: 'long', year: 'numeric' }) : null);

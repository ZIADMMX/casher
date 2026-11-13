// Courts directory data shared by the list and the court page, plus the CSV import/export round-trip.

export const COURT_TYPES = [
  { value: 'first_instance', label: 'أول درجة', mark: '١' },
  { value: 'cassation', label: 'النقض', mark: '٢' },
  { value: 'appeals', label: 'الاستئناف', mark: '٣' },
  { value: 'family', label: 'الأسرة', mark: '٤' },
  { value: 'criminal', label: 'الجنائية', mark: '٥' },
  { value: 'commercial', label: 'التجارية', mark: '٦' },
  { value: 'labor', label: 'العمالية', mark: '٧' },
  { value: 'administrative', label: 'الإدارية', mark: '٨' },
];

export const typeLabel = (value) => COURT_TYPES.find((type) => type.value === value)?.label || value || '—';

// Same columns the export writes, so an exported file imports back unchanged.

export const CSV_HEADER = ['المحكمة', 'النوع', 'الاختصاص', 'المدينة', 'العنوان', 'الهاتف', 'مواعيد العمل', 'القضايا', 'الحالة', 'ملاحظات'];

const FIELD_BY_HEADER = {
  'المحكمة': 'name',
  'اسم المحكمة': 'name',
  'النوع': 'court_type',
  'نوع المحكمة': 'court_type',
  'الاختصاص': 'specialization',
  'المدينة': 'city',
  'العنوان': 'address',
  'الهاتف': 'phone',
  'مواعيد العمل': 'working_hours',
  'ملاحظات': 'notes',
};

export function csvCell(value) {
  const text = String(value ?? '');
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** RFC-4180 style parser: quoted cells may hold commas, quotes ("") and new lines. */
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  const raw = String(text || '');
  const source = raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw; // Excel's BOM
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i += 1;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((cells) => cells.some((value) => value.trim()));
}

export function csvToCourts(text) {
  return tableToCourts(parseCsv(text));
}

/** Maps [header, ...rows] from a CSV or Excel sheet to court payloads; the type column accepts the Arabic label or the stored value. */
export function tableToCourts([header = [], ...rows]) {
  const fields = header.map((title) => FIELD_BY_HEADER[String(title ?? '').trim()]);
  if (!fields.includes('name')) throw new Error('الملف لازم يحتوي على عمود «المحكمة».');
  return rows.map((cells) => {
    const court = {};
    fields.forEach((field, index) => { if (field) court[field] = String(cells[index] ?? '').trim(); });
    const type = COURT_TYPES.find((item) => item.label === court.court_type || item.value === court.court_type);
    court.court_type = type ? type.value : 'first_instance'; // unknown type: lands as first instance, editable later
    return court;
  }).filter((court) => court.name);
}

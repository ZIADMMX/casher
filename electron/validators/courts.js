const COURT_TYPES = Object.freeze([
  'first_instance',
  'cassation',
  'appeals',
  'family',
  'criminal',
  'commercial',
  'labor',
  'administrative',
]);

const COURT_FIELDS = {
  name: { label: 'اسم المحكمة', maxLength: 180 },
  court_type: { label: 'نوع المحكمة', maxLength: 40 },
  specialization: { label: 'الاختصاص القضائي', maxLength: 180 },
  notes: { label: 'الملاحظات', maxLength: 2000 },
  phone: { label: 'الهاتف', maxLength: 40 },
  city: { label: 'المدينة', maxLength: 100 },
  address: { label: 'العنوان', maxLength: 300 },
};

function validateCourtInput(input, { partial = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new Error('بيانات المحكمة غير صالحة');
  }

  const result = {};
  for (const [field, { label, maxLength }] of Object.entries(COURT_FIELDS)) {
    if (!Object.hasOwn(input, field)) {
      if (!partial && ['name', 'court_type'].includes(field)) {
        throw new Error(`${label} مطلوب`);
      }
      continue;
    }

    const raw = input[field];
    if (typeof raw !== 'string') throw new Error(`${label} غير صالح`);
    const value = raw.trim();
    if (!partial && ['name', 'court_type'].includes(field) && !value) {
      throw new Error(`${label} مطلوب`);
    }
    if (field === 'name' && value.length < 2) throw new Error('اسم المحكمة يجب أن يتكون من حرفين على الأقل');
    if (value.length > maxLength) throw new Error(`${label} أطول من الحد المسموح`);
    if (field === 'court_type' && !COURT_TYPES.includes(value)) {
      throw new Error('نوع المحكمة غير معتمد');
    }
    result[field] = value || null;
  }

  if (Object.hasOwn(input, 'is_active')) {
    if (typeof input.is_active !== 'boolean') throw new Error('حالة المحكمة غير صالحة');
    result.is_active = input.is_active;
  }

  return result;
}

function isCourtId(value) {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

module.exports = { COURT_TYPES, validateCourtInput, isCourtId };

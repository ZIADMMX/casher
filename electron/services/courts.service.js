const { randomUUID } = require('node:crypto');
const courtsRepository = require('../repositories/courts.repository');
const { COURT_TYPES, validateCourtInput, isCourtId } = require('../validators/courts');

function normalizeFilters(filters = {}) {
  const page = Number(filters.page ?? 1);
  const pageSize = Number(filters.pageSize ?? 10);
  if (!Number.isSafeInteger(page) || page < 1) throw new Error('رقم الصفحة غير صالح');
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
    throw new Error('عدد النتائج في الصفحة يجب أن يكون بين 1 و100');
  }

  const status = filters.status || 'active';
  if (!['active', 'inactive', 'all'].includes(status)) throw new Error('حالة المحكمة غير صالحة');
  if (filters.courtType && !COURT_TYPES.includes(filters.courtType)) {
    throw new Error('نوع المحكمة غير معتمد');
  }
  return {
    search: typeof filters.search === 'string' ? filters.search.slice(0, 180) : '',
    courtType: typeof filters.courtType === 'string' ? filters.courtType : '',
    status,
    page,
    pageSize,
  };
}

function getCourts(filters) {
  return courtsRepository.getCourts(normalizeFilters(filters));
}

function getCourtById(id) {
  if (!isCourtId(id)) throw new Error('معرّف المحكمة غير صالح');
  return courtsRepository.getCourtById(id);
}

function createCourt(input) {
  const data = validateCourtInput(input);
  try {
    return courtsRepository.createCourt(randomUUID(), data);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      error.message = 'يوجد محكمة نشطة بهذا الاسم بالفعل';
      error.statusCode = 409;
    }
    throw error;
  }
}

function updateCourt(id, input) {
  if (!isCourtId(id)) throw new Error('معرّف المحكمة غير صالح');
  const data = validateCourtInput(input, { partial: true });
  try {
    return courtsRepository.updateCourt(id, data);
  } catch (error) {
    if (error.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      error.message = 'يوجد محكمة نشطة بهذا الاسم بالفعل';
      error.statusCode = 409;
    }
    throw error;
  }
}

function deactivateCourt(id) {
  if (!isCourtId(id)) throw new Error('معرّف المحكمة غير صالح');
  return courtsRepository.deactivateCourt(id);
}

module.exports = {
  getCourts, getCourtById, createCourt, updateCourt, deactivateCourt,
  getCourtsOverview: () => courtsRepository.getCourtsOverview(),
};

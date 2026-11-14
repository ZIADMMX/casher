const repo = require('../repositories/gymMembers.repository');
const customersRepo = require('../repositories/customers.repository');

const EMPTY = { emergency_name: null, emergency_phone: null, health_notes: null, trainer_id: null, trainer_name: null };

// Text from the form: trimmed, empty becomes null, and over-long input is rejected, not cut.
function cleanText(value, max, label) {
  const text = String(value ?? '').trim();
  if (text.length > max) throw new Error(`${label} لا يزيد عن ${max} حرفًا`);
  return text || null;
}

function getMemberProfile(customerId) {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0) throw new Error('العميل غير صحيح');
  return repo.getProfile(id) || { customer_id: id, ...EMPTY };
}

function saveMemberProfile(customerId, data = {}) {
  const id = Number(customerId);
  if (!Number.isInteger(id) || id <= 0 || !customersRepo.getById(id)) throw new Error('العميل غير موجود');

  const phone = cleanText(data.emergency_phone, 30, 'رقم الطوارئ');
  if (phone && !/^[0-9+()\-\s]{5,30}$/.test(phone)) throw new Error('رقم هاتف الطوارئ غير صحيح');
  const trainerId = data.trainer_id ? Number(data.trainer_id) : null;
  if (trainerId && !repo.trainerExists(trainerId)) throw new Error('المدرب غير موجود أو غير نشط');

  repo.saveProfile(id, {
    emergency_name: cleanText(data.emergency_name, 80, 'اسم جهة الطوارئ'),
    emergency_phone: phone,
    health_notes: cleanText(data.health_notes, 1000, 'الملاحظات الصحية'),
    trainer_id: trainerId,
  });
  return repo.getProfile(id);
}

module.exports = { getMemberProfile, saveMemberProfile };

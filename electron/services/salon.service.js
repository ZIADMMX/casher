const salonRepo = require('../repositories/salon.repository');
const { db } = require('../database/db');
const { getCurrentSession } = require('./auth.service');

/**
 * Salon & Beauty Center Service
 * إدارة منطق الكراسي، المصففين، المواعيد، تذكيرات الواتساب، والعمولات
 */

// 1. الكراسي
function getAllChairs() {
  return salonRepo.getAllChairs();
}

function createChair(data) {
  if (!data.name || !data.name.trim()) throw new Error('اسم الكرسي أو المحطة مطلوب');
  return salonRepo.createChair(data);
}

function updateChair(id, data) {
  if (!id) throw new Error('معرف الكرسي مطلوب');
  return salonRepo.updateChair(id, data);
}

function setChairStatus(id, status) {
  const allowed = ['available', 'occupied', 'cleaning', 'maintenance'];
  if (!allowed.includes(status)) throw new Error('حالة الكرسي غير صحيحة');
  return salonRepo.setChairStatus(id, status);
}

function deleteChair(id) {
  return salonRepo.deleteChair(id);
}

// 2. الخدمات
function getAllServices(category) {
  return salonRepo.getAllServices(category);
}

function createService(data) {
  if (!data.name || !data.name.trim()) throw new Error('اسم الخدمة مطلوب');
  if (data.price === undefined || Number(data.price) < 0) throw new Error('سعر الخدمة غير صحيح');
  return salonRepo.createService({
    name: data.name.trim(),
    category: data.category || 'عام',
    duration_minutes: Number(data.duration_minutes) || 30,
    price: Number(data.price),
    cost_price: Number(data.cost_price) || 0,
    commission_type: data.commission_type || 'percentage',
    commission_value: Number(data.commission_value) || 0,
    required_station_type: data.required_station_type || null,
    description: data.description || '',
  });
}

function updateService(id, data) {
  if (!id) throw new Error('معرف الخدمة مطلوب');
  return salonRepo.updateService(id, data);
}

function deleteService(id) {
  return salonRepo.deleteService(id);
}

// 3. الباقات وكروت الزيارات
function getAllPackages() {
  return salonRepo.getAllPackages();
}

function createPackage(data) {
  if (!data.name || !data.name.trim()) throw new Error('اسم الباقة مطلوب');
  if (!data.price || Number(data.price) <= 0) throw new Error('سعر الباقة مطلوب');
  if (!data.total_visits || Number(data.total_visits) <= 0) throw new Error('عدد الزيارات مطلوب');
  return salonRepo.createPackage(data);
}

function subscribeCustomerToPackage(data) {
  if (!data.package_id || !data.customer_id) throw new Error('الباقة والعميل مطلوبان');
  return salonRepo.subscribeCustomerToPackage(data);
}

function getCustomerActiveSubscriptions(customerId) {
  if (!customerId) return [];
  return salonRepo.getCustomerActiveSubscriptions(customerId);
}

// 4. الحجوزات وجدول المواعيد مع فحص التعارض وتذكير واتساب
function getAppointments(filters) {
  return salonRepo.getAppointments(filters);
}

function createAppointment(data) {
  if (!data.service_id) throw new Error('الخدمة مطلوبة');
  if (!data.customer_name || !data.customer_name.trim()) throw new Error('اسم العميل مطلوب');
  if (!data.appointment_date || !data.start_time) throw new Error('تاريخ ووقت الموعد مطلوبان');

  // فحص عدم تعارض موعد الكرسي لو تم تحديده
  if (data.chair_id) {
    const conflict = db.prepare(`
      SELECT id, customer_name, start_time, end_time 
      FROM salon_appointments 
      WHERE chair_id = ? 
        AND appointment_date = ? 
        AND status IN ('booked', 'confirmed', 'in_service')
        AND (
          (start_time <= ? AND end_time > ?) OR
          (start_time < ? AND end_time >= ?) OR
          (start_time >= ? AND start_time < ?)
        )
    `).get(
      data.chair_id,
      data.appointment_date,
      data.start_time,
      data.start_time,
      data.start_time,
      data.start_time,
      data.start_time,
      data.start_time
    );

    if (conflict) {
      throw new Error(`الكرسي محجوز بالفعل في هذا التوقيت للعميل (${conflict.customer_name})`);
    }
  }

  // فحص عدم تعارض المصفف لو تم تحديده
  if (data.stylist_id) {
    const conflictStylist = db.prepare(`
      SELECT id, customer_name, start_time, end_time 
      FROM salon_appointments 
      WHERE stylist_id = ? 
        AND appointment_date = ? 
        AND status IN ('booked', 'confirmed', 'in_service')
        AND (
          (start_time <= ? AND end_time > ?) OR
          (start_time < ? AND end_time >= ?)
        )
    `).get(data.stylist_id, data.appointment_date, data.start_time, data.start_time, data.start_time, data.start_time);

    if (conflictStylist) {
      throw new Error(`المصفف مرتبط بحجز آخر في هذا الوقت للعميل (${conflictStylist.customer_name})`);
    }
  }

  return salonRepo.createAppointment(data);
}

function updateAppointmentStatus(id, status, saleId = null) {
  if (!id) throw new Error('معرف الحجز مطلوب');
  return salonRepo.updateAppointmentStatus(id, status, saleId);
}

/**
 * إنشاء رابط واتساب تذكيري فوري مباشر بالرسالة
 */
function generateWhatsAppReminderLink(appointmentId) {
  const appt = salonRepo.getAppointmentById(appointmentId);
  if (!appt) throw new Error('الحجز غير موجود');
  if (!appt.customer_phone) throw new Error('رقم هاتف العميل غير مسجل');

  let phone = appt.customer_phone.replace(/\D/g, '');
  // إضافة مفتاح الدولة مصر افتراضياً لو بدأ بـ 01
  if (phone.startsWith('01') && phone.length === 11) {
    phone = '2' + phone;
  }

  const message = appt.whatsapp_message || `مرحباً أستاذ ${appt.customer_name}، نذكرك بموعدك لخدمة ${appt.service_name} يوم ${appt.appointment_date} الساعة ${appt.start_time}. نسعد بزيارتك! ✂️💈`;
  const encodedMsg = encodeURIComponent(message);

  return {
    phone,
    message,
    url: `https://api.whatsapp.com/send?phone=${phone}&text=${encodedMsg}`,
  };
}

// 5. تسجيل الخدمات والمبيعات وحساب العمولات
function logSalonServiceSale(data) {
  return salonRepo.logSalonServiceSale(data);
}

function getStylistCommissionsSummary(filters = {}) {
  return salonRepo.getStylistCommissionsSummary(
    filters.stylist_id,
    filters.startDate,
    filters.endDate
  );
}

// 6. تهيئة بيانات افتراضية لقطاع الصالونات إن لم تكن موجودة
function seedSalonDefaultsIfEmpty() {
  const chairCount = db.prepare('SELECT COUNT(*) as count FROM salon_chairs').get();
  if (chairCount.count === 0) {
    salonRepo.createChair({ name: 'كرسي 1 (حلاقة كلاسيك)', station_type: 'barber_chair' });
    salonRepo.createChair({ name: 'كرسي 2 (حلاقة وذقن VIP)', station_type: 'barber_chair' });
    salonRepo.createChair({ name: 'كرسي 3 (استشوار وتصفيف)', station_type: 'hair_styling' });
    salonRepo.createChair({ name: 'ركن تنظيف البشرة والسبا', station_type: 'skincare' });
  }

  const serviceCount = db.prepare('SELECT COUNT(*) as count FROM salon_services').get();
  if (serviceCount.count === 0) {
    salonRepo.createService({
      name: 'قص شعر وتصفيف استشوار',
      category: 'شعر',
      duration_minutes: 30,
      price: 150,
      commission_type: 'percentage',
      commission_value: 20,
    });
    salonRepo.createService({
      name: 'حلاقة ذقن وتحديد بالبخار',
      category: 'ذقن',
      duration_minutes: 20,
      price: 80,
      commission_type: 'percentage',
      commission_value: 20,
    });
    salonRepo.createService({
      name: 'جلسة تنظيف بشرة ماسك وماكينة بخار',
      category: 'عناية وبشرة',
      duration_minutes: 45,
      price: 250,
      commission_type: 'fixed',
      commission_value: 50,
    });
    salonRepo.createService({
      name: 'بروتين علاجي للشعر وتنعيم',
      category: 'علاجات الشعر',
      duration_minutes: 90,
      price: 800,
      commission_type: 'percentage',
      commission_value: 25,
    });
    salonRepo.createService({
      name: 'باكج عريس كامل (شعر + ذقن + حمام بخار + ماسكات)',
      category: 'باكجات عرسان',
      duration_minutes: 120,
      price: 1200,
      commission_type: 'fixed',
      commission_value: 300,
    });
  }

  const pkgCount = db.prepare('SELECT COUNT(*) as count FROM salon_packages').get();
  if (pkgCount.count === 0) {
    salonRepo.createPackage({
      name: 'كارت باقة 5 قصات شعر + 1 هدية',
      price: 600,
      total_visits: 6,
      validity_days: 120,
      description: 'كارت زيارات توفيري يمنحك 6 قصات شعر بسعر 4',
    });
    salonRepo.createPackage({
      name: 'باقة العناية الشهرية الشاملة',
      price: 900,
      total_visits: 4,
      validity_days: 30,
      description: 'جلسة أسبوعية تتضمن حلاقة كاملة وتنظيف بشرة ومساج',
    });
  }
}

function seatCustomerOnChair(data) {
  return salonRepo.seatCustomerOnChair(data);
}

function vacateChair(chairId) {
  return salonRepo.vacateChair(chairId);
}

function completeChairService(data) {
  const session = getCurrentSession();
  return salonRepo.completeChairService({
    ...data,
    userId: session?.id || null,
  });
}

function getBarbersWithStats(filters = {}) {
  return salonRepo.getBarbersWithStats(filters);
}

function getStylistDetailedLedger(stylistId, filters = {}) {
  return salonRepo.getStylistDetailedLedger(stylistId, filters.startDate, filters.endDate);
}

function getAllCoupons() {
  return salonRepo.getAllCoupons();
}

function createCoupon(data) {
  return salonRepo.createCoupon(data);
}

function deleteCoupon(id) {
  return salonRepo.deleteCoupon(id);
}

function applyCoupon(code, amount) {
  return salonRepo.applyCoupon(code, amount);
}

function getTipPoolSummary(filters = {}) {
  return salonRepo.getTipPoolSummary(filters.startDate, filters.endDate);
}

module.exports = {
  getAllChairs,
  createChair,
  updateChair,
  setChairStatus,
  deleteChair,
  seatCustomerOnChair,
  vacateChair,
  completeChairService,
  getAllServices,
  createService,
  updateService,
  deleteService,
  getAllPackages,
  createPackage,
  subscribeCustomerToPackage,
  getCustomerActiveSubscriptions,
  getAppointments,
  createAppointment,
  updateAppointmentStatus,
  generateWhatsAppReminderLink,
  logSalonServiceSale,
  getStylistCommissionsSummary,
  getBarbersWithStats,
  getStylistDetailedLedger,
  getAllCoupons,
  createCoupon,
  deleteCoupon,
  applyCoupon,
  getTipPoolSummary,
  seedSalonDefaultsIfEmpty,
};


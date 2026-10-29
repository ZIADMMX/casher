const { db } = require('../database/db');

/**
 * Salon & Barber Repository
 * مستودع بيانات الصالونات: الكراسي، الخدمات، المصففين، الباكجات، والحجوزات
 */

// ==========================================
// 1. الكراسي ومحطات العمل (Chairs & Stations)
// ==========================================

function getAllChairs() {
  return db.prepare(`
    SELECT 
      c.*,
      u.full_name as default_stylist_name,
      u.username as default_stylist_username
    FROM salon_chairs c
    LEFT JOIN users u ON c.default_stylist_id = u.id
    WHERE c.is_active = 1
    ORDER BY c.id ASC
  `).all();
}

function getChairById(id) {
  return db.prepare(`
    SELECT c.*, u.full_name as default_stylist_name
    FROM salon_chairs c
    LEFT JOIN users u ON c.default_stylist_id = u.id
    WHERE c.id = ?
  `).get(id);
}

function createChair({ name, station_type = 'barber_chair', default_stylist_id = null, notes = '' }) {
  const stmt = db.prepare(`
    INSERT INTO salon_chairs (name, station_type, default_stylist_id, notes)
    VALUES (?, ?, ?, ?)
  `);
  const res = stmt.run(name, station_type, default_stylist_id, notes);
  return getChairById(res.lastInsertRowid);
}

function updateChair(id, { name, station_type, status, default_stylist_id, notes }) {
  db.prepare(`
    UPDATE salon_chairs
    SET name = COALESCE(?, name),
        station_type = COALESCE(?, station_type),
        status = COALESCE(?, status),
        default_stylist_id = ?,
        notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(name, station_type, status, default_stylist_id, notes, id);
  return getChairById(id);
}

function setChairStatus(id, status) {
  db.prepare(`UPDATE salon_chairs SET status = ? WHERE id = ?`).run(status, id);
  return getChairById(id);
}

function deleteChair(id) {
  return db.prepare(`UPDATE salon_chairs SET is_active = 0 WHERE id = ?`).run(id);
}

// ==========================================
// 2. الخدمات والمدد والأسعار (Services & Durations)
// ==========================================

function getAllServices(category = null) {
  if (category && category !== 'all' && category !== 'الكل') {
    return db.prepare(`
      SELECT * FROM salon_services
      WHERE is_active = 1 AND category = ?
      ORDER BY name ASC
    `).all(category);
  }
  return db.prepare(`
    SELECT * FROM salon_services
    WHERE is_active = 1
    ORDER BY category ASC, name ASC
  `).all();
}

function getServiceById(id) {
  return db.prepare(`SELECT * FROM salon_services WHERE id = ?`).get(id);
}

function createService({
  name,
  category = 'عام',
  duration_minutes = 30,
  price = 0,
  cost_price = 0,
  commission_type = 'percentage',
  commission_value = 0,
  required_station_type = null,
  description = '',
}) {
  const stmt = db.prepare(`
    INSERT INTO salon_services (
      name, category, duration_minutes, price, cost_price,
      commission_type, commission_value, required_station_type, description
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(
    name,
    category,
    duration_minutes,
    price,
    cost_price,
    commission_type,
    commission_value,
    required_station_type,
    description
  );
  return getServiceById(res.lastInsertRowid);
}

function updateService(id, fields) {
  const current = getServiceById(id);
  if (!current) throw new Error('الخدمة غير موجودة');

  db.prepare(`
    UPDATE salon_services
    SET name = ?, category = ?, duration_minutes = ?, price = ?, cost_price = ?,
        commission_type = ?, commission_value = ?, required_station_type = ?, description = ?
    WHERE id = ?
  `).run(
    fields.name ?? current.name,
    fields.category ?? current.category,
    fields.duration_minutes ?? current.duration_minutes,
    fields.price ?? current.price,
    fields.cost_price ?? current.cost_price,
    fields.commission_type ?? current.commission_type,
    fields.commission_value ?? current.commission_value,
    fields.required_station_type ?? current.required_station_type,
    fields.description ?? current.description,
    id
  );
  return getServiceById(id);
}

function deleteService(id) {
  return db.prepare(`UPDATE salon_services SET is_active = 0 WHERE id = ?`).run(id);
}

// ==========================================
// 3. باقات وكروت الزيارات (Salon Packages)
// ==========================================

function getAllPackages() {
  return db.prepare(`
    SELECT * FROM salon_packages
    WHERE is_active = 1
    ORDER BY price ASC
  `).all();
}

function getPackageById(id) {
  return db.prepare(`SELECT * FROM salon_packages WHERE id = ?`).get(id);
}

function createPackage({ name, price, total_visits, validity_days = 90, included_services_json = '[]', description = '' }) {
  const stmt = db.prepare(`
    INSERT INTO salon_packages (name, price, total_visits, validity_days, included_services_json, description)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const res = stmt.run(name, price, total_visits, validity_days, included_services_json, description);
  return getPackageById(res.lastInsertRowid);
}

// اشتراكات كروت الزيارات للعملاء
function subscribeCustomerToPackage({ package_id, customer_id, customer_name, customer_phone, sale_id = null, notes = '' }) {
  const pkg = getPackageById(package_id);
  if (!pkg) throw new Error('الباقة غير موجودة');

  const today = new Date();
  const startDate = today.toISOString().split('T')[0];
  const endDateObj = new Date(today);
  endDateObj.setDate(today.getDate() + (pkg.validity_days || 90));
  const endDate = endDateObj.toISOString().split('T')[0];

  const stmt = db.prepare(`
    INSERT INTO salon_package_subscriptions (
      package_id, customer_id, customer_name, customer_phone,
      total_visits, remaining_visits, start_date, end_date, status, sale_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `);
  const res = stmt.run(
    package_id,
    customer_id,
    customer_name,
    customer_phone,
    pkg.total_visits,
    pkg.total_visits,
    startDate,
    endDate,
    sale_id,
    notes
  );
  return db.prepare(`SELECT * FROM salon_package_subscriptions WHERE id = ?`).get(res.lastInsertRowid);
}

function getCustomerActiveSubscriptions(customerId) {
  return db.prepare(`
    SELECT s.*, p.name as package_name, p.included_services_json
    FROM salon_package_subscriptions s
    JOIN salon_packages p ON s.package_id = p.id
    WHERE s.customer_id = ? AND s.status = 'active' AND s.remaining_visits > 0
    ORDER BY s.end_date ASC
  `).all(customerId);
}

function deductSubscriptionVisit(subscriptionId) {
  const sub = db.prepare(`SELECT * FROM salon_package_subscriptions WHERE id = ?`).get(subscriptionId);
  if (!sub || sub.remaining_visits <= 0) {
    throw new Error('لا يوجد رصيد زيارات متبقي في هذا الكارت');
  }

  const remaining = sub.remaining_visits - 1;
  const status = remaining === 0 ? 'completed' : 'active';

  db.prepare(`
    UPDATE salon_package_subscriptions
    SET remaining_visits = ?, status = ?
    WHERE id = ?
  `).run(remaining, status, subscriptionId);

  return db.prepare(`SELECT * FROM salon_package_subscriptions WHERE id = ?`).get(subscriptionId);
}

// ==========================================
// 4. الحجوزات والمواعيد (Salon Appointments)
// ==========================================

function getAppointments(filters = {}) {
  let sql = `
    SELECT 
      a.*,
      s.name as service_name,
      s.duration_minutes as service_duration,
      s.price as service_price,
      c.name as chair_name,
      u.full_name as stylist_name,
      u.username as stylist_username
    FROM salon_appointments a
    JOIN salon_services s ON a.service_id = s.id
    LEFT JOIN salon_chairs c ON a.chair_id = c.id
    LEFT JOIN users u ON a.stylist_id = u.id
    WHERE 1=1
  `;
  const params = [];

  if (filters.date) {
    sql += ` AND a.appointment_date = ?`;
    params.push(filters.date);
  }
  if (filters.stylist_id) {
    sql += ` AND a.stylist_id = ?`;
    params.push(filters.stylist_id);
  }
  if (filters.chair_id) {
    sql += ` AND a.chair_id = ?`;
    params.push(filters.chair_id);
  }
  if (filters.status) {
    sql += ` AND a.status = ?`;
    params.push(filters.status);
  }

  sql += ` ORDER BY a.appointment_date ASC, a.start_time ASC`;
  return db.prepare(sql).all(...params);
}

function getAppointmentById(id) {
  return db.prepare(`
    SELECT 
      a.*,
      s.name as service_name,
      s.price as service_price,
      s.duration_minutes,
      c.name as chair_name,
      u.full_name as stylist_name
    FROM salon_appointments a
    JOIN salon_services s ON a.service_id = s.id
    LEFT JOIN salon_chairs c ON a.chair_id = c.id
    LEFT JOIN users u ON a.stylist_id = u.id
    WHERE a.id = ?
  `).get(id);
}

function createAppointment({
  service_id,
  chair_id = null,
  stylist_id = null,
  customer_id = null,
  customer_name,
  customer_phone,
  appointment_date,
  start_time,
  deposit_amount = 0,
  notes = '',
  created_by_user_id = null,
}) {
  const service = getServiceById(service_id);
  if (!service) throw new Error('الخدمة المطلوبة غير موجودة');

  // احتساب end_time تلقائياً بناء على مدة الخدمة
  const [h, m] = start_time.split(':').map(Number);
  const totalMinutes = h * 60 + m + (service.duration_minutes || 30);
  const endH = String(Math.floor(totalMinutes / 60) % 24).padStart(2, '0');
  const endM = String(totalMinutes % 60).padStart(2, '0');
  const endTime = `${endH}:${endM}`;

  // صياغة رسالة واتساب التذكيرية التلقائية
  const whatsappMsg = `مرحباً أستاذ ${customer_name}، نؤكد حجز موعدك لخدمة (${service.name}) في صالوننا يوم ${appointment_date} الساعة ${start_time}. نسعد بزيارتك! ✂️💈`;

  const stmt = db.prepare(`
    INSERT INTO salon_appointments (
      service_id, chair_id, stylist_id, customer_id, customer_name, customer_phone,
      appointment_date, start_time, end_time, status, deposit_amount, whatsapp_message, notes, created_by_user_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'booked', ?, ?, ?, ?)
  `);

  const res = stmt.run(
    service_id,
    chair_id,
    stylist_id,
    customer_id,
    customer_name,
    customer_phone,
    appointment_date,
    start_time,
    endTime,
    deposit_amount,
    whatsappMsg,
    notes,
    created_by_user_id
  );

  return getAppointmentById(res.lastInsertRowid);
}

function updateAppointmentStatus(id, status, saleId = null) {
  db.prepare(`
    UPDATE salon_appointments
    SET status = ?, sale_id = COALESCE(?, sale_id), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(status, saleId, id);

  // إذا بدأ في الخدمة، يمكن تحديث حالة الكرسي لمشغول
  const appt = getAppointmentById(id);
  if (appt?.chair_id) {
    if (status === 'in_service') {
      setChairStatus(appt.chair_id, 'occupied');
    } else if (status === 'completed' || status === 'cancelled') {
      setChairStatus(appt.chair_id, 'available');
    }
  }

  return appt;
}

// ==========================================
// 5. تسجيل الخدمات والعمولات في الفاتورة (Service Logs & Commissions)
// ==========================================

function logSalonServiceSale({
  sale_id = null,
  appointment_id = null,
  service_id,
  stylist_id,
  chair_id = null,
  package_subscription_id = null,
  notes = '',
}) {
  const service = getServiceById(service_id);
  if (!service) throw new Error('الخدمة غير موجودة');

  // حساب عمولة المصفف بدقة (نسبة أو مبلغ ثابت)
  let earnedCommission = 0;
  if (service.commission_type === 'percentage') {
    earnedCommission = Math.round(service.price * (service.commission_value / 100) * 100) / 100;
  } else {
    earnedCommission = service.commission_value || 0;
  }

  const stmt = db.prepare(`
    INSERT INTO salon_service_sales (
      sale_id, appointment_id, service_id, stylist_id, chair_id,
      service_price, commission_type, commission_value, earned_commission,
      package_subscription_id, notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const res = stmt.run(
    sale_id,
    appointment_id,
    service_id,
    stylist_id,
    chair_id,
    service.price,
    service.commission_type,
    service.commission_value,
    earnedCommission,
    package_subscription_id,
    notes
  );

  // خصم الزيارة لو من باقة
  if (package_subscription_id) {
    deductSubscriptionVisit(package_subscription_id);
  }

  // تحديث حالة الحجز لو مرتبط
  if (appointment_id) {
    updateAppointmentStatus(appointment_id, 'completed', sale_id);
  }

  return db.prepare(`SELECT * FROM salon_service_sales WHERE id = ?`).get(res.lastInsertRowid);
}

function getStylistCommissionsSummary(stylistId = null, startDate = null, endDate = null) {
  let sql = `
    SELECT 
      u.id as stylist_id,
      u.full_name as stylist_name,
      COUNT(ss.id) as services_count,
      COALESCE(SUM(ss.service_price), 0) as total_services_value,
      COALESCE(SUM(ss.earned_commission), 0) as total_commission
    FROM users u
    LEFT JOIN salon_service_sales ss ON u.id = ss.stylist_id
  `;
  const params = [];
  const conditions = [];

  if (stylistId) {
    conditions.push(`u.id = ?`);
    params.push(stylistId);
  }
  if (startDate) {
    conditions.push(`DATE(ss.created_at) >= ?`);
    params.push(startDate);
  }
  if (endDate) {
    conditions.push(`DATE(ss.created_at) <= ?`);
    params.push(endDate);
  }

  if (conditions.length > 0) {
    sql += ` WHERE ` + conditions.join(' AND ');
  }

  sql += ` GROUP BY u.id ORDER BY total_commission DESC`;
  return db.prepare(sql).all(...params);
}

// ==========================================
// 6. ربط الكرسي بالحلاق والعميل حياً (Live Chair Operations)
// ==========================================

function seatCustomerOnChair({
  chairId,
  customerName,
  customerPhone = '',
  stylistId = null,
  stylistName = '',
  serviceId = null,
  serviceName = '',
  servicePrice = 0,
  appointmentId = null,
}) {
  db.prepare(`
    UPDATE salon_chairs
    SET status = 'occupied',
        current_customer_name = ?,
        current_customer_phone = ?,
        current_stylist_id = ?,
        current_stylist_name = ?,
        current_service_id = ?,
        current_service_name = ?,
        current_service_price = ?,
        service_started_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    customerName || 'عميل نقدي',
    customerPhone || '',
    stylistId || null,
    stylistName || '',
    serviceId || null,
    serviceName || '',
    Number(servicePrice) || 0,
    chairId
  );

  if (appointmentId) {
    db.prepare(`UPDATE salon_appointments SET status = 'in_service' WHERE id = ?`).run(appointmentId);
  }

  return getChairById(chairId);
}

function vacateChair(chairId) {
  db.prepare(`
    UPDATE salon_chairs
    SET status = 'available',
        current_customer_name = NULL,
        current_customer_phone = NULL,
        current_stylist_id = NULL,
        current_stylist_name = NULL,
        current_service_id = NULL,
        current_service_name = NULL,
        current_service_price = 0,
        service_started_at = NULL
    WHERE id = ?
  `).run(chairId);
  return getChairById(chairId);
}

function completeChairService({
  chairId,
  paymentMethod = 'cash',
  discountAmount = 0,
  tipAmount = 0,
  tipRecipient = 'stylist',
  notes = '',
  userId = null,
  couponCode = null,
}) {
  const chair = getChairById(chairId);
  if (!chair) throw new Error('الكرسي غير موجود');

  const basePrice = Number(chair.current_service_price) || 0;
  const discount = Math.min(basePrice, Math.max(0, Number(discountAmount) || 0));
  const tip = Math.max(0, Number(tipAmount) || 0);
  const finalPrice = Math.max(0, basePrice - discount);
  const totalReceived = finalPrice + tip;

  const currentShift = db.prepare("SELECT id FROM shifts WHERE status = 'open' ORDER BY id DESC LIMIT 1").get();
  const shiftId = currentShift ? currentShift.id : null;

  const runTx = db.transaction(() => {
    // 1. تسجيل فاتورة البيع في sales
    const invoiceNum = 'INV-SALON-' + Date.now().toString().slice(-6);
    const saleRes = db.prepare(`
      INSERT INTO sales (
        invoice_number, customer_name, customer_phone, total_amount, discount,
        payment_method, shift_id, user_id, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      invoiceNum,
      chair.current_customer_name || 'عميل نقدي',
      chair.current_customer_phone || null,
      totalReceived,
      discount,
      paymentMethod || 'cash',
      shiftId,
      userId || chair.current_stylist_id || null,
      notes || `خدمة صالون: ${chair.current_service_name || ''} على ${chair.name}`
    );
    const saleId = saleRes.lastInsertRowid;

    // 2. تسجيل عمولة وبند الخدمة في salon_service_sales
    let earnedCommission = 0;
    let commType = 'percentage';
    let commVal = 20;

    if (chair.current_service_id) {
      const srv = getServiceById(chair.current_service_id);
      if (srv) {
        commType = srv.commission_type || 'percentage';
        commVal = Number(srv.commission_value) || 0;
      }
    }

    if (commType === 'percentage') {
      earnedCommission = Math.round(finalPrice * (commVal / 100) * 100) / 100;
    } else {
      earnedCommission = commVal;
    }

    db.prepare(`
      INSERT INTO salon_service_sales (
        sale_id, service_id, stylist_id, chair_id, service_price,
        commission_type, commission_value, earned_commission,
        tip_amount, tip_recipient, discount_amount, customer_name, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      saleId,
      chair.current_service_id || null,
      chair.current_stylist_id || userId || 1,
      chairId,
      basePrice,
      commType,
      commVal,
      earnedCommission,
      tip,
      tipRecipient,
      discount,
      chair.current_customer_name || 'عميل نقدي',
      notes || null
    );

    if (couponCode) {
      try {
        db.prepare('UPDATE salon_coupons SET usage_count = usage_count + 1 WHERE code = ?').run(couponCode);
      } catch {}
    }

    // تفريغ الكرسي
    vacateChair(chairId);

    return {
      saleId,
      invoiceNumber: invoiceNum,
      finalPrice,
      discount,
      tip,
      earnedCommission,
      totalReceived,
    };
  });

  return runTx();
}

// ==========================================
// 7. إدارة الحلاقين، العمولات، الحضور، والبقشيش (Barbers & Staff)
// ==========================================

function getBarbersWithStats(filters = {}) {
  const todayStr = new Date().toISOString().split('T')[0];
  const startDate = filters.startDate || null;
  const endDate = filters.endDate || null;

  const users = db.prepare(`
    SELECT id, username, full_name, role, job_title, specialty, pay_type, pay_amount, commission_rate, phone, is_active
    FROM users
    WHERE is_active = 1
    ORDER BY full_name ASC
  `).all();

  return users.map((u) => {
    let query = `
      SELECT 
        COUNT(id) as services_count,
        COALESCE(SUM(service_price), 0) as total_sales,
        COALESCE(SUM(earned_commission), 0) as total_commission,
        COALESCE(SUM(CASE WHEN tip_recipient = 'stylist' THEN tip_amount ELSE 0 END), 0) as total_tips
      FROM salon_service_sales
      WHERE stylist_id = ?
    `;
    const params = [u.id];
    if (startDate) {
      query += ` AND DATE(created_at) >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      query += ` AND DATE(created_at) <= ?`;
      params.push(endDate);
    }
    const stats = db.prepare(query).get(...params);

    const attendance = db.prepare(`
      SELECT check_in, check_out 
      FROM attendance_records 
      WHERE user_id = ? AND attendance_date = ?
    `).get(u.id, todayStr);

    return {
      ...u,
      servicesCount: Number(stats?.services_count || 0),
      totalSales: Number(stats?.total_sales || 0),
      totalCommission: Number(stats?.total_commission || 0),
      totalTips: Number(stats?.total_tips || 0),
      isCheckedIn: Boolean(attendance && attendance.check_in && !attendance.check_out),
      checkInTime: attendance?.check_in || null,
      checkOutTime: attendance?.check_out || null,
    };
  });
}

function getStylistDetailedLedger(stylistId, startDate = null, endDate = null) {
  let query = `
    SELECT 
      ss.*,
      s.name as service_name,
      c.name as chair_name,
      sa.invoice_number
    FROM salon_service_sales ss
    LEFT JOIN salon_services s ON ss.service_id = s.id
    LEFT JOIN salon_chairs c ON ss.chair_id = c.id
    LEFT JOIN sales sa ON ss.sale_id = sa.id
    WHERE ss.stylist_id = ?
  `;
  const params = [stylistId];
  if (startDate) {
    query += ` AND DATE(ss.created_at) >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND DATE(ss.created_at) <= ?`;
    params.push(endDate);
  }
  query += ` ORDER BY ss.created_at DESC`;
  return db.prepare(query).all(...params);
}

// ==========================================
// 8. الكوبونات والعروض الموسمية (Coupons & Offers)
// ==========================================

function getAllCoupons() {
  return db.prepare('SELECT * FROM salon_coupons ORDER BY is_active DESC, created_at DESC').all();
}

function createCoupon(data) {
  const stmt = db.prepare(`
    INSERT INTO salon_coupons (code, title, discount_type, discount_value, min_spend, is_active, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, 1, ?, ?)
  `);
  const res = stmt.run(
    data.code.trim().toUpperCase(),
    data.title.trim(),
    data.discount_type || 'percentage',
    Number(data.discount_value) || 0,
    Number(data.min_spend) || 0,
    data.start_date || null,
    data.end_date || null
  );
  return db.prepare('SELECT * FROM salon_coupons WHERE id = ?').get(res.lastInsertRowid);
}

function deleteCoupon(id) {
  return db.prepare('DELETE FROM salon_coupons WHERE id = ?').run(id);
}

function applyCoupon(code, amount) {
  const coupon = db.prepare('SELECT * FROM salon_coupons WHERE code = ? AND is_active = 1').get(code.trim().toUpperCase());
  if (!coupon) throw new Error('الكوبون غير صحيح أو غير مفعل');

  const nowStr = new Date().toISOString().split('T')[0];
  if (coupon.start_date && nowStr < coupon.start_date) throw new Error('هذا العرض لم يبدأ بعد');
  if (coupon.end_date && nowStr > coupon.end_date) throw new Error('هذا العرض منتهي الصلاحية');

  const base = Number(amount) || 0;
  if (base < (coupon.min_spend || 0)) {
    throw new Error(`الحد الأدنى لتطبيق الكوبون هو ${coupon.min_spend} ج.م`);
  }

  let discountVal = 0;
  if (coupon.discount_type === 'percentage') {
    discountVal = Math.round(base * (coupon.discount_value / 100) * 100) / 100;
  } else {
    discountVal = Math.min(base, coupon.discount_value);
  }

  return {
    valid: true,
    code: coupon.code,
    title: coupon.title,
    discountAmount: discountVal,
    netAmount: Math.max(0, base - discountVal),
  };
}

function getTipPoolSummary(startDate = null, endDate = null) {
  let query = `
    SELECT 
      COALESCE(SUM(tip_amount), 0) as total_tip_pool,
      COALESCE(SUM(tip_amount), 0) as total_pool_tips,
      COUNT(id) as service_count,
      COUNT(id) as tip_count
    FROM salon_service_sales
    WHERE tip_recipient = 'pool'
  `;
  const params = [];
  if (startDate) {
    query += ` AND DATE(created_at) >= ?`;
    params.push(startDate);
  }
  if (endDate) {
    query += ` AND DATE(created_at) <= ?`;
    params.push(endDate);
  }
  return db.prepare(query).get(...params);
}

module.exports = {
  getAllChairs,
  getChairById,
  createChair,
  updateChair,
  setChairStatus,
  deleteChair,
  seatCustomerOnChair,
  vacateChair,
  completeChairService,
  getAllServices,
  getServiceById,
  createService,
  updateService,
  deleteService,
  getAllPackages,
  getPackageById,
  createPackage,
  subscribeCustomerToPackage,
  getCustomerActiveSubscriptions,
  deductSubscriptionVisit,
  getAppointments,
  getAppointmentById,
  createAppointment,
  updateAppointmentStatus,
  logSalonServiceSale,
  getStylistCommissionsSummary,
  getBarbersWithStats,
  getStylistDetailedLedger,
  getAllCoupons,
  createCoupon,
  deleteCoupon,
  applyCoupon,
  getTipPoolSummary,
};


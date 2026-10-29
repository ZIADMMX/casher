const { safeHandle } = require('./safeHandle');
const salonService = require('../services/salon.service');

function registerSalonHandlers() {
  // الكراسي ومحطات العمل
  safeHandle('salon:getAllChairs', () => {
    return salonService.getAllChairs();
  });

  safeHandle('salon:createChair', (event, data) => {
    return salonService.createChair(data || {});
  });

  safeHandle('salon:updateChair', (event, payload) => {
    const { id, data } = payload || {};
    return salonService.updateChair(id, data || {});
  });

  safeHandle('salon:setChairStatus', (event, payload) => {
    const { id, status } = payload || {};
    return salonService.setChairStatus(id, status);
  });

  safeHandle('salon:deleteChair', (event, id) => {
    return salonService.deleteChair(id);
  });

  // الخدمات والأسعار والعمولات
  safeHandle('salon:getAllServices', (event, category) => {
    return salonService.getAllServices(category);
  });

  safeHandle('salon:createService', (event, data) => {
    return salonService.createService(data || {});
  });

  safeHandle('salon:updateService', (event, payload) => {
    const { id, data } = payload || {};
    return salonService.updateService(id, data || {});
  });

  safeHandle('salon:deleteService', (event, id) => {
    return salonService.deleteService(id);
  });

  // باقات وكروت الزيارات
  safeHandle('salon:getAllPackages', () => {
    return salonService.getAllPackages();
  });

  safeHandle('salon:createPackage', (event, data) => {
    return salonService.createPackage(data || {});
  });

  safeHandle('salon:subscribePackage', (event, data) => {
    return salonService.subscribeCustomerToPackage(data || {});
  });

  safeHandle('salon:getCustomerSubscriptions', (event, customerId) => {
    return salonService.getCustomerActiveSubscriptions(customerId);
  });

  // الحجوزات والمواعيد والواتساب
  safeHandle('salon:getAppointments', (event, filters) => {
    return salonService.getAppointments(filters || {});
  });

  safeHandle('salon:createAppointment', (event, data) => {
    return salonService.createAppointment(data || {});
  });

  safeHandle('salon:updateAppointmentStatus', (event, payload) => {
    const { id, status, saleId } = payload || {};
    return salonService.updateAppointmentStatus(id, status, saleId);
  });

  safeHandle('salon:getWhatsAppReminderLink', (event, appointmentId) => {
    return salonService.generateWhatsAppReminderLink(appointmentId);
  });

  // تسجيل المبيعات مع العمولات
  safeHandle('salon:logServiceSale', (event, data) => {
    return salonService.logSalonServiceSale(data || {});
  });

  safeHandle('salon:getStylistCommissions', (event, filters) => {
    return salonService.getStylistCommissionsSummary(filters || {});
  });

  // ربط الكرسي بالحلاق والعميل حياً
  safeHandle('salon:seatCustomerOnChair', (event, data) => {
    return salonService.seatCustomerOnChair(data || {});
  });

  safeHandle('salon:vacateChair', (event, chairId) => {
    return salonService.vacateChair(chairId);
  });

  safeHandle('salon:completeChairService', (event, data) => {
    return salonService.completeChairService(data || {});
  });

  // إدارة الحلاقين والصناع والعمولات
  safeHandle('salon:getBarbersWithStats', (event, filters) => {
    return salonService.getBarbersWithStats(filters || {});
  });

  safeHandle('salon:getStylistDetailedLedger', (event, payload) => {
    const { stylistId, filters } = payload || {};
    return salonService.getStylistDetailedLedger(stylistId, filters || {});
  });

  // الكوبونات والعروض
  safeHandle('salon:getAllCoupons', () => {
    return salonService.getAllCoupons();
  });

  safeHandle('salon:createCoupon', (event, data) => {
    return salonService.createCoupon(data || {});
  });

  safeHandle('salon:deleteCoupon', (event, id) => {
    return salonService.deleteCoupon(id);
  });

  safeHandle('salon:applyCoupon', (event, payload) => {
    const { code, amount } = payload || {};
    return salonService.applyCoupon(code, amount);
  });

  safeHandle('salon:getTipPoolSummary', (event, filters) => {
    return salonService.getTipPoolSummary(filters || {});
  });
}

module.exports = { registerSalonHandlers };

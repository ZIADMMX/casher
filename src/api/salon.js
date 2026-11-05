// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Salon & Barbershop Management APIs; Live Chair Linkage, Barbers, Coupons & Tips
import { bridgeMethod } from './bridge.js';

export const getAllSalonChairs = bridgeMethod('getAllSalonChairs');
export const createSalonChair = bridgeMethod('createSalonChair');
export const updateSalonChair = bridgeMethod('updateSalonChair');
export const setSalonChairStatus = bridgeMethod('setSalonChairStatus');
export const deleteSalonChair = bridgeMethod('deleteSalonChair');
export const getAllSalonServices = bridgeMethod('getAllSalonServices');
export const createSalonService = bridgeMethod('createSalonService');
export const updateSalonService = bridgeMethod('updateSalonService');
export const deleteSalonService = bridgeMethod('deleteSalonService');
export const getAllSalonPackages = bridgeMethod('getAllSalonPackages');
export const createSalonPackage = bridgeMethod('createSalonPackage');
export const subscribeCustomerToSalonPackage = bridgeMethod('subscribeCustomerToSalonPackage');
export const getCustomerActiveSalonSubscriptions = bridgeMethod('getCustomerActiveSalonSubscriptions');
export const getSalonAppointments = bridgeMethod('getSalonAppointments');
export const createSalonAppointment = bridgeMethod('createSalonAppointment');
export const updateSalonAppointmentStatus = bridgeMethod('updateSalonAppointmentStatus');
export const getSalonWhatsAppReminderLink = bridgeMethod('getSalonWhatsAppReminderLink');
export const logSalonServiceSale = bridgeMethod('logSalonServiceSale');
export const getSalonStylistCommissions = bridgeMethod('getSalonStylistCommissions');
export const seatSalonChair = bridgeMethod('seatSalonChair');
export const vacateSalonChair = bridgeMethod('vacateSalonChair');
export const completeSalonChairService = bridgeMethod('completeSalonChairService');
export const getSalonBarbersWithStats = bridgeMethod('getSalonBarbersWithStats');
export const getSalonStylistDetailedLedger = bridgeMethod('getSalonStylistDetailedLedger');
export const getAllSalonCoupons = bridgeMethod('getAllSalonCoupons');
export const createSalonCoupon = bridgeMethod('createSalonCoupon');
export const deleteSalonCoupon = bridgeMethod('deleteSalonCoupon');
export const applySalonCoupon = bridgeMethod('applySalonCoupon');
export const getSalonTipPoolSummary = bridgeMethod('getSalonTipPoolSummary');

const { safeHandle } = require('./safeHandle');
const appointmentsService = require('../services/appointments.service');

function registerAppointmentsHandlers() {
  safeHandle('appointments:getResources', (_event, filters) => appointmentsService.getResources(filters));
  safeHandle('appointments:getResource', (_event, id) => appointmentsService.getResource(id));
  safeHandle('appointments:saveResource', (_event, data) => appointmentsService.saveResource(data));
  safeHandle('appointments:getServices', (_event, filters) => appointmentsService.getServices(filters));
  safeHandle('appointments:saveService', (_event, data) => appointmentsService.saveService(data));
  safeHandle('appointments:getHolidays', (_event, filters) => appointmentsService.getHolidays(filters));
  safeHandle('appointments:saveHoliday', (_event, data) => appointmentsService.saveHoliday(data));
  safeHandle('appointments:removeHoliday', (_event, id) => appointmentsService.removeHoliday(id));
  safeHandle('appointments:getAll', (_event, filters) => appointmentsService.getAppointments(filters));
  safeHandle('appointments:create', (_event, data) => appointmentsService.createAppointment(data));
  safeHandle('appointments:updateStatus', (_event, payload) => appointmentsService.updateAppointmentStatus(payload.id, payload.status));
  safeHandle('appointments:reschedule', (_event, payload) => appointmentsService.rescheduleAppointment(payload.id, payload.data));
  safeHandle('appointments:convertToOrder', (_event, id) => appointmentsService.convertToServiceOrder(id));
}

module.exports = { registerAppointmentsHandlers };

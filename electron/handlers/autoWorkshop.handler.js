const { safeHandle } = require('./safeHandle');
const workshop = require('../services/autoWorkshop.service');
const authService = require('../services/auth.service');

// "enterprise:" prefix: reads need enterprise.view, everything else enterprise.manage.
function registerAutoWorkshopHandlers() {
  safeHandle('enterprise:searchVehicles', (event, q) => workshop.searchVehicles(q));
  safeHandle('enterprise:getVehiclesOverview', (event, filters) => workshop.getVehiclesOverview(filters || {}));
  safeHandle('enterprise:deactivateVehicle', (event, id) => workshop.deactivateVehicle(id));
  safeHandle('enterprise:createVehicle', (event, data) => workshop.createVehicle(data));
  safeHandle('enterprise:updateVehicle', (event, payload) => workshop.updateVehicle(payload?.id, payload?.data));
  safeHandle('enterprise:receiveVehicle', (event, data) => {
    const session = authService.requireAuth();
    return workshop.checkInVehicle(data, session.fullName || session.username);
  });
  safeHandle('enterprise:getVehicleCheckIn', (event, orderId) => workshop.getCheckIn(orderId));
  safeHandle('enterprise:printVehicleCheckIn', (event, orderId) => {
    const html = require('../services/vehicleIntakeReceipt.service').getReceiptHtml(orderId);
    return require('../services/print.service').printHtml(html, { silent: false });
  });
  // Customer car tracking (public page + in-app preview)
  const tracking = require('../services/tracking.service');
  safeHandle('enterprise:createTrackingLink', (event, orderId) => {
    const link = tracking.getLink(orderId);
    tracking.publishOne(orderId).catch(() => {}); // so the page already exists when the customer opens it; the 15 s loop retries on failure
    return link;
  });
  safeHandle('enterprise:revokeTrackingLink', (event, orderId) => tracking.revokeLink(orderId));
  safeHandle('enterprise:previewTracking', (event, orderId) => tracking.getPreviewHtml(orderId));
  safeHandle('enterprise:getWorkOrderPhotos', (event, orderId) => tracking.listPhotos(orderId));
  safeHandle('enterprise:addWorkOrderUpdate', (event, payload) => tracking.addUpdate(payload?.orderId, payload?.data));
  safeHandle('enterprise:addWorkOrderPhoto', (event, payload) => tracking.addPhoto(payload?.orderId, payload?.data));
  safeHandle('enterprise:removeWorkOrderPhoto', (event, id) => tracking.removePhoto(id));
  safeHandle('enterprise:setWorkOrderLineDone', (event, payload) => tracking.setLineDone(payload?.lineId, payload?.done));
  safeHandle('enterprise:findVehicleByPlate', (event, plate) => workshop.findVehicleByPlate(plate));
  safeHandle('enterprise:getCustomerWorkshopProfile', (event, id) => workshop.getCustomerProfile(id));
  safeHandle('enterprise:getVehicleProfile', (event, id) => workshop.getVehicleProfile(id));
  safeHandle('enterprise:addOdometerReading', (event, payload) => workshop.addOdometerReading(payload?.vehicleId, payload?.data));
  safeHandle('enterprise:markReminderSent', (event, id) => workshop.markReminderSent(id));
  safeHandle('enterprise:getVehicleHistory', (event, id) => workshop.getVehicleHistory(id));
  safeHandle('enterprise:getWorkOrderBoard', (event, filters) => workshop.getWorkOrderBoard(filters || {}));
  safeHandle('enterprise:getWorkOrders', (event, filters) => workshop.listOrders(filters || {}));
  safeHandle('enterprise:getWorkOrder', (event, id) => workshop.stripCosts(workshop.getOrder(id)));
  safeHandle('enterprise:openWorkOrder', (event, data) => workshop.openOrder(data));
  safeHandle('enterprise:updateWorkOrder', (event, payload) => workshop.stripCosts(workshop.updateOrder(payload?.id, payload?.data)));
  safeHandle('enterprise:addWorkOrderLine', (event, payload) => workshop.stripCosts(workshop.addLine(payload?.orderId, payload?.data)));
  safeHandle('enterprise:removeWorkOrderLine', (event, lineId) => workshop.stripCosts(workshop.removeLine(lineId)));
  safeHandle('enterprise:setWorkOrderLineQuantity', (event, payload) => workshop.stripCosts(workshop.setLineQuantity(payload?.lineId, payload?.quantity)));
  safeHandle('enterprise:orderMissingParts', (event, payload) => workshop.orderMissingParts(payload?.orderId, payload?.data));
  safeHandle('enterprise:collectWorkOrder', (event, payload) => require('../services/sales.service').createSale({
    workOrderId: payload?.orderId, paymentMethod: payload?.paymentMethod, discount: payload?.discount || 0,
    customerName: payload?.customerName, dueDate: payload?.dueDate,
  }));
  safeHandle('enterprise:getPartsOrderDraft', (event, orderId) => workshop.getPartsOrderDraft(orderId));
  safeHandle('enterprise:getPartsOrder', (event, id) => workshop.getPartsOrder(id));
  safeHandle('enterprise:receivePartsOrder', (event, id) => workshop.receivePartsOrder(id));
  safeHandle('enterprise:cancelPartsOrder', (event, id) => workshop.cancelPartsOrder(id));
  safeHandle('enterprise:setWorkOrderStatus', (event, payload) => workshop.stripCosts(workshop.setStatus(payload?.id, payload?.status)));
  safeHandle('enterprise:getOrderProfit', (event, orderId) => workshop.getOrderProfit(orderId));
  safeHandle('enterprise:setPartCost', (event, payload) => workshop.setPartCost(payload?.variantId, payload?.cost));
  safeHandle('enterprise:setLaborCostPerHour', (event, value) => workshop.setLaborCostPerHour(value));
  safeHandle('enterprise:addServiceReminder', (event, payload) => workshop.addReminder(payload?.vehicleId, payload?.data));
  safeHandle('enterprise:completeServiceReminder', (event, id) => workshop.completeReminder(id));
  safeHandle('enterprise:getDueServiceReminders', () => workshop.getDueReminders());

  const reports = require('../services/workshopReports.service');
  safeHandle('enterprise:getWorkshopReport', (event, filters) => reports.getReport(filters));
  safeHandle('enterprise:exportWorkshopReport', async (event, filters) => {
    const { start, end, rows } = reports.getExportRows(filters);
    const result = await require('../services/export.service').exportToExcel(rows, 'أوامر الشغل المقفولة', `تقرير-الورشة-${start}-إلى-${end}.xlsx`);
    if (!result?.canceled) {
      require('../services/audit.service').logAction({ actionType: 'report_export', title: 'تصدير تقرير الورشة', details: `${start} → ${end} (${rows.length} أمر)` });
    }
    return result;
  });

  const maintenance = require('../services/maintenanceReminders.service');
  safeHandle('enterprise:getMaintenanceDashboard', (event, filters) => maintenance.getDashboard(filters || {}));
  safeHandle('enterprise:saveMaintenanceRules', (event, rules) => maintenance.saveRules(rules));
  safeHandle('enterprise:setMaintenanceRuleActive', (event, payload) => maintenance.setRuleActive(payload?.id, payload?.active));
  safeHandle('enterprise:saveMaintenanceTemplate', (event, text) => maintenance.saveTemplate(text));
  safeHandle('enterprise:previewMaintenanceMessage', (event, payload) => maintenance.previewMessage(payload || {}));
  safeHandle('enterprise:sendMaintenanceReminder', (event, key) => maintenance.sendReminder(key));
  safeHandle('enterprise:sendMaintenanceReminders', (event, keys) => maintenance.sendBulk(keys));
  safeHandle('enterprise:bookMaintenanceReminder', (event, payload) => maintenance.bookReminder(payload?.key, payload?.date));
}

module.exports = { registerAutoWorkshopHandlers };

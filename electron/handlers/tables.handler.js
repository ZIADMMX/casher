const { safeHandle } = require('./safeHandle');
const tablesService = require('../services/tables.service');
const reservations = require('../services/reservations.service');

function registerTablesHandlers() {
  safeHandle('tables:getTables', () => tablesService.getTables());
  safeHandle('tables:addTable', (_event, name) => tablesService.addTable(name));
  safeHandle('tables:removeTable', (_event, tableId) => tablesService.removeTable(tableId));
  safeHandle('tables:openTab', (_event, tableId) => tablesService.openTab(tableId));
  safeHandle('tables:getOpenTab', (_event, tabId) => tablesService.getOpenTab(tabId));
  safeHandle('tables:sendRound', (_event, { tabId, items } = {}) => tablesService.sendRound(tabId, items));
  safeHandle('tables:cancelTab', (_event, tabId) => tablesService.cancelTab(tabId));
  safeHandle('tables:getReservations', (_event, date) => reservations.listReservations(date));
  safeHandle('tables:getUpcomingReservations', () => reservations.getUpcomingByTable());
  safeHandle('tables:createReservation', (_event, data) => reservations.createReservation(data));
  safeHandle('tables:updateReservation', (_event, payload) => reservations.updateReservation(payload?.id, payload?.data));
  safeHandle('tables:setReservationStatus', (_event, payload) => reservations.setReservationStatus(payload?.id, payload?.status));
  safeHandle('tables:seatReservation', (_event, payload) => reservations.seatReservation(payload?.id, payload?.tableId));
}

module.exports = { registerTablesHandlers };

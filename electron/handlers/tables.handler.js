const { safeHandle } = require('./safeHandle');
const tablesService = require('../services/tables.service');

function registerTablesHandlers() {
  safeHandle('tables:getTables', () => tablesService.getTables());
  safeHandle('tables:addTable', (_event, name) => tablesService.addTable(name));
  safeHandle('tables:removeTable', (_event, tableId) => tablesService.removeTable(tableId));
  safeHandle('tables:openTab', (_event, tableId) => tablesService.openTab(tableId));
  safeHandle('tables:getOpenTab', (_event, tabId) => tablesService.getOpenTab(tabId));
  safeHandle('tables:sendRound', (_event, { tabId, items } = {}) => tablesService.sendRound(tabId, items));
  safeHandle('tables:cancelTab', (_event, tabId) => tablesService.cancelTab(tabId));
}

module.exports = { registerTablesHandlers };

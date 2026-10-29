const { safeHandle } = require('./safeHandle');
const inventoryService = require('../services/inventory.service');

function registerInventoryHandlers() {
  safeHandle('inventory:getBranches', () => inventoryService.getBranches());
  safeHandle('inventory:createBranch', (event, data) => inventoryService.createBranch(data));
  safeHandle('inventory:updateBranch', (event, payload) => inventoryService.updateBranch(payload.id, payload.data));
  safeHandle('inventory:getWarehouses', (event, branchId) => inventoryService.getWarehouses(branchId));
  safeHandle('inventory:createWarehouse', (event, data) => inventoryService.createWarehouse(data));
  safeHandle('inventory:updateWarehouse', (event, payload) => inventoryService.updateWarehouse(payload.id, payload.data));
  safeHandle('inventory:getStock', (event, filters) => inventoryService.getStock(filters));
  safeHandle('inventory:getMovements', (event, filters) => inventoryService.getMovementHistory(filters));
  safeHandle('inventory:getTransfers', () => inventoryService.getTransfers());
  safeHandle('inventory:transfer', (event, data) => inventoryService.transferStock(data));
  safeHandle('inventory:adjust', (event, data) => inventoryService.adjustStock(data));
  safeHandle('inventory:setReorderLevel', (event, data) => inventoryService.setReorderLevel(data));
  safeHandle('inventory:count', (event, data) => inventoryService.countStock(data));
}

module.exports = { registerInventoryHandlers };

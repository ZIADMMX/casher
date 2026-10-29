const { safeHandle } = require('./safeHandle');
const groceryService = require('../services/grocery.service');

/**
 * Supermarket & Grocery Module IPC Handlers
 * قنوات الاتصال بين واجهة المستخدم ومحرك السوبر ماركت الخلفي
 */
function registerGroceryHandlers() {
  // 1. محلل الباركود الشامل وميزان الباركود الإلكتروني
  safeHandle('grocery:resolveBarcode', (event, input) => {
    return groceryService.resolveBarcode(input);
  });

  safeHandle('grocery:parseScaleBarcode', (event, barcode) => {
    return groceryService.parseScaleBarcode(barcode);
  });

  safeHandle('grocery:parseQuickMultiplier', (event, input) => {
    return groceryService.parseQuickMultiplier(input);
  });

  // 2. تعدد وحدات القياس (Multi-UOM)
  safeHandle('grocery:getUnits', (event, variantId) => {
    return groceryService.getUnitsByVariant(variantId);
  });

  safeHandle('grocery:getUnitByBarcode', (event, barcode) => {
    return groceryService.getUnitByBarcode(barcode);
  });

  safeHandle('grocery:createUnit', (event, data) => {
    return groceryService.createUnit(data || {});
  });

  safeHandle('grocery:updateUnit', (event, payload) => {
    const { id, data } = payload || {};
    return groceryService.updateUnit(id, data || {});
  });

  safeHandle('grocery:deleteUnit', (event, id) => {
    return groceryService.deleteUnit(id);
  });

  // 3. إدارة التشغيلات والصلاحيات (Batches & Expiry)
  safeHandle('grocery:getBatches', (event, variantId) => {
    return groceryService.getBatchesByVariant(variantId);
  });

  safeHandle('grocery:createBatch', (event, data) => {
    return groceryService.createBatch(data || {});
  });

  safeHandle('grocery:getExpiringBatches', (event, daysAhead) => {
    return groceryService.getExpiringBatches(daysAhead);
  });

  safeHandle('grocery:getExpiredBatches', () => {
    return groceryService.getExpiredBatches();
  });

  safeHandle('grocery:getExpirySummary', (event, daysAhead) => {
    return groceryService.getExpirySummary(daysAhead);
  });

  // 4. إعدادات ميزان الباركود
  safeHandle('grocery:getScaleConfig', () => {
    return groceryService.getScaleConfig();
  });

  safeHandle('grocery:saveScaleConfig', (event, data) => {
    return groceryService.saveScaleConfig(data || {});
  });

  // 5. أزرار السلع السريعة (Speed PLU Keys)
  safeHandle('grocery:getSpeedKeys', () => {
    return groceryService.getAllSpeedKeys();
  });

  safeHandle('grocery:createSpeedKey', (event, data) => {
    return groceryService.createSpeedKey(data || {});
  });

  safeHandle('grocery:deleteSpeedKey', (event, id) => {
    return groceryService.deleteSpeedKey(id);
  });
}

module.exports = { registerGroceryHandlers };

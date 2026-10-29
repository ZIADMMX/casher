const UIConfigService = require('../services/ui-config.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

/**
 * معالجات IPC لمصمم الشاشة الديناميكي (Screen Designer)
 */
function registerUIConfigHandlers() {
  // جلب إعدادات نطاق محدد
  safeHandle('uiConfig:get', (_event, { scope, roleOrUserId } = {}) => {
    authService.requireAuth();
    return UIConfigService.getScreenConfig(scope, roleOrUserId);
  });

  // حفظ إعدادات نطاق محدد (مدير فقط)
  safeHandle('uiConfig:save', (_event, { scope, config, roleOrUserId } = {}) => {
    authService.requireAdmin();
    return UIConfigService.saveScreenConfig(scope, config, roleOrUserId);
  });

  // إعادة ضبط الإعدادات الافتراضية (مدير فقط)
  safeHandle('uiConfig:reset', (_event, { scope, roleOrUserId } = {}) => {
    authService.requireAdmin();
    return UIConfigService.resetToDefaults(scope, roleOrUserId);
  });

  // تصدير جميع الإعدادات
  safeHandle('uiConfig:export', () => {
    authService.requireAdmin();
    return UIConfigService.exportConfig();
  });

  // استيراد إعدادات (مدير فقط)
  safeHandle('uiConfig:import', (_event, configData) => {
    authService.requireAdmin();
    return UIConfigService.importConfig(configData);
  });

  // جلب الأدوات المتاحة لنطاق محدد
  safeHandle('uiConfig:getWidgets', (_event, scope) => {
    authService.requireAuth();
    return UIConfigService.getAvailableWidgets(scope);
  });

  // إعادة ترتيب العناصر
  safeHandle('uiConfig:reorder', (_event, { scope, itemIds, roleOrUserId } = {}) => {
    authService.requireAdmin();
    return UIConfigService.reorderItems(scope, itemIds, roleOrUserId);
  });

  // جلب كل النطاقات المتاحة
  safeHandle('uiConfig:getScopes', () => {
    authService.requireAuth();
    return UIConfigService.getAllScopes();
  });
}

module.exports = { registerUIConfigHandlers };

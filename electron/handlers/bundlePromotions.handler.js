const { safeHandle } = require('./safeHandle');
const authService = require('../services/auth.service');
const bundlePromotionsService = require('../services/bundlePromotions.service');

function registerBundlePromotionHandlers() {
  safeHandle('promotions:getBundles', () => {
    authService.requireAuth();
    return bundlePromotionsService.getBundlePromotions();
  });

  safeHandle('promotions:saveBundles', (_event, promotions) => {
    authService.requireAdmin();
    return bundlePromotionsService.saveBundlePromotions(promotions);
  });
}

module.exports = { registerBundlePromotionHandlers };

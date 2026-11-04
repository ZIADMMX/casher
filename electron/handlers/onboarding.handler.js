const { ipcMain } = require('electron');
const onboardingService = require('../services/onboarding.service');
const { logError } = require('../services/logger.service');
const authService = require('../services/auth.service');
const { requireActiveLicense } = require('../services/licenseGuard.service');

function registerGuardedHandle(channel, handler) {
  ipcMain.handle(channel, async (event, ...args) => {
    await requireActiveLicense(event);
    return handler(event, ...args);
  });
}

/**
 * حارس القنوات المعدِّلة لمعالج الإعداد:
 * - مع جلسة مسجلة: يشترط صلاحية المدير
 * - بدون جلسة (أول تشغيل قبل تسجيل الدخول): مسموح فقط ما دام الإعداد لم يكتمل بعد
 */
function requireOnboardingMutationAllowed() {
  const session = authService.getCurrentSession();
  if (session) {
    authService.requireAdmin();
    return;
  }

  const state = onboardingService.getOnboardingState();
  if (state && state.is_completed) {
    throw new Error('اكتمل إعداد المتجر بالفعل. سجّل الدخول كمدير لتعديل الإعداد');
  }
}

function registerOnboardingHandlers() {
  registerGuardedHandle('onboarding:getState', async () => {
    try {
      return { success: true, data: onboardingService.getOnboardingState() };
    } catch (err) {
      logError('OnboardingGetState', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:getPresets', async () => {
    try {
      return { success: true, data: onboardingService.getPresets() };
    } catch (err) {
      logError('OnboardingGetPresets', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:getPreset', async (_event, sectorKey) => {
    try {
      return { success: true, data: onboardingService.getPresetByKey(sectorKey) };
    } catch (err) {
      logError('OnboardingGetPreset', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:activatePreset', async (_event, payload) => {
    try {
      requireOnboardingMutationAllowed();
      authService.requireAdmin();
      return { success: true, data: onboardingService.activatePreset(payload || {}) };
    } catch (err) {
      logError('OnboardingActivatePreset', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:updateState', async (_event, stateData) => {
    try {
      requireOnboardingMutationAllowed();
      return { success: true, data: onboardingService.updateOnboardingState(stateData) };
    } catch (err) {
      logError('OnboardingUpdateState', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:preview', async (_event, previewData) => {
    try {
      return { success: true, data: onboardingService.previewCustomizedCatalog(previewData) };
    } catch (err) {
      logError('OnboardingPreview', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:provision', async (_event, payload) => {
    try {
      requireOnboardingMutationAllowed();
      const summary = onboardingService.provisionSectorData(payload);
      return { success: true, data: summary };
    } catch (err) {
      logError('OnboardingProvision', err);
      return { success: false, message: err.message };
    }
  });

  registerGuardedHandle('onboarding:reset', async () => {
    try {
      requireOnboardingMutationAllowed();
      return { success: true, data: onboardingService.resetOnboarding() };
    } catch (err) {
      logError('OnboardingReset', err);
      return { success: false, message: err.message };
    }
  });
}

module.exports = {
  registerOnboardingHandlers,
};

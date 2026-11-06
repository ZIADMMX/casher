const licenseService = require('../services/license.service');
const licenseClock = require('../services/licenseClock.service');
const authService = require('../services/auth.service');
const { exportAllData } = require('../services/export.service');
const { safeHandle } = require('./safeHandle');

function registerLicenseHandlers() {
  safeHandle('license:getStatus', async () => {
    const now = await licenseClock.getTrustedNow();
    return licenseService.getLicenseStatus(now);
  });

  safeHandle('license:activate', async (event, keyInput) => {
    const now = await licenseClock.getTrustedNow();
    return licenseService.activateSoftware(keyInput, now);
  });

  // Open while the app is locked (license:* skips the license check), so the
  // owner can always take their data out. Needs the admin's password because
  // the lock screen is shown before anyone signs in.
  safeHandle('license:exportData', async (event, credentials) => {
    const { username, password } = credentials || {};
    const { token, user } = authService.login(username, password, 'license-export', { remember: false });
    try {
      if (user.role !== 'admin' && !user.permissions?.includes('*')) {
        throw new Error('تصدير البيانات متاح لمدير النظام فقط');
      }
      return await exportAllData();
    } finally {
      authService.logout(token);
    }
  });
}

module.exports = { registerLicenseHandlers };

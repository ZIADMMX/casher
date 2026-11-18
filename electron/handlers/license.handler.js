const licenseService = require('../services/license.service');
const authService = require('../services/auth.service');
const { exportAllData } = require('../services/export.service');
const { safeHandle } = require('./safeHandle');
const { trustedNowFor } = require('../services/licenseGuard.service');
const licenseCertificateService = require('../services/licenseCertificate.service');

function registerLicenseHandlers() {
  safeHandle('license:getStatus', async () => {
    const now = await trustedNowFor();
    return licenseService.getLicenseStatus(now);
  });

  safeHandle('license:activate', async (event, payload) => {
    // Older callers sent the key as a bare string; the object form carries the
    // accepted agreement version alongside it.
    const { key, acceptedEulaVersion } = typeof payload === 'string'
      ? { key: payload, acceptedEulaVersion: null }
      : (payload || {});
    const now = await trustedNowFor(key);
    const result = licenseService.activateSoftware(key, now, { acceptedEulaVersion });
    
    // عند نجاح التفعيل، إنشاء ومزامنة شهادة الترخيص فوراً مع السحابة
    let certificate = null;
    try {
      certificate = licenseCertificateService.getCertificate();
      licenseCertificateService.syncCertificateToCloud(certificate).catch(() => {});
    } catch {}

    return {
      ...result,
      certificate,
    };
  });

  safeHandle('license:getCertificate', () => {
    return licenseCertificateService.getCertificate();
  });

  safeHandle('license:syncCertificate', async () => {
    return licenseCertificateService.syncCertificateToCloud();
  });

  // Is the licence server really reachable (not just a wifi icon)? Runs the cached check, so it costs at most one request a quarter hour.
  safeHandle('license:getConnection', async () => {
    try { await trustedNowFor(); } catch { /* the failure itself is what we report */ }
    return { reachable: require('../services/licenseClock.service').getReachability() };
  });

  safeHandle('license:getAgreement', () => licenseService.getAgreement());

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

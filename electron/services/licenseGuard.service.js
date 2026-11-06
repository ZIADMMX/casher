const licenseClock = require('./licenseClock.service');
const licenseService = require('./license.service');

// An ended trial or license only locks the app: the shop's data is never deleted,
// and license:exportData stays open so the owner can take everything out.
async function requireActiveLicense(event) {
  const now = await licenseClock.getTrustedNow();
  const status = licenseService.getLicenseStatus(now, { updateClock: false });

  if (status.isExpired && !status.isActivated) {
    const sender = event?.sender;
    if (sender && !sender.isDestroyed?.()) {
      sender.send('license:statusChanged', status);
    }
    const error = new Error(status.reason || 'انتهت مدة الترخيص. فعّل البرنامج لمتابعة العمل. بيانات المتجر محفوظة.');
    error.code = 'LICENSE_EXPIRED';
    throw error;
  }

  return status;
}

module.exports = { requireActiveLicense };

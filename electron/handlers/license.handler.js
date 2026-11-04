const licenseService = require('../services/license.service');
const licenseClock = require('../services/licenseClock.service');
const { clearExpiredTrialData } = require('../database/db');
const { safeHandle } = require('./safeHandle');

function registerLicenseHandlers() {
  safeHandle('license:getStatus', async () => {
    const now = await licenseClock.getTrustedNow();
    const status = licenseService.getLicenseStatus(now);
    if (!status.isActivated && status.trialDeadlineReached) {
      clearExpiredTrialData();
    }
    return status;
  });

  safeHandle('license:activate', async (event, keyInput) => {
    const now = await licenseClock.getTrustedNow();
    return licenseService.activateSoftware(keyInput, now);
  });
}

module.exports = { registerLicenseHandlers };

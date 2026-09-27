const licenseService = require('../services/license.service');
const { safeHandle } = require('./safeHandle');

function registerLicenseHandlers() {
  safeHandle('license:getStatus', () => {
    return licenseService.getLicenseStatus();
  });

  safeHandle('license:activate', (event, keyInput) => {
    return licenseService.activateSoftware(keyInput);
  });
}

module.exports = { registerLicenseHandlers };

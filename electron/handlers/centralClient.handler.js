const centralClient = require('../services/centralClient.service');
const { safeHandle } = require('./safeHandle');
const authService = require('../services/auth.service');

async function requireCentralAdmin() {
  const remoteSession = await centralClient.getSession();
  if (remoteSession) {
    if (remoteSession.role !== 'admin') throw new Error('غير مصرح لك بتنفيذ هذا الإجراء');
    return;
  }
  authService.requireAdmin();
}

function registerCentralClientHandlers() {
  safeHandle('central:getConfig', () => centralClient.getConfig());
  safeHandle('central:configure', async (_event, baseUrl) => {
    await requireCentralAdmin();
    return centralClient.configure(baseUrl);
  });
  safeHandle('central:setWarehouse', async (_event, warehouseId) => {
    await requireCentralAdmin();
    return centralClient.setWarehouse(warehouseId);
  });
  safeHandle('central:isConfigured', () => centralClient.isConfigured());
  safeHandle('central:login', (_event, credentials) => centralClient.login(credentials));
  safeHandle('central:getSession', () => centralClient.getSession());
  safeHandle('central:refreshSession', () => centralClient.refreshSession());
  safeHandle('central:updateProfile', (_event, profile) => centralClient.updateProfile(profile));
  safeHandle('central:getMyProfile', () => centralClient.getMyProfile());
  safeHandle('central:saveMyProfile', (_event, profile) => centralClient.saveMyProfile(profile));
  safeHandle('central:changePassword', (_event, password) => centralClient.changePassword(password));
  safeHandle('central:logout', () => centralClient.logout());
  safeHandle('central:testConnection', (_event, baseUrl) => centralClient.testConnection(baseUrl));
  safeHandle('central:getServerFingerprint', (_event, baseUrl) => centralClient.getServerFingerprint(baseUrl));
  safeHandle('central:request', (_event, data) => centralClient.invoke(data));
}

module.exports = { registerCentralClientHandlers };

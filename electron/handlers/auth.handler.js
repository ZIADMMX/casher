const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const {
  loginSchema,
  createAdminSchema,
  updateProfileSchema,
  resetWithKeySchema,
  resetWithChallengeSchema,
} = require('../validators/schema');

function registerAuthHandlers() {
  safeHandle('auth:isSetupRequired', () => authService.isSetupRequired());

  safeHandle('auth:createInitialAdmin', createAdminSchema, (event, credentials) => {
    return authService.createInitialAdmin(credentials);
  });

  safeHandle('auth:login', loginSchema, (event, credentials) => {
    return authService.login(credentials.username, credentials.password);
  });

  safeHandle('auth:logout', () => {
    authService.logout();
    return true;
  });

  safeHandle('auth:getSession', () => {
    return authService.getCurrentSession();
  });

  safeHandle('auth:refreshSession', () => {
    return authService.refreshSession();
  });

  safeHandle('auth:updateProfile', updateProfileSchema, (event, data) => {
    return authService.updateProfile(data);
  });

  safeHandle('auth:changePassword', (event, newPassword) => {
    return authService.changePassword(newPassword);
  });

  safeHandle('auth:getRecoveryChallenge', () => {
    return authService.getRecoveryChallenge();
  });

  safeHandle('auth:resetWithRecoveryKey', resetWithKeySchema, (event, data) => {
    return authService.resetAdminPasswordWithRecoveryKey(data);
  });

  safeHandle('auth:resetWithChallenge', resetWithChallengeSchema, (event, data) => {
    return authService.resetAdminPasswordWithChallenge(data);
  });
}

module.exports = { registerAuthHandlers };

const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');
const {
  loginSchema,
  createAdminSchema,
  updateProfileSchema,
  personalProfileSchema,
  resetWithKeySchema,
  resetWithChallengeSchema,
  changePasswordSchema,
} = require('../validators/schema');

function registerAuthHandlers() {
  safeHandle('auth:isSetupRequired', () => authService.isSetupRequired());

  safeHandle('auth:createInitialAdmin', createAdminSchema, (event, credentials) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.createInitialAdmin(credentials, callerId);
  });

  safeHandle('auth:login', loginSchema, (event, credentials) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.login(credentials.username, credentials.password, callerId);
  });

  safeHandle('auth:logout', (event) => {
    const callerId = event?.sender?.id ?? 'default';
    authService.logout(callerId);
    return true;
  });

  safeHandle('auth:getSession', (event) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.getCurrentSession(callerId);
  });

  safeHandle('auth:refreshSession', (event) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.refreshSession(callerId);
  });

  safeHandle('auth:updateProfile', updateProfileSchema, (event, data) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.updateProfile(data, callerId);
  });

  safeHandle('auth:getMyProfile', (event) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.getMyProfile(callerId);
  });

  safeHandle('auth:saveMyProfile', personalProfileSchema, (event, profile) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.saveMyProfile(profile, callerId);
  });

  safeHandle('auth:changePassword', changePasswordSchema, (event, newPassword) => {
    const callerId = event?.sender?.id ?? 'default';
    return authService.changePassword(newPassword, callerId);
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

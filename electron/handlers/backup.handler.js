const backupService = require('../services/backup.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

function registerBackupHandlers() {
  safeHandle('backup:now', () => {
    authService.requireAdmin();
    return backupService.backupNow();
  });

  safeHandle('backup:restore', () => {
    authService.requireAdmin();
    return backupService.restoreFromBackup();
  });
}

module.exports = { registerBackupHandlers };
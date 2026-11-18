const backupService = require('../services/backup.service');
const externalBackup = require('../services/externalBackup.service');
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

  // External copy (USB stick / another drive): status, choose, stop.
  safeHandle('backup:getExternalStatus', () => {
    authService.requireAdmin();
    return externalBackup.getStatus();
  });

  safeHandle('backup:chooseExternalFolder', async () => {
    authService.requireAdmin();
    const chosen = await externalBackup.chooseFolder();
    if (!chosen.success) return chosen;
    // Take the first copy right away instead of waiting for the next daily run.
    const daily = await backupService.autoBackupDaily();
    return { success: true, copy: daily.external, status: externalBackup.getStatus() };
  });

  safeHandle('backup:clearExternalFolder', () => {
    authService.requireAdmin();
    return externalBackup.clearFolder();
  });
}

module.exports = { registerBackupHandlers };
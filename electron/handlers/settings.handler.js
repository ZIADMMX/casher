const { dialog, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const SettingsService = require('../services/settings.service');
const { getDefaultBackupPath } = require('../services/backup.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

// Loaded on first use: its migration helpers open the database connection as soon as they load.
const cloudSync = () => require('../services/cloudSync.service');

function registerSettingsHandlers() {
  safeHandle('settings:getAll', () => {
    authService.requireAuth();
    return SettingsService.getSettings();
  });

  // Desktop -> erp-api upload (see services/cloudSync.service.js)
  safeHandle('cloudSync:getStatus', () => {
    authService.requireAdmin();
    return cloudSync().getStatus();
  });

  safeHandle('cloudSync:configure', (_event, config) => {
    authService.requireAdmin();
    return cloudSync().configure(config);
  });

  safeHandle('cloudSync:syncNow', async () => {
    authService.requireAdmin();
    await cloudSync().syncOnce();
    return cloudSync().getStatus();
  });

  safeHandle('settings:save', (_event, settingsData) => {
    authService.requireAdmin();
    return SettingsService.saveSettings(settingsData);
  });

  safeHandle('settings:backup', async (event) => {
    authService.requireAdmin();
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showSaveDialog(win, {
      title: 'حفظ نسخة احتياطية من قاعدة البيانات',
      // The user's own Documents folder; a drive root like D:\ is writable by every Windows account.
      defaultPath: getDefaultBackupPath(),
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const res = await SettingsService.backupDatabase(result.filePath);
    return res;
  });

  safeHandle('settings:restore', async (event) => {
    authService.requireAdmin();
    const win = BrowserWindow.fromWebContents(event.sender);
    const openOptions = {
      title: 'اختر ملف النسخة الاحتياطية لاستعادتها',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'bak'] }],
      defaultPath: path.dirname(getDefaultBackupPath()),
    };

    const result = await dialog.showOpenDialog(win, openOptions);

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedFile = result.filePaths[0];
    const res = await SettingsService.restoreDatabase(selectedFile);
    return { success: true, message: res.message };
  });

  safeHandle('settings:uploadLogo', async (event) => {
    authService.requireAdmin();
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'اختر صورة شعار المحل (Logo)',
      properties: ['openFile'],
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const imagePath = result.filePaths[0];
    const ext = path.extname(imagePath).toLowerCase().replace('.', '') || 'png';
    const fileData = fs.readFileSync(imagePath);
    const base64Data = `data:image/${ext === 'svg' ? 'svg+xml' : ext};base64,${fileData.toString('base64')}`;

    // حفظ الشعار فوراً في الإعدادات
    SettingsService.saveSettings({ store_logo: base64Data });

    return { success: true, dataUrl: base64Data };
  });
}

module.exports = { registerSettingsHandlers };

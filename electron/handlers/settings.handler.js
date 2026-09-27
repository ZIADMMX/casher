const { dialog, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const SettingsService = require('../services/settings.service');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

function registerSettingsHandlers() {
  safeHandle('settings:getAll', () => {
    authService.requireAuth();
    return SettingsService.getSettings();
  });

  safeHandle('settings:save', (_event, settingsData) => {
    authService.requireAdmin();
    return SettingsService.saveSettings(settingsData);
  });

  safeHandle('settings:backup', async (event) => {
    authService.requireAdmin();
    const win = BrowserWindow.fromWebContents(event.sender);
    const now = new Date();
    const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    const defaultFilename = `kashiear_backup_${dateStr}.db`;

    const result = await dialog.showSaveDialog(win, {
      title: 'حفظ نسخة احتياطية من قاعدة البيانات',
      defaultPath: defaultFilename,
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite'] }]
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    const res = SettingsService.backupDatabase(result.filePath);
    return res;
  });

  safeHandle('settings:restore', async (event) => {
    authService.requireAdmin();
    const win = BrowserWindow.fromWebContents(event.sender);
    const result = await dialog.showOpenDialog(win, {
      title: 'اختر ملف النسخة الاحتياطية لاستعادتها',
      properties: ['openFile'],
      filters: [{ name: 'SQLite Database', extensions: ['db', 'sqlite', 'bak'] }]
    });

    if (result.canceled || !result.filePaths || result.filePaths.length === 0) {
      return { canceled: true };
    }

    const selectedFile = result.filePaths[0];
    const res = SettingsService.restoreDatabase(selectedFile);
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

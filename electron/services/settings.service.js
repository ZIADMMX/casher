const SettingsRepository = require('../repositories/settings.repository');
const { logError } = require('./logger.service');

const SettingsService = {
  getSettings() {
    return SettingsRepository.getAll();
  },

  saveSettings(settingsData) {
    if (!settingsData || typeof settingsData !== 'object') {
      throw new Error('بيانات الإعدادات غير صالحة');
    }
    return SettingsRepository.setMany(settingsData);
  },

  async backupDatabase(destFilePath) {
    if (!destFilePath) {
      throw new Error('لم يتم تحديد مسار النسخ الاحتياطي');
    }

    try {
      // استخدم المنطق الموحد من backup.service.js
      const { backupNow } = require('./backup.service');
      const result = await backupNow(destFilePath);
      if (!result.success) {
        logError('SettingsBackup', new Error(result.message || 'فشل النسخ الاحتياطي'));
        return {
          ...result,
          message: result.message ? (result.message.startsWith('فشل النسخ الاحتياطي:') ? result.message : `فشل النسخ الاحتياطي: ${result.message}`) : 'فشل النسخ الاحتياطي',
        };
      }
      return result;
    } catch (err) {
      logError('SettingsBackup', err);
      let msg = err.message || 'فشل النسخ الاحتياطي';
      if (msg.includes('database or disk is full')) {
        msg = 'المساحة على القرص المختار ممتلئة تماماً (Disk is full). يرجى اختيار قرص به مساحة كافية مثل القرص D أو فلاش ميموري.';
      }
      return {
        success: false,
        message: msg,
        filePath: null,
        path: null,
      };
    }
  },

  async restoreDatabase(sourceFilePath) {
    const { restoreDatabase } = require('./backup.service');
    return restoreDatabase(sourceFilePath);
  }
};

module.exports = SettingsService;

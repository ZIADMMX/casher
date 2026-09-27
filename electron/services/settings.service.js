const fs = require('node:fs');
const { db, dbPath } = require('../database/db');
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

  backupDatabase(destFilePath) {
    if (!destFilePath) {
      throw new Error('لم يتم تحديد مسار النسخ الاحتياطي');
    }

    try {
      // استخدم المنطق الموحد من backup.service.js
      const { backupNow } = require('./backup.service');
      const result = backupNow(destFilePath);
      if (!result.success) {
        logError('SettingsBackup', new Error(result.message || 'فشل النسخ الاحتياطي'));
        return {
          ...result,
          message: `فشل النسخ الاحتياطي: ${result.message || 'خطأ غير معروف'}`,
        };
      }
      return result;
    } catch (err) {
      logError('SettingsBackup', err);
      return {
        success: false,
        message: `فشل النسخ الاحتياطي: ${err.message || 'خطأ غير معروف'}`,
        filePath: null,
        path: null,
      };
    }
  },

  restoreDatabase(sourceFilePath) {
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      throw new Error('ملف النسخة الاحتياطية غير موجود');
    }

    try {
      // فحص سريع لملف SQLite للتأكد من أنه قاعدة بيانات صالحة
      const buffer = Buffer.alloc(16);
      const fd = fs.openSync(sourceFilePath, 'r');
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      const header = buffer.toString('utf-8');
      if (!header.startsWith('SQLite format 3')) {
        throw new Error('الملف المحدد ليس ملف قاعدة بيانات SQLite سليم');
      }

      // أخذ نسخة احتياطية فورية من الحالة الحالية للطوارئ
      const backupEmergencyPath = `${dbPath}.emergency.bak`;
      try {
        fs.copyFileSync(dbPath, backupEmergencyPath);
      } catch {
        // تجاهل
      }

      // إغلاق أي معاملات ثم استبدال الملف
      db.pragma('wal_checkpoint(TRUNCATE)');
      fs.copyFileSync(sourceFilePath, dbPath);

      // حذف ملفات wal و shm القديمة إن وجدت
      try {
        if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
        if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
      } catch {}

      return {
        success: true,
        message: 'تمت استعادة قاعدة البيانات بنجاح'
      };
    } catch (err) {
      logError('RestoreDatabase', err);
      throw new Error(`فشل الاستعادة: ${err.message}`);
    }
  }
};

module.exports = SettingsService;

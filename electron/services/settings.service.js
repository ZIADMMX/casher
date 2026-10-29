const fs = require('node:fs');
const Database = require('better-sqlite3');
const { db, dbPath, closeDatabase, checkpointWalIfNeeded } = require('../database/db');
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

  restoreDatabase(sourceFilePath) {
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      throw new Error('ملف النسخة الاحتياطية غير موجود');
    }

    try {
      // 1. فحص ملف SQLite والتأكد من أنه قاعدة بيانات صالحة وسليمة
      const buffer = Buffer.alloc(16);
      const fd = fs.openSync(sourceFilePath, 'r');
      fs.readSync(fd, buffer, 0, 16, 0);
      fs.closeSync(fd);

      const header = buffer.toString('utf-8');
      if (!header.startsWith('SQLite format 3')) {
        throw new Error('الملف المحدد ليس ملف قاعدة بيانات SQLite سليم');
      }

      const backupDb = new Database(sourceFilePath, { readonly: true, fileMustExist: true });
      try {
        const integrityCheck = backupDb.pragma('integrity_check', { simple: true });
        if (integrityCheck !== 'ok') {
          throw new Error('ملف النسخة الاحتياطية تالف ولا يمكن استعادته');
        }
      } finally {
        backupDb.close();
      }

      // 2. أخذ نسخة احتياطية فورية من الحالة الحالية للطوارئ
      const backupEmergencyPath = `${dbPath}.before-restore.bak`;
      try {
        if (fs.existsSync(dbPath)) {
          fs.copyFileSync(dbPath, backupEmergencyPath);
        }
      } catch (e) {
        logError('PreRestoreSafetyBackup', e);
      }

      // 3. عمل Checkpoint لملف WAL قبل الإغلاق
      try {
        checkpointWalIfNeeded(db);
      } catch (e) {
        logError('RestoreCheckpoint', e);
      }

      // 4. إغلاق اتصال قاعدة البيانات الحالي بأمان
      closeDatabase();

      // 5. حذف ملفات wal و shm القديمة لمنع تلف قاعدة البيانات
      const walPath = `${dbPath}-wal`;
      const shmPath = `${dbPath}-shm`;
      try {
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch (e) {
        logError('DeleteWalShm', e);
      }

      // 6. استبدال الملف ومزامنة القرص
      fs.copyFileSync(sourceFilePath, dbPath);
      try {
        const flushFd = fs.openSync(dbPath, 'r+');
        fs.fsyncSync(flushFd);
        fs.closeSync(flushFd);
      } catch {
        // ignore
      }

      try {
        if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
        if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
      } catch {
        // ignore
      }

      // 7. التحقق من سلامة قاعدة البيانات بعد الاستبدال
      const verifyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
      try {
        const check = verifyDb.pragma('integrity_check', { simple: true });
        if (check !== 'ok') {
          if (fs.existsSync(backupEmergencyPath)) {
            fs.copyFileSync(backupEmergencyPath, dbPath);
          }
          throw new Error('فشل التحقق من سلامة قاعدة البيانات بعد الاستعادة');
        }
      } finally {
        verifyDb.close();
      }

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

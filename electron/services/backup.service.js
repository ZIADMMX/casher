const { dialog, app } = require('electron');
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const { db, dbPath, closeDatabase, checkpointWalIfNeeded } = require('../database/db');
const { logError } = require('./logger.service');

/**
 * Perform a manual backup of the database.
 * Returns a consistent object containing both filePath and path.
 */
async function backupNow(destFilePath) {
  try {
    let defaultBackupPath = `foxcloud-backup-${new Date().toISOString().slice(0, 10)}.db`;
    try {
      if (fs.existsSync('D:\\')) {
        defaultBackupPath = path.join('D:\\', defaultBackupPath);
      }
    } catch {}

    const savePath = destFilePath || dialog.showSaveDialogSync({
      title: 'حفظ نسخة احتياطية',
      defaultPath: defaultBackupPath,
      filters: [{ name: 'Database Backup', extensions: ['db'] }],
    });

    // If the user cancelled the dialog (or destFilePath was falsy), signal cancellation.
    if (!savePath) return { success: false, canceled: true, filePath: null, path: null };

    // Flush WAL changes to main DB before backup if in WAL mode
    try {
      checkpointWalIfNeeded(db);
    } catch {}

    await db.backup(savePath);
    return { success: true, filePath: savePath, path: savePath };
  } catch (err) {
    logError('BackupNow', err);
    let msg = err.message || 'فشل النسخ الاحتياطي';
    if (msg.includes('database or disk is full')) {
      msg = 'database or disk is full (المساحة على القرص المختار ممتلئة تماماً، يرجى اختيار مسار حفظ على القرص D أو فلاش ميموري)';
    }
    return {
      success: false,
      message: msg,
      filePath: null,
      path: null,
    };
  }
}

/**
 * Restore the database from a selected backup file.
 * Returns { success: true } on success, otherwise throws.
 */
function restoreFromBackup() {
  try {
    const result = dialog.showOpenDialogSync({
      title: 'اختر ملف النسخة الاحتياطية',
      filters: [{ name: 'Database Backup', extensions: ['db'] }],
      properties: ['openFile'],
    });

    if (!result || result.length === 0) return { success: false, canceled: true };
    const chosenPath = result[0];

    // 1. التحقق من سلامة وصلاحية ملف النسخة الاحتياطية
    const backupDb = new Database(chosenPath, { readonly: true, fileMustExist: true });
    try {
      const integrityCheck = backupDb.pragma('integrity_check', { simple: true });
      if (integrityCheck !== 'ok') {
        throw new Error('ملف النسخة الاحتياطية تالف ولا يمكن استعادته');
      }
    } finally {
      backupDb.close();
    }

    // 2. أخذ نسخة احتياطية فورية لحماية البيانات الحالية قبل الاستبدال
    const emergencyBackupPath = `${dbPath}.before-restore.bak`;
    try {
      if (fs.existsSync(dbPath)) {
        fs.copyFileSync(dbPath, emergencyBackupPath);
      }
    } catch (e) {
      logError('PreRestoreSafetyBackup', e);
    }

    // 3. عمل Checkpoint لملف WAL قبل الإغلاق لضمان تفريغ أي معاملات معلقة
    try {
      checkpointWalIfNeeded(db);
    } catch (e) {
      logError('RestoreCheckpoint', e);
    }

    // 4. إغلاق اتصال قاعدة البيانات الحالي بأمان
    closeDatabase();

    // 5. حذف ملفات WAL و SHM السابقة لمنع تلوث قاعدة البيانات المستعادة وتلفها
    const walPath = `${dbPath}-wal`;
    const shmPath = `${dbPath}-shm`;
    try {
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
    } catch (e) {
      logError('DeleteWalFile', e);
    }
    try {
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch (e) {
      logError('DeleteShmFile', e);
    }

    // 6. كتابة النسخة الاحتياطية إلى ملف مؤقت داخل نفس مجلد قاعدة البيانات ثم استبدالها
    // بشكل ذري لتجنب الكتابة المباشرة إلى قاعدة البيانات الحالية أثناء الاستعادة.
    const restoreTempPath = path.join(
      path.dirname(dbPath),
      `.${path.basename(dbPath)}.restore-tmp.${Date.now()}.db`
    );
    try {
      if (fs.existsSync(restoreTempPath)) fs.unlinkSync(restoreTempPath);
      fs.copyFileSync(chosenPath, restoreTempPath);
      const restoreFd = fs.openSync(restoreTempPath, 'r+');
      fs.fsyncSync(restoreFd);
      fs.closeSync(restoreFd);
      fs.renameSync(restoreTempPath, dbPath);
    } catch (e) {
      logError('RestoreReplaceDatabase', e);
      if (fs.existsSync(restoreTempPath)) {
        try { fs.unlinkSync(restoreTempPath); } catch {}
      }
      if (fs.existsSync(emergencyBackupPath)) {
        try { fs.copyFileSync(emergencyBackupPath, dbPath); } catch {}
      }
      throw new Error('فشل استبدال ملف قاعدة البيانات أثناء الاستعادة');
    }

    // التأكد من عدم وجود أي بقايا wal أو shm بعد استبدال قاعدة البيانات
    try {
      if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
      if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
    } catch {
      // ignore
    }

    // 7. التحقق من سلامة قاعدة البيانات المستعادة بعد كتابتها
    const verifyDb = new Database(dbPath, { readonly: true, fileMustExist: true });
    try {
      const check = verifyDb.pragma('integrity_check', { simple: true });
      if (check !== 'ok') {
        if (fs.existsSync(emergencyBackupPath)) {
          fs.copyFileSync(emergencyBackupPath, dbPath);
        }
        throw new Error('فشل التحقق من سلامة قاعدة البيانات بعد الاستعادة');
      }
    } finally {
      verifyDb.close();
    }

    // Relaunch app to load new DB
    app.relaunch();
    app.exit(0);
    return { success: true };
  } catch (err) {
    logError('RestoreBackup', err);
    throw new Error(err.message || 'فشل استعادة النسخ الاحتياطي');
  }
}

async function autoBackupOnClose() {
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const backupPath = path.join(
    backupsDir,
    `kashiear-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  );

  await db.backup(backupPath);
  const shutdownBackups = fs.readdirSync(backupsDir)
    .filter((file) => file.startsWith('kashiear-auto-') && file.endsWith('.db'))
    .sort()
    .reverse();
  for (const file of shutdownBackups.slice(5)) {
    try {
      fs.unlinkSync(path.join(backupsDir, file));
    } catch (err) {
      logError('PruneAutoBackup', err);
    }
  }

  return { success: true, filePath: backupPath };
}

async function autoBackupDaily() {
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const dateKey = new Date().toISOString().slice(0, 10);
  const backupPath = path.join(backupsDir, `kashiear-daily-${dateKey}.db`);

  if (fs.existsSync(backupPath)) {
    return { success: true, skipped: true, filePath: backupPath };
  }

  await db.backup(backupPath);

  const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  for (const file of fs.readdirSync(backupsDir)) {
    const match = file.match(/^kashiear-daily-(\d{4}-\d{2}-\d{2})\.db$/);
    if (match && match[1] < cutoffDate) {
      try {
        fs.unlinkSync(path.join(backupsDir, file));
      } catch (err) {
        logError('PruneAutoBackup', err);
      }
    }
  }

  return { success: true, filePath: backupPath };
}

module.exports = { backupNow, restoreFromBackup, autoBackupOnClose, autoBackupDaily };
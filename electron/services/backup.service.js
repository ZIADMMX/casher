const { dialog, app } = require('electron');
const Database = require('better-sqlite3');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { db, dbPath, closeDatabase } = require('../database/db');
const { logError } = require('./logger.service');

function verifyDatabase(filePath) {
  const database = new Database(filePath, { readonly: true, fileMustExist: true });
  try {
    if (database.pragma('integrity_check', { simple: true }) !== 'ok') {
      throw new Error('ملف قاعدة البيانات تالف ولا يمكن استخدامه');
    }
  } finally {
    database.close();
  }
}

function makeTempPath(filePath, label) {
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.${label}.${crypto.randomUUID()}.tmp`
  );
}

function replaceFileAtomically(tempPath, filePath) {
  const previousPath = makeTempPath(filePath, 'previous');
  const hadPreviousFile = fs.existsSync(filePath);

  if (hadPreviousFile) fs.renameSync(filePath, previousPath);
  try {
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    if (hadPreviousFile) fs.renameSync(previousPath, filePath);
    throw error;
  }

  if (hadPreviousFile) {
    try {
      fs.unlinkSync(previousPath);
    } catch (error) {
      logError('RemovePreviousBackup', error);
    }
  }
}

function copyAndSync(sourcePath, destPath) {
  fs.copyFileSync(sourcePath, destPath);
  const fd = fs.openSync(destPath, 'r+');
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
}

function removeDatabaseSidecars() {
  for (const suffix of ['-wal', '-shm']) {
    const sidecarPath = `${dbPath}${suffix}`;
    if (fs.existsSync(sidecarPath)) fs.unlinkSync(sidecarPath);
  }
}

async function backupToFile(filePath) {
  const tempPath = makeTempPath(filePath, 'backup');
  try {
    await db.backup(tempPath);
    verifyDatabase(tempPath);
    replaceFileAtomically(tempPath, filePath);
  } catch (error) {
    if (fs.existsSync(tempPath)) {
      try {
        fs.unlinkSync(tempPath);
      } catch (cleanupError) {
        logError('CleanupBackupTemp', cleanupError);
      }
    }
    throw error;
  }
}

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

    await backupToFile(savePath);
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
async function restoreFromBackup() {
  try {
    const result = dialog.showOpenDialogSync({
      title: 'اختر ملف النسخة الاحتياطية',
      filters: [{ name: 'Database Backup', extensions: ['db'] }],
      properties: ['openFile'],
    });

    if (!result || result.length === 0) return { success: false, canceled: true };
    return await restoreDatabase(result[0]);
  } catch (err) {
    logError('RestoreBackup', err);
    throw new Error(err.message || 'فشل استعادة النسخ الاحتياطي');
  }
}

async function restoreDatabase(sourceFilePath) {
  let restoreTempPath;
  let emergencyBackupPath;
  let databaseClosed = false;

  try {
    if (!sourceFilePath || !fs.existsSync(sourceFilePath)) {
      throw new Error('ملف النسخة الاحتياطية غير موجود');
    }
    verifyDatabase(sourceFilePath);

    restoreTempPath = makeTempPath(dbPath, 'restore');
    copyAndSync(sourceFilePath, restoreTempPath);
    verifyDatabase(restoreTempPath);

    if (!fs.existsSync(dbPath)) {
      throw new Error('ملف قاعدة البيانات الحالية غير موجود لإنشاء نسخة طوارئ');
    }
    emergencyBackupPath = `${dbPath}.before-restore-${Date.now()}-${crypto.randomUUID()}.bak`;
    await backupToFile(emergencyBackupPath);

    closeDatabase();
    databaseClosed = true;
    removeDatabaseSidecars();
    replaceFileAtomically(restoreTempPath, dbPath);
    restoreTempPath = null;
    removeDatabaseSidecars();
    verifyDatabase(dbPath);

    app.relaunch();
    app.exit(0);
    return { success: true, message: 'تمت استعادة قاعدة البيانات بنجاح' };
  } catch (error) {
    logError('RestoreDatabase', error);
    if (restoreTempPath && fs.existsSync(restoreTempPath)) {
      try {
        fs.unlinkSync(restoreTempPath);
      } catch (cleanupError) {
        logError('CleanupRestoreTemp', cleanupError);
      }
    }

    if (databaseClosed && emergencyBackupPath && fs.existsSync(emergencyBackupPath)) {
      let recoveryTempPath;
      try {
        recoveryTempPath = makeTempPath(dbPath, 'recovery');
        copyAndSync(emergencyBackupPath, recoveryTempPath);
        verifyDatabase(recoveryTempPath);
        removeDatabaseSidecars();
        replaceFileAtomically(recoveryTempPath, dbPath);
        recoveryTempPath = null;
        removeDatabaseSidecars();
        app.relaunch();
        app.exit(0);
      } catch (recoveryError) {
        logError('RestoreRollback', recoveryError);
      } finally {
        if (recoveryTempPath && fs.existsSync(recoveryTempPath)) {
          try {
            fs.unlinkSync(recoveryTempPath);
          } catch (cleanupError) {
            logError('CleanupRecoveryTemp', cleanupError);
          }
        }
      }
    }
    throw new Error(error.message || 'فشل استعادة النسخ الاحتياطي');
  }
}

async function autoBackupOnClose() {
  const backupsDir = path.join(app.getPath('userData'), 'backups');
  fs.mkdirSync(backupsDir, { recursive: true });
  const backupPath = path.join(
    backupsDir,
    `kashiear-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
  );

  await backupToFile(backupPath);
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
    try {
      verifyDatabase(backupPath);
      return { success: true, skipped: true, filePath: backupPath };
    } catch (error) {
      logError('VerifyExistingDailyBackup', error);
    }
  }

  await backupToFile(backupPath);

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

module.exports = {
  backupNow,
  restoreFromBackup,
  restoreDatabase,
  autoBackupOnClose,
  autoBackupDaily,
};
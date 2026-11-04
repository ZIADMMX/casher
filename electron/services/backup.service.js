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

// Tables every database written by this app has; a file without them is not ours.
const REQUIRED_TABLES = ['users', 'settings', 'sales'];

function quoteIdentifier(name) {
  return `"${String(name).replace(/"/g, '""')}"`;
}

/**
 * Make a restore candidate safe to load. A backup is a whole database, so a
 * crafted one could carry triggers or views that act on every later write.
 * Only triggers/views identical to the ones in the current database survive;
 * migrations recreate any the older backup legitimately lacks.
 */
function sanitizeRestoreCandidate(candidatePath) {
  const live = new Database(dbPath, { readonly: true, fileMustExist: true });
  let liveVersion;
  let knownObjects;
  try {
    liveVersion = live.pragma('user_version', { simple: true }) || 0;
    knownObjects = new Map(live.prepare(
      "SELECT type || ':' || name AS id, sql FROM sqlite_master WHERE type IN ('trigger', 'view')"
    ).all().map((row) => [row.id, row.sql]));
  } finally {
    live.close();
  }

  const candidate = new Database(candidatePath, { fileMustExist: true });
  try {
    const tables = new Set(candidate.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().map((r) => r.name));
    if (REQUIRED_TABLES.some((table) => !tables.has(table))) {
      throw new Error('هذا الملف ليس نسخة احتياطية من قاعدة بيانات البرنامج');
    }
    if ((candidate.pragma('user_version', { simple: true }) || 0) > liveVersion) {
      throw new Error('هذه النسخة الاحتياطية من إصدار أحدث من البرنامج. حدّث البرنامج أولاً ثم أعد الاستعادة');
    }

    const objects = candidate.prepare("SELECT type, name, sql FROM sqlite_master WHERE type IN ('trigger', 'view')").all();
    for (const { type, name, sql } of objects) {
      if (knownObjects.get(`${type}:${name}`) !== sql) {
        candidate.exec(`DROP ${type === 'view' ? 'VIEW' : 'TRIGGER'} IF EXISTS ${quoteIdentifier(name)}`);
      }
    }
  } finally {
    candidate.close();
  }
}

/** Default manual-backup location: the user's own Documents folder, not a shared drive root. */
function getDefaultBackupPath() {
  return path.join(app.getPath('documents'), `foxcloud-backup-${new Date().toISOString().slice(0, 10)}.db`);
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
    const savePath = destFilePath || dialog.showSaveDialogSync({
      title: 'حفظ نسخة احتياطية',
      defaultPath: getDefaultBackupPath(),
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
    sanitizeRestoreCandidate(restoreTempPath);

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
    // The restored revoked_tokens table is older than the live one, so logged-out
    // tokens could work again: rotate the secret so everyone signs in afresh.
    require('./session.service').rotateSecret();

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
  getDefaultBackupPath,
  backupNow,
  restoreFromBackup,
  restoreDatabase,
  autoBackupOnClose,
  autoBackupDaily,
};
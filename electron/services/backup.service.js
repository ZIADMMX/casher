const { dialog, app } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { dbPath, closeDatabase } = require('../database/db');
const { logError } = require('./logger.service');

function copyFileWithRetry(sourcePath, destinationPath, maxAttempts = 3) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      fs.copyFileSync(sourcePath, destinationPath);
      return;
    } catch (err) {
      const isTransient = ['EBUSY', 'EPERM', 'EAGAIN'].includes(err.code);
      if (!isTransient || attempt === maxAttempts) throw err;
    }
  }
}

/**
 * Perform a manual backup of the database.
 * Returns a consistent object containing both filePath and path.
 */
function backupNow(destFilePath) {
  try {
    // Use the path supplied by the caller (Settings UI) if provided;
    // otherwise fall back to the save‑dialog for manual selection.
    const savePath = destFilePath || dialog.showSaveDialogSync({
      title: 'حفظ نسخة احتياطية',
      defaultPath: `kashiear-backup-${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'Database Backup', extensions: ['db'] }],
    });

    // If the user cancelled the dialog (or destFilePath was falsy), signal cancellation.
    if (!savePath) return { success: false, canceled: true, filePath: null, path: null };

    copyFileWithRetry(dbPath, savePath);
    return { success: true, filePath: savePath, path: savePath };
  } catch (err) {
    logError('BackupNow', err);
    return {
      success: false,
      message: err.message || 'فشل النسخ الاحتياطي',
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

    // Simple validation that the file looks like a SQLite DB
    const buffer = Buffer.alloc(16);
    const fd = fs.openSync(chosenPath, 'r');
    fs.readSync(fd, buffer, 0, 16, 0);
    fs.closeSync(fd);

    if (buffer.toString('utf8', 0, 15) !== 'SQLite format 3') {
      throw new Error('الملف المختار ليس نسخة قاعدة بيانات صحيحة');
    }

    closeDatabase();
    fs.copyFileSync(chosenPath, dbPath);

    // Relaunch app to load new DB
    app.relaunch();
    app.exit();
    return { success: true };
  } catch (err) {
    logError('RestoreBackup', err);
    // Propagate error to caller (will be caught in safeHandle)
    throw new Error(err.message || 'فشل استعادة النسخ الاحتياطي');
  }
}

function autoBackupOnClose() {
  try {
    const backupsDir = path.join(app.getPath('userData'), 'backups');
    fs.mkdirSync(backupsDir, { recursive: true });
    const backupPath = path.join(
      backupsDir,
      `kashiear-auto-${new Date().toISOString().replace(/[:.]/g, '-')}.db`
    );

    fs.copyFileSync(dbPath, backupPath);
    return { success: true, filePath: backupPath };
  } catch (err) {
    logError('AutoBackupOnClose', err);
    return { success: false, filePath: null };
  }
}

module.exports = { backupNow, restoreFromBackup, autoBackupOnClose };
// Copies the daily backup to a folder the owner picks (a USB stick, another drive, a synced folder),
// so a dead disk or a stolen PC does not take every backup with it. The copy lives in
// <folder>/foxcloud-backups/foxcloud-YYYY-MM-DD.db, one per day, the newest KEEP_COPIES kept.
const fs = require('node:fs');
const path = require('node:path');
const { logError } = require('./logger.service');

const DIR_KEY = 'external_backup_dir';
const LAST_KEY = 'external_backup_last_at';
const SUBFOLDER = 'foxcloud-backups';
const KEEP_COPIES = 14;
const STALE_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;
const COPY_PATTERN = /^foxcloud-\d{4}-\d{2}-\d{2}\.db$/;

function settings() {
  return require('../repositories/settings.repository');
}

function getFolder() {
  return settings().get(DIR_KEY) || null;
}

function targetDir(folder = getFolder()) {
  return folder ? path.join(folder, SUBFOLDER) : null;
}

// A USB stick that was pulled out, or a read-only folder, fails here instead of halfway through a copy.
function isWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.fox-write-test-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function setFolder(folder) {
  if (!folder || typeof folder !== 'string' || !path.isAbsolute(folder)) {
    throw new Error('مسار المجلد غير صالح');
  }
  if (!isWritableDir(targetDir(folder))) {
    throw new Error('لا يمكن الكتابة في هذا المجلد. اختر فلاشة أو مجلدًا آخر.');
  }
  settings().set(DIR_KEY, folder);
  return getStatus();
}

function clearFolder() {
  settings().set(DIR_KEY, '');
  return getStatus();
}

async function chooseFolder() {
  const { dialog } = require('electron');
  const result = await dialog.showOpenDialog({
    title: 'اختر فلاشة أو مجلد للنسخ الاحتياطي',
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { success: false, canceled: true };
  setFolder(result.filePaths[0]);
  return { success: true };
}

function pruneOldCopies(dir) {
  const copies = fs.readdirSync(dir).filter((file) => COPY_PATTERN.test(file)).sort().reverse();
  for (const file of copies.slice(KEEP_COPIES)) {
    try {
      fs.unlinkSync(path.join(dir, file));
    } catch (error) {
      logError('PruneExternalBackup', error);
    }
  }
}

// Never throws: a missing USB stick must not break the local daily backup.
function copyToExternal(sourcePath, now = Date.now()) {
  const dir = targetDir();
  if (!dir) return { success: false, skipped: true, reason: 'not_configured' };
  if (!sourcePath || !fs.existsSync(sourcePath)) return { success: false, reason: 'no_source' };
  if (!isWritableDir(dir)) return { success: false, reason: 'unavailable' };

  const destPath = path.join(dir, `foxcloud-${new Date(now).toISOString().slice(0, 10)}.db`);
  const lastAt = Number(settings().get(LAST_KEY)) || 0;
  if (fs.existsSync(destPath) && new Date(lastAt).toISOString().slice(0, 10) === new Date(now).toISOString().slice(0, 10)) {
    return { success: true, skipped: true, filePath: destPath };
  }

  const tempPath = `${destPath}.tmp-${process.pid}`;
  try {
    fs.copyFileSync(sourcePath, tempPath);
    const fd = fs.openSync(tempPath, 'r+');
    try {
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    fs.renameSync(tempPath, destPath);
  } catch (error) {
    try {
      if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
    } catch {}
    logError('ExternalBackup', error);
    return { success: false, reason: 'copy_failed', message: error.message };
  }

  settings().set(LAST_KEY, String(now));
  pruneOldCopies(dir);
  return { success: true, filePath: destPath };
}

function getStatus(now = Date.now()) {
  const folder = getFolder();
  const lastAt = Number(settings().get(LAST_KEY)) || null;
  const daysSinceLast = lastAt ? Math.floor((now - lastAt) / DAY_MS) : null;
  return {
    folder,
    configured: Boolean(folder),
    available: folder ? isWritableDir(targetDir(folder)) : false,
    lastAt,
    daysSinceLast,
    stale: !lastAt || now - lastAt > STALE_DAYS * DAY_MS,
  };
}

// Once a day at most (the notification dedupe window), tell the owner when no copy has left the PC lately.
function remindIfStale(now = Date.now()) {
  const status = getStatus(now);
  if (!status.stale) return null;
  const message = !status.configured
    ? 'كل النسخ الاحتياطية على نفس الجهاز. لو الهارد باظ هتضيع. اختار فلاشة أو مجلد من الإعدادات ← النسخ الاحتياطي الخارجي.'
    : !status.available
      ? 'مكان النسخ الاحتياطي الخارجي مش موجود (الفلاشة مش متوصلة؟). وصّلها عشان البرنامج ياخد نسخة.'
      : `آخر نسخة خارجية بقالها ${status.daysSinceLast ?? 'أكتر من 3'} يوم.`;
  return require('./notifications.service').notify({
    type: 'warning',
    title: 'النسخ الاحتياطي الخارجي',
    message,
    linkPage: 'settings',
    dedupeKey: 'external-backup-stale',
  });
}

module.exports = {
  DIR_KEY,
  LAST_KEY,
  SUBFOLDER,
  KEEP_COPIES,
  STALE_DAYS,
  getStatus,
  setFolder,
  clearFolder,
  chooseFolder,
  copyToExternal,
  remindIfStale,
};

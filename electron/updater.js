const { app, dialog, BrowserWindow } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
// لو العميل اختار "لاحقًا" التحديث يتثبت لوحده أول ما يقفل البرنامج.
autoUpdater.autoInstallOnAppQuit = true;

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000;
let promptOpen = false;

function check() {
  autoUpdater.checkForUpdates().catch((error) => log.error('Could not check for updates:', error));
}

async function askToRestart() {
  if (promptOpen) return;
  promptOpen = true;
  try {
    const parent = BrowserWindow.getFocusedWindow() || BrowserWindow.getAllWindows()[0];
    const options = {
      type: 'question',
      buttons: ['إعادة التشغيل الآن', 'لاحقًا'],
      defaultId: 0,
      cancelId: 1,
      message: 'تم تنزيل تحديث جديد. هل تريد إعادة تشغيل التطبيق الآن؟',
      detail: 'لو اخترت "لاحقًا" هيتثبت التحديث تلقائيًا عند إغلاق البرنامج.',
    };
    const { response } = parent
      ? await dialog.showMessageBox(parent, options)
      : await dialog.showMessageBox(options);
    if (response === 0) autoUpdater.quitAndInstall();
  } finally {
    promptOpen = false;
  }
}

function configureUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') return;

  // الافتراضي: GitHub Releases من إعداد build.publish اللي بيتحط جوه التطبيق وقت البناء.
  // KASHIEAR_UPDATE_URL اختياري لو عايز سيرفر خاص بدل GitHub.
  const updateUrl = process.env.KASHIEAR_UPDATE_URL;
  if (updateUrl) autoUpdater.setFeedURL({ provider: 'generic', url: updateUrl });

  autoUpdater.on('checking-for-update', () => log.info('Checking for updates.'));
  autoUpdater.on('update-available', (info) => log.info('Update available:', info.version));
  autoUpdater.on('update-not-available', () => log.info('No update available.'));
  autoUpdater.on('download-progress', (p) => log.info(`Update download progress: ${Math.round(p.percent)}%`));
  autoUpdater.on('error', (error) => log.error('Automatic update failed:', error));
  autoUpdater.on('update-downloaded', () => askToRestart());

  check();
  setInterval(check, CHECK_EVERY_MS).unref();
}

module.exports = { configureUpdater };

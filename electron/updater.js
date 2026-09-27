const { app, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

log.transports.file.level = 'info';
autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = false;

function configureUpdater() {
  if (!app.isPackaged || process.platform !== 'win32') {
    return;
  }

  const updateUrl = process.env.KASHIEAR_UPDATE_URL;
  if (!updateUrl) {
    log.info('Automatic updates are disabled: KASHIEAR_UPDATE_URL is not configured.');
    return;
  }

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: updateUrl,
  });

  autoUpdater.on('checking-for-update', () => log.info('Checking for updates.'));
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
  });
  autoUpdater.on('update-not-available', () => log.info('No update available.'));
  autoUpdater.on('download-progress', (progress) => {
    log.info(`Update download progress: ${Math.round(progress.percent)}%`);
  });
  autoUpdater.on('error', (error) => {
    log.error('Automatic update failed:', error);
  });
  autoUpdater.on('update-downloaded', () => {
    const result = dialog.showMessageBoxSync({
      type: 'question',
      buttons: ['إعادة التشغيل الآن', 'لاحقًا'],
      defaultId: 0,
      cancelId: 1,
      message: 'تم تنزيل تحديث جديد. هل تريد إعادة تشغيل التطبيق الآن؟',
    });

    if (result === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.checkForUpdates().catch((error) => {
    log.error('Could not check for updates:', error);
  });
}

module.exports = { configureUpdater };

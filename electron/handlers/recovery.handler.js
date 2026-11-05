// Registered with ipcMain directly, not safeHandle: the error screen must be able
// to restart the app when the request queue is full, the license check fails or
// nobody is logged in. It only accepts calls from the app's own page.
const { ipcMain } = require('electron');
const { relaunchApp } = require('../services/recovery.service');

function registerRecoveryHandlers({ isAppUrl }) {
  ipcMain.handle('recovery:relaunch', (event) => {
    const url = event?.senderFrame?.url || event?.sender?.getURL?.() || '';
    if (!isAppUrl(url)) throw new Error('غير مسموح');
    return relaunchApp('error-screen');
  });
}

module.exports = { registerRecoveryHandlers };

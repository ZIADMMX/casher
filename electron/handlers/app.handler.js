const { app } = require('electron');
const authService = require('../services/auth.service');
const { safeHandle } = require('./safeHandle');

function registerAppHandlers() {
  safeHandle('app:restart', () => {
    app.relaunch();
    app.quit();
    return { success: true };
  }, {
    authorize: (event) => authService.requireAuth(event?.sender?.id),
  });
}

module.exports = { registerAppHandlers };

// Keeps the app usable without a technician:
// - a renderer that crashes is reloaded automatically;
// - a renderer frozen for too long is restarted;
// - a crash loop stops auto-reloading and asks before restarting the whole app;
// - the error screen can restart the whole app even when the request queue is
//   full or nobody is logged in (it does not go through safeHandle).
const { app, dialog } = require('electron');
const { logError } = require('./logger.service');

const CRASH_WINDOW_MS = 2 * 60 * 1000;
const MAX_AUTO_RELOADS = 3;
const UNRESPONSIVE_GRACE_MS = 15 * 1000;

let relaunching = false;

// Restart the whole app. The normal before-quit path still runs (backup,
// sessions, LAN server) and is capped at 15 seconds there.
function relaunchApp(reason = 'manual') {
  if (relaunching) return { success: true, alreadyRestarting: true };
  relaunching = true;
  logError('AppRelaunch', new Error(`reason=${reason}`));
  app.relaunch();
  app.quit();
  // If shutdown hangs past its own cap, leave anyway so the new copy can start.
  setTimeout(() => app.exit(0), 20_000).unref();
  return { success: true };
}

// Decides what to do after a renderer crash. Pure, so it can be tested.
function createCrashTracker({ now = () => Date.now(), windowMs = CRASH_WINDOW_MS, max = MAX_AUTO_RELOADS } = {}) {
  let crashes = [];
  return function recordCrash() {
    const t = now();
    crashes = crashes.filter((at) => t - at < windowMs);
    crashes.push(t);
    return crashes.length <= max ? 'reload' : 'ask';
  };
}

function askToRestart(win, message) {
  const choice = dialog.showMessageBoxSync(win && !win.isDestroyed() ? win : undefined, {
    type: 'error',
    title: 'البرنامج يواجه مشكلة',
    message,
    detail: 'بياناتك محفوظة. إعادة التشغيل تحل المشكلة غالبًا، ولو تكررت تواصل مع الدعم.',
    buttons: ['إعادة تشغيل البرنامج', 'إغلاق'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  });
  if (choice === 0) relaunchApp('crash-loop');
  else app.quit();
}

function watchWindow(win) {
  const recordCrash = createCrashTracker();
  let frozenTimer = null;

  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || relaunching || win.isDestroyed()) return;
    if (recordCrash() === 'reload') {
      logError('RendererAutoReload', new Error(`reason=${details.reason}`));
      win.webContents.reload();
    } else {
      askToRestart(win, 'الشاشة توقفت أكثر من مرة خلال دقيقتين.');
    }
  });

  win.on('unresponsive', () => {
    if (frozenTimer) return;
    frozenTimer = setTimeout(() => {
      frozenTimer = null;
      if (win.isDestroyed()) return;
      logError('RendererUnresponsive', new Error('frozen; restarting renderer'));
      // Crashing the renderer hands over to the reload logic above.
      win.webContents.forcefullyCrashRenderer();
    }, UNRESPONSIVE_GRACE_MS);
  });

  win.on('responsive', () => {
    clearTimeout(frozenTimer);
    frozenTimer = null;
  });
}

module.exports = { relaunchApp, createCrashTracker, watchWindow, askToRestart };

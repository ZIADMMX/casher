const { app, BrowserWindow, protocol, net } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

// تسجيل امتيازات البروتوكول المخصص قبل app.whenReady لضمان دعم الأمان والـ fetch
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kashiear-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: true,
      stream: true,
    },
  },
]);
const { initDatabase, migrateSalesTable, migrateUsersTable, migrateSuppliersTable, migrateShiftsTable, migrateReturnsTable, migrateSettingsTable, migrateNotificationsTable, migrateCustomersTable, migrateOrdersTables, migrateSubscriptionsTables, migrateCommissionsTables, migrateCRMTables } = require('./database/db');
const { registerSalesHandlers } = require('./handlers/sales.handler');
const { registerProductHandlers } = require('./handlers/products.handler');
const { registerAuthHandlers } = require('./handlers/auth.handler');
const { registerUsersHandlers } = require('./handlers/users.handler');
const { registerCustomersHandlers } = require('./handlers/customers.handler');
const { registerSuppliersHandlers } = require('./handlers/suppliers.handler');
const { registerPurchasesHandlers } = require('./handlers/purchases.handler');
const { registerShiftsHandlers } = require('./handlers/shifts.handler');
const { registerReportsHandlers } = require('./handlers/reports.handler');
const { registerExportHandlers } = require('./handlers/export.handler');
const { registerPrintHandlers } = require('./handlers/print.handler');
const { registerBackupHandlers } = require('./handlers/backup.handler');
const { autoBackupOnClose } = require('./services/backup.service');
const { registerReturnsHandlers } = require('./handlers/returns.handler');
const { registerSettingsHandlers } = require('./handlers/settings.handler');
const { registerNotificationsHandlers } = require('./handlers/notifications.handler');
const { registerLicenseHandlers } = require('./handlers/license.handler');
const { registerImportHandlers } = require('./handlers/import.handler');
const { registerOrdersHandlers } = require('./handlers/orders.handler');
const { registerSubscriptionsHandlers } = require('./handlers/subscriptions.handler');
const { registerCommissionsHandlers } = require('./handlers/commissions.handler');
const { registerCRMHandlers } = require('./handlers/crm.handler');
const { registerEnterpriseHandlers } = require('./handlers/enterprise.handler');
const { configureUpdater } = require('./updater');
const { logError } = require('./services/logger.service');

// منع فتح أكثر من نسخة من البرنامج في نفس الوقت لتوفير الرام والبروسيسور
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
}

// تحسينات أداء Chromium و Electron
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

function createWindow() {
  const win = new BrowserWindow({
    minWidth: 900,
    minHeight: 600,
    width: 1290,
    backgroundColor: '#15151A', // لون خلفية يمنع الوميض الأبيض لحظة فتح التطبيق
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // يحافظ على استجابة النظام وأجهزة الباركود حتى لو صغرت النافذة
      spellcheck: false, // تعطيل التدقيق اللغوي لتوفير الرام والمعالج
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.setMenuBarVisibility(false);
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
  });
}

app.whenReady().then(async () => {
  try {
    initDatabase();
    migrateSalesTable();
    migrateUsersTable();
    migrateReturnsTable();
    migrateSuppliersTable();
    migrateShiftsTable();
    migrateSettingsTable();
    migrateNotificationsTable();
    migrateCustomersTable();
    migrateOrdersTables();
    migrateSubscriptionsTables();
    migrateCommissionsTables();
    migrateCRMTables();
  } catch (err) {
    logError('DatabaseInit', err);
    app.quit();
    return;
  }

  // تسجيل معالج بروتوكول الوسائط الآمن لعرض صور المنتجات
  protocol.handle('kashiear-media', (request) => {
    try {
      let rawPath = decodeURIComponent(request.url.replace(/^kashiear-media:\/\/+/, ''));
      if (process.platform !== 'win32' && !rawPath.startsWith('/')) {
        rawPath = '/' + rawPath;
      }
      return net.fetch(pathToFileURL(rawPath).toString());
    } catch (err) {
      logError('MediaProtocol', err);
      return new Response('Not Found', { status: 404 });
    }
  });

  registerCustomersHandlers();
  registerSuppliersHandlers();
  registerPurchasesHandlers();
  registerShiftsHandlers();
  registerProductHandlers();
  registerAuthHandlers();
  registerUsersHandlers();
  registerSalesHandlers();
  registerReportsHandlers();
  registerPrintHandlers();
  registerBackupHandlers();
  registerSettingsHandlers();
  registerNotificationsHandlers();
  registerLicenseHandlers();
  registerImportHandlers();
  registerOrdersHandlers();
  registerSubscriptionsHandlers();
  registerCommissionsHandlers();
  registerCRMHandlers();
  registerEnterpriseHandlers();

  const resilienceService = require('./services/resilience.service');
  try {
    await resilienceService.startSystemBackbone();
  } catch (err) {
    logError('ResilienceWorkerStartup', err);
  }
  const { registerResilienceHandlers } = require('./handlers/resilience.handler');
  registerResilienceHandlers();
  createWindow();
  registerReturnsHandlers();
  registerExportHandlers();
  configureUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => {
  autoBackupOnClose();
  require('./services/resilience.service').shutdownSystemBackbone();
});

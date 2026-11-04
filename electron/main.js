const { app, BrowserWindow, protocol, dialog, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { pathToFileURL } = require('node:url');

const { logError } = require('./services/logger.service');

// تسجيل معالجات الاستثناءات العامة لمنع انهيار البرنامج المفاجئ وحفظ تفاصيل الخطأ في السجل
process.on('uncaughtException', (err) => {
  logError('MainProcessUncaughtException', err);
  try {
    dialog.showErrorBox(
      'حدث خطأ غير متوقع',
      `واجه البرنامج خطأ غير متوقع في العمليات الخلفية:\n${err?.message || String(err)}\n\nيرجى حفظ العمل وإعادة تشغيل التطبيق.`
    );
  } catch {}
});

process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason));
  logError('MainProcessUnhandledRejection', err);
});

// إعداد مسار بيانات التطبيق وقاعدة البيانات: AppData النظامي في الإنتاج مع دعم المجلد المحلي في التطوير
function setupUserDataDirectory() {
  const customUserDataDir = process.env.FOX_USER_DATA_DIR || process.env.FOX_E2E_USER_DATA_DIR;
  const isDev = !app.isPackaged;
  const defaultAppData = app.getPath('appData');

  const targetUserDataPath = customUserDataDir
    ? path.resolve(customUserDataDir)
    : (isDev && fs.existsSync('D:\\my-electron-app\\data')
        ? 'D:\\my-electron-app\\data'
        : path.join(defaultAppData, 'kashiear'));

  try {
    fs.mkdirSync(targetUserDataPath, { recursive: true });

    // نقل البيانات القديمة تلقائياً إن وجدت في مسار بديل ولم تكن قد نُقلت بعد
    const legacyDir = path.join(process.env.APPDATA || defaultAppData, 'kashiear');
    const legacyDb = path.join(legacyDir, 'shop.db');
    const targetDb = path.join(targetUserDataPath, 'shop.db');

    if (!customUserDataDir && fs.existsSync(legacyDir) && legacyDir.toLowerCase() !== targetUserDataPath.toLowerCase()) {
      if (!fs.existsSync(targetDb) && fs.existsSync(legacyDb)) {
        try { fs.copyFileSync(legacyDb, targetDb); } catch {}
        for (const ext of ['-wal', '-shm']) {
          if (fs.existsSync(legacyDb + ext)) {
            try { fs.copyFileSync(legacyDb + ext, targetDb + ext); } catch {}
          }
        }
        for (const folder of ['images', 'backups', 'employee-images']) {
          const srcFolder = path.join(legacyDir, folder);
          const dstFolder = path.join(targetUserDataPath, folder);
          if (fs.existsSync(srcFolder) && !fs.existsSync(dstFolder)) {
            try { fs.cpSync(srcFolder, dstFolder, { recursive: true }); } catch {}
          }
        }
        for (const file of ['central-server.json', '.vault.key']) {
          const srcFile = path.join(legacyDir, file);
          const dstFile = path.join(targetUserDataPath, file);
          if (fs.existsSync(srcFile) && !fs.existsSync(dstFile)) {
            try { fs.copyFileSync(srcFile, dstFile); } catch {}
          }
        }
      }
    }

    app.setPath('userData', targetUserDataPath);
  } catch (err) {
    console.error('تعذر إعداد مسار بيانات التطبيق:', err);
  }
}
setupUserDataDirectory();

// احصل على القفل قبل تحميل قاعدة البيانات وبقية الخدمات.
const hasSingleInstanceLock = process.env.FOX_E2E_USER_DATA_DIR || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.exit(0);
}

// تسجيل امتيازات البروتوكول المخصص قبل app.whenReady لضمان دعم الأمان والـ fetch
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kashiear-media',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      bypassCSP: false,
      stream: true,
    },
  },
]);
const { registerMediaProtocol } = require('./security/mediaProtocol');
const { db, dbPath, runAllMigrations } = require('./database/db');
const { registerSalesHandlers } = require('./handlers/sales.handler');
const { registerKitchenHandlers } = require('./handlers/kitchen.handler');
const { registerProductHandlers } = require('./handlers/products.handler');
const { registerAuthHandlers } = require('./handlers/auth.handler');
const { registerUsersHandlers } = require('./handlers/users.handler');
const { registerAttendanceHandlers } = require('./handlers/attendance.handler');
const { registerLeavesHandlers } = require('./handlers/leaves.handler');
const { registerAuditHandlers } = require('./handlers/audit.handler');
const { registerCustomersHandlers } = require('./handlers/customers.handler');
const { registerSuppliersHandlers } = require('./handlers/suppliers.handler');
const { registerPurchasesHandlers } = require('./handlers/purchases.handler');
const { registerShiftsHandlers } = require('./handlers/shifts.handler');
const { registerReportsHandlers } = require('./handlers/reports.handler');
const { registerExportHandlers } = require('./handlers/export.handler');
const { registerPrintHandlers } = require('./handlers/print.handler');
const { registerBackupHandlers } = require('./handlers/backup.handler');
const { autoBackupOnClose, autoBackupDaily } = require('./services/backup.service');
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
const { registerLanHandlers } = require('./handlers/lan.handler');
const { registerInventoryHandlers } = require('./handlers/inventory.handler');
const { registerCentralClientHandlers } = require('./handlers/centralClient.handler');
const { registerAppointmentsHandlers } = require('./handlers/appointments.handler');
const { registerAIHandlers } = require('./handlers/ai.handler');
const { registerChannelsHandlers } = require('./handlers/channels.handler');
const { registerBundlePromotionHandlers } = require('./handlers/bundlePromotions.handler');
const { registerPayrollHandlers } = require('./handlers/payroll.handler');
const { registerReviewsHandlers } = require('./handlers/reviews.handler');
const { registerSalonHandlers } = require('./handlers/salon.handler');
const { registerCasesHandlers } = require('./handlers/cases.handler');
const { registerCourtsHandlers } = require('./handlers/courts.handler');
const { registerGroceryHandlers } = require('./handlers/grocery.handler');
const { registerAppHandlers } = require('./handlers/app.handler');
const salonService = require('./services/salon.service');
const { configureUpdater } = require('./updater');

// تعطيل تسريع كارت الشاشة (Hardware Acceleration) لمنع تجمد التطبيق على أجهزة ويندوز والكروت المدمجة
app.disableHardwareAcceleration();

// تحسينات أداء وكاشينج Chromium و Electron و V8
app.commandLine.appendSwitch('disk-cache-size', '104857600'); // 100MB Disk Cache
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=2048'); // 2GB V8 Heap لمنع اختناق الذاكرة

// تعيين معرف التطبيق لربط أيقونة شريط المهام والإشعارات بشكل صحيح على ويندوز
app.setAppUserModelId('com.foxcloud.pos');

let mainWindow = null;
let dbReady = false;
let isShuttingDown = false;

const APP_INDEX_URL = pathToFileURL(path.join(__dirname, '..', 'dist', 'index.html'));
const VERSION_FILE = () => path.join(app.getPath('userData'), 'last-run-version.txt');
const PRE_MIGRATION_DIR = () => path.join(app.getPath('userData'), 'pre-migration-backups');
const PRE_MIGRATION_KEEP = 3;

function readLastRunVersion() {
  try {
    return fs.readFileSync(VERSION_FILE(), 'utf8').trim();
  } catch {
    return null;
  }
}

function writeLastRunVersion() {
  try {
    fs.writeFileSync(VERSION_FILE(), app.getVersion(), 'utf8');
  } catch (err) {
    logError('WriteLastRunVersion', err);
  }
}

async function backupBeforeMigrationIfNeeded() {
  if (readLastRunVersion() === app.getVersion()) return;

  const { count: tableCount } = db.prepare(
    "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'"
  ).get();
  if (tableCount === 0) return;

  const dir = PRE_MIGRATION_DIR();
  fs.mkdirSync(dir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const target = path.join(dir, `shop-before-v${app.getVersion()}-${stamp}.db`);
  await db.backup(target);

  const backups = fs.readdirSync(dir)
    .filter((file) => file.endsWith('.db'))
    .map((file) => ({ file, modifiedAt: fs.statSync(path.join(dir, file)).mtimeMs }))
    .sort((a, b) => b.modifiedAt - a.modifiedAt);
  for (const backup of backups.slice(PRE_MIGRATION_KEEP)) {
    try {
      fs.unlinkSync(path.join(dir, backup.file));
    } catch (err) {
      logError('PrunePreMigrationBackup', err);
    }
  }
}

function runMigrations() {
  runAllMigrations();
}

function startSafeInterval(name, callback, intervalMs) {
  const run = async () => {
    try {
      await require('./services/licenseGuard.service').requireActiveLicense();
      await callback();
    } catch (err) {
      if (err.code !== 'LICENSE_EXPIRED') {
        logError(name, err);
      }
    }
  };
  run();
  const timer = setInterval(run, intervalMs);
  timer.unref();
}

function isAppUrl(url) {
  try {
    const parsedUrl = new URL(url);
    return parsedUrl.protocol === 'file:' && parsedUrl.pathname === APP_INDEX_URL.pathname;
  } catch {
    return false;
  }
}

function createWindow() {
  const win = new BrowserWindow({
    minWidth: 900,
    minHeight: 600,
    width: 1290,
    backgroundColor: '#15151A', // لون خلفية يمنع الوميض الأبيض لحظة فتح التطبيق
    icon: path.join(
      __dirname,
      '..',
      'build',
      process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    ),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      backgroundThrottling: false, // يحافظ على استجابة النظام وأجهزة الباركود حتى لو صغرت النافذة
      spellcheck: false, // تعطيل التدقيق اللغوي لتوفير الرام والمعالج
      contextIsolation: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
    show: false,
  });

  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  win.setMenuBarVisibility(false);
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) {
      shell.openExternal(url).catch((err) => logError('OpenExternal', err));
    }
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    if (!isAppUrl(navigationUrl)) event.preventDefault();
  });
  win.webContents.on('console-message', (_event, details) => {
    if (details.level >= 3) {
      logError(
        'RendererConsole',
        new Error(`${details.message} (${details.sourceId}:${details.lineNumber})`)
      );
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    logError('RendererProcessGone', new Error(
      `reason=${details.reason}, exitCode=${details.exitCode}`
    ));
  });
  win.webContents.on('preload-error', (_event, preloadPath, error) => {
    logError('RendererPreload', new Error(`${preloadPath}: ${error.message}`));
  });
  win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  win.once('ready-to-show', () => {
    win.show();
  });
}

app.on('second-instance', () => {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
});

app.whenReady().then(async () => {
  if (!hasSingleInstanceLock) return;

  try {
    try {
      await backupBeforeMigrationIfNeeded();
    } catch (err) {
      logError('PreMigrationBackup', err);
    }

    runMigrations();

    const enterpriseService = require('./services/enterprise.service');
    if (!enterpriseService.seedEnterpriseDefaults()) {
      throw new Error('تعذر تهيئة جداول وإعدادات Enterprise بعد ترحيل قاعدة البيانات');
    }
    // مسح أي جلسة سابقة عند فتح التطبيق لضمان إظهار شاشة تسجيل الدخول دائماً
    const authService = require('./services/auth.service');
    authService.clearAllSessions();
    dbReady = true;
    writeLastRunVersion();
  } catch (err) {
    logError('DatabaseInit', err);
    dialog.showErrorBox(
      'تعذر تشغيل البرنامج',
      `حدث خطأ أثناء تجهيز قاعدة البيانات:\n${err.message}\n\n` +
      `بياناتك لم تُحذف. تواصل مع الدعم وأرسل ملف السجل.\n` +
      `نسخ ما قبل الترحيل (إن وُجدت) في:\n${PRE_MIGRATION_DIR()}\n` +
      `ملف قاعدة البيانات: ${dbPath}`
    );
    app.exit(1);
    return;
  }

  // تسجيل معالج بروتوكول الوسائط الآمن مع حماية صارمة لمنع قراءة أي ملفات خارج مجلدات الوسائط المعتمدة
  registerMediaProtocol();

  registerCustomersHandlers();
  registerSuppliersHandlers();
  registerPurchasesHandlers();
  registerShiftsHandlers();
  registerProductHandlers();
  registerAuthHandlers();
  registerUsersHandlers();
  registerAttendanceHandlers();
  registerLeavesHandlers();
  registerAuditHandlers();
  registerSalesHandlers();
  registerKitchenHandlers();
  registerBundlePromotionHandlers();
  registerReportsHandlers();
  registerPrintHandlers();
  registerBackupHandlers();
  registerSettingsHandlers();
  registerNotificationsHandlers();
  registerLicenseHandlers();
  registerImportHandlers();
  registerOrdersHandlers();
  registerAppointmentsHandlers();
  registerSubscriptionsHandlers();
  registerCommissionsHandlers();
  registerCRMHandlers();
  registerEnterpriseHandlers();
  registerInventoryHandlers();
  registerLanHandlers();
  registerCentralClientHandlers();
  registerAIHandlers();
  registerChannelsHandlers();
  registerPayrollHandlers();
  registerReviewsHandlers();
  registerSalonHandlers();
  registerCasesHandlers();
  registerCourtsHandlers();
  registerGroceryHandlers();
  registerAppHandlers();
  registerReturnsHandlers();
  registerExportHandlers();
  try {
    salonService.seedSalonDefaultsIfEmpty();
  } catch (e) {
    logError('SeedSalonDefaults', e);
  }

  const { registerUIConfigHandlers } = require('./handlers/ui-config.handler');
  registerUIConfigHandlers();

  const { registerOnboardingHandlers } = require('./handlers/onboarding.handler');
  registerOnboardingHandlers();

  const { requireActiveLicense } = require('./services/licenseGuard.service');
  const licenseStatusTimer = setInterval(async () => {
    try {
      await requireActiveLicense({
        sender: mainWindow && !mainWindow.isDestroyed() ? mainWindow.webContents : null,
      });
    } catch (error) {
      if (error.code !== 'LICENSE_EXPIRED' && mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('license:verificationFailed', { message: error.message });
      }
    }
  }, 15_000);
  licenseStatusTimer.unref();

  const resilienceService = require('./services/resilience.service');
  const { registerResilienceHandlers } = require('./handlers/resilience.handler');
  registerResilienceHandlers();
  createWindow();
  resilienceService.startSystemBackbone().catch((err) => {
    logError('ResilienceWorkerStartup', err);
  });
  const appointmentsService = require('./services/appointments.service');
  startSafeInterval('AppointmentReminders', () => appointmentsService.checkDueReminders(), 60_000);
  const crmService = require('./services/crm.service');
  startSafeInterval('CrmReminders', () => crmService.checkDueReminders(), 60_000);
  const casesService = require('./services/cases.service');
  startSafeInterval('CourtSessionReminders', () => casesService.checkDueCourtSessionReminders(48), 60_000);
    startSafeInterval('LegalTaskReminders', () => casesService.checkDueCaseTaskReminders(), 60_000);
  startSafeInterval('DailyDatabaseBackup', () => autoBackupDaily(), 6 * 60 * 60 * 1000);
  configureUpdater();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});


app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

async function runShutdownSteps() {
  const steps = [
    ['AutoBackupOnClose', () => autoBackupOnClose()],
    ['ClearSessions', () => require('./services/auth.service').clearAllSessions()],
    ['ResilienceShutdown', () => require('./services/resilience.service').shutdownSystemBackbone()],
    ['LanServerStop', () => require('./services/lanServer.service').stopServer()],
  ];
  for (const [name, run] of steps) {
    try {
      await run();
    } catch (err) {
      logError(name, err);
    }
  }
}

app.on('before-quit', (event) => {
  if (isShuttingDown) return;
  isShuttingDown = true;
  if (!dbReady) return;

  event.preventDefault();
  let timeoutId;
  const timeout = new Promise((resolve) => {
    timeoutId = setTimeout(resolve, 15_000);
  });
  Promise.race([runShutdownSteps(), timeout]).finally(() => {
    clearTimeout(timeoutId);
    app.quit();
  });
});

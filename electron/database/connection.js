const Database = require('better-sqlite3');
const path = require('node:path');
const fs = require('node:fs');

let app;
try {
  app = require('electron').app;
} catch {
  app = null;
}

const isDev = !app?.isPackaged;
const defaultAppData = process.env.APPDATA || (process.platform === 'darwin' ? path.join(process.env.HOME || '', 'Library', 'Application Support') : __dirname);
// The project's own data/ folder in development, wherever the project lives.
const devDataDir = path.join(__dirname, '..', '..', 'data');
const fallbackDataDir = (isDev && fs.existsSync(devDataDir))
  ? devDataDir
  : path.join(defaultAppData, 'kashiear');

const userDataDir = app?.getPath
  ? app.getPath('userData')
  : (process.env.FOX_USER_DATA_DIR || process.env.FOX_E2E_USER_DATA_DIR || (process.env.NODE_ENV === 'test' ? path.join(process.env.TEMP || 'D:\\temp', 'kashiear') : fallbackDataDir));
if (userDataDir !== ':memory:' && !fs.existsSync(userDataDir)) {
  try { fs.mkdirSync(userDataDir, { recursive: true }); } catch {}
}
const dbPath = userDataDir === ':memory:' ? ':memory:' : path.join(userDataDir, 'shop.db');
const DATABASE_SCHEMA_VERSION = 23;
const SALES_SCHEMA_VERSION = 6;

const DATABASE_LOCK_TIMEOUT_MS = 30000;

const db = new Database(dbPath, {
  timeout: DATABASE_LOCK_TIMEOUT_MS,
});

function configureDatabaseConnection(database = db) {
  if (!database || typeof database.pragma !== 'function') {
    return database;
  }

  try {
    database.pragma('foreign_keys = ON');
  } catch (e) {
    console.warn('تعذر ضبط foreign_keys = ON:', e.message);
  }

  try {
    database.pragma('journal_mode = WAL');
  } catch (e) {
    console.warn('تعذر ضبط journal_mode = WAL:', e.message);
  }

  try {
    database.pragma(`busy_timeout = ${DATABASE_LOCK_TIMEOUT_MS}`);
  } catch (e) {
    console.warn('تعذر ضبط busy_timeout:', e.message);
  }

  try {
    database.pragma('synchronous = NORMAL');
    database.pragma('cache_size = -64000');
    database.pragma('temp_store = MEMORY');
  } catch (e) {
    console.warn('تعذر ضبط إعدادات الأداء لقاعدة البيانات:', e.message);
  }

  return database;
}

function checkpointWalIfNeeded(database = db) {
  if (!database || typeof database.pragma !== 'function') return;

  try {
    database.pragma('wal_checkpoint(PASSIVE)');
  } catch {
    // Do not fail shutdown or backup because WAL checkpoint is advisory only.
  }
}

function closeDatabase() {
  if (!db || !db.open) return;

  try {
    checkpointWalIfNeeded(db);
  } catch {}

  try {
    db.close();
  } catch (err) {
    console.warn('تعذر إغلاق اتصال قاعدة البيانات بشكل نظيف:', err.message);
  }
}

configureDatabaseConnection(db);

module.exports = {
  db,
  dbPath,
  DATABASE_SCHEMA_VERSION,
  SALES_SCHEMA_VERSION,
  configureDatabaseConnection,
  checkpointWalIfNeeded,
  closeDatabase,
};

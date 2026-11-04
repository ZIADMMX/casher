// F2: a restored file must not carry foreign triggers/views or a newer/unknown schema,
//     and restoring must end existing sessions.
// F3: manual backups must not default to a folder other Windows accounts can write.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');

const mockRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'restore-hardening-'));
const mockDatabasePath = path.join(mockRoot, 'data', 'shop.db');
let mockLiveDatabase;

jest.mock('electron', () => ({
  dialog: { showSaveDialogSync: jest.fn(() => null), showOpenDialogSync: jest.fn() },
  app: {
    relaunch: jest.fn(),
    exit: jest.fn(),
    getPath: jest.fn((name) => require('node:path').join(mockRoot, name)),
  },
}));

jest.mock('../../electron/database/db', () => ({
  db: {
    backup: jest.fn(async (destPath) => {
      const LocalDatabase = require('better-sqlite3');
      const source = new LocalDatabase(mockDatabasePath);
      try { await source.backup(destPath); } finally { source.close(); }
    }),
  },
  dbPath: mockDatabasePath,
  closeDatabase: jest.fn(() => {
    if (mockLiveDatabase && mockLiveDatabase.open) mockLiveDatabase.close();
    mockLiveDatabase = null;
  }),
}));

jest.mock('../../electron/services/logger.service', () => ({ logError: jest.fn() }));

const { dialog } = require('electron');
const backupService = require('../../electron/services/backup.service');

const APP_SCHEMA = `
  CREATE TABLE users (id INTEGER PRIMARY KEY, username TEXT, role TEXT);
  CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE sales (id INTEGER PRIMARY KEY, total REAL);
  CREATE TRIGGER trg_app_known AFTER INSERT ON sales BEGIN SELECT 1; END;
`;

function makeDatabase(filePath, { extraSql = '', version = 12, schema = APP_SCHEMA } = {}) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const database = new Database(filePath);
  database.exec(schema + extraSql);
  database.pragma(`user_version = ${version}`);
  return database;
}

function makeBackup(name, options) {
  const filePath = path.join(mockRoot, 'incoming', name);
  makeDatabase(filePath, options).close();
  return filePath;
}

function liveMarker() {
  const database = new Database(mockDatabasePath, { readonly: true });
  try { return database.prepare("SELECT value FROM settings WHERE key = 'marker'").get()?.value; }
  finally { database.close(); }
}

function schemaObjects(type) {
  const database = new Database(mockDatabasePath, { readonly: true });
  try { return database.prepare('SELECT name FROM sqlite_master WHERE type = ?').all(type).map((r) => r.name); }
  finally { database.close(); }
}

beforeEach(() => {
  jest.clearAllMocks();
  // A rejected restore never calls closeDatabase, so close the previous live handle here.
  if (mockLiveDatabase && mockLiveDatabase.open) mockLiveDatabase.close();
  fs.rmSync(path.join(mockRoot, 'data'), { recursive: true, force: true });
  mockLiveDatabase = makeDatabase(mockDatabasePath);
  mockLiveDatabase.prepare("INSERT INTO settings (key, value) VALUES ('marker', 'live')").run();
});

afterAll(() => {
  if (mockLiveDatabase && mockLiveDatabase.open) mockLiveDatabase.close();
  fs.rmSync(mockRoot, { recursive: true, force: true });
});

describe('Security: restore sanitizes the incoming database', () => {
  test('drops triggers and views this app does not define, keeps known ones', async () => {
    const backup = makeBackup('crafted.db', {
      extraSql: `
        CREATE TRIGGER trg_evil AFTER INSERT ON users BEGIN UPDATE users SET role = 'admin'; END;
        CREATE VIEW v_evil AS SELECT * FROM users;
        INSERT INTO settings (key, value) VALUES ('marker', 'restored');
      `,
    });

    await backupService.restoreDatabase(backup);

    expect(liveMarker()).toBe('restored');
    expect(schemaObjects('trigger')).toEqual(['trg_app_known']);
    expect(schemaObjects('view')).toEqual([]);
  });

  test('drops a known trigger name whose body was changed', async () => {
    const backup = makeBackup('tampered.db', {
      schema: APP_SCHEMA.replace('BEGIN SELECT 1; END', "BEGIN UPDATE users SET role = 'admin'; END"),
    });

    await backupService.restoreDatabase(backup);

    expect(schemaObjects('trigger')).toEqual([]);
  });

  test('rejects a file that is not one of this app\'s databases', async () => {
    const backup = makeBackup('foreign.db', { schema: 'CREATE TABLE notes (body TEXT);' });

    await expect(backupService.restoreDatabase(backup)).rejects.toThrow();
    expect(liveMarker()).toBe('live');
  });

  test('rejects a backup made by a newer version of the app', async () => {
    const backup = makeBackup('newer.db', { version: 999 });

    await expect(backupService.restoreDatabase(backup)).rejects.toThrow();
    expect(liveMarker()).toBe('live');
  });

  test('ends every session by rotating the signing secret', async () => {
    const secretFile = path.join(path.dirname(mockDatabasePath), 'session.key');
    fs.writeFileSync(secretFile, 'a'.repeat(64));
    const backup = makeBackup('normal.db');

    await backupService.restoreDatabase(backup);

    expect(fs.existsSync(secretFile)).toBe(false);
  });
});

describe('Security: manual backups default to a private folder', () => {
  test('the default backup location is inside the user Documents folder', () => {
    const defaultPath = backupService.getDefaultBackupPath();
    expect(defaultPath.startsWith(path.join(mockRoot, 'documents'))).toBe(true);
    expect(path.extname(defaultPath)).toBe('.db');
  });

  test('the settings screen backup and restore dialogs open there too', async () => {
    const handlers = new Map();
    jest.isolateModules(() => {
      jest.doMock('../../electron/handlers/safeHandle', () => ({ safeHandle: (channel, fn) => handlers.set(channel, fn) }));
      jest.doMock('../../electron/services/auth.service', () => ({ requireAdmin: jest.fn() }));
      const electron = require('electron');
      electron.BrowserWindow = { fromWebContents: jest.fn(() => null) };
      electron.dialog.showSaveDialog = jest.fn(async () => ({ canceled: true }));
      electron.dialog.showOpenDialog = jest.fn(async () => ({ canceled: true }));
      require('../../electron/handlers/settings.handler').registerSettingsHandlers();
    });
    const electron = require('electron');

    await handlers.get('settings:backup')({ sender: {} });
    await handlers.get('settings:restore')({ sender: {} });

    const documents = path.join(mockRoot, 'documents');
    expect(electron.dialog.showSaveDialog.mock.calls[0][1].defaultPath.startsWith(documents)).toBe(true);
    expect(electron.dialog.showOpenDialog.mock.calls[0][1].defaultPath.startsWith(documents)).toBe(true);
  });

  test('the save dialog of backupNow opens there', async () => {
    await backupService.backupNow();
    const { defaultPath } = dialog.showSaveDialogSync.mock.calls[0][0];
    expect(defaultPath).toBe(backupService.getDefaultBackupPath());
  });
});

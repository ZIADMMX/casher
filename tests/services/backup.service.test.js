const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const mockDatabasePath = path.join(os.tmpdir(), `kashiear-backup-service-${process.pid}`, 'shop.db');
const mockBackupRoot = path.join(os.tmpdir(), `kashiear-backup-dest-${process.pid}`);
const mockManualBackupPath = path.join(mockBackupRoot, 'manual.db');
let mockLiveDatabase;
// Restore only accepts files that carry this app's core tables.
const APP_CORE_TABLES = 'CREATE TABLE users (id INTEGER PRIMARY KEY); '
  + 'CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT); '
  + 'CREATE TABLE sales (id INTEGER PRIMARY KEY); ';

jest.mock('electron', () => ({
  dialog: {
    showSaveDialogSync: jest.fn(() => mockManualBackupPath),
    showOpenDialogSync: jest.fn(),
  },
  app: { relaunch: jest.fn(), exit: jest.fn(), getPath: jest.fn(() => mockBackupRoot) },
}));

jest.mock('../../electron/database/db', () => ({
  db: {
    backup: jest.fn(async (destPath) => {
      const fs = require('node:fs');
      const LocalDatabase = require('better-sqlite3');
      fs.mkdirSync(require('node:path').dirname(destPath), { recursive: true });
      if (fs.existsSync(mockDatabasePath)) {
        const sourceDb = new LocalDatabase(mockDatabasePath);
        try {
          await sourceDb.backup(destPath);
        } finally {
          sourceDb.close();
        }
      } else {
        const destinationDb = new LocalDatabase(destPath);
        destinationDb.exec('CREATE TABLE backup_probe (value TEXT)');
        destinationDb.close();
      }
    }),
  },
  dbPath: mockDatabasePath,
  closeDatabase: jest.fn(() => {
    if (mockLiveDatabase && mockLiveDatabase.open) mockLiveDatabase.close();
    mockLiveDatabase = null;
  }),
}));

jest.mock('../../electron/services/logger.service', () => ({
  logError: jest.fn(),
}));

const { logError } = require('../../electron/services/logger.service');
const backupService = require('../../electron/services/backup.service');

function createLiveDatabase({ wal = false } = {}) {
  fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(mockDatabasePath), { recursive: true });
  mockLiveDatabase = new Database(mockDatabasePath);
  if (wal) {
    mockLiveDatabase.pragma('journal_mode = WAL');
    mockLiveDatabase.pragma('wal_autocheckpoint = 0');
  }
  mockLiveDatabase.exec('CREATE TABLE live_restore (msg TEXT NOT NULL)');
  mockLiveDatabase.prepare('INSERT INTO live_restore (msg) VALUES (?)').run('original live data');
}

afterEach(() => {
  if (mockLiveDatabase && mockLiveDatabase.open) mockLiveDatabase.close();
  mockLiveDatabase = null;
  fs.rmSync(mockBackupRoot, { recursive: true, force: true });
  fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
});

describe('backup.service.backupNow', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    fs.rmSync(mockBackupRoot, { recursive: true, force: true });
  });

  test('creates a consistent SQLite backup and returns both path keys', async () => {
    const { db } = require('../../electron/database/db');

    const result = await backupService.backupNow();

    expect(db.backup).toHaveBeenCalledWith(expect.stringContaining('.manual.db.backup.'));
    expect(result).toEqual({
      success: true,
      filePath: mockManualBackupPath,
      path: mockManualBackupPath,
    });
    const backupDb = new Database(mockManualBackupPath, { readonly: true });
    expect(backupDb.pragma('integrity_check', { simple: true })).toBe('ok');
    backupDb.close();
  });

  test('returns a failure object and logs when backup fails', async () => {
    const { db } = require('../../electron/database/db');
    db.backup.mockRejectedValueOnce(new Error('disk unavailable'));

    const result = await backupService.backupNow();

    expect(result).toEqual({
      success: false,
      message: 'disk unavailable',
      filePath: null,
      path: null,
    });
    expect(logError).toHaveBeenCalledWith('BackupNow', expect.any(Error));
  });

  test('includes committed records that are still in the WAL file', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-wal-backup-'));
    const sourcePath = path.join(tempDir, 'source.db');
    const backupPath = path.join(tempDir, 'backup.db');
    let sourceDb;
    let backupDb;

    try {
      sourceDb = new Database(sourcePath);
      sourceDb.pragma('journal_mode = WAL');
      sourceDb.pragma('wal_autocheckpoint = 0');
      sourceDb.exec('CREATE TABLE wal_probe (value TEXT NOT NULL)');
      sourceDb.prepare('INSERT INTO wal_probe (value) VALUES (?)').run('committed in WAL');

      expect(fs.statSync(`${sourcePath}-wal`).size).toBeGreaterThan(0);

      await sourceDb.backup(backupPath);
      backupDb = new Database(backupPath, { readonly: true, fileMustExist: true });

      expect(backupDb.prepare('SELECT value FROM wal_probe').get().value)
        .toBe('committed in WAL');
    } finally {
      if (backupDb?.open) backupDb.close();
      if (sourceDb?.open) sourceDb.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe('backup.service.autoBackupOnClose', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a consistent asynchronous backup before shutdown', async () => {
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    const { db } = require('../../electron/database/db');

    try {
      const result = await backupService.autoBackupOnClose();

      expect(db.backup).toHaveBeenCalledWith(expect.stringContaining('kashiear-auto-'));
      expect(result).toEqual({
        success: true,
        filePath: expect.stringMatching(/kashiear-auto-.*\.db$/),
      });
    } finally {
      fs.readdirSync.mockRestore();
    }
  });

  test('keeps only the five most recent shutdown backups', async () => {
    jest.spyOn(fs, 'readdirSync').mockReturnValue([
      'kashiear-auto-2026-01-01.db',
      'kashiear-auto-2026-01-02.db',
      'kashiear-auto-2026-01-03.db',
      'kashiear-auto-2026-01-04.db',
      'kashiear-auto-2026-01-05.db',
      'kashiear-auto-2026-01-06.db',
      'kashiear-auto-2026-01-07.db',
    ]);
    const unlinkSpy = jest.spyOn(fs, 'unlinkSync').mockImplementation(() => {});

    try {
      await backupService.autoBackupOnClose();

      expect(unlinkSpy).toHaveBeenCalledTimes(2);
      expect(unlinkSpy).toHaveBeenCalledWith(path.join(
        mockBackupRoot,
        'backups',
        'kashiear-auto-2026-01-02.db'
      ));
      expect(unlinkSpy).toHaveBeenCalledWith(path.join(
        mockBackupRoot,
        'backups',
        'kashiear-auto-2026-01-01.db'
      ));
    } finally {
      fs.readdirSync.mockRestore();
      unlinkSpy.mockRestore();
    }
  });
});

describe('backup.service.autoBackupDaily', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates one daily SQLite backup', async () => {
    const dateKey = new Date().toISOString().slice(0, 10);
    const dailyBackupPath = path.join(mockBackupRoot, 'backups', `kashiear-daily-${dateKey}.db`);
    const realExistsSync = fs.existsSync.bind(fs);
    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => (
      filePath === dailyBackupPath ? false : realExistsSync(filePath)
    ));
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    const { db } = require('../../electron/database/db');

    try {
      const result = await backupService.autoBackupDaily();

      expect(db.backup).toHaveBeenCalledWith(expect.stringContaining('kashiear-daily-'));
      expect(result).toEqual({
        success: true,
        filePath: expect.stringMatching(/kashiear-daily-/),
      });
    } finally {
      fs.existsSync.mockRestore();
      fs.readdirSync.mockRestore();
    }
  });

  test('does not overwrite an existing daily backup', async () => {
    const dateKey = new Date().toISOString().slice(0, 10);
    const dailyBackupPath = path.join(mockBackupRoot, 'backups', `kashiear-daily-${dateKey}.db`);
    fs.mkdirSync(path.dirname(dailyBackupPath), { recursive: true });
    const existingBackup = new Database(dailyBackupPath);
    existingBackup.exec('CREATE TABLE existing_backup (value TEXT)');
    existingBackup.close();
    const realExistsSync = fs.existsSync.bind(fs);
    jest.spyOn(fs, 'existsSync').mockImplementation((filePath) => (
      filePath === dailyBackupPath || realExistsSync(filePath)
    ));
    const { db } = require('../../electron/database/db');

    try {
      const result = await backupService.autoBackupDaily();

      expect(db.backup).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: true, skipped: true });
    } finally {
      fs.existsSync.mockRestore();
    }
  });

  test('replaces a damaged daily backup instead of reporting it as safely skipped', async () => {
    const dateKey = new Date().toISOString().slice(0, 10);
    const dailyBackupPath = path.join(mockBackupRoot, 'backups', `kashiear-daily-${dateKey}.db`);
    fs.mkdirSync(path.dirname(dailyBackupPath), { recursive: true });
    fs.writeFileSync(dailyBackupPath, 'damaged backup');

    const result = await backupService.autoBackupDaily();

    expect(result).toMatchObject({ success: true, filePath: dailyBackupPath });
    expect(result.skipped).toBeUndefined();
    // SqliteError comes from the native module's realm, so check the shape, not instanceof.
    expect(logError).toHaveBeenCalledWith(
      'VerifyExistingDailyBackup',
      expect.objectContaining({ message: expect.stringContaining('not a database') })
    );
    const repairedBackup = new Database(dailyBackupPath, { readonly: true });
    expect(repairedBackup.pragma('integrity_check', { simple: true })).toBe('ok');
    repairedBackup.close();
  });
});

describe('backup.service.restoreFromBackup', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a damaged SQLite file before closing or replacing the live database', async () => {
    const { dialog, app } = require('electron');
    const { closeDatabase } = require('../../electron/database/db');
    const damagedBackupPath = path.join(os.tmpdir(), `damaged-backup-${process.pid}.db`);
    const damagedBackup = Buffer.alloc(128);
    Buffer.from('SQLite format 3\0').copy(damagedBackup);
    damagedBackup.writeUInt16BE(4096, 16);

    fs.mkdirSync(path.dirname(mockDatabasePath), { recursive: true });
    fs.writeFileSync(mockDatabasePath, 'live database remains intact');
    fs.writeFileSync(damagedBackupPath, damagedBackup);
    dialog.showOpenDialogSync.mockReturnValue([damagedBackupPath]);

    try {
      await expect(backupService.restoreFromBackup()).rejects.toThrow();
      expect(closeDatabase).not.toHaveBeenCalled();
      expect(app.relaunch).not.toHaveBeenCalled();
      expect(fs.readFileSync(mockDatabasePath, 'utf8')).toBe('live database remains intact');
    } finally {
      fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
      fs.rmSync(damagedBackupPath, { force: true });
    }
  });

  test('uses an atomic temp-file swap and a consistent emergency backup', async () => {
    const { dialog, app } = require('electron');
    const { closeDatabase } = require('../../electron/database/db');
    const validBackupPath = path.join(os.tmpdir(), `valid-backup-atomic-${process.pid}.db`);
    const validDb = new Database(validBackupPath);
    validDb.exec(`${APP_CORE_TABLES}CREATE TABLE atomic_restore (id INTEGER PRIMARY KEY, msg TEXT)`);
    validDb.prepare('INSERT INTO atomic_restore (msg) VALUES (?)').run('restored atomically');
    validDb.close();

    createLiveDatabase({ wal: true });
    expect(fs.statSync(`${mockDatabasePath}-wal`).size).toBeGreaterThan(0);
    dialog.showOpenDialogSync.mockReturnValue([validBackupPath]);
    const renameSpy = jest.spyOn(fs, 'renameSync');

    try {
      const res = await backupService.restoreFromBackup();
      expect(res).toMatchObject({ success: true, message: 'تمت استعادة قاعدة البيانات بنجاح' });
      expect(closeDatabase).toHaveBeenCalled();
      expect(renameSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\.restore\.[^\\/]+\.tmp$/),
        mockDatabasePath
      );
      expect(app.relaunch).toHaveBeenCalled();
      const emergencyPath = fs.readdirSync(path.dirname(mockDatabasePath))
        .find((file) => file.startsWith('shop.db.before-restore-'));
      expect(emergencyPath).toBeDefined();
      const emergencyDb = new Database(path.join(path.dirname(mockDatabasePath), emergencyPath), { readonly: true });
      expect(emergencyDb.prepare('SELECT msg FROM live_restore').get().msg).toBe('original live data');
      emergencyDb.close();
    } finally {
      renameSpy.mockRestore();
      fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
      fs.rmSync(validBackupPath, { force: true });
    }
  });

  test('cleans up obsolete WAL and SHM files on successful restore to prevent database corruption', async () => {
    const { dialog, app } = require('electron');
    const { closeDatabase } = require('../../electron/database/db');
    const validBackupPath = path.join(os.tmpdir(), `valid-backup-${process.pid}.db`);
    const validDb = new Database(validBackupPath);
    validDb.exec(`${APP_CORE_TABLES}CREATE TABLE test_table (id INTEGER PRIMARY KEY, msg TEXT)`);
    validDb.prepare('INSERT INTO test_table (msg) VALUES (?)').run('valid data');
    validDb.close();

    createLiveDatabase();
    const oldWalPath = `${mockDatabasePath}-wal`;
    const oldShmPath = `${mockDatabasePath}-shm`;
    fs.writeFileSync(oldWalPath, 'old wal data that would corrupt new db');
    fs.writeFileSync(oldShmPath, 'old shm data');

    dialog.showOpenDialogSync.mockReturnValue([validBackupPath]);

    try {
      const res = await backupService.restoreFromBackup();
      expect(res).toMatchObject({ success: true, message: 'تمت استعادة قاعدة البيانات بنجاح' });
      expect(closeDatabase).toHaveBeenCalled();
      expect(app.relaunch).toHaveBeenCalled();
      expect(app.exit).toHaveBeenCalledWith(0);

      // Verify WAL and SHM files were deleted
      expect(fs.existsSync(oldWalPath)).toBe(false);
      expect(fs.existsSync(oldShmPath)).toBe(false);

      // Verify the restored database opens and contains the restored data
      const restored = new Database(mockDatabasePath, { readonly: true });
      const row = restored.prepare('SELECT msg FROM test_table WHERE id = 1').get();
      restored.close();
      expect(row.msg).toBe('valid data');
    } finally {
      fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
      fs.rmSync(validBackupPath, { force: true });
    }
  });
});

describe('settings restore delegation', () => {
  test('uses the same validated restore flow as the backup screen', async () => {
    const SettingsService = require('../../electron/services/settings.service');
    const restoreSpy = jest.spyOn(backupService, 'restoreDatabase')
      .mockResolvedValue({ success: true, message: 'تمت استعادة قاعدة البيانات بنجاح' });

    await expect(SettingsService.restoreDatabase('selected-backup.db')).resolves.toEqual({
      success: true,
      message: 'تمت استعادة قاعدة البيانات بنجاح',
    });
    expect(restoreSpy).toHaveBeenCalledWith('selected-backup.db');
    restoreSpy.mockRestore();
  });
});

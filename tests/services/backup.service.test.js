const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const Database = require('better-sqlite3');
const mockDatabasePath = path.join(os.tmpdir(), `kashiear-backup-service-${process.pid}`, 'shop.db');

jest.mock('electron', () => ({
  dialog: {
    showSaveDialogSync: jest.fn(() => 'C:\\backup\\shop.db'),
    showOpenDialogSync: jest.fn(),
  },
  app: { relaunch: jest.fn(), exit: jest.fn(), getPath: jest.fn(() => 'C:\\data') },
}));

jest.mock('../../electron/database/db', () => ({
  db: { backup: jest.fn(() => Promise.resolve()) },
  dbPath: mockDatabasePath,
  closeDatabase: jest.fn(),
}));

jest.mock('../../electron/services/logger.service', () => ({
  logError: jest.fn(),
}));

const { logError } = require('../../electron/services/logger.service');
const backupService = require('../../electron/services/backup.service');

describe('backup.service.backupNow', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates a consistent SQLite backup and returns both path keys', async () => {
    const { db } = require('../../electron/database/db');

    const result = await backupService.backupNow();

    expect(db.backup).toHaveBeenCalledWith('C:\\backup\\shop.db');
    expect(result).toEqual({
      success: true,
      filePath: 'C:\\backup\\shop.db',
      path: 'C:\\backup\\shop.db',
    });
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
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    const { db } = require('../../electron/database/db');

    try {
      const result = await backupService.autoBackupOnClose();

      expect(db.backup).toHaveBeenCalledWith(expect.stringMatching(
        /^C:\\data\\backups\\kashiear-auto-.*\.db$/
      ));
      expect(result).toEqual({
        success: true,
        filePath: expect.stringMatching(/^C:\\data\\backups\\kashiear-auto-.*\.db$/),
      });
    } finally {
      fs.mkdirSync.mockRestore();
      fs.readdirSync.mockRestore();
    }
  });

  test('keeps only the five most recent shutdown backups', async () => {
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
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
        'C:\\data\\backups',
        'kashiear-auto-2026-01-02.db'
      ));
      expect(unlinkSpy).toHaveBeenCalledWith(path.join(
        'C:\\data\\backups',
        'kashiear-auto-2026-01-01.db'
      ));
    } finally {
      fs.mkdirSync.mockRestore();
      fs.readdirSync.mockRestore();
      unlinkSpy.mockRestore();
    }
  });
});

describe('backup.service.autoBackupDaily', () => {
  beforeEach(() => jest.clearAllMocks());

  test('creates one daily SQLite backup', async () => {
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'readdirSync').mockReturnValue([]);
    const { db } = require('../../electron/database/db');

    try {
      const result = await backupService.autoBackupDaily();

      expect(db.backup).toHaveBeenCalledWith(expect.stringMatching(
        /^C:\\data\\backups\\kashiear-daily-\d{4}-\d{2}-\d{2}\.db$/
      ));
      expect(result).toEqual({
        success: true,
        filePath: expect.stringMatching(/^C:\\data\\backups\\kashiear-daily-/),
      });
    } finally {
      fs.mkdirSync.mockRestore();
      fs.existsSync.mockRestore();
      fs.readdirSync.mockRestore();
    }
  });

  test('does not overwrite an existing daily backup', async () => {
    jest.spyOn(fs, 'mkdirSync').mockImplementation(() => {});
    jest.spyOn(fs, 'existsSync').mockReturnValue(true);
    const { db } = require('../../electron/database/db');

    try {
      const result = await backupService.autoBackupDaily();

      expect(db.backup).not.toHaveBeenCalled();
      expect(result).toMatchObject({ success: true, skipped: true });
    } finally {
      fs.mkdirSync.mockRestore();
      fs.existsSync.mockRestore();
    }
  });
});

describe('backup.service.restoreFromBackup', () => {
  beforeEach(() => jest.clearAllMocks());

  test('rejects a damaged SQLite file before closing or replacing the live database', () => {
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
      expect(() => backupService.restoreFromBackup()).toThrow();
      expect(closeDatabase).not.toHaveBeenCalled();
      expect(app.relaunch).not.toHaveBeenCalled();
      expect(fs.readFileSync(mockDatabasePath, 'utf8')).toBe('live database remains intact');
    } finally {
      fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
      fs.rmSync(damagedBackupPath, { force: true });
    }
  });

  test('uses an atomic temp-file swap when restoring a backup to avoid partial overwrites', () => {
    const { dialog, app } = require('electron');
    const { closeDatabase } = require('../../electron/database/db');
    const validBackupPath = path.join(os.tmpdir(), `valid-backup-atomic-${process.pid}.db`);
    const validDb = new Database(validBackupPath);
    validDb.exec('CREATE TABLE atomic_restore (id INTEGER PRIMARY KEY, msg TEXT)');
    validDb.prepare('INSERT INTO atomic_restore (msg) VALUES (?)').run('restored atomically');
    validDb.close();

    fs.mkdirSync(path.dirname(mockDatabasePath), { recursive: true });
    fs.writeFileSync(mockDatabasePath, 'original db');
    dialog.showOpenDialogSync.mockReturnValue([validBackupPath]);
    const renameSpy = jest.spyOn(fs, 'renameSync');

    try {
      const res = backupService.restoreFromBackup();
      expect(res).toEqual({ success: true });
      expect(closeDatabase).toHaveBeenCalled();
      expect(renameSpy).toHaveBeenCalledWith(
        expect.stringMatching(/\.restore-tmp\.[^\\/]+\.db$/),
        mockDatabasePath
      );
      expect(app.relaunch).toHaveBeenCalled();
    } finally {
      renameSpy.mockRestore();
      fs.rmSync(path.dirname(mockDatabasePath), { recursive: true, force: true });
      fs.rmSync(validBackupPath, { force: true });
    }
  });

  test('cleans up obsolete WAL and SHM files on successful restore to prevent database corruption', () => {
    const { dialog, app } = require('electron');
    const { closeDatabase } = require('../../electron/database/db');
    const validBackupPath = path.join(os.tmpdir(), `valid-backup-${process.pid}.db`);
    const validDb = new Database(validBackupPath);
    validDb.exec('CREATE TABLE test_table (id INTEGER PRIMARY KEY, msg TEXT)');
    validDb.prepare('INSERT INTO test_table (msg) VALUES (?)').run('valid data');
    validDb.close();

    fs.mkdirSync(path.dirname(mockDatabasePath), { recursive: true });
    fs.writeFileSync(mockDatabasePath, 'original db');
    const oldWalPath = `${mockDatabasePath}-wal`;
    const oldShmPath = `${mockDatabasePath}-shm`;
    fs.writeFileSync(oldWalPath, 'old wal data that would corrupt new db');
    fs.writeFileSync(oldShmPath, 'old shm data');

    dialog.showOpenDialogSync.mockReturnValue([validBackupPath]);

    try {
      const res = backupService.restoreFromBackup();
      expect(res).toEqual({ success: true });
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

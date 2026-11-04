jest.mock('../../electron/database/db', () => ({
  dbPath: 'C:\\data\\shop.db',
  db: {
    pragma: jest.fn(),
    prepare: jest.fn(() => ({ run: jest.fn() })),
    backup: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../electron/repositories/settings.repository', () => ({
  getAll: jest.fn(),
  setMany: jest.fn(),
}));

jest.mock('../../electron/services/logger.service', () => ({
  logError: jest.fn(),
}));

const { logError } = require('../../electron/services/logger.service');
const settingsService = require('../../electron/services/settings.service');

describe('settings.service.backupDatabase', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns both path keys on success', async () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const Database = require('better-sqlite3');
    const { db } = require('../../electron/database/db');
    // backup.service writes to a temp file, verifies it, then moves it into place,
    // so the mocked SQLite backup has to produce a real database file.
    db.backup.mockImplementationOnce(async (tempPath) => {
      const copy = new Database(tempPath);
      copy.exec('CREATE TABLE t (x INTEGER)');
      copy.close();
    });
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'settings-backup-'));
    const destination = path.join(dir, 'shop.db');

    try {
      const result = await settingsService.backupDatabase(destination);

      expect(result.success).toBe(true);
      expect(result.filePath).toBe(destination);
      expect(result.path).toBe(result.filePath);
      expect(fs.existsSync(destination)).toBe(true);
      expect(fs.readdirSync(dir)).toEqual(['shop.db']); // no temp file left behind
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  test('returns a failure object and logs when backup fails', async () => {
    const { db } = require('../../electron/database/db');
    db.backup.mockRejectedValueOnce(new Error('database locked'));

    const result = await settingsService.backupDatabase('C:\\backup\\shop.db');

    expect(result).toEqual({
      success: false,
      message: 'فشل النسخ الاحتياطي: database locked',
      filePath: null,
      path: null,
    });
    expect(logError).toHaveBeenCalledWith('SettingsBackup', expect.any(Error));
  });
});

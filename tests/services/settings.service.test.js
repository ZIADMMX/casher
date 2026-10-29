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
    const { db } = require('../../electron/database/db');

    const result = await settingsService.backupDatabase('C:\\backup\\shop.db');

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('C:\\backup\\shop.db');
    expect(result.path).toBe(result.filePath);
    expect(db.backup).toHaveBeenCalledWith('C:\\backup\\shop.db');
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

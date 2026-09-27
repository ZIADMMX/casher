const fs = require('node:fs');

jest.mock('../../electron/database/db', () => ({
  dbPath: 'C:\\data\\shop.db',
  db: {
    pragma: jest.fn(),
    prepare: jest.fn(() => ({ run: jest.fn() })),
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

  test('returns both path keys on success', () => {
    jest.spyOn(fs, 'existsSync').mockReturnValue(false);
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

    const result = settingsService.backupDatabase('C:\\backup\\shop.db');

    expect(result.success).toBe(true);
    expect(result.filePath).toBe('C:\\backup\\shop.db');
    expect(result.path).toBe(result.filePath);
    fs.existsSync.mockRestore();
    fs.copyFileSync.mockRestore();
  });

  test('returns a failure object and logs when backup fails', () => {
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('database locked');
    });

    const result = settingsService.backupDatabase('C:\\backup\\shop.db');

    expect(result).toEqual({
      success: false,
      message: 'فشل النسخ الاحتياطي: database locked',
      filePath: null,
      path: null,
    });
    expect(logError).toHaveBeenCalledWith('SettingsBackup', expect.any(Error));
    fs.copyFileSync.mockRestore();
  });
});

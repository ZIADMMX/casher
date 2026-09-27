const fs = require('node:fs');

jest.mock('electron', () => ({
  dialog: { showSaveDialogSync: jest.fn(() => 'C:\\backup\\shop.db') },
  app: { relaunch: jest.fn(), exit: jest.fn() },
}));

jest.mock('../../electron/database/db', () => ({
  dbPath: 'C:\\data\\shop.db',
  closeDatabase: jest.fn(),
}));

jest.mock('../../electron/services/logger.service', () => ({
  logError: jest.fn(),
}));

const { logError } = require('../../electron/services/logger.service');
const backupService = require('../../electron/services/backup.service');

describe('backup.service.backupNow', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns both path keys on success', () => {
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {});

    const result = backupService.backupNow();

    expect(result).toEqual({
      success: true,
      filePath: 'C:\\backup\\shop.db',
      path: 'C:\\backup\\shop.db',
    });
    fs.copyFileSync.mockRestore();
  });

  test('returns a failure object and logs when copying fails', () => {
    jest.spyOn(fs, 'copyFileSync').mockImplementation(() => {
      throw new Error('disk unavailable');
    });

    const result = backupService.backupNow();

    expect(result).toEqual({
      success: false,
      message: 'disk unavailable',
      filePath: null,
      path: null,
    });
    expect(logError).toHaveBeenCalledWith('BackupNow', expect.any(Error));
    fs.copyFileSync.mockRestore();
  });
});

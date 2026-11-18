const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockAppDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-logger-'));

jest.mock('electron', () => ({
  app: { getPath: jest.fn(() => mockAppDataPath) },
}));

const { logError, MAX_LOG_BYTES } = require('../../electron/services/logger.service');

describe('logger.service.logError', () => {
  afterAll(() => {
    fs.rmSync(mockAppDataPath, { recursive: true, force: true });
  });

  test('writes the error to the app log and returns undefined', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    expect(logError('LoggerTest', new Error('test failure'))).toBeUndefined();

    const logPath = path.join(mockAppDataPath, 'kashiear', 'logs', 'error.log');
    expect(fs.readFileSync(logPath, 'utf8')).toContain('[LoggerTest]');
    expect(fs.readFileSync(logPath, 'utf8')).toContain('test failure');
    consoleSpy.mockRestore();
  });
  test('moves a log past the size cap to error.log.1 and starts a new one', () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const logPath = path.join(mockAppDataPath, 'kashiear', 'logs', 'error.log');
    fs.writeFileSync(logPath, 'x'.repeat(MAX_LOG_BYTES + 1));

    logError('AfterRotate', new Error('fresh'));

    expect(fs.statSync(`${logPath}.1`).size).toBe(MAX_LOG_BYTES + 1);
    expect(fs.readFileSync(logPath, 'utf8')).toContain('[AfterRotate]');
    expect(fs.statSync(logPath).size).toBeLessThan(10_000);
    consoleSpy.mockRestore();
  });
});

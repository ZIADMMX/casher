const mockHandlers = new Map();
const mockApp = { relaunch: jest.fn(), quit: jest.fn(), exit: jest.fn() };

jest.mock('electron', () => ({
  app: mockApp,
  dialog: { showMessageBoxSync: jest.fn(() => 1) },
  ipcMain: { handle: (channel, fn) => mockHandlers.set(channel, fn) },
}));
jest.mock('../../electron/services/logger.service', () => ({ logError: jest.fn() }));

const { createCrashTracker } = require('../../electron/services/recovery.service');
const { registerRecoveryHandlers } = require('../../electron/handlers/recovery.handler');

describe('crash tracker', () => {
  test('reloads the first three crashes, then asks once crashes keep coming', () => {
    let now = 0;
    const record = createCrashTracker({ now: () => now });
    expect([record(), record(), record()]).toEqual(['reload', 'reload', 'reload']);
    now += 1000;
    expect(record()).toBe('ask');
  });

  test('forgets crashes older than the window', () => {
    let now = 0;
    const record = createCrashTracker({ now: () => now, windowMs: 1000, max: 1 });
    expect(record()).toBe('reload');
    now = 5000;
    expect(record()).toBe('reload');
  });
});

describe('recovery:relaunch', () => {
  const isAppUrl = (url) => url === 'file:///app/dist/index.html';

  beforeAll(() => registerRecoveryHandlers({ isAppUrl }));

  test('refuses calls that do not come from the app page', () => {
    const handler = mockHandlers.get('recovery:relaunch');
    expect(() => handler({ senderFrame: { url: 'https://evil.example' } })).toThrow('غير مسموح');
    expect(mockApp.relaunch).not.toHaveBeenCalled();
  });

  test('restarts the app once, even if pressed twice', () => {
    jest.useFakeTimers();
    const handler = mockHandlers.get('recovery:relaunch');
    const event = { senderFrame: { url: 'file:///app/dist/index.html' } };
    expect(handler(event)).toEqual({ success: true });
    expect(handler(event)).toEqual({ success: true, alreadyRestarting: true });
    expect(mockApp.relaunch).toHaveBeenCalledTimes(1);
    expect(mockApp.quit).toHaveBeenCalledTimes(1);
    jest.runAllTimers();
    expect(mockApp.exit).toHaveBeenCalledWith(0);
    jest.useRealTimers();
  });
});

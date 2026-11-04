const mockRegisteredHandlers = new Map();

jest.mock('electron', () => ({
  app: {
    relaunch: jest.fn(),
    quit: jest.fn(),
  },
}));

jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: jest.fn(),
}));

jest.mock('../../electron/handlers/safeHandle', () => ({
  safeHandle: jest.fn((channel, handler, options) => {
    mockRegisteredHandlers.set(channel, { handler, options });
  }),
}));

const { app } = require('electron');
const authService = require('../../electron/services/auth.service');
const { registerAppHandlers } = require('../../electron/handlers/app.handler');

describe('app restart handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRegisteredHandlers.clear();
    registerAppHandlers();
  });

  test('requires an authenticated caller and relaunches the application', async () => {
    const event = { sender: { id: 12 } };
    const { handler, options } = mockRegisteredHandlers.get('app:restart');

    options.authorize(event);
    expect(handler(event)).toEqual({ success: true });

    expect(authService.requireAuth).toHaveBeenCalledWith(12);
    expect(app.relaunch).toHaveBeenCalledTimes(1);
    expect(app.quit).toHaveBeenCalledTimes(1);
  });
});

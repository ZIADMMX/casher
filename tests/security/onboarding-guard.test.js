const bcrypt = require('bcryptjs');

const mockHandlers = new Map();
const mockUsers = new Map();

jest.mock('electron', () => ({
  ipcMain: { handle: (channel, fn) => mockHandlers.set(channel, fn) },
}));
jest.mock('../../electron/services/licenseGuard.service', () => ({
  requireActiveLicense: jest.fn(() => Promise.resolve()),
}));
jest.mock('../../electron/services/logger.service', () => ({ logError: jest.fn() }));
jest.mock('../../electron/services/onboarding.service', () => ({
  getOnboardingState: jest.fn(() => ({ is_completed: 0 })),
  getPresets: jest.fn(() => []),
  getPresetByKey: jest.fn(),
  activatePreset: jest.fn(() => ({ activated: true })),
  updateOnboardingState: jest.fn(() => ({ updated: true })),
  previewCatalog: jest.fn(),
  provisionSectorData: jest.fn(() => ({ provisioned: true })),
  resetOnboarding: jest.fn(() => ({ reset: true })),
}));
jest.mock('../../electron/repositories/users.repository', () => ({
  countAll: jest.fn(() => mockUsers.size),
  getByUsername: jest.fn((username) => [...mockUsers.values()].find((u) => u.username === username)),
  getById: jest.fn((id) => mockUsers.get(id)),
}));
jest.mock('../../electron/repositories/enterprise.repository', () => ({
  getRolePermissions: jest.fn(() => []),
}));
jest.mock('../../electron/repositories/settings.repository', () => {
  const store = new Map();
  return {
    get: jest.fn((key) => store.get(key) || null),
    set: jest.fn((key, value) => store.set(key, value)),
  };
});
jest.mock('../../electron/services/audit.service', () => ({ logAction: jest.fn() }));

const onboardingService = require('../../electron/services/onboarding.service');
const authService = require('../../electron/services/auth.service');
require('../../electron/handlers/onboarding.handler').registerOnboardingHandlers();

const hash = bcrypt.hashSync('secret123', 4);
const call = (channel, windowId, ...args) => mockHandlers.get(channel)({ sender: { id: windowId } }, ...args);

describe('Security: onboarding wizard guard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService._resetMemoryForTesting();
    authService.resetLoginAttempts();
    mockUsers.clear();
  });

  function seedUsers() {
    mockUsers.set(1, { id: 1, username: 'owner', role: 'admin', system_role_key: null, password_hash: hash, is_active: 1 });
    mockUsers.set(2, { id: 2, username: 'cashier', role: 'cashier', system_role_key: null, password_hash: hash, is_active: 1 });
  }

  test('first run with no users: the wizard may run without a session', async () => {
    const result = await call('onboarding:provision', 7, { sector: 'retail' });
    expect(result.success).toBe(true);
    expect(onboardingService.provisionSectorData).toHaveBeenCalled();
  });

  test('a live shop that never finished the wizard rejects unauthenticated changes', async () => {
    seedUsers();
    onboardingService.getOnboardingState.mockReturnValue({ is_completed: 0 });

    for (const channel of ['onboarding:updateState', 'onboarding:reset', 'onboarding:provision', 'onboarding:activatePreset']) {
      const result = await call(channel, 99, {});
      expect({ channel, success: result.success }).toEqual({ channel, success: false });
    }
    expect(onboardingService.updateOnboardingState).not.toHaveBeenCalled();
    expect(onboardingService.resetOnboarding).not.toHaveBeenCalled();
    expect(onboardingService.provisionSectorData).not.toHaveBeenCalled();
    expect(onboardingService.activatePreset).not.toHaveBeenCalled();
  });

  test('the admin window that just created the account can finish the wizard', async () => {
    seedUsers();
    authService.login('owner', 'secret123', 5);
    const result = await call('onboarding:provision', 5, { sector: 'retail' });
    expect(result.success).toBe(true);
  });

  test('a logged-in admin can change setup after it was completed', async () => {
    seedUsers();
    onboardingService.getOnboardingState.mockReturnValue({ is_completed: 1 });
    authService.login('owner', 'secret123', 5);

    expect((await call('onboarding:updateState', 5, { current_step: 2 })).success).toBe(true);
    expect((await call('onboarding:activatePreset', 5, { sectorKey: 'retail' })).success).toBe(true);
  });

  test('a logged-in cashier cannot change setup', async () => {
    seedUsers();
    authService.login('cashier', 'secret123', 6);
    expect((await call('onboarding:reset', 6)).success).toBe(false);
    expect(onboardingService.resetOnboarding).not.toHaveBeenCalled();
  });

  test('another window being logged in as admin does not authorize this one', async () => {
    seedUsers();
    authService.login('owner', 'secret123', 5);
    expect((await call('onboarding:reset', 99)).success).toBe(false);
  });
});

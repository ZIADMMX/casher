const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const originalLicenseSecret = process.env.KASHIEAR_LICENSE_SECRET;
process.env.KASHIEAR_LICENSE_SECRET = crypto.randomBytes(32).toString('hex');

jest.mock('../../electron/repositories/users.repository', () => ({
  countAll: jest.fn(),
  create: jest.fn(),
  getByUsername: jest.fn(),
  getById: jest.fn(),
  getProfileById: jest.fn(),
  updatePersonalProfile: jest.fn(),
  getAdmin: jest.fn(),
  getAll: jest.fn(),
  getDetails: jest.fn(),
  getSalesActivity: jest.fn(),
  getShiftsActivity: jest.fn(),
  setActive: jest.fn(),
  clearForcePasswordChange: jest.fn(),
  updatePassword: jest.fn(),
  setForcePasswordChange: jest.fn(),
  updateRecoveryKeyHash: jest.fn(),
  updateUsername: jest.fn(),
}));

jest.mock('../../electron/services/session.service', () => {
  const sessions = new Map();
  const revoked = new Set();

  return {
    generateToken: jest.fn((payload) => {
      const token = `token-${sessions.size + 1}`;
      sessions.set(token, payload);
      return token;
    }),
    verifyToken: jest.fn((token) => {
      if (!sessions.has(token) || revoked.has(token)) throw new Error('InvalidSession');
      return sessions.get(token);
    }),
    invalidateToken: jest.fn((token) => revoked.add(token)),
    refreshToken: jest.fn((token) => {
      if (!sessions.has(token) || revoked.has(token)) throw new Error('InvalidSession');
      const payload = sessions.get(token);
      const newToken = `token-${sessions.size + 1}`;
      sessions.set(newToken, payload);
      return newToken;
    }),
    getTokenTTL: jest.fn(() => 1800),
  };
});

jest.mock('../../electron/repositories/settings.repository', () => {
  const store = new Map();
  return {
    get: jest.fn((key) => store.get(key) || null),
    set: jest.fn((key, value) => {
      store.set(key, value);
      return { key, value };
    }),
    _store: store,
  };
});
// A LAN client must prove who it is with a signed token. Window/caller keys
// ('lan-api', 'default', window ids) are internal and must never act as a token.
const usersRepo = require('../../electron/repositories/users.repository');
const authService = require('../../electron/services/auth.service');

const admin = { id: 1, username: 'admin', password_hash: bcrypt.hashSync('admin123', 4), role: 'admin', is_active: 1 };

beforeEach(() => {
  authService.logout();
  authService.resetLoginAttempts();
  usersRepo.getByUsername.mockReset().mockReturnValue(admin);
  usersRepo.getById.mockReset().mockImplementation((id) => (id === admin.id ? admin : undefined));
});

afterAll(() => {
  if (originalLicenseSecret === undefined) delete process.env.KASHIEAR_LICENSE_SECRET;
  else process.env.KASHIEAR_LICENSE_SECRET = originalLicenseSecret;
});

test('a LAN login is not stored under a guessable caller key', () => {
  authService.login('admin', 'admin123', 'lan-api', { remember: false });
  expect(authService.getCurrentSession('lan-api')).toBeNull();
  expect(authService.getCurrentSession()).toBeNull();
});

test('a LAN login does not become the desktop fallback session', () => {
  authService.login('admin', 'admin123', 'lan-api', { remember: false });
  expect(authService.getCurrentSession('default')).toBeNull();
});

test.each(['lan-api', 'default', '1', 1, '', null, undefined, {}])(
  'getSessionByToken(%p) never resolves a caller key',
  (value) => {
    authService.login('admin', 'admin123', 'default');
    authService.login('admin', 'admin123', 1);
    authService.login('admin', 'admin123', 'lan-api');
    expect(authService.getSessionByToken(value)).toBeNull();
  }
);

test('getSessionByToken accepts the signed token a LAN login returns', () => {
  const { token } = authService.login('admin', 'admin123', 'lan-api', { remember: false });
  expect(authService.getSessionByToken(token)).toMatchObject({ id: 1, role: 'admin' });
});

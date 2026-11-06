const bcrypt = require('bcryptjs');

const licenseKeys = require('../helpers/licenseKeys');
const mockUsers = new Map();

jest.mock('../../electron/repositories/users.repository', () => ({
  getByUsername: jest.fn((username) => [...mockUsers.values()].find((u) => u.username === username)),
  getById: jest.fn((id) => mockUsers.get(id)),
  getAll: jest.fn(() => [...mockUsers.values()]),
  getDetails: jest.fn((id) => mockUsers.get(id)),
  setActive: jest.fn(),
  updatePassword: jest.fn(),
  setForcePasswordChange: jest.fn(),
  clearForcePasswordChange: jest.fn(),
  getAdmin: jest.fn(() => mockUsers.get(1)),
  updateRecoveryKeyHash: jest.fn(),
}));

jest.mock('../../electron/repositories/enterprise.repository', () => ({
  getRolePermissions: jest.fn(() => ['team.view', 'team.manage']),
}));

jest.mock('../../electron/repositories/settings.repository', () => {
  const store = new Map();
  return {
    get: jest.fn((key) => store.get(key) || null),
    set: jest.fn((key, value) => store.set(key, value)),
  };
});

jest.mock('../../electron/services/audit.service', () => ({ logAction: jest.fn() }));

const usersRepo = require('../../electron/repositories/users.repository');
const authService = require('../../electron/services/auth.service');

const hash = bcrypt.hashSync('secret123', 4);

describe('Security: job roles with team.manage cannot take over the main admin', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService._resetMemoryForTesting();
    authService.resetLoginAttempts();
    mockUsers.clear();
    mockUsers.set(1, { id: 1, username: 'owner', role: 'admin', system_role_key: null, password_hash: hash, is_active: 1 });
    mockUsers.set(2, { id: 2, username: 'cashier', role: 'cashier', system_role_key: null, password_hash: hash, is_active: 1 });
    mockUsers.set(3, { id: 3, username: 'hr', role: 'cashier', system_role_key: 'hr', password_hash: hash, is_active: 1 });
  });

  function asHr(fn) {
    authService.login('hr', 'secret123', 'default');
    return authService.runWithPermission('team.manage', fn);
  }

  test('cannot reset the admin password', () => {
    expect(() => asHr(() => authService.resetUserPassword({ userId: 1, password: 'hacked1' })))
      .toThrow('مدير النظام');
    expect(usersRepo.updatePassword).not.toHaveBeenCalled();
  });

  test('cannot disable or remove the admin', () => {
    expect(() => asHr(() => authService.toggleUserActive(1))).toThrow('مدير النظام');
    expect(() => asHr(() => authService.removeUser(1))).toThrow('مدير النظام');
    expect(usersRepo.setActive).not.toHaveBeenCalled();
  });

  test('can still manage regular staff', () => {
    expect(asHr(() => authService.resetUserPassword({ userId: 2, password: 'newpass1' })))
      .toEqual({ success: true });
    expect(usersRepo.updatePassword).toHaveBeenCalledWith(2, expect.any(String));
  });

  test('the main admin can still manage other admin accounts', () => {
    mockUsers.set(4, { id: 4, username: 'admin2', role: 'admin', system_role_key: null, password_hash: hash, is_active: 1 });
    authService.login('owner', 'secret123', 'default');
    expect(authService.resetUserPassword({ userId: 4, password: 'newpass1' })).toEqual({ success: true });
  });
});

describe('Security: password change without the current password', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService._resetMemoryForTesting();
    authService.resetLoginAttempts();
    mockUsers.clear();
    mockUsers.set(2, { id: 2, username: 'cashier', role: 'cashier', system_role_key: null, password_hash: hash, is_active: 1, force_password_change: 0 });
  });

  test('is refused for a normal session (a stolen or unattended session cannot lock the owner out)', () => {
    authService.login('cashier', 'secret123', 'default');
    expect(() => authService.changePassword('takeover1')).toThrow('كلمة المرور الحالية');
    expect(usersRepo.updatePassword).not.toHaveBeenCalled();
  });

  test('is allowed only while the account must change its password', () => {
    mockUsers.get(2).force_password_change = 1;
    authService.login('cashier', 'secret123', 'default');
    expect(authService.changePassword('newpass1')).toEqual(expect.objectContaining({ success: true }));
    expect(usersRepo.updatePassword).toHaveBeenCalledWith(2, expect.any(String));
  });
});

describe('Security: developer recovery OTP is bound to this machine and date', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUsers.clear();
    mockUsers.set(1, { id: 1, username: 'owner', role: 'admin', system_role_key: null, password_hash: hash, is_active: 1 });
  });

  test('accepts the OTP for a challenge issued here today', () => {
    const challengeCode = authService.getRecoveryChallenge();
    const responseOtp = licenseKeys.generateDeveloperRecoveryOtp(challengeCode);
    expect(authService.resetAdminPasswordWithChallenge({ challengeCode, responseOtp, newPassword: 'newpass1' }))
      .toEqual(expect.objectContaining({ success: true }));
  });

  test('rejects a valid OTP for an old challenge (replay)', () => {
    const old = authService.getRecoveryChallenge(new Date('2020-01-01T00:00:00Z'));
    const responseOtp = licenseKeys.generateDeveloperRecoveryOtp(old);
    expect(() => authService.resetAdminPasswordWithChallenge({ challengeCode: old, responseOtp, newPassword: 'newpass1' }))
      .toThrow();
    expect(usersRepo.updatePassword).not.toHaveBeenCalled();
  });

  test('rejects a valid OTP for another machine', () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const other = `CHAL-OTHERMACHINE-${today}-0000`;
    const responseOtp = licenseKeys.generateDeveloperRecoveryOtp(other);
    expect(() => authService.resetAdminPasswordWithChallenge({ challengeCode: other, responseOtp, newPassword: 'newpass1' }))
      .toThrow();
  });
});

describe('Security: sessions end when the password changes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    authService._resetMemoryForTesting();
    authService.resetLoginAttempts();
    mockUsers.clear();
    mockUsers.set(1, { id: 1, username: 'owner', role: 'admin', system_role_key: null, password_hash: hash, is_active: 1 });
    mockUsers.set(2, { id: 2, username: 'cashier', role: 'cashier', system_role_key: null, password_hash: hash, is_active: 1 });
    usersRepo.updatePassword.mockImplementation((id, newHash) => { mockUsers.get(id).password_hash = newHash; });
  });

  afterEach(() => usersRepo.updatePassword.mockReset());

  test('an admin password reset kills the cashier tokens on every device', () => {
    const { token: cashierToken } = authService.login('cashier', 'secret123', 'terminal-1');
    expect(authService.getCurrentSession(cashierToken)?.username).toBe('cashier');

    authService.login('owner', 'secret123', 'default');
    authService.resetUserPassword({ userId: 2, password: 'newpass1' });

    expect(authService.getCurrentSession(cashierToken)).toBeNull();
  });

  test('a session killed by a password reset cannot be refreshed', () => {
    authService.login('cashier', 'secret123', 'terminal-1');
    authService.login('owner', 'secret123', 'default');
    authService.resetUserPassword({ userId: 2, password: 'newpass1' });

    expect(authService.refreshSession('terminal-1')).toBeNull();
    expect(authService.getCurrentSession('terminal-1')).toBeNull();
  });

  test('a disabled account cannot refresh its session', () => {
    authService.login('cashier', 'secret123', 'terminal-1');
    mockUsers.get(2).is_active = 0;
    expect(authService.refreshSession('terminal-1')).toBeNull();
  });

  test('a valid session still refreshes', () => {
    authService.login('cashier', 'secret123', 'terminal-1');
    expect(authService.refreshSession('terminal-1')?.user?.username).toBe('cashier');
  });

  test('tokens issued after the change keep working', () => {
    authService.login('owner', 'secret123', 'default');
    authService.resetUserPassword({ userId: 2, password: 'newpass1' });
    const { token } = authService.login('cashier', 'newpass1', 'terminal-1');
    expect(authService.getCurrentSession(token)?.username).toBe('cashier');
  });
});

describe('Security: login does not reveal which accounts exist', () => {
  beforeEach(() => {
    authService._resetMemoryForTesting();
    authService.resetLoginAttempts();
    mockUsers.clear();
    mockUsers.set(5, { id: 5, username: 'disabled', role: 'cashier', system_role_key: null, password_hash: hash, is_active: 0 });
  });

  test('a wrong password on a disabled account gets the generic error', () => {
    expect(() => authService.login('disabled', 'wrong-pass')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');
    expect(() => authService.login('nobody', 'wrong-pass')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');
  });

  test('only the correct password reveals that the account is disabled', () => {
    expect(() => authService.login('disabled', 'secret123')).toThrow('معطل');
  });
});

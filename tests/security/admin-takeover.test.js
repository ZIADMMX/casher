const bcrypt = require('bcryptjs');

process.env.KASHIEAR_LICENSE_SECRET = 'test-license-secret';
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
    const responseOtp = authService.generateDeveloperRecoveryOtp(challengeCode);
    expect(authService.resetAdminPasswordWithChallenge({ challengeCode, responseOtp, newPassword: 'newpass1' }))
      .toEqual(expect.objectContaining({ success: true }));
  });

  test('rejects a valid OTP for an old challenge (replay)', () => {
    const old = authService.getRecoveryChallenge(new Date('2020-01-01T00:00:00Z'));
    const responseOtp = authService.generateDeveloperRecoveryOtp(old);
    expect(() => authService.resetAdminPasswordWithChallenge({ challengeCode: old, responseOtp, newPassword: 'newpass1' }))
      .toThrow();
    expect(usersRepo.updatePassword).not.toHaveBeenCalled();
  });

  test('rejects a valid OTP for another machine', () => {
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const other = `CHAL-OTHERMACHINE-${today}-0000`;
    const responseOtp = authService.generateDeveloperRecoveryOtp(other);
    expect(() => authService.resetAdminPasswordWithChallenge({ challengeCode: other, responseOtp, newPassword: 'newpass1' }))
      .toThrow();
  });
});

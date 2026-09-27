const bcrypt = require('bcryptjs');

jest.mock('../../electron/repositories/users.repository', () => ({
  countAll: jest.fn(),
  create: jest.fn(),
  getByUsername: jest.fn(),
  getById: jest.fn(),
  getAdmin: jest.fn(),
  getAll: jest.fn(),
  setActive: jest.fn(),
  remove: jest.fn(),
  clearForcePasswordChange: jest.fn(),
  updatePassword: jest.fn(),
  updateRecoveryKeyHash: jest.fn(),
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
      return `token-${sessions.size + 1}`;
    }),
    getTokenTTL: jest.fn(() => 1800),
  };
});

const usersRepo = require('../../electron/repositories/users.repository');
const sessionService = require('../../electron/services/session.service');
const authService = require('../../electron/services/auth.service');

const admin = {
  id: 1,
  username: 'admin',
  password_hash: bcrypt.hashSync('admin123', 4),
  role: 'admin',
  is_active: 1,
};

const cashier = {
  id: 2,
  username: 'cashier',
  password_hash: bcrypt.hashSync('cashier123', 4),
  role: 'cashier',
  is_active: 1,
};

describe('auth.service', () => {
  beforeEach(() => {
    authService.logout();
    jest.clearAllMocks();
    usersRepo.getByUsername.mockReturnValue(undefined);
  });

  test('logs in an active user and returns a clean session user', () => {
    usersRepo.getByUsername.mockReturnValue(admin);

    expect(authService.login('admin', 'admin123')).toEqual({
      token: 'token-1',
      user: { id: 1, username: 'admin', role: 'admin', forcePasswordChange: false },
    });
    expect(sessionService.generateToken).toHaveBeenCalledWith({
      id: 1,
      username: 'admin',
      role: 'admin',
      forcePasswordChange: false,
    });
    expect(authService.getCurrentSession()).toEqual({
      id: 1,
      username: 'admin',
      role: 'admin',
      forcePasswordChange: false,
    });
  });

  test('reports setup required when no users exist and creates the first admin', () => {
    usersRepo.countAll.mockReturnValue(0);
    expect(authService.isSetupRequired()).toBe(true);

    usersRepo.getByUsername.mockReturnValue({
      id: 3,
      username: 'owner',
      password_hash: bcrypt.hashSync('owner123', 4),
      role: 'admin',
      is_active: 1,
      force_password_change: 0,
    });

    const result = authService.createInitialAdmin({ username: ' owner ', password: 'owner123' });

    expect(usersRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      username: 'owner',
      role: 'admin',
      forcePasswordChange: false,
      passwordHash: expect.any(String),
    }));
    expect(result.user).toEqual(expect.objectContaining({
      username: 'owner',
      role: 'admin',
    }));
  });

  test('does not allow initial admin setup after an account exists', () => {
    usersRepo.countAll.mockReturnValue(1);

    expect(() => authService.createInitialAdmin({ username: 'owner', password: 'owner123' }))
      .toThrow('تم إنشاء حساب المدير بالفعل');
  });

  test('rejects unknown users, bad passwords, and inactive accounts', () => {
    expect(() => authService.login('missing', 'admin123'))
      .toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');

    usersRepo.getByUsername.mockReturnValue(admin);
    expect(() => authService.login('admin', 'wrong-password'))
      .toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');

    usersRepo.getByUsername.mockReturnValue({ ...admin, is_active: 0 });
    expect(() => authService.login('admin', 'admin123'))
      .toThrow('هذا الحساب معطل حاليًا. تواصل مع المدير');
  });

  test('requires an authenticated session and lets an admin pass the admin guard', () => {
    expect(() => authService.requireAuth()).toThrow('يجب تسجيل الدخول أولاً');

    usersRepo.getByUsername.mockReturnValue(admin);
    authService.login('admin', 'admin123');

    expect(authService.requireAdmin()).toEqual({
      id: 1,
      username: 'admin',
      role: 'admin',
      forcePasswordChange: false,
    });
  });

  test('blocks cashier-only sessions from admin actions', () => {
    usersRepo.getByUsername.mockReturnValue(cashier);
    authService.login('cashier', 'cashier123');

    expect(() => authService.requireAdmin()).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    expect(() => authService.addCashier({ username: 'new-cashier', password: 'secret123' }))
      .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
  });

  test('allows an admin to add a valid cashier and prevents duplicate usernames', () => {
    usersRepo.getByUsername
      .mockReturnValueOnce(admin)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(admin);
    authService.login('admin', 'admin123');

    expect(authService.addCashier({ username: '  new-cashier  ', password: 'secret123' }))
      .toEqual({ success: true });
    expect(usersRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      username: 'new-cashier',
      role: 'cashier',
    }));

    expect(() => authService.addCashier({ username: 'admin', password: 'secret123' }))
      .toThrow('اسم المستخدم مستخدم بالفعل');
  });

  test('logout invalidates the current session', () => {
    usersRepo.getByUsername.mockReturnValue(admin);
    const { token } = authService.login('admin', 'admin123');

    authService.logout();

    expect(authService.getCurrentSession()).toBeNull();
    expect(sessionService.invalidateToken).toHaveBeenCalledWith(token);
  });

  test('changes the authenticated password and clears the first-login flag', () => {
    const firstLoginAdmin = {
      ...admin,
      force_password_change: 1,
    };
    usersRepo.getByUsername.mockReturnValue(firstLoginAdmin);
    authService.login('admin', 'admin123');

    expect(() => authService.changePassword('123'))
      .toThrow('كلمة المرور لازم تكون 6 أحرف على الأقل');

    const result = authService.changePassword('new-admin-password');

    expect(result).toEqual(expect.objectContaining({
      success: true,
      user: expect.objectContaining({ forcePasswordChange: false }),
    }));
    expect(usersRepo.updatePassword).toHaveBeenCalledWith(1, expect.any(String));
    expect(usersRepo.clearForcePasswordChange).toHaveBeenCalledWith(1);
  });

  describe('Admin Password Recovery', () => {
    const rawRescueKey = 'REC-A1B2-C3D4-E5F6';
    const adminWithRecovery = {
      id: 1,
      username: 'admin',
      role: 'admin',
      is_active: 1,
      recovery_key_hash: bcrypt.hashSync(rawRescueKey, 4),
    };

    test('generates challenge code and verifies developer response OTP', () => {
      const challenge = authService.getRecoveryChallenge();
      expect(challenge).toMatch(/^CHAL-[A-Z0-9]{8}-\d{8}-[A-Z0-9]{4}$/);

      const devOtp = authService.generateDeveloperRecoveryOtp(challenge);
      expect(devOtp).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);

      expect(authService.verifyRecoveryChallengeResponse(challenge, devOtp)).toBe(true);
      expect(authService.verifyRecoveryChallengeResponse(challenge, 'WRON-G123')).toBe(false);
    });

    test('resets admin password with valid recovery key', () => {
      usersRepo.getAdmin.mockReturnValue(adminWithRecovery);

      const res = authService.resetAdminPasswordWithRecoveryKey({
        recoveryKey: rawRescueKey,
        newPassword: 'brand-new-password-123',
      });

      expect(res.success).toBe(true);
      expect(res.newRecoveryKey).toMatch(/^REC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(usersRepo.updatePassword).toHaveBeenCalledWith(1, expect.any(String));
      expect(usersRepo.updateRecoveryKeyHash).toHaveBeenCalledWith(1, expect.any(String));
    });

    test('rejects reset with wrong recovery key', () => {
      usersRepo.getAdmin.mockReturnValue(adminWithRecovery);

      expect(() => {
        authService.resetAdminPasswordWithRecoveryKey({
          recoveryKey: 'REC-0000-0000-0000',
          newPassword: 'brand-new-password-123',
        });
      }).toThrow('مفتاح الاسترداد غير صحيح');
    });

    test('resets admin password with valid challenge response OTP', () => {
      usersRepo.getAdmin.mockReturnValue(adminWithRecovery);
      const challenge = authService.getRecoveryChallenge();
      const validOtp = authService.generateDeveloperRecoveryOtp(challenge);

      const res = authService.resetAdminPasswordWithChallenge({
        challengeCode: challenge,
        responseOtp: validOtp,
        newPassword: 'brand-new-password-123',
      });

      expect(res.success).toBe(true);
      expect(res.newRecoveryKey).toMatch(/^REC-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
      expect(usersRepo.updatePassword).toHaveBeenCalledWith(1, expect.any(String));
    });

    test('rejects reset with invalid challenge response OTP', () => {
      usersRepo.getAdmin.mockReturnValue(adminWithRecovery);
      const challenge = authService.getRecoveryChallenge();

      expect(() => {
        authService.resetAdminPasswordWithChallenge({
          challengeCode: challenge,
          responseOtp: 'FAKE-1234',
          newPassword: 'brand-new-password-123',
        });
      }).toThrow('كود الاستجابة غير صحيح أو منتهي الصلاحية');
    });
  });
});
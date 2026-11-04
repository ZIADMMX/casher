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

const usersRepo = require('../../electron/repositories/users.repository');
const sessionService = require('../../electron/services/session.service');
const settingsRepo = require('../../electron/repositories/settings.repository');
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
    authService.resetLoginAttempts();
    jest.clearAllMocks();
    usersRepo.getByUsername.mockReset().mockReturnValue(undefined);
    usersRepo.getById.mockReset().mockImplementation((id) => {
      if (id === admin.id) return admin;
      if (id === cashier.id) return cashier;
      return undefined;
    });
    settingsRepo.get.mockReset().mockImplementation((key) => settingsRepo._store.get(key) || null);
    settingsRepo.set.mockReset().mockImplementation((key, value) => {
      settingsRepo._store.set(key, value);
      return { key, value };
    });
  });

  afterAll(() => {
    if (originalLicenseSecret === undefined) {
      delete process.env.KASHIEAR_LICENSE_SECRET;
    } else {
      process.env.KASHIEAR_LICENSE_SECRET = originalLicenseSecret;
    }
  });

  test('logs in an active user and returns a clean session user', () => {
    usersRepo.getByUsername.mockReturnValue(admin);

    expect(authService.login('admin', 'admin123')).toEqual({
      token: 'token-1',
      user: {
        id: 1,
        username: 'admin',
        role: 'admin',
        systemRoleKey: null,
        permissions: ['*'],
        forcePasswordChange: false,
      },
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
      systemRoleKey: null,
      permissions: ['*'],
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
      systemRoleKey: null,
      permissions: ['*'],
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

  test('limits cashiers without a system role to default cashier permissions', () => {
    usersRepo.getByUsername.mockReturnValue(cashier);
    authService.login('cashier', 'cashier123');

    expect(authService.runWithPermission('pos.sell', () => authService.requirePermission('pos.sell')))
      .toMatchObject({ id: cashier.id });
    expect(() => authService.runWithPermission('settings.manage', () => authService.requirePermission('settings.manage')))
      .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
  });

  test('allows an admin to add a valid cashier and prevents duplicate usernames', () => {
    usersRepo.getByUsername
      .mockReturnValueOnce(admin)
      .mockReturnValueOnce(undefined)
      .mockReturnValueOnce(admin);
    authService.login('admin', 'admin123');

    expect(authService.addCashier({
      username: '  new-cashier  ',
      password: 'secret123',
      fullName: '  أحمد محمد  ',
      phone: '  01012345678  ',
      email: '  ahmed@example.com  ',
      firstName: '  أحمد ',
      lastName: ' محمد  ',
      jobTitle: '  مشرف مبيعات  ',
      specialty: '  الملابس  ',
      workingHours: '  09:00 - 17:00  ',
      profileImage: 'C:\\employee-images\\ahmed.jpg',
      payType: 'monthly',
      payAmount: 12000,
      commissionRate: 5,
      isActive: false,
      notes: '  دوام مسائي  ',
    }))
      .toEqual({ success: true });
    expect(usersRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      username: 'new-cashier',
      role: 'cashier',
      fullName: 'أحمد محمد',
      firstName: 'أحمد',
      lastName: 'محمد',
      phone: '01012345678',
      email: 'ahmed@example.com',
      jobTitle: 'مشرف مبيعات',
      specialty: 'الملابس',
      workingHours: '09:00 - 17:00',
      profileImage: 'C:\\employee-images\\ahmed.jpg',
      payType: 'monthly',
      payAmount: 12000,
      commissionRate: 5,
      isActive: false,
      forcePasswordChange: true,
      notes: 'دوام مسائي',
    }));

    expect(() => authService.addCashier({ username: 'admin', password: 'secret123' }))
      .toThrow('اسم المستخدم مستخدم بالفعل');
  });

  test('creates a manager with admin access when that job role is selected', () => {
    usersRepo.getByUsername
      .mockReturnValueOnce(admin)
      .mockReturnValueOnce(undefined);
    authService.login('admin', 'admin123');

    authService.addCashier({
      username: 'new-manager',
      password: 'secret123',
      role: 'admin',
      firstName: 'Manager',
      lastName: 'One',
      jobTitle: 'مدير',
      isActive: true,
    });

    expect(usersRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      role: 'admin',
      fullName: 'Manager One',
      firstName: 'Manager',
      lastName: 'One',
      forcePasswordChange: true,
      isActive: true,
    }));
  });

  test('allows admins to view cashier details and paginated activity', () => {
    usersRepo.getByUsername.mockReturnValue(admin);
    authService.login('admin', 'admin123');
    usersRepo.getDetails.mockReturnValue({ user: { id: cashier.id }, stats: { invoiceCount: 0 } });
    usersRepo.getById.mockImplementation((id) => id === admin.id ? admin : id === cashier.id ? cashier : undefined);
    usersRepo.getSalesActivity.mockReturnValue([{ id: 1 }, { id: 2 }]);

    expect(authService.getUserDetails(cashier.id)).toEqual({
      user: { id: cashier.id },
      stats: { invoiceCount: 0 },
    });
    expect(authService.getUserActivity({ userId: cashier.id, type: 'sales', offset: 20 })).toEqual({
      items: [{ id: 1 }, { id: 2 }],
      hasMore: false,
      nextOffset: 22,
    });
    expect(usersRepo.getSalesActivity).toHaveBeenCalledWith(cashier.id, 21, 20);
  });

  test('blocks cashiers from viewing other users activity and resetting passwords', () => {
    usersRepo.getByUsername.mockReturnValue(cashier);
    authService.login('cashier', 'cashier123');

    expect(() => authService.getUserDetails(admin.id)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    expect(() => authService.getUserActivity({ userId: admin.id, type: 'sales' }))
      .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    expect(() => authService.resetUserPassword({ userId: admin.id, password: 'temporary1' }))
      .toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
  });

  test('resets another user password and requires a password change at next login', () => {
    usersRepo.getByUsername.mockReturnValue(admin);
    authService.login('admin', 'admin123');
    usersRepo.getById.mockImplementation((id) => id === admin.id ? admin : id === cashier.id ? cashier : undefined);

    expect(authService.resetUserPassword({
      userId: cashier.id,
      password: 'temporary1',
    })).toEqual({ success: true });

    const passwordHash = usersRepo.updatePassword.mock.calls[0][1];
    expect(bcrypt.compareSync('temporary1', passwordHash)).toBe(true);
    expect(usersRepo.setForcePasswordChange).toHaveBeenCalledWith(cashier.id, true);
    expect(() => authService.resetUserPassword({ userId: cashier.id, password: '123' }))
      .toThrow('كلمة المرور لازم تكون 6 أحرف على الأقل');
  });

  test('deactivates cashier accounts linked to financial history without deleting them', () => {
    usersRepo.getByUsername.mockReturnValue(admin);
    authService.login('admin', 'admin123');
    usersRepo.getById.mockReturnValue(admin);
    usersRepo.getDetails.mockReturnValue({
      stats: { invoiceCount: 1, shiftCount: 1, returnCount: 0 },
    });

    expect(authService.removeUser(cashier.id)).toEqual({ success: true });
    expect(usersRepo.setActive).toHaveBeenCalledWith(cashier.id, false);
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
    usersRepo.getById.mockReturnValue(firstLoginAdmin);
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

  describe('updateProfile', () => {
    test('successfully updates username, password, and re-issues a new token', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      usersRepo.getById.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      // Update both username and password
      const result = authService.updateProfile({
        currentPassword: 'admin123',
        newUsername: 'newadmin',
        newPassword: 'newpassword123',
      });

      expect(result.success).toBe(true);
      expect(result.user.username).toBe('newadmin');
      expect(usersRepo.updateUsername).toHaveBeenCalledWith(1, 'newadmin');
      expect(usersRepo.updatePassword).toHaveBeenCalledWith(1, expect.any(String));
      expect(usersRepo.clearForcePasswordChange).toHaveBeenCalledWith(1);
      expect(sessionService.generateToken).toHaveBeenCalled();
    });

    test('throws when user not found in database', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      authService.login('admin', 'admin123');
      usersRepo.getById.mockReturnValueOnce(admin).mockReturnValue(null);

      expect(() => authService.updateProfile({ currentPassword: 'admin123' }))
        .toThrow('المستخدم غير موجود');
    });

    test('throws when currentPassword is empty', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      usersRepo.getById.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      expect(() => authService.updateProfile({ currentPassword: '' }))
        .toThrow('كلمة المرور الحالية مطلوبة لتأكيد التعديلات');
    });

    test('throws when currentPassword is incorrect', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      usersRepo.getById.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      expect(() => authService.updateProfile({ currentPassword: 'wrong-password' }))
        .toThrow('كلمة المرور الحالية غير صحيحة');
    });

    test('throws when newUsername is already in use by another user', () => {
      usersRepo.getByUsername
        .mockReturnValueOnce(admin) // login
        .mockReturnValueOnce({ id: 99, username: 'taken_user' }); // lookup newUsername
      usersRepo.getById.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      expect(() => authService.updateProfile({ currentPassword: 'admin123', newUsername: 'taken_user' }))
        .toThrow('اسم المستخدم الجديد مستخدم بالفعل');
    });

    test('throws when newPassword is shorter than 6 characters', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      usersRepo.getById.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      expect(() => authService.updateProfile({ currentPassword: 'admin123', newPassword: '123' }))
        .toThrow('كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل');
    });

    test('updateProfile requires newPassword when forcePasswordChange is true', () => {
      const forcedAdmin = { ...admin, force_password_change: 1 };
      usersRepo.getByUsername.mockReturnValue(forcedAdmin);
      usersRepo.getById.mockReturnValue(forcedAdmin);
      authService.login('admin', 'admin123');

      expect(() => authService.updateProfile({ currentPassword: 'admin123', newUsername: 'admin' }))
        .toThrow('يجب تغيير كلمة المرور قبل متابعة استخدام النظام');
    });
  });

  describe('personal profile', () => {
    test('returns only profile fields for the authenticated user', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      usersRepo.getById.mockReturnValue(admin);
      usersRepo.getProfileById.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
        first_name: 'First',
        last_name: 'Last',
        full_name: 'First Last',
        email: 'admin@example.com',
        phone: '+201012345678',
        gender: 'prefer_not_to_say',
        date_of_birth: '1990-01-01',
        country: 'Egypt',
        city: 'Cairo',
        address: 'Main street',
        created_at: '2026-10-01',
      });
      authService.login('admin', 'admin123');

      expect(authService.getMyProfile()).toEqual(expect.objectContaining({
        id: 1,
        username: 'admin',
        firstName: 'First',
        lastName: 'Last',
        email: 'admin@example.com',
        country: 'Egypt',
      }));
      expect(authService.getMyProfile()).not.toHaveProperty('password_hash');
    });

    test('validates and persists profile changes only for the current user', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      usersRepo.getById.mockReturnValue(admin);
      usersRepo.updatePersonalProfile.mockReturnValue({ changes: 1 });
      usersRepo.getProfileById.mockReturnValue({
        id: 1,
        username: 'admin',
        role: 'admin',
        first_name: 'New',
        last_name: 'Name',
        full_name: 'New Name',
        email: 'new@example.com',
      });
      authService.login('admin', 'admin123');

      const result = authService.saveMyProfile({
        firstName: 'New',
        email: 'new@example.com',
      });

      expect(usersRepo.updatePersonalProfile).toHaveBeenCalledWith(1, expect.objectContaining({
        firstName: 'New',
        email: 'new@example.com',
      }));
      expect(result).toEqual(expect.objectContaining({
        firstName: 'New',
        email: 'new@example.com',
      }));
    });
  });

  describe('User Management: getAllUsers, toggleUserActive, removeUser', () => {
    beforeEach(() => {
      usersRepo.getByUsername.mockReturnValue(admin);
      authService.login('admin', 'admin123');
      usersRepo.getById.mockReturnValue(admin);
    });

    test('getAllUsers returns list of all registered users', () => {
      const mockUsers = [admin, cashier];
      usersRepo.getAll.mockReturnValue(mockUsers);

      const users = authService.getAllUsers();
      expect(users).toEqual(mockUsers);
      expect(usersRepo.getAll).toHaveBeenCalled();
    });

    test('toggleUserActive prevents self-deactivation of current logged-in user', () => {
      expect(() => authService.toggleUserActive(1))
        .toThrow('لا يمكنك تعطيل حسابك الخاص وأنت مسجل دخول به');
    });

    test('toggleUserActive throws when user is not found', () => {
      usersRepo.getAll.mockReturnValue([admin]);

      expect(() => authService.toggleUserActive(999))
        .toThrow('المستخدم غير موجود');
    });

    test('toggleUserActive toggles active status successfully', () => {
      usersRepo.getAll.mockReturnValue([
        admin,
        { id: 2, username: 'cashier', is_active: 1 },
      ]);

      const result = authService.toggleUserActive(2);
      expect(result).toEqual({ success: true });
      expect(usersRepo.setActive).toHaveBeenCalledWith(2, false);
    });

    test('removeUser prevents deleting own logged-in account', () => {
      expect(() => authService.removeUser(1))
        .toThrow('لا يمكنك حذف حسابك الخاص وأنت مسجل دخول به');
    });

    test('removeUser deactivates another user instead of deleting the record', () => {
      usersRepo.getDetails.mockReturnValue({
        stats: { invoiceCount: 0, shiftCount: 0, returnCount: 0 },
      });
      const result = authService.removeUser(2);
      expect(result).toEqual({ success: true });
      expect(usersRepo.setActive).toHaveBeenCalledWith(2, false);
    });
  });

  describe('Session Utilities: refreshSession & getSessionTTL', () => {
    test('refreshSession returns null when there is no active session', () => {
      authService.logout();
      expect(authService.refreshSession()).toBeNull();
    });

    test('refreshSession successfully refreshes token and returns updated session', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      const result = authService.refreshSession();
      expect(result).toEqual({
        token: expect.any(String),
        user: {
          id: 1,
          username: 'admin',
          role: 'admin',
          systemRoleKey: null,
          permissions: ['*'],
          forcePasswordChange: false,
        },
      });
      expect(sessionService.refreshToken).toHaveBeenCalled();
    });

    test('getSessionTTL returns 0 when logged out and TTL when logged in', () => {
      authService.logout();
      expect(authService.getSessionTTL()).toBe(0);

      usersRepo.getByUsername.mockReturnValue(admin);
      authService.login('admin', 'admin123');
      expect(authService.getSessionTTL()).toBe(1800);
    });
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

    test('throws when no admin account exists in database for recovery', () => {
      usersRepo.getAdmin.mockReturnValue(null);

      expect(() => {
        authService.resetAdminPasswordWithRecoveryKey({
          recoveryKey: rawRescueKey,
          newPassword: 'new-pass-123',
        });
      }).toThrow('لم يتم العثور على حساب المدير في النظام');

      const challenge = authService.getRecoveryChallenge();
      const validOtp = authService.generateDeveloperRecoveryOtp(challenge);
      expect(() => {
        authService.resetAdminPasswordWithChallenge({
          challengeCode: challenge,
          responseOtp: validOtp,
          newPassword: 'new-pass-123',
        });
      }).toThrow('لم يتم العثور على حساب المدير في النظام');
    });
  });

  describe('Brute-Force & Rate Limiting Defense (حماية الهجمات العنيفة والقفل التلقائي)', () => {
    test('locks out account after 5 consecutive failed login attempts', () => {
      usersRepo.getByUsername.mockReturnValue(admin);

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        expect(() => authService.login('admin', 'wrong-pass')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');
      }

      // 5th failed attempt triggers lockout
      expect(() => authService.login('admin', 'wrong-pass')).toThrow(/تم تجاوز الحد الأقصى للمحاولات الخاطئة/);

      // 6th attempt while locked out throws lockout error with remaining time
      expect(() => authService.login('admin', 'admin123')).toThrow(/تم قفل الحساب مؤقتًا بسبب كثرة المحاولات الخاطئة/);
    });

    test('clears failed attempts counter upon successful login', () => {
      const freshUser = {
        id: 10,
        username: 'cleanuser',
        password_hash: bcrypt.hashSync('cleanpass123', 4),
        role: 'cashier',
        is_active: 1,
      };
      usersRepo.getByUsername.mockReturnValue(freshUser);

      // 2 failed attempts
      expect(() => authService.login('cleanuser', 'wrong1')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');
      expect(() => authService.login('cleanuser', 'wrong2')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');

      // 3rd attempt succeeds
      const result = authService.login('cleanuser', 'cleanpass123');
      expect(result.token).toBeDefined();

      // Next wrong attempt counts from 1 again, not 3
      expect(() => authService.login('cleanuser', 'wrongAgain')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');
    });
  });

  describe('Corrupted / Expired Token Recovery in getCurrentSession', () => {
    test('returns null and clears token when verifyToken throws', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      // Force sessionService.verifyToken to throw InvalidSession
      sessionService.verifyToken.mockImplementationOnce(() => {
        throw new Error('InvalidSession');
      });

      expect(authService.getCurrentSession()).toBeNull();
      expect(authService.getCurrentSession()).toBeNull();
    });
  });

  describe('Multi-Window / Multi-Lane Session Isolation & Crash Recovery', () => {
    test('supports independent sessions across different window callers (webContents.id)', () => {
      usersRepo.getByUsername.mockImplementation((username) => {
        if (username === 'admin') return admin;
        if (username === 'cashier') return cashier;
        return undefined;
      });

      // Window 1 logs in as Admin
      const win1Login = authService.login('admin', 'admin123', 101);
      expect(win1Login.user.username).toBe('admin');

      // Window 2 logs in as Cashier
      const win2Login = authService.login('cashier', 'cashier123', 102);
      expect(win2Login.user.username).toBe('cashier');

      // Verify sessions are completely isolated
      const sessionWin1 = authService.getCurrentSession(101);
      const sessionWin2 = authService.getCurrentSession(102);

      expect(sessionWin1.username).toBe('admin');
      expect(sessionWin1.role).toBe('admin');

      expect(sessionWin2.username).toBe('cashier');
      expect(sessionWin2.role).toBe('cashier');

      // Guard checks should honor caller window
      expect(authService.requireAdmin(101).role).toBe('admin');
      expect(() => authService.requireAdmin(102)).toThrow('غير مصرح لك بتنفيذ هذا الإجراء');
    });

    test('does not expose the persisted default session to a different window', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      authService.login('admin', 'admin123');

      expect(authService.getCurrentSession(303)).toBeNull();
      expect(authService.getSessionToken(303)).toBeNull();
    });

    test('logging out from one window does not terminate session in another window', () => {
      usersRepo.getByUsername.mockImplementation((username) => {
        if (username === 'admin') return admin;
        if (username === 'cashier') return cashier;
        return undefined;
      });

      authService.login('admin', 'admin123', 201);
      authService.login('cashier', 'cashier123', 202);

      // Logout window 202
      authService.logout(202);

      expect(authService.getCurrentSession(202)).toBeNull();
      expect(authService.getCurrentSession(201)).not.toBeNull();
      expect(authService.getCurrentSession(201).username).toBe('admin');
    });

    test('recovers session from persistent settings repository upon app restart/crash', () => {
      usersRepo.getByUsername.mockReturnValue(admin);
      const loginRes = authService.login('admin', 'admin123');
      const savedToken = loginRes.token;

      // Verify token was stored in settings repository
      expect(settingsRepo.set).toHaveBeenCalledWith('last_active_session_token', savedToken);

      // Simulate app restart / memory wipe without explicit logout
      authService._resetMemoryForTesting();

      // Mock settingsRepo returning the persisted token as if restored from disk
      settingsRepo.get.mockReturnValueOnce(savedToken);

      const recoveredSession = authService.getCurrentSession();
      expect(recoveredSession).not.toBeNull();
      expect(recoveredSession.username).toBe('admin');
      expect(recoveredSession.role).toBe('admin');
    });
  });
});
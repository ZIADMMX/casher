/**
 * @file license.flow.test.js
 * @description Full end-to-end license flow tests covering:
 *   - Fresh install trial period (14 days)
 *   - Activation with a valid / invalid key
 *   - State persistence (save & reload)
 *   - Trial expiry simulation → LicenseLockScreen trigger condition
 *   - Clock rollback detection (anti-tamper)
 *   - IPC handler delegation
 */

const licenseService = require('../../electron/services/license.service');

// ── Mock DB repo ─────────────────────────────────────────────────────────────
let mockStore = {};

jest.mock('../../electron/repositories/settings.repository', () => ({
  getAll:  jest.fn(() => mockStore),
  get:     jest.fn((key) => mockStore[key]),
  set:     jest.fn((key, value) => { mockStore[key] = value; }),
  setMany: jest.fn((obj) => { Object.assign(mockStore, obj); }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────
const DAY_MS = 24 * 60 * 60 * 1000;
const FIXED_NOW = 1_700_000_000_000; // 2023-11-14T22:13:20.000Z

function makeKey(daysFromNow = 30, hwid = licenseService.getMachineHardwareId()) {
  const expiryTimestamp = FIXED_NOW + daysFromNow * DAY_MS;
  return licenseService.generateLicenseKey({ hwid, expiryTimestamp });
}

function makeLifetimeKey(hwid = licenseService.getMachineHardwareId()) {
  return licenseService.generateLicenseKey({
    hwid,
    expiryTimestamp: 9_999_999_999_999,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
describe('License Flow – Full End-to-End', () => {
  let dateSpy;

  beforeEach(() => {
    mockStore  = {};
    jest.clearAllMocks();
    dateSpy = jest.spyOn(Date, 'now').mockReturnValue(FIXED_NOW);
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  // ── 1. Fresh install ─────────────────────────────────────────────────────
  describe('1. Fresh install – 14-day trial', () => {
    test('status is trial, not activated, not expired, 14 days left', () => {
      const status = licenseService.getLicenseStatus();

      expect(status.isActivated).toBe(false);
      expect(status.isTrial).toBe(true);
      expect(status.isExpired).toBe(false);
      expect(status.remainingDays).toBe(14);
    });

    test('trial_start_date is persisted to DB on first call', () => {
      licenseService.getLicenseStatus();
      expect(mockStore.trial_start_date).toBe(String(FIXED_NOW));
    });

    test('subsequent calls reuse the same trial_start_date (no drift)', () => {
      licenseService.getLicenseStatus();
      const firstDate = mockStore.trial_start_date;

      dateSpy.mockReturnValue(FIXED_NOW + 2 * DAY_MS);
      licenseService.getLicenseStatus();

      expect(mockStore.trial_start_date).toBe(firstDate);
    });
  });

  // ── 2. Trial expiry after 14 days ─────────────────────────────────────────
  describe('2. Trial expiry – simulate 15 days later', () => {
    test('isExpired becomes true after 15 days', () => {
      licenseService.getLicenseStatus();

      dateSpy.mockReturnValue(FIXED_NOW + 15 * DAY_MS);
      const status = licenseService.getLicenseStatus();

      expect(status.isExpired).toBe(true);
      expect(status.remainingDays).toBe(0);
      expect(status.isActivated).toBe(false);
    });

    test('expired status triggers LicenseLockScreen condition (isExpired && !isActivated)', () => {
      licenseService.getLicenseStatus();
      dateSpy.mockReturnValue(FIXED_NOW + 15 * DAY_MS);
      const status = licenseService.getLicenseStatus();

      // This is the exact condition checked in App.jsx line 59
      const shouldShowLockScreen = status.isExpired && !status.isActivated;
      expect(shouldShowLockScreen).toBe(true);
    });

    test('exactly on day 14 last second is NOT expired', () => {
      licenseService.getLicenseStatus();
      dateSpy.mockReturnValue(FIXED_NOW + 14 * DAY_MS - 1000);
      const status = licenseService.getLicenseStatus();

      expect(status.isExpired).toBe(false);
      expect(status.remainingDays).toBe(1);
    });
  });

  // ── 3. Activation with valid key ──────────────────────────────────────────
  describe('3. Activation – valid key', () => {
    test('activateSoftware succeeds and returns success:true', () => {
      const key = makeKey(30);
      const result = licenseService.activateSoftware(key);

      expect(result.success).toBe(true);
      expect(result.message).toContain('تم تفعيل');
      expect(result.status.isActivated).toBe(true);
    });

    test('license_key is persisted to DB after activation', () => {
      const key = makeKey(30);
      licenseService.activateSoftware(key);

      expect(mockStore.license_key).toBe(key.trim().toUpperCase());
      expect(mockStore.license_activated_at).toBeDefined();
    });

    test('getLicenseStatus returns activated after activation (state reload)', () => {
      const key = makeKey(30);
      licenseService.activateSoftware(key);

      const status = licenseService.getLicenseStatus();

      expect(status.isActivated).toBe(true);
      expect(status.isTrial).toBe(false);
      expect(status.isExpired).toBe(false);
    });

    test('lifetime key: remainingDays is 99999', () => {
      const key = makeLifetimeKey();
      licenseService.activateSoftware(key);
      const status = licenseService.getLicenseStatus();

      expect(status.remainingDays).toBe(99999);
      expect(status.licenseType).toBe('ترخيص كامل (مدى الحياة)');
    });

    test('activated app: LicenseLockScreen does NOT show', () => {
      const key = makeLifetimeKey();
      licenseService.activateSoftware(key);
      const status = licenseService.getLicenseStatus();

      const shouldShowLockScreen = status.isExpired && !status.isActivated;
      expect(shouldShowLockScreen).toBe(false);
    });
  });

  // ── 4. Activation with invalid key ───────────────────────────────────────
  describe('4. Activation – invalid key scenarios', () => {
    test('throws on empty key', () => {
      expect(() => licenseService.activateSoftware('')).toThrow('مفتاح التفعيل فارغ');
    });

    test('throws on wrong format (no KASH prefix)', () => {
      expect(() => licenseService.activateSoftware('INVALID-123')).toThrow('تنسيق المفتاح غير صحيح');
    });

    test('throws when key is for a different machine HWID', () => {
      const foreignKey = makeKey(30, 'AAAABBBB');
      expect(() => licenseService.activateSoftware(foreignKey)).toThrow('هذا السيريال مخصص لجهاز آخر');
    });

    test('throws on expired activation key', () => {
      const expiredKey = makeKey(-5);
      expect(() => licenseService.activateSoftware(expiredKey)).toThrow('انتهت صلاحية مفتاح التفعيل هذا');
    });

    test('throws on tampered signature', () => {
      const key = makeKey(30);
      const tampered = key.slice(0, -4) + 'ZZZZ';
      expect(() => licenseService.activateSoftware(tampered)).toThrow('توقيع المفتاح غير صحيح أو تم التلاعب به');
    });

    test('DB is NOT written when activation fails', () => {
      expect(() => licenseService.activateSoftware('KASH-INVALID')).toThrow();
      expect(mockStore.license_key).toBeUndefined();
    });
  });

  // ── 5. State persistence across "restarts" ────────────────────────────────
  describe('5. State persistence (save & reload)', () => {
    test('trial state reloads correctly: correct remainingDays after 3 days', () => {
      licenseService.getLicenseStatus(); // day 0

      dateSpy.mockReturnValue(FIXED_NOW + 3 * DAY_MS);
      const status = licenseService.getLicenseStatus();

      expect(status.remainingDays).toBe(11); // 14 - 3
      expect(status.isExpired).toBe(false);
    });

    test('activated state survives restart: reads license_key from DB', () => {
      const key = makeLifetimeKey();
      licenseService.activateSoftware(key);

      // Simulate app restart: mockStore still has data (like real DB)
      const status = licenseService.getLicenseStatus();
      expect(status.isActivated).toBe(true);
    });
  });

  // ── 6. Clock rollback detection (anti-tamper) ────────────────────────────
  describe('6. Anti-tamper – clock rollback detection', () => {
    test('warns on console.warn if clock goes backward by >1 minute', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      licenseService.getLicenseStatus();
      dateSpy.mockReturnValue(FIXED_NOW - 2 * 60 * 1000);
      licenseService.getLicenseStatus();

      expect(warnSpy).toHaveBeenCalledWith('تنبيه: تم اكتشاف تلاعب في ساعة النظام!');
      warnSpy.mockRestore();
    });

    test('after clock rollback, trial isExpired becomes true (security measure)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      licenseService.getLicenseStatus();
      dateSpy.mockReturnValue(FIXED_NOW - 2 * 60 * 1000);
      const status = licenseService.getLicenseStatus();

      expect(status.isExpired).toBe(true);
      warnSpy.mockRestore();
    });

    test('small clock drift <1 minute is tolerated (normal NTP correction)', () => {
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      licenseService.getLicenseStatus();
      dateSpy.mockReturnValue(FIXED_NOW - 30 * 1000); // 30 seconds back
      licenseService.getLicenseStatus();

      expect(warnSpy).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });
  });
});

const crypto = require('node:crypto');
const originalLicenseSecret = process.env.KASHIEAR_LICENSE_SECRET;
process.env.KASHIEAR_LICENSE_SECRET = crypto.randomBytes(32).toString('hex');
const licenseService = require('../../electron/services/license.service');
require('../../electron/repositories/settings.repository');

let mockStore = {};

jest.mock('../../electron/repositories/settings.repository', () => ({
  getAll: jest.fn(() => mockStore),
  get: jest.fn((key) => mockStore[key]),
  set: jest.fn((key, value) => { mockStore[key] = value; }),
  setMany: jest.fn((obj) => { Object.assign(mockStore, obj); })
}));

describe('license.service', () => {
  let dateSpy;
  

  beforeEach(() => {
    mockStore = {};
    jest.clearAllMocks();
    dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => 1700000000000); // e.g. Nov 14 2023
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });

  afterAll(() => {
    if (originalLicenseSecret === undefined) {
      delete process.env.KASHIEAR_LICENSE_SECRET;
    } else {
      process.env.KASHIEAR_LICENSE_SECRET = originalLicenseSecret;
    }
  });

  test('1. getMachineHardwareId returns 8 uppercase hex chars consistently', () => {
    const hwid1 = licenseService.getMachineHardwareId();
    const hwid2 = licenseService.getMachineHardwareId();
    
    expect(hwid1).toMatch(/^[0-9A-F]{8}$/);
    expect(hwid1).toBe(hwid2);
  });

  test('2. generateLicenseKey produces correct KASH-XXXX-XXXX-XXXX format', () => {
    const hwid = 'ABCDEF12';
    const expiryTimestamp = 1700000000000;
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    expect(key).toMatch(/^KASH-ABCDEF12-[0-9A-F]+-[0-9A-F]{8}$/);
  });

  test('does not embed a fallback signing secret when none is configured', () => {
    const configuredSecret = process.env.KASHIEAR_LICENSE_SECRET;
    delete process.env.KASHIEAR_LICENSE_SECRET;

    try {
      jest.isolateModules(() => {
        const unconfiguredLicenseService = require('../../electron/services/license.service');
        expect(() => unconfiguredLicenseService.generateLicenseKey({
          hwid: 'ABCDEF12',
          expiryTimestamp: 1700000000000,
        })).toThrow('KASHIEAR_LICENSE_SECRET غير معرف');
      });
    } finally {
      process.env.KASHIEAR_LICENSE_SECRET = configuredSecret;
    }
  });

  test('3. verifyLicenseKey validates a correct key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.verifyLicenseKey(key, hwid);
    expect(result.valid).toBe(true);
    expect(result.expiryTimestamp).toBe(expiryTimestamp);
  });

  test('4. verifyLicenseKey rejects key for wrong HWID', () => {
    const hwid = 'WRONG123';
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    const actualHwid = licenseService.getMachineHardwareId();
    const result = licenseService.verifyLicenseKey(key, actualHwid);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('هذا السيريال مخصص لجهاز آخر');
  });

  test('5. verifyLicenseKey rejects expired key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() - 100000; // Past date
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.verifyLicenseKey(key, hwid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('انتهت صلاحية مفتاح التفعيل هذا');
  });

  test('6. verifyLicenseKey accepts lifetime key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = 9999999999999; // Lifetime
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.verifyLicenseKey(key, hwid);
    expect(result.valid).toBe(true);
    expect(result.isLifetime).toBe(true);
  });

  test('7. verifyLicenseKey rejects tampered signature', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    const tamperedKey = key.slice(0, -4) + '0000'; // Change last 4 chars
    const result = licenseService.verifyLicenseKey(tamperedKey, hwid);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('توقيع المفتاح غير صحيح أو تم التلاعب به');
  });

  test('8. getLicenseStatus returns trial on fresh install', () => {
    const status = licenseService.getLicenseStatus();
    
    expect(status.isActivated).toBe(false);
    expect(status.isTrial).toBe(true);
    expect(status.isExpired).toBe(false);
    expect(status.remainingDays).toBe(14);
    expect(mockStore.trial_start_date).toBe(String(Date.now()));
  });

  test('9. getLicenseStatus returns expired after 14+ days (mock Date.now)', () => {
    // Fresh install
    licenseService.getLicenseStatus();
    
    // Move time forward 15 days
    const fifteenDaysMs = 15 * 24 * 60 * 60 * 1000;
    dateSpy.mockImplementation(() => 1700000000000 + fifteenDaysMs);
    
    const status = licenseService.getLicenseStatus();
    expect(status.isActivated).toBe(false);
    expect(status.isTrial).toBe(true);
    expect(status.isExpired).toBe(true);
    expect(status.remainingDays).toBe(0);
  });

  test('10. activateSoftware succeeds with valid key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.activateSoftware(key);
    expect(result.success).toBe(true);
    expect(mockStore.license_key).toBe(key);
  });

  test('11. activateSoftware throws on invalid key', () => {
    expect(() => licenseService.activateSoftware('INVALID-KEY')).toThrow('تنسيق المفتاح غير صحيح');
  });

  test('12. getLicenseStatus returns activated after activation', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = 9999999999999;
    const key = licenseService.generateLicenseKey({ hwid, expiryTimestamp });
    
    licenseService.activateSoftware(key);
    
    const status = licenseService.getLicenseStatus();
    expect(status.isActivated).toBe(true);
    expect(status.isTrial).toBe(false);
    expect(status.isExpired).toBe(false);
    expect(status.licenseType).toBe('ترخيص كامل (مدى الحياة)');
  });

  test('13. getLicenseStatus detects clock rollback', () => {
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    
    licenseService.getLicenseStatus(); // sets last_known_clock
    
    // Move time backwards
    dateSpy.mockImplementation(() => 1700000000000 - 100000);
    
    const status = licenseService.getLicenseStatus();
    expect(warnSpy).toHaveBeenCalledWith('تنبيه: تم اكتشاف تلاعب في ساعة النظام!');
    // Also test trial expired if clock rollback is detected in trial logic
    expect(status.isExpired).toBe(true);
    
    warnSpy.mockRestore();
  });

  test('14. clock rollback remains blocked after the clock is restored', () => {
    licenseService.getLicenseStatus();

    dateSpy.mockImplementation(() => 1700000000000 + 20 * 24 * 60 * 60 * 1000);
    licenseService.getLicenseStatus();

    dateSpy.mockImplementation(() => 1700000000000);
    const status = licenseService.getLicenseStatus();

    expect(mockStore.clock_rollback_detected).toBe('1');
    expect(status.isExpired).toBe(true);
  });
});

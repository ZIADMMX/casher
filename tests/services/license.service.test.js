const crypto = require('node:crypto');
const licenseKeys = require('../helpers/licenseKeys');
const { signLicenseKey, base32Encode, base32Decode } = require('../../electron/security/licenseSigning');
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
    // Each test starts on a machine that never ran a trial.
    require('node:fs').rmSync(process.env.FOX_TRIAL_MARKER_DIR, { recursive: true, force: true });
    mockStore = {};
    jest.clearAllMocks();
    dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => 1700000000000); // e.g. Nov 14 2023
  });

  afterEach(() => {
    dateSpy.mockRestore();
  });


  test('1. getMachineHardwareId returns 8 uppercase hex chars consistently', () => {
    const hwid1 = licenseService.getMachineHardwareId();
    const hwid2 = licenseService.getMachineHardwareId();
    
    expect(hwid1).toMatch(/^[0-9A-F]{8}$/);
    expect(hwid1).toBe(hwid2);
  });

  test('2. license keys use the FOX1 Crockford base32 format', () => {
    const key = licenseKeys.generateLicenseKey({ hwid: 'ABCDEF12', expiryTimestamp: 1700000000000 });

    expect(key).toMatch(/^FOX1(-[0-9A-HJKMNP-TV-Z]{1,5})+$/);
  });

  test('the app cannot mint keys: it ships no signing function or secret', () => {
    expect(licenseService.generateLicenseKey).toBeUndefined();
    expect(licenseService.DEVELOPER_MASTER_SECRET).toBeUndefined();
  });

  test('rejects a key signed with any other private key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const { privateKey: otherKey } = crypto.generateKeyPairSync('ed25519');
    const forged = signLicenseKey({ hwid, expiryTimestamp: 9999999999000, privateKey: otherKey });

    const result = licenseService.verifyLicenseKey(forged, hwid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('توقيع المفتاح غير صحيح أو تم التلاعب به');
  });

  test('rejects a valid key whose HWID bytes were edited', () => {
    const key = licenseKeys.generateLicenseKey({ hwid: 'ABCDEF12', expiryTimestamp: 9999999999000 });
    const bytes = base32Decode(key.slice(4).replace(/-/g, ''));
    bytes.write('12345678', 1, 'hex');
    const edited = `FOX1${base32Encode(bytes)}`;

    const result = licenseService.verifyLicenseKey(edited, '12345678');
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('توقيع المفتاح غير صحيح أو تم التلاعب به');
  });

  test('accepts the key with spaces, lower case and without dashes', () => {
    const hwid = licenseService.getMachineHardwareId();
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp: 9999999999000 });
    const messy = ` ${key.replace(/-/g, '').toLowerCase()} `;

    expect(licenseService.verifyLicenseKey(messy, hwid).valid).toBe(true);
  });

  test('an old KASH key asks for re-activation instead of falling back to an ended trial', () => {
    mockStore.license_key = 'KASH-ABCDEF12-9184E72A000-ABCDEF12';
    mockStore.trial_start_date = String(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const status = licenseService.getLicenseStatus();
    expect(status.isActivated).toBe(false);
    expect(status.isExpired).toBe(true);
    expect(status.needsReactivation).toBe(true);
    expect(status.trialDeadlineReached).toBe(false);
  });

  test('3. verifyLicenseKey validates a correct key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.verifyLicenseKey(key, hwid);
    expect(result.valid).toBe(true);
    expect(result.expiryTimestamp).toBe(expiryTimestamp);
  });

  test('deleting the database does not start a fresh trial', () => {
    licenseService.getLicenseStatus(); // trial starts now
    mockStore = {}; // database deleted or app reinstalled
    dateSpy.mockImplementation(() => 1700000000000 + 15 * 24 * 60 * 60 * 1000);

    const status = licenseService.getLicenseStatus();
    expect(status.isExpired).toBe(true);
    expect(status.trialDeadlineReached).toBe(true);
    expect(mockStore.trial_start_date).toBe('1700000000000');
  });

  test('moving the marker date later does not extend the trial', () => {
    licenseService.getLicenseStatus();
    const hwid = licenseService.getMachineHardwareId();
    require('node:fs').writeFileSync(
      require('node:path').join(process.env.FOX_TRIAL_MARKER_DIR, `${hwid}.dat`),
      String(1700000000000 + 30 * 24 * 60 * 60 * 1000)
    );
    dateSpy.mockImplementation(() => 1700000000000 + 15 * 24 * 60 * 60 * 1000);

    expect(licenseService.getLicenseStatus().trialDeadlineReached).toBe(true);
  });

  test('an expired paid key locks the app as expired, not as an ended trial', () => {
    const hwid = licenseService.getMachineHardwareId();
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp: Date.now() + 1000 });
    licenseService.activateSoftware(key, Date.now());
    mockStore.trial_start_date = String(Date.now() - 400 * 24 * 60 * 60 * 1000);

    const status = licenseService.getLicenseStatus(Date.now() + 2000);
    expect(status.isActivated).toBe(false);
    expect(status.isExpired).toBe(true);
    expect(status.trialDeadlineReached).toBe(false);
    expect(status.reason).toBe('انتهت صلاحية مفتاح التفعيل هذا');
  });

  test('4. verifyLicenseKey rejects key for wrong HWID', () => {
    const hwid = 'ABCD1234';
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
    const actualHwid = licenseService.getMachineHardwareId();
    const result = licenseService.verifyLicenseKey(key, actualHwid);
    
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('هذا السيريال مخصص لجهاز آخر');
  });

  test('5. verifyLicenseKey rejects expired key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() - 100000; // Past date
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.verifyLicenseKey(key, hwid);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('انتهت صلاحية مفتاح التفعيل هذا');
  });

  test('6. verifyLicenseKey accepts lifetime key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = 9999999999999; // Lifetime
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
    const result = licenseService.verifyLicenseKey(key, hwid);
    expect(result.valid).toBe(true);
    expect(result.isLifetime).toBe(true);
  });

  test('7. verifyLicenseKey rejects tampered signature', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
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

  test('warns during the final two days of the trial', () => {
    licenseService.getLicenseStatus();
    const twelveDaysMs = 12 * 24 * 60 * 60 * 1000;
    dateSpy.mockImplementation(() => 1700000000000 + twelveDaysMs);

    const status = licenseService.getLicenseStatus();

    expect(status.remainingDays).toBe(2);
    expect(status.warning).toBe(true);
    expect(status.isExpired).toBe(false);
  });

  test('10. activateSoftware succeeds with valid key', () => {
    const hwid = licenseService.getMachineHardwareId();
    const expiryTimestamp = Date.now() + 100000;
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
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
    const key = licenseKeys.generateLicenseKey({ hwid, expiryTimestamp });
    
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

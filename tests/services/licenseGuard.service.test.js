jest.mock('../../electron/services/licenseClock.service', () => ({
  getTrustedNow: jest.fn(),
}));
jest.mock('../../electron/services/license.service', () => ({
  getLicenseStatus: jest.fn(),
}));
jest.mock('../../electron/database/db', () => ({
  clearExpiredTrialData: jest.fn(),
}));

const licenseClock = require('../../electron/services/licenseClock.service');
const licenseService = require('../../electron/services/license.service');
const database = require('../../electron/database/db');
const { requireActiveLicense } = require('../../electron/services/licenseGuard.service');

describe('licenseGuard.service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    licenseClock.getTrustedNow.mockResolvedValue(1_800_000_000_000);
  });

  test('blocks operations when the trial has expired and notifies the renderer', async () => {
    licenseService.getLicenseStatus.mockReturnValue({
      isExpired: true,
      isActivated: false,
      trialDeadlineReached: true,
    });
    const event = {
      sender: {
        isDestroyed: jest.fn(() => false),
        send: jest.fn(),
      },
    };

    await expect(requireActiveLicense(event)).rejects.toThrow('انتهت الفترة التجريبية');

    expect(licenseService.getLicenseStatus).toHaveBeenCalledWith(
      1_800_000_000_000,
      { updateClock: false }
    );
    expect(event.sender.send).toHaveBeenCalledWith('license:statusChanged', {
      isExpired: true,
      isActivated: false,
      trialDeadlineReached: true,
    });
    expect(database.clearExpiredTrialData).toHaveBeenCalledTimes(1);
  });

  test('does not purge data when the lock is caused by clock rollback', async () => {
    licenseService.getLicenseStatus.mockReturnValue({
      isExpired: true,
      isActivated: false,
      trialDeadlineReached: false,
    });

    await expect(requireActiveLicense()).rejects.toThrow('دون تصفير بيانات المتجر');
    expect(database.clearExpiredTrialData).not.toHaveBeenCalled();
  });

  test('allows operations only while the license is active', async () => {
    const status = { isExpired: false, isActivated: true };
    licenseService.getLicenseStatus.mockReturnValue(status);

    await expect(requireActiveLicense()).resolves.toBe(status);
  });

  test('fails closed when the trusted time server cannot be reached', async () => {
    licenseClock.getTrustedNow.mockRejectedValue(new Error('time server unavailable'));

    await expect(requireActiveLicense()).rejects.toThrow('time server unavailable');
    expect(licenseService.getLicenseStatus).not.toHaveBeenCalled();
  });
});

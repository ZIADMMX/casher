describe('licenseClock.service', () => {
  const originalEndpoint = process.env.FOX_LICENSE_TIME_URL;
  const originalFetch = global.fetch;
  let licenseClock;

  beforeEach(() => {
    jest.resetModules();
    process.env.FOX_LICENSE_TIME_URL = 'https://license.example.com/api/license/time';
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ utc: '2030-01-02T03:04:05.000Z' }),
    });
    licenseClock = require('../../electron/services/licenseClock.service');
  });

  afterEach(() => {
    licenseClock.resetForTesting();
    global.fetch = originalFetch;
    if (originalEndpoint === undefined) {
      delete process.env.FOX_LICENSE_TIME_URL;
    } else {
      process.env.FOX_LICENSE_TIME_URL = originalEndpoint;
    }
  });

  test('uses the HTTPS server UTC time and caches recent validation', async () => {
    const serverTime = Date.parse('2030-01-02T03:04:05.000Z');

    const firstTime = await licenseClock.getTrustedNow();
    const secondTime = await licenseClock.getTrustedNow();

    expect(firstTime).toBeGreaterThanOrEqual(serverTime);
    expect(firstTime).toBeLessThan(serverTime + 2000);
    expect(secondTime).toBeGreaterThanOrEqual(firstTime);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('rejects a non-HTTPS time endpoint', async () => {
    process.env.FOX_LICENSE_TIME_URL = 'http://license.example.com/api/license/time';

    await expect(licenseClock.getTrustedNow()).rejects.toThrow('يتطلب رابط HTTPS');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('packaged builds ignore a client-controlled environment URL', async () => {
    jest.doMock('electron', () => ({ app: { isPackaged: true } }));
    jest.doMock('node:fs', () => ({
      ...jest.requireActual('node:fs'),
      readFileSync: jest.fn(() => {
        const error = new Error('missing test config');
        error.code = 'ENOENT';
        throw error;
      }),
    }));
    jest.resetModules();
    const packagedClock = require('../../electron/services/licenseClock.service');

    await expect(packagedClock.getTrustedNow()).rejects.toThrow('غير مضبوط');
    expect(global.fetch).not.toHaveBeenCalled();

    jest.dontMock('electron');
    jest.dontMock('node:fs');
    packagedClock.resetForTesting();
  });
});

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

  describe('offline fallback', () => {
    const DAY = 24 * 60 * 60 * 1000;
    const SERVER_TIME = Date.parse('2030-01-02T03:04:05.000Z');
    const WALL_AT_SYNC = 1_900_000_000_000;
    let store;
    let wallNow;
    let dateSpy;

    function makeStore(initial = {}) {
      const data = new Map(Object.entries(initial));
      return {
        data,
        get: jest.fn((key) => (data.has(key) ? data.get(key) : null)),
        set: jest.fn((key, value) => data.set(key, String(value))),
      };
    }

    function anchoredStore(lastSeen = WALL_AT_SYNC) {
      return makeStore({
        license_time_anchor_server: String(SERVER_TIME),
        license_time_anchor_wall: String(WALL_AT_SYNC),
        license_time_last_seen_wall: String(lastSeen),
      });
    }

    beforeEach(() => {
      wallNow = WALL_AT_SYNC;
      dateSpy = jest.spyOn(Date, 'now').mockImplementation(() => wallNow);
      store = makeStore();
      licenseClock.setAnchorStoreForTesting(store);
    });

    afterEach(() => {
      dateSpy.mockRestore();
    });

    test('a successful check saves an anchor for later offline use', async () => {
      await licenseClock.getTrustedNow();

      expect(Number(store.data.get('license_time_anchor_server'))).toBeGreaterThanOrEqual(SERVER_TIME);
      expect(store.data.get('license_time_anchor_wall')).toBe(String(WALL_AT_SYNC));
      expect(store.data.get('license_time_last_seen_wall')).toBe(String(WALL_AT_SYNC));
    });

    test('keeps working offline after a restart within the grace period', async () => {
      store = anchoredStore();
      licenseClock.setAnchorStoreForTesting(store);
      global.fetch.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));
      wallNow = WALL_AT_SYNC + 3 * DAY;

      await expect(licenseClock.getTrustedNow()).resolves.toBe(SERVER_TIME + 3 * DAY);
      expect(store.data.get('license_time_last_seen_wall')).toBe(String(wallNow));
    });

    test('also falls back when the time server answers with an error', async () => {
      store = anchoredStore();
      licenseClock.setAnchorStoreForTesting(store);
      global.fetch.mockResolvedValue({ ok: false, status: 503 });
      wallNow = WALL_AT_SYNC + DAY;

      await expect(licenseClock.getTrustedNow()).resolves.toBe(SERVER_TIME + DAY);
    });

    test('blocks once the offline grace period is used up', async () => {
      store = anchoredStore();
      licenseClock.setAnchorStoreForTesting(store);
      global.fetch.mockRejectedValue(new Error('offline'));
      wallNow = WALL_AT_SYNC + 8 * DAY;

      await expect(licenseClock.getTrustedNow()).rejects.toThrow('اتصل بالإنترنت');
    });

    test('blocks when the device clock was turned back while offline', async () => {
      store = anchoredStore(WALL_AT_SYNC + 5 * DAY);
      licenseClock.setAnchorStoreForTesting(store);
      global.fetch.mockRejectedValue(new Error('offline'));
      wallNow = WALL_AT_SYNC + DAY;

      await expect(licenseClock.getTrustedNow()).rejects.toThrow('ساعة الجهاز');
    });

    test('a frozen wall clock cannot stop time: app running time still counts', async () => {
      store = anchoredStore();
      store.data.set('license_time_offline_runtime', String(8 * DAY));
      licenseClock.setAnchorStoreForTesting(store);
      global.fetch.mockRejectedValue(new Error('offline'));
      wallNow = WALL_AT_SYNC + 1000; // clock held at the moment of the last check

      await expect(licenseClock.getTrustedNow()).rejects.toThrow('اتصل بالإنترنت');
    });

    test('offline running time moves trusted time forward when the wall clock stands still', async () => {
      store = anchoredStore();
      store.data.set('license_time_offline_runtime', String(2 * DAY));
      licenseClock.setAnchorStoreForTesting(store);
      global.fetch.mockRejectedValue(new Error('offline'));
      wallNow = WALL_AT_SYNC + 1000;

      await expect(licenseClock.getTrustedNow()).resolves.toBe(SERVER_TIME + 2 * DAY);
    });

    test('a successful check resets the offline running time', async () => {
      store = anchoredStore();
      store.data.set('license_time_offline_runtime', String(5 * DAY));
      licenseClock.setAnchorStoreForTesting(store);

      await licenseClock.getTrustedNow();
      expect(store.data.get('license_time_offline_runtime')).toBe('0');
    });

    test('still needs the internet when no check ever succeeded', async () => {
      global.fetch.mockRejectedValue(new Error('offline'));

      await expect(licenseClock.getTrustedNow()).rejects.toThrow('تعذر التحقق من وقت الترخيص');
    });

    test('a later successful check clears a corrected clock', async () => {
      store = anchoredStore(WALL_AT_SYNC + 5 * DAY);
      licenseClock.setAnchorStoreForTesting(store);
      wallNow = WALL_AT_SYNC + DAY;

      await expect(licenseClock.getTrustedNow()).resolves.toBeGreaterThanOrEqual(SERVER_TIME);
      expect(store.data.get('license_time_last_seen_wall')).toBe(String(wallNow));
    });
  });
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockUserDataPath = path.join(os.tmpdir(), 'kashiear-central-client-test');

jest.mock('electron', () => ({
  app: { getPath: () => mockUserDataPath },
}));

jest.mock('../../electron/security/tlsTrust', () => ({
  configureSystemCertificateTrust: jest.fn(),
}));

const mockFingerprint = Array(32).fill('AB').join(':');
jest.mock('../../electron/security/tlsPin', () => ({
  ...jest.requireActual('../../electron/security/tlsPin'),
  fetchServerCertificate: jest.fn(),
  probeServer: jest.fn(),
  pinnedRequest: jest.fn(),
}));

const centralClient = require('../../electron/services/centralClient.service');
const { configureSystemCertificateTrust } = require('../../electron/security/tlsTrust');
const tlsPin = require('../../electron/security/tlsPin');

// Devices paired before certificate pinning: no pinned certificate in the config.
function pairLegacy(baseUrl) {
  fs.mkdirSync(mockUserDataPath, { recursive: true });
  fs.writeFileSync(path.join(mockUserDataPath, 'central-server.json'), JSON.stringify({ baseUrl }));
}

describe('centralClient.service', () => {
  beforeEach(async () => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    global.fetch = jest.fn();
    configureSystemCertificateTrust.mockClear();
    tlsPin.fetchServerCertificate.mockReset();
    tlsPin.probeServer.mockReset();
    tlsPin.pinnedRequest.mockReset();
    await centralClient.configure('');
  });

  afterAll(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    delete global.fetch;
  });

  test('validates the URL and pins the confirmed server certificate', async () => {
    expect(centralClient.getConfig()).toEqual({ baseUrl: '', warehouseId: null, certFingerprint: null, pinned: false });
    await expect(centralClient.configure('not a url')).rejects.toThrow('عنوان الخادم المركزي غير صالح');
    await expect(centralClient.configure('http://192.168.1.10:5000')).rejects.toThrow('يتطلب HTTPS');
    await expect(centralClient.configure('https://192.168.1.10:5443/')).rejects.toThrow('تأكيد بصمة');

    tlsPin.fetchServerCertificate.mockResolvedValue({ fingerprint256: mockFingerprint, pem: 'PEM' });
    await expect(centralClient.configure({ baseUrl: 'https://192.168.1.10:5443/', fingerprint256: mockFingerprint.toLowerCase() }))
      .resolves.toEqual({
        baseUrl: 'https://192.168.1.10:5443',
        warehouseId: null,
        certFingerprint: mockFingerprint,
        pinned: true,
        enabled: true,
      });
    expect(centralClient.isConfigured()).toBe(true);
  });

  test('refuses to pair when the served certificate differs from the confirmed one', async () => {
    tlsPin.fetchServerCertificate.mockResolvedValue({ fingerprint256: Array(32).fill('CD').join(':'), pem: 'PEM' });
    await expect(centralClient.configure({ baseUrl: 'https://192.168.1.10:5443', fingerprint256: mockFingerprint }))
      .rejects.toThrow('لا تطابق');
    expect(centralClient.isConfigured()).toBe(false);
  });

  test('sends requests of a pinned device through the pinned HTTPS client', async () => {
    tlsPin.fetchServerCertificate.mockResolvedValue({ fingerprint256: mockFingerprint, pem: 'PEM' });
    await centralClient.configure({ baseUrl: 'https://central.test:5443', fingerprint256: mockFingerprint });
    tlsPin.pinnedRequest.mockResolvedValue({ ok: true, json: async () => ({ token: 't', user: { id: 1 } }) });

    await centralClient.login({ username: 'cash1', password: 'x' });

    expect(global.fetch).not.toHaveBeenCalled();
    expect(configureSystemCertificateTrust).not.toHaveBeenCalled();
    expect(tlsPin.pinnedRequest).toHaveBeenCalledWith(
      'https://central.test:5443/api/auth/login',
      expect.objectContaining({ method: 'POST', pin: { fingerprint256: mockFingerprint, pem: 'PEM' } }),
    );
  });

  test('migrates a previously saved HTTP URL to HTTPS', () => {
    fs.mkdirSync(mockUserDataPath, { recursive: true });
    const configPath = path.join(mockUserDataPath, 'central-server.json');
    fs.writeFileSync(configPath, JSON.stringify({
      baseUrl: 'http://central.test:5000',
      warehouseId: 12,
    }));

    expect(centralClient.getConfig()).toEqual({
      baseUrl: 'https://central.test:5443',
      warehouseId: 12,
      certFingerprint: null,
      pinned: false,
    });
    expect(JSON.parse(fs.readFileSync(configPath, 'utf8')).baseUrl)
      .toBe('https://central.test:5443');
  });

  test('rejects a legacy HTTP port that cannot map to a valid HTTPS port', () => {
    fs.mkdirSync(mockUserDataPath, { recursive: true });
    fs.writeFileSync(path.join(mockUserDataPath, 'central-server.json'), JSON.stringify({
      baseUrl: 'http://central.test:65535',
    }));

    expect(() => centralClient.getConfig()).toThrow('منفذ الخادم القديم');
  });

  test('tests central health only over HTTPS and reports the server fingerprint', async () => {
    tlsPin.probeServer.mockResolvedValue({ serverInfo: { status: 'online' }, fingerprint256: mockFingerprint });

    await expect(centralClient.testConnection('http://central.test:5000'))
      .rejects.toThrow('يتطلب HTTPS');
    await expect(centralClient.testConnection('https://central.test:5443'))
      .resolves.toEqual({ status: 'online', fingerprint256: mockFingerprint });

    expect(tlsPin.probeServer).toHaveBeenCalledWith('https://central.test:5443');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test('keeps a selected warehouse and bearer token on central requests', async () => {
    pairLegacy('https://central.test:5443');
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'signed-token', user: { id: 4, role: 'admin' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => [{ id: 1, variants: [] }],
      });

    await centralClient.login({ username: 'admin', password: 'secret' });
    centralClient.setWarehouse(12);
    const products = await centralClient.invoke({ method: 'GET', route: '/api/products' });

    expect(products).toHaveLength(1);
    expect(global.fetch.mock.calls[1][1].headers).toMatchObject({
      Authorization: 'Bearer signed-token',
      'X-Branch-Warehouse-Id': '12',
    });
  });

  test('caches court reads and invalidates the cache after a court update', async () => {
    pairLegacy('https://central.test:5443');
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'signed-token', user: { id: 4, role: 'admin', branch_id: 2 } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'court-1', name: 'محكمة القاهرة' }], total: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: 'court-1', name: 'محكمة الاستئناف' }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'court-1', name: 'محكمة الاستئناف' }], total: 1 }),
      });

    await centralClient.login({ username: 'admin', password: 'secret' });
    const first = await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });
    first.items[0].name = 'تعديل محلي لا يجب تخزينه';
    const cached = await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(cached.items[0].name).toBe('محكمة القاهرة');

    await centralClient.invoke({
      method: 'PUT',
      route: '/api/courts/123e4567-e89b-42d3-a456-426614174000',
      body: { name: 'محكمة الاستئناف' },
    });
    const refreshed = await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });

    expect(global.fetch).toHaveBeenCalledTimes(4);
    expect(refreshed.items[0].name).toBe('محكمة الاستئناف');
  });

  test('shares one in-flight request between concurrent court reads', async () => {
    pairLegacy('https://central.test:5443');
    let resolveCourtsRequest;
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'signed-token', user: { id: 4, role: 'admin' } }),
      })
      .mockImplementationOnce(() => new Promise((resolve) => {
        resolveCourtsRequest = resolve;
      }));

    await centralClient.login({ username: 'admin', password: 'secret' });
    const firstRequest = centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });
    const concurrentRequest = centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    resolveCourtsRequest({
      ok: true,
      json: async () => ({ items: [{ id: 'court-1', name: 'محكمة القاهرة' }], total: 1 }),
    });

    const [first, concurrent] = await Promise.all([firstRequest, concurrentRequest]);
    expect(first).toEqual(concurrent);
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' }))
      .toEqual(first);
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('refreshes court cache on the first request after four hours', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000);
    pairLegacy('https://central.test:5443');
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'signed-token', user: { id: 4, role: 'admin' } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'court-1', name: 'الاسم القديم' }], total: 1 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ items: [{ id: 'court-1', name: 'الاسم الجديد' }], total: 1 }),
      });

    try {
      await centralClient.login({ username: 'admin', password: 'secret' });
      const first = await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });
      expect(first.items[0].name).toBe('الاسم القديم');
      expect(await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' }))
        .toEqual(first);
      expect(global.fetch).toHaveBeenCalledTimes(2);

      now.mockReturnValue(1_000 + 4 * 60 * 60 * 1000);
      const refreshed = await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' });

      expect(refreshed.items[0].name).toBe('الاسم الجديد');
      expect(global.fetch).toHaveBeenCalledTimes(3);
      expect(await centralClient.invoke({ method: 'GET', route: '/api/courts?status=active' }))
        .toEqual(refreshed);
      expect(global.fetch).toHaveBeenCalledTimes(3);
    } finally {
      now.mockRestore();
    }
  });

  test('does not silently fall back to local operation when central connection fails', async () => {
    pairLegacy('https://central.test:5443');
    global.fetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ token: 'signed-token', user: { id: 4, role: 'admin' } }),
      })
      .mockRejectedValueOnce(new Error('network down'));
    await centralClient.login({ username: 'admin', password: 'secret' });
    await expect(centralClient.invoke({ method: 'POST', route: '/api/sales/create', body: {} }))
      .rejects.toThrow('تعذر الاتصال بالخادم المركزي');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});

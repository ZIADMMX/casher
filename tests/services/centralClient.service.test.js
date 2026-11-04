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

const centralClient = require('../../electron/services/centralClient.service');
const { configureSystemCertificateTrust } = require('../../electron/security/tlsTrust');

describe('centralClient.service', () => {
  beforeEach(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    global.fetch = jest.fn();
    configureSystemCertificateTrust.mockClear();
    centralClient.configure('');
  });

  afterAll(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    delete global.fetch;
  });

  test('validates and stores the central server URL', () => {
    expect(centralClient.getConfig()).toEqual({ baseUrl: '', warehouseId: null });
    expect(() => centralClient.configure('not a url')).toThrow('عنوان الخادم المركزي غير صالح');
    expect(() => centralClient.configure('http://192.168.1.10:5000')).toThrow('يتطلب HTTPS');

    expect(centralClient.configure('https://192.168.1.10:5443/')).toEqual({
      baseUrl: 'https://192.168.1.10:5443',
      warehouseId: null,
      enabled: true,
    });
    expect(centralClient.isConfigured()).toBe(true);
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

  test('tests central health only over HTTPS with system certificate validation', async () => {
    global.fetch.mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'online' }),
    });

    await expect(centralClient.testConnection('http://central.test:5000'))
      .rejects.toThrow('يتطلب HTTPS');
    await expect(centralClient.testConnection('https://central.test:5443'))
      .resolves.toEqual({ status: 'online' });

    expect(configureSystemCertificateTrust).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://central.test:5443/api/health',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  test('keeps a selected warehouse and bearer token on central requests', async () => {
    centralClient.configure('https://central.test:5443');
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
    centralClient.configure('https://central.test:5443');
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
    centralClient.configure('https://central.test:5443');
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
    centralClient.configure('https://central.test:5443');
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
    centralClient.configure('https://central.test:5443');
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

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const mockUserDataPath = path.join(os.tmpdir(), 'kashiear-central-client-test');

jest.mock('electron', () => ({
  app: { getPath: () => mockUserDataPath },
}));

const centralClient = require('../../electron/services/centralClient.service');

describe('centralClient.service', () => {
  beforeEach(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    global.fetch = jest.fn();
    centralClient.configure('');
  });

  afterAll(() => {
    fs.rmSync(mockUserDataPath, { recursive: true, force: true });
    delete global.fetch;
  });

  test('validates and stores the central server URL', () => {
    expect(centralClient.getConfig()).toEqual({ baseUrl: '', warehouseId: null });
    expect(() => centralClient.configure('file:///private/database')).toThrow('أدخل عنوان الخادم فقط');

    expect(centralClient.configure('http://192.168.1.10:5000/')).toEqual({
      baseUrl: 'http://192.168.1.10:5000',
      warehouseId: null,
      enabled: true,
    });
    expect(centralClient.isConfigured()).toBe(true);
  });

  test('keeps a selected warehouse and bearer token on central requests', async () => {
    centralClient.configure('http://central.test:5000');
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

  test('does not silently fall back to local operation when central connection fails', async () => {
    centralClient.configure('http://central.test:5000');
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

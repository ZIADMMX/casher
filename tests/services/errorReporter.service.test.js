jest.mock('electron', () => ({ app: { isPackaged: false, getVersion: () => '1.0.4' } }));
jest.mock('../../electron/services/licenseClock.service', () => ({
  getTimeEndpoint: jest.fn(() => 'https://fox.example.workers.dev/api/license/time'),
}));
jest.mock('../../electron/security/deviceId', () => ({ getDeviceId: () => 'a'.repeat(64) }));

const os = require('node:os');
const reporter = require('../../electron/services/errorReporter.service');

function response(status) {
  return { ok: status >= 200 && status < 300, status };
}

beforeEach(() => {
  reporter.resetForTesting();
  process.env.FOX_ERROR_REPORTS = '1';
});

afterAll(() => {
  reporter.resetForTesting();
  delete process.env.FOX_ERROR_REPORTS;
});

describe('errorReporter.service', () => {
  test('stays off outside the packaged app', () => {
    delete process.env.FOX_ERROR_REPORTS;
    reporter.report('Ctx', new Error('boom'));
    expect(reporter.pendingForTesting()).toEqual([]);
  });

  test('counts the same error instead of queueing it again', () => {
    reporter.report('Sales', new Error('boom'));
    reporter.report('Sales', new Error('boom'));
    reporter.report('Sales', new Error('other'));
    const pending = reporter.pendingForTesting();
    expect(pending).toHaveLength(2);
    expect(pending[0]).toMatchObject({ context: 'Sales', message: 'boom', count: 2 });
  });

  test('removes the user folder from paths', () => {
    const err = new Error(`cannot open ${os.homedir()}/secret.db`);
    reporter.report('Ctx', err);
    expect(reporter.pendingForTesting()[0].message).not.toContain(os.homedir());
  });

  test('posts a batch to /api/errors with the device and version, then clears it', async () => {
    reporter.report('Sales', new Error('boom'));
    const fetchImpl = jest.fn(async () => response(200));

    const result = await reporter.flush(fetchImpl);

    expect(result).toEqual({ sent: 1, status: 200 });
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://fox.example.workers.dev/api/errors');
    const body = JSON.parse(options.body);
    expect(body).toMatchObject({ device: 'a'.repeat(64), version: '1.0.4' });
    expect(body.items[0]).toMatchObject({ context: 'Sales', message: 'boom' });
    expect(reporter.pendingForTesting()).toEqual([]);
  });

  test('keeps the batch when offline or rate limited', async () => {
    reporter.report('Sales', new Error('boom'));
    await reporter.flush(jest.fn(async () => { throw new Error('offline'); }));
    expect(reporter.pendingForTesting()).toHaveLength(1);
    await reporter.flush(jest.fn(async () => response(429)));
    expect(reporter.pendingForTesting()).toHaveLength(1);
  });

  test('sends at most 10 per request', async () => {
    for (let i = 0; i < 15; i++) reporter.report(`C${i}`, new Error('x'));
    const fetchImpl = jest.fn(async () => response(200));
    await reporter.flush(fetchImpl);
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).items).toHaveLength(10);
    expect(reporter.pendingForTesting()).toHaveLength(5);
  });

  test('never throws, even with a broken error object', () => {
    expect(() => reporter.report(undefined, { toString() { throw new Error('bad'); } })).not.toThrow();
  });
});

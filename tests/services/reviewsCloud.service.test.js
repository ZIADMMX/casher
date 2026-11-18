const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');
const mockQueue = [];
jest.mock('../../electron/database/db', () => ({ db: mockDb }));
jest.mock('../../electron/repositories/reviews.repository', () => ({
  getPendingSync: jest.fn(() => mockQueue.map((entry) => ({ ...entry }))),
  removePendingSync: jest.fn((id) => {
    const index = mockQueue.findIndex((entry) => entry.id === id);
    if (index >= 0) mockQueue.splice(index, 1);
  }),
}));
jest.mock('../../electron/services/licenseClock.service', () => ({
  getTimeEndpoint: jest.fn(() => 'https://fox.example.workers.dev/api/license/time'),
}));
jest.mock('../../electron/security/deviceId', () => ({ getDeviceId: () => 'a'.repeat(64) }));

const licenseClock = require('../../electron/services/licenseClock.service');
const reviewsCloud = require('../../electron/services/reviewsCloud.service');

function queue(entries) {
  mockQueue.length = 0;
  mockQueue.push(...entries);
}

const ok = () => jest.fn(async () => ({ ok: true, status: 200 }));

beforeEach(() => {
  mockDb.exec('DROP TABLE IF EXISTS review_cloud_state');
  licenseClock.getTimeEndpoint.mockReturnValue('https://fox.example.workers.dev/api/license/time');
});

describe('reviewsCloud.service', () => {
  test('sends a local review to /api/reviews and clears it from the queue', async () => {
    queue([{ id: 1, tenantId: 'local', userId: 3, payload: { rating: 5, tags: ['سهولة الاستخدام'], consent: true, businessName: 'متجر النور', sector: 'retail', appVersion: '1.0.4' } }]);
    const fetchImpl = ok();

    expect(await reviewsCloud.syncPending(fetchImpl)).toEqual({ sent: 1 });

    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://fox.example.workers.dev/api/reviews');
    const body = JSON.parse(options.body);
    expect(body.device).toBe('a'.repeat(64));
    expect(body.reviews[0]).toMatchObject({ tenantId: 'local', userId: 3, rating: 5, consent: true, businessName: 'متجر النور' });
    expect(mockQueue).toHaveLength(0);
  });

  test('keeps a central account entry for the central sync, but does not resend it', async () => {
    queue([{ id: 2, tenantId: 'branch:7', userId: 24, payload: { rating: 4, tags: [] } }]);
    const fetchImpl = ok();

    await reviewsCloud.syncPending(fetchImpl);
    expect(mockQueue).toHaveLength(1);

    await reviewsCloud.syncPending(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test('a changed review is sent again', async () => {
    queue([{ id: 2, tenantId: 'branch:7', userId: 24, payload: { rating: 4, tags: [] } }]);
    const fetchImpl = ok();
    await reviewsCloud.syncPending(fetchImpl);
    mockQueue[0].payload = { rating: 2, tags: [] };
    await reviewsCloud.syncPending(fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  test('offline or refused: the review stays queued and an Arabic reason comes back', async () => {
    queue([{ id: 3, tenantId: 'local', userId: 3, payload: { rating: 3, tags: [] } }]);

    const offline = await reviewsCloud.syncPending(jest.fn(async () => { throw new Error('ENOTFOUND'); }));
    expect(offline.sent).toBe(0);
    expect(offline.error).toContain('النت');

    const refused = await reviewsCloud.syncPending(jest.fn(async () => ({ ok: false, status: 403 })));
    expect(refused.error).toContain('403');
    expect(mockQueue).toHaveLength(1);
  });

  test('never sends name or logo without consent, and drops an oversized logo', () => {
    const noConsent = reviewsCloud.toCloudReview({ tenantId: 'local', userId: 1, payload: { rating: 5, consent: false, businessName: 'X', businessLogo: 'data:image/png;base64,AAAA' } });
    expect(noConsent).toMatchObject({ businessName: null, businessLogo: null });

    const bigLogo = reviewsCloud.toCloudReview({ tenantId: 'local', userId: 1, payload: { rating: 5, consent: true, businessLogo: `data:image/png;base64,${'A'.repeat(500_000)}` } });
    expect(bigLogo.businessLogo).toBeNull();
  });

  test('does nothing when this build has no cloud address', async () => {
    licenseClock.getTimeEndpoint.mockReturnValue(null);
    queue([{ id: 4, tenantId: 'local', userId: 3, payload: { rating: 5, tags: [] } }]);
    const fetchImpl = ok();
    expect(await reviewsCloud.syncPending(fetchImpl)).toMatchObject({ sent: 0, skipped: true });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

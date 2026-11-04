// tests/unit/rateLimiter.test.js
/**
 * Unit tests for the Redis based rate limiter.
 * The ioredis client is mocked so the tests do not require a real Redis server.
 */

const mockIncr = jest.fn();
const mockExpire = jest.fn();
const mockEval = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: jest.fn().mockReturnThis(),
    connect: jest.fn().mockResolvedValue(undefined),
    incr: mockIncr,
    expire: mockExpire,
    eval: mockEval,
  }));
});

const {
  checkRateLimit,
  checkActionRateLimit,
  normalizeActionPath,
  ACTION_MAX_REQUESTS,
  ACTION_WINDOW_MS,
} = require('../../electron/services/rateLimiter');

describe('rateLimiter (Redis implementation)', () => {
  beforeEach(() => {
    mockIncr.mockReset();
    mockExpire.mockReset();
    mockEval.mockReset();
  });

  test('allows request when count is within limit (first request)', async () => {
    // Simulate first request -> Redis returns 1
    mockIncr.mockResolvedValueOnce(1);
    const result = await checkRateLimit('127.0.0.1');
    expect(result).toBe(true);
    // expire should be set for the first request
    expect(mockExpire).toHaveBeenCalledTimes(1);
  });

  test('allows request when count is below limit', async () => {
    // Simulate subsequent request that is still under the limit (e.g., 50)
    mockIncr.mockResolvedValueOnce(50);
    const result = await checkRateLimit('127.0.0.1');
    expect(result).toBe(true);
    // expire should NOT be called because key already exists
    expect(mockExpire).not.toHaveBeenCalled();
  });

  test('blocks request when count exceeds limit', async () => {
    // Simulate a request that exceeds the configured global request limit.
    mockIncr.mockResolvedValueOnce(601);
    const result = await checkRateLimit('127.0.0.1');
    expect(result).toBe(false);
    // expire should NOT be called for over‑limit requests
    expect(mockExpire).not.toHaveBeenCalled();
  });

  test('applies the five-attempt rolling-window action policy through Redis', async () => {
    mockEval.mockResolvedValueOnce([1, 0]);

    const result = await checkActionRateLimit('user:42', 'POST /api/sales/create');

    expect(result).toEqual({ allowed: true, retryAfterMs: 0 });
    expect(mockEval).toHaveBeenCalledWith(
      expect.any(String),
      1,
      expect.stringMatching(/^rl:action:[a-f0-9]{64}$/),
      expect.any(Number),
      ACTION_WINDOW_MS,
      ACTION_MAX_REQUESTS,
      expect.stringMatching(/^[0-9]+:/)
    );
  });

  test('returns the retry delay when an action exceeds its limit', async () => {
    mockEval.mockResolvedValueOnce([0, 12345]);

    await expect(checkActionRateLimit('user:43', 'POST /api/sales/create'))
      .resolves.toEqual({ allowed: false, retryAfterMs: 12345 });
  });

  test('allows five attempts per action, then expires the block after forty seconds', async () => {
    mockEval.mockRejectedValueOnce(new Error('Redis unavailable'));
    const identity = 'user:rolling-window-test';
    const action = 'POST /api/sales/create';
    const firstAttemptAt = Date.now();
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(firstAttemptAt);

    try {
      for (let attempt = 0; attempt < ACTION_MAX_REQUESTS; attempt += 1) {
        await expect(checkActionRateLimit(identity, action))
          .resolves.toEqual({ allowed: true, retryAfterMs: 0 });
      }

      const blocked = await checkActionRateLimit(identity, action);
      expect(blocked.allowed).toBe(false);
      expect(blocked.retryAfterMs).toBe(ACTION_WINDOW_MS);

      nowSpy.mockReturnValue(firstAttemptAt + ACTION_WINDOW_MS);
      await expect(checkActionRateLimit(identity, action))
        .resolves.toEqual({ allowed: true, retryAfterMs: 0 });
    } finally {
      nowSpy.mockRestore();
    }
  });

  test('normalizes numeric resource IDs so retries share an action key', () => {
    expect(normalizeActionPath('/api/products/123/update?source=screen'))
      .toBe('/api/products/:id/update');
  });

  test('does not apply write-action limits to read requests', async () => {
    const { checkRequestActionRateLimit } = require('../../electron/services/rateLimiter');
    const result = await checkRequestActionRateLimit({
      method: 'GET',
      url: '/api/products',
    });

    expect(result).toBeNull();
    expect(mockEval).not.toHaveBeenCalled();
  });

  test('caps concurrent requests and releases slots only once', () => {
    const { tryAcquireRequestSlot, MAX_CONCURRENT_REQUESTS } = require('../../electron/services/rateLimiter');
    const releases = Array.from({ length: MAX_CONCURRENT_REQUESTS }, () => tryAcquireRequestSlot());

    expect(releases.every((release) => typeof release === 'function')).toBe(true);
    expect(tryAcquireRequestSlot()).toBeNull();
    releases[0]();
    releases[0]();
    const releasedSlot = tryAcquireRequestSlot();
    expect(typeof releasedSlot).toBe('function');
    releasedSlot();
    releases.slice(1).forEach((release) => release());
  });
});

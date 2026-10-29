// tests/unit/rateLimiter.test.js
/**
 * Unit tests for the Redis based rate limiter.
 * The ioredis client is mocked so the tests do not require a real Redis server.
 */

const mockIncr = jest.fn();
const mockExpire = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    incr: mockIncr,
    expire: mockExpire,
  }));
});

const { checkRateLimit } = require('../../electron/services/rateLimiter');

describe('rateLimiter (Redis implementation)', () => {
  beforeEach(() => {
    mockIncr.mockReset();
    mockExpire.mockReset();
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
    // Simulate a request that exceeds the configured MAX_REQUESTS (100)
    mockIncr.mockResolvedValueOnce(101);
    const result = await checkRateLimit('127.0.0.1');
    expect(result).toBe(false);
    // expire should NOT be called for over‑limit requests
    expect(mockExpire).not.toHaveBeenCalled();
  });
});

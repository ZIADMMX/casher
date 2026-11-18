const breaker = require('../../electron/services/circuitBreaker.service');

const URL_A = 'https://down.example.com/api/sync';
const URL_B = 'https://up.example.com/api/sync';
const ok = () => Promise.resolve({ status: 200, ok: true });
const serverError = () => Promise.resolve({ status: 500, ok: false });
const offline = () => Promise.reject(new Error('fetch failed'));

const call = (url, impl) => breaker.guardedFetch(url, {}, impl);

describe('circuitBreaker.guardedFetch', () => {
  beforeEach(() => breaker.resetForTesting());
  afterEach(() => jest.useRealTimers());

  it('passes answers through and keeps the breaker closed', async () => {
    const fetchImpl = jest.fn(ok);
    await expect(call(URL_B, fetchImpl)).resolves.toMatchObject({ status: 200 });
    expect(breaker.stateForTesting(URL_B).openUntil).toBe(0);
  });

  it('stops calling the host after three failures', async () => {
    const fetchImpl = jest.fn(offline);
    for (let i = 0; i < 3; i += 1) await expect(call(URL_A, fetchImpl)).rejects.toThrow();
    expect(fetchImpl).toHaveBeenCalledTimes(3);

    await expect(call(URL_A, fetchImpl)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(fetchImpl).toHaveBeenCalledTimes(3); // the 4th request never left the app
  });

  it('counts 5xx and 429 answers as failures', async () => {
    const fetchImpl = jest.fn(serverError);
    for (let i = 0; i < 3; i += 1) await call(URL_A, fetchImpl);
    await expect(call(URL_A, fetchImpl)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
  });

  it('does not open on a 4xx, which means the server is answering', async () => {
    const fetchImpl = jest.fn(() => Promise.resolve({ status: 404, ok: false }));
    for (let i = 0; i < 5; i += 1) await call(URL_A, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it('keeps one host down from blocking another', async () => {
    const bad = jest.fn(offline);
    const good = jest.fn(ok);
    for (let i = 0; i < 3; i += 1) await expect(call(URL_A, bad)).rejects.toThrow();
    await expect(call(URL_B, good)).resolves.toMatchObject({ status: 200 });
  });

  it('lets one request through after the cooldown and closes on success', async () => {
    jest.useFakeTimers();
    const bad = jest.fn(offline);
    for (let i = 0; i < 3; i += 1) await expect(call(URL_A, bad)).rejects.toThrow();

    jest.advanceTimersByTime(31_000);
    const good = jest.fn(ok);
    await expect(call(URL_A, good)).resolves.toMatchObject({ status: 200 });
    expect(breaker.stateForTesting(URL_A).openUntil).toBe(0);
  });

  it('re-opens on the first failed probe, with a longer cooldown', async () => {
    jest.useFakeTimers();
    const bad = jest.fn(offline);
    for (let i = 0; i < 3; i += 1) await expect(call(URL_A, bad)).rejects.toThrow();

    jest.advanceTimersByTime(31_000);
    await expect(call(URL_A, bad)).rejects.toThrow('fetch failed');
    expect(bad).toHaveBeenCalledTimes(4);

    jest.advanceTimersByTime(31_000); // the second cooldown is 60s, so still open
    await expect(call(URL_A, bad)).rejects.toMatchObject({ code: 'CIRCUIT_OPEN' });
    expect(bad).toHaveBeenCalledTimes(4);
  });
});

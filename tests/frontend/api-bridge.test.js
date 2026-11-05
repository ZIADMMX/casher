import { afterEach, describe, expect, it, vi } from 'vitest';
import { BridgeUnavailableError, bridgeMethod, isBridgeAvailable } from '../../src/api/bridge.js';

describe('src/api/bridge', () => {
  afterEach(() => {
    delete window.electronAPI;
  });

  it('forwards calls and arguments to window.electronAPI at call time', async () => {
    const getThing = bridgeMethod('getThing');
    window.electronAPI = { getThing: vi.fn(async (id, opts) => ({ id, opts })) };

    await expect(getThing(7, { full: true })).resolves.toEqual({ id: 7, opts: { full: true } });
    expect(window.electronAPI.getThing).toHaveBeenCalledWith(7, { full: true });
  });

  it('returns synchronous results unchanged (subscriptions return an unsubscribe function)', () => {
    const unsubscribe = vi.fn();
    const onEvent = bridgeMethod('onEvent');
    window.electronAPI = { onEvent: vi.fn(() => unsubscribe) };

    expect(onEvent(() => {})).toBe(unsubscribe);
  });

  it('throws BridgeUnavailableError when the bridge or the method is missing', () => {
    const missing = bridgeMethod('missing');
    expect(() => missing()).toThrow(BridgeUnavailableError);

    window.electronAPI = {};
    expect(() => missing()).toThrow(/missing/);
  });

  it('reports availability and supports optional calls', () => {
    const maybe = bridgeMethod('maybe');
    expect(isBridgeAvailable()).toBe(false);
    expect(maybe.isAvailable()).toBe(false);
    expect(maybe.ifAvailable(1)).toBeUndefined();

    window.electronAPI = { maybe: vi.fn((x) => x * 2) };
    expect(isBridgeAvailable()).toBe(true);
    expect(maybe.isAvailable()).toBe(true);
    expect(maybe.ifAvailable(21)).toBe(42);
  });
});

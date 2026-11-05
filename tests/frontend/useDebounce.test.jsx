import { act, renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useDebounce } from '../../src/hooks/useDebounce.js';

describe('useDebounce', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test('returns the new value only after the delay', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: 'a' },
    });

    rerender({ value: 'ab' });
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(199));
    expect(result.current).toBe('a');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current).toBe('ab');
  });

  test('rapid changes restart the timer and settle on the last value', () => {
    const { result, rerender } = renderHook(({ value }) => useDebounce(value, 200), {
      initialProps: { value: '' },
    });

    for (const value of ['1', '12', '123']) {
      rerender({ value });
      act(() => vi.advanceTimersByTime(150));
    }
    expect(result.current).toBe('');

    act(() => vi.advanceTimersByTime(200));
    expect(result.current).toBe('123');
  });
});

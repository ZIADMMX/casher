import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import useBarcodeScanner from '../../src/hooks/useBarcodeScanner.js';

function press(key) {
  window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

// Types each character `intervalMs` apart, then presses Enter.
function typeCode(code, intervalMs) {
  for (const ch of code) {
    press(ch);
    vi.advanceTimersByTime(intervalMs);
  }
  press('Enter');
}

describe('useBarcodeScanner', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-05T10:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  test('fast keystrokes ending in Enter are reported as one scan', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    typeCode('6221234567890', 10);

    expect(onScan).toHaveBeenCalledTimes(1);
    expect(onScan).toHaveBeenCalledWith('6221234567890');
  });

  test('Arabic-Indic digits from the scanner are converted to Western digits', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    typeCode('٦٢٢١٢٣', 10);

    expect(onScan).toHaveBeenCalledWith('622123');
  });

  test('slow human typing is not treated as a scan', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan));

    typeCode('12345', 150);

    expect(onScan).not.toHaveBeenCalled();
  });

  test('codes shorter than minChars are ignored', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan, { minChars: 4 }));

    typeCode('123', 10);

    expect(onScan).not.toHaveBeenCalled();
  });

  test('does nothing while disabled', () => {
    const onScan = vi.fn();
    renderHook(() => useBarcodeScanner(onScan, { enabled: false }));

    typeCode('6221234567890', 10);

    expect(onScan).not.toHaveBeenCalled();
  });

  test('Enter in the POS search box submits typed text even at human speed', () => {
    const onScan = vi.fn();
    const input = document.createElement('input');
    input.id = 'barcode-search-input';
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useBarcodeScanner(onScan));

    typeCode('ABC', 100);

    expect(onScan).toHaveBeenCalledWith('ABC');
  });

  test('a scan into a focused input clears that input', () => {
    const onScan = vi.fn();
    const input = document.createElement('input');
    input.value = '6221234567890';
    document.body.appendChild(input);
    input.focus();
    renderHook(() => useBarcodeScanner(onScan));

    typeCode('6221234567890', 10);

    expect(onScan).toHaveBeenCalledWith('6221234567890');
    expect(input.value).toBe('');
  });

  test('stops listening after unmount', () => {
    const onScan = vi.fn();
    const { unmount } = renderHook(() => useBarcodeScanner(onScan));
    unmount();

    typeCode('6221234567890', 10);

    expect(onScan).not.toHaveBeenCalled();
  });
});

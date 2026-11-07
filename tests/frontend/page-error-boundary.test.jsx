import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import PageErrorBoundary from '../../src/components/system/PageErrorBoundary.jsx';

let shouldFail = true;
// The countdown ticks once a second, so step the clock one second at a time.
function passSeconds(n) {
  for (let i = 0; i < n; i += 1) act(() => { vi.advanceTimersByTime(1000); });
}
function Flaky() {
  if (shouldFail) throw new Error('Cannot read properties of undefined');
  return <p>الصفحة اشتغلت</p>;
}

beforeEach(() => {
  shouldFail = true;
  vi.useFakeTimers();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  delete window.electronAPI;
});

test('shows the error screen and recovers on its own after the countdown', () => {
  render(<PageErrorBoundary pageName="reports"><Flaky /></PageErrorBoundary>);
  expect(screen.getByText('حصلت مشكلة في عرض التقارير')).toBeInTheDocument();
  expect(screen.getByText(/محاولة تلقائية خلال/)).toBeInTheDocument();

  shouldFail = false;
  passSeconds(11);
  expect(screen.getByText('الصفحة اشتغلت')).toBeInTheDocument();
});

test('stops retrying on its own after three attempts', () => {
  render(<PageErrorBoundary pageName="reports"><Flaky /></PageErrorBoundary>);
  for (let i = 0; i < 3; i += 1) {
    passSeconds(11);
  }
  expect(screen.queryByText(/محاولة تلقائية خلال/)).not.toBeInTheDocument();
  expect(screen.getByText(/المحاولات التلقائية ما نفعتش/)).toBeInTheDocument();
});

test('the restart button restarts the whole app through the recovery channel', async () => {
  const relaunchAfterError = vi.fn(() => Promise.resolve({ success: true }));
  window.electronAPI = { relaunchAfterError };
  render(<PageErrorBoundary pageName="reports"><Flaky /></PageErrorBoundary>);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'إعادة تشغيل البرنامج' })); });
  expect(relaunchAfterError).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: /جارٍ إعادة تشغيل البرنامج/ })).toBeDisabled();
});

test('a stale build shows a reload button and plain text instead of the raw error', () => {
  function Stale() { throw new TypeError('Failed to fetch dynamically imported module: file:///x/LeavesPage-abc.js'); }
  render(<PageErrorBoundary pageName="leaves"><Stale /></PageErrorBoundary>);
  expect(screen.getByText('فيه نسخة أحدث من البرنامج')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'تحديث الصفحة' })).toBeInTheDocument();
  expect(screen.queryByText(/محاولة تلقائية خلال/)).not.toBeInTheDocument();
  expect(screen.queryByText(/dynamically imported module/)).not.toBeInTheDocument();
});

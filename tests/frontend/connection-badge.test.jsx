import { render, screen, waitFor, act } from '@testing-library/react';
import { afterEach, describe, expect, test, vi } from 'vitest';

const getConnectionState = vi.fn();
vi.mock('../../src/api/license.js', () => ({ getConnectionState: (...a) => getConnectionState(...a) }));

async function mount() {
  vi.resetModules(); // the connection state is shared per module instance
  const { default: ConnectionBadge } = await import('../../src/components/ConnectionBadge.jsx');
  return render(<ConnectionBadge />);
}

afterEach(() => {
  vi.restoreAllMocks();
  getConnectionState.mockReset();
});

describe('ConnectionBadge', () => {
  test('shows online when the server answers', async () => {
    getConnectionState.mockResolvedValue({ reachable: true });
    await mount();
    expect(screen.getByRole('status')).toHaveClass('is-online');
    expect(screen.getByText('متصل')).toBeInTheDocument();
  });

  test('shows offline when the server is unreachable even though wifi is on', async () => {
    getConnectionState.mockResolvedValue({ reachable: false });
    await mount();
    await waitFor(() => expect(screen.getByRole('status')).toHaveClass('is-offline'));
    expect(screen.getByRole('status')).toHaveAttribute('title', expect.stringContaining('الشغل مستمر'));
  });

  test('goes offline at once when the browser reports no network, and back when it returns', async () => {
    getConnectionState.mockResolvedValue({ reachable: null });
    await mount();
    expect(screen.getByRole('status')).toHaveClass('is-online');

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await act(async () => { window.dispatchEvent(new Event('offline')); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveClass('is-offline'));

    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
    await act(async () => { window.dispatchEvent(new Event('online')); });
    await waitFor(() => expect(screen.getByRole('status')).toHaveClass('is-online'));
  });

  test('an unknown server state falls back to the browser answer', async () => {
    getConnectionState.mockRejectedValue(new Error('no bridge'));
    await mount();
    expect(screen.getByRole('status')).toHaveClass('is-online');
  });
});

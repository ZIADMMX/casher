import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, test, vi } from 'vitest';
import GymMemberPtCard from '../../src/components/gym/GymMemberPtCard.jsx';

const getGymPtPackages = vi.fn();
const logGymPtSession = vi.fn();
vi.mock('../../src/api/subscriptions.js', () => ({
  getGymPtPackages: (...a) => getGymPtPackages(...a),
  logGymPtSession: (...a) => logGymPtSession(...a),
}));

const pkg = (extra) => ({ id: 1, customer_id: 7, trainer_name: 'كابتن أحمد', sessions_total: 10, remaining: 6, valid_until: '2030-01-31', last_session: '2029-12-20', status: 'active', ...extra });

beforeEach(() => { getGymPtPackages.mockReset(); logGymPtSession.mockReset(); });

describe('GymMemberPtCard', () => {
  test('shows only this member packages: balance, trainer and expiry', async () => {
    getGymPtPackages.mockResolvedValue([pkg(), pkg({ id: 2, customer_id: 99, trainer_name: 'مدرب تاني' })]);
    render(<GymMemberPtCard customerId={7} />);
    expect(await screen.findByText('مع كابتن أحمد')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText('من 10')).toBeInTheDocument();
    expect(screen.queryByText('مع مدرب تاني')).toBeNull();
  });

  test('renders nothing for a member without packages', async () => {
    getGymPtPackages.mockResolvedValue([pkg({ customer_id: 99 })]);
    const { container } = render(<GymMemberPtCard customerId={7} />);
    await waitFor(() => expect(getGymPtPackages).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  test('booking a session counts it and reloads the balance', async () => {
    getGymPtPackages.mockResolvedValueOnce([pkg()]).mockResolvedValueOnce([pkg({ remaining: 5 })]);
    logGymPtSession.mockResolvedValue({});
    render(<GymMemberPtCard customerId={7} />);
    fireEvent.click(await screen.findByRole('button', { name: 'حجز حصة' }));
    await waitFor(() => expect(logGymPtSession).toHaveBeenCalledWith(1));
    expect(await screen.findByText('5')).toBeInTheDocument();
  });

  test('a used-up or expired package cannot be booked, and a failure is shown', async () => {
    getGymPtPackages.mockResolvedValue([pkg({ status: 'used_up', remaining: 0 })]);
    const { unmount } = render(<GymMemberPtCard customerId={7} />);
    expect(await screen.findByRole('button', { name: 'حجز حصة' })).toBeDisabled();
    unmount();

    getGymPtPackages.mockResolvedValue([pkg()]);
    logGymPtSession.mockRejectedValue(new Error('الباقة خلصت'));
    render(<GymMemberPtCard customerId={7} />);
    fireEvent.click(await screen.findByRole('button', { name: 'حجز حصة' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('الباقة خلصت');
  });
});

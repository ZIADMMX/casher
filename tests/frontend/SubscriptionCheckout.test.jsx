import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import SubscriptionCheckout from '../../src/components/gym/SubscriptionCheckout.jsx';
import * as shiftsApi from '../../src/api/shifts.js';
import * as authApi from '../../src/api/auth.js';

vi.mock('../../src/api/shifts.js', () => ({ getCurrentShift: Object.assign(vi.fn(), { isAvailable: () => true }) }));
vi.mock('../../src/api/auth.js', () => ({ getSession: Object.assign(vi.fn(), { isAvailable: () => true }) }));

const SHIFT = {
  id: 7,
  liveTotals: { openingCash: 500, cashSales: 100, cardSales: 50, creditSales: 0, totalSales: 150, salesCount: 2, expectedCash: 600 },
};

function setup(props = {}) {
  const onConfirm = vi.fn().mockResolvedValue();
  render(
    <SubscriptionCheckout customerName="مروان" customerPhone="0100" packageName="سنوي" price={1000} onConfirm={onConfirm} onClose={() => {}} {...props} />
  );
  return onConfirm;
}

beforeEach(() => {
  shiftsApi.getCurrentShift.mockResolvedValue(SHIFT);
  authApi.getSession.mockResolvedValue({ username: 'ziad' });
});

const collectButton = () => screen.getByRole('button', { name: /تحصيل/ });

test('full cash payment sends one cash payment for the whole price', async () => {
  const onConfirm = setup();
  await screen.findByText(/الشيفت مفتوح/);
  fireEvent.click(collectButton());
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([{ method: 'cash', amount: 1000 }]));
});

test('split payment needs the amounts to cover the price, and merges non-cash methods into card', async () => {
  const onConfirm = setup();
  await screen.findByText(/الشيفت مفتوح/);
  fireEvent.click(screen.getByRole('button', { name: /تقسيم الدفعة/ }));
  // cash starts with the full price; cut it to 400, then add visa for the rest
  fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '400' } });
  fireEvent.click(screen.getByRole('button', { name: /فيزا/ }));
  expect(collectButton()).not.toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: /إنستاباي/ }));
  expect(collectButton()).toBeDisabled(); // instapay line is 0 so far (nothing left to distribute)
  fireEvent.click(screen.getByRole('button', { name: /إنستاباي/ })); // deselect
  fireEvent.click(collectButton());
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([
    { method: 'cash', amount: 400 },
    { method: 'card', amount: 600 },
  ]));
});

test('installment sends the down payment and the rest as credit with its due date', async () => {
  const onConfirm = setup();
  await screen.findByText(/الشيفت مفتوح/);
  fireEvent.click(screen.getByRole('button', { name: /تقسيط/ }));
  // no down payment yet = a fully deferred sale, which the old form also allowed
  fireEvent.click(screen.getByRole('button', { name: /^كاش/ }));
  fireEvent.change(screen.getByLabelText('المبلغ'), { target: { value: '300' } });
  fireEvent.change(screen.getByLabelText('تاريخ استحقاق المتبقي'), { target: { value: '2031-02-03' } });
  fireEvent.click(collectButton());
  await waitFor(() => expect(onConfirm).toHaveBeenCalledWith([
    { method: 'cash', amount: 300 },
    { method: 'credit', amount: 700, due_date: '2031-02-03' },
  ]));
});

test('blocks collection and explains it when no shift is open', async () => {
  shiftsApi.getCurrentShift.mockResolvedValue(null);
  setup();
  expect(await screen.findAllByText(/لا توجد وردية مفتوحة/)).not.toHaveLength(0);
  expect(collectButton()).toBeDisabled();
});

test('a failed shift lookup is reported as an error, not as "no open shift"', async () => {
  shiftsApi.getCurrentShift.mockRejectedValue(new Error('no such column: shift_id'));
  setup();
  expect(await screen.findAllByText(/no such column: shift_id/)).not.toHaveLength(0);
});

test('shows the server error inline and stays open', async () => {
  const onConfirm = vi.fn().mockRejectedValue(new Error('مجموع الدفعات لا يساوي قيمة الباقة'));
  setup({ onConfirm });
  await screen.findByText(/الشيفت مفتوح/);
  fireEvent.click(collectButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('مجموع الدفعات');
});

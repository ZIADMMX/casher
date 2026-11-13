import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import SessionOutcomeModal from '../../src/components/legal/SessionOutcomeModal.jsx';
import * as legalApi from '../../src/api/legal.js';

vi.mock('../../src/api/legal.js', () => ({
  getCaseById: vi.fn().mockResolvedValue({
    id: 5, subject: 'مطالبة مالية', case_type: 'civil', contract_amount: 240000,
    opponent_name: 'شركة المستقبل للتجارة', assigned_lawyer_name: 'أ. محمود عبد الرحمن',
    sessions: [{ id: 9, session_date: '2026-10-12 09:30:00', decision: 'تأجيل لإعلان الخصم' }],
  }),
  getCaseFinancialBreakdown: vi.fn().mockResolvedValue({ retainer_balance: 8000 }),
  recordSessionOutcome: vi.fn().mockResolvedValue({ session: {}, nextSession: {} }),
}));

const session = {
  id: 77, case_id: 5, case_number: '8432/2026', session_date: '2026-11-12 09:30:00',
  court_name: 'شمال القاهرة الابتدائية', client_name: 'أحمد سمير',
};

describe('SessionOutcomeModal', () => {
  it('sends the postponement with the next hearing, the reason and the expense', async () => {
    const onSaved = vi.fn();
    render(<SessionOutcomeModal session={session} onClose={() => {}} onSaved={onSaved} />);

    expect(await screen.findByText('شركة المستقبل للتجارة')).toBeInTheDocument();
    expect(screen.getByText('تأجيل لإعلان الخصم')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/تاريخ الجلسة القادمة/), { target: { value: '2026-12-06' } });
    fireEvent.change(screen.getByDisplayValue('لتقديم مستندات'), { target: { value: 'لسماع الشهود' } });
    fireEvent.change(screen.getByPlaceholderText(/حافظة مستندات/), { target: { value: 'مذكرة بدفاع' } });
    fireEvent.change(screen.getByPlaceholderText('0'), { target: { value: '500' } });
    fireEvent.click(screen.getByRole('button', { name: 'حفظ وجدولة الجلسة القادمة' }));

    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(legalApi.recordSessionOutcome).toHaveBeenCalledWith(77, expect.objectContaining({
      outcome: 'postponed',
      next_session_date: '2026-12-06T09:30:00',
      next_session_reason: 'لسماع الشهود',
      preparation: 'مذكرة بدفاع',
      expenses: [expect.objectContaining({ amount: 500, paid_by_client: true })],
    }));
  });

  it('drops the next-hearing fields when a verdict is issued', async () => {
    render(<SessionOutcomeModal session={session} onClose={() => {}} onSaved={() => {}} />);
    expect(await screen.findByLabelText(/تاريخ الجلسة القادمة/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'صدور حكم' }));
    expect(screen.queryByLabelText(/تاريخ الجلسة القادمة/)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حفظ إجراء الجلسة' })).toBeInTheDocument();
  });

  it('asks how the verdict went for the client before saving it', async () => {
    legalApi.recordSessionOutcome.mockClear();
    const onSaved = vi.fn();
    render(<SessionOutcomeModal session={session} onClose={() => {}} onSaved={onSaved} />);
    await screen.findByText('شركة المستقبل للتجارة');
    fireEvent.click(screen.getByRole('button', { name: 'صدور حكم' }));

    fireEvent.click(screen.getByRole('button', { name: 'حفظ إجراء الجلسة' }));
    expect(await screen.findByText('حدد نتيجة الحكم بالنسبة للموكل')).toBeInTheDocument();
    expect(legalApi.recordSessionOutcome).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'لصالح الموكل' }));
    fireEvent.click(screen.getByRole('button', { name: 'حفظ إجراء الجلسة' }));
    await vi.waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(legalApi.recordSessionOutcome).toHaveBeenCalledWith(77, expect.objectContaining({
      outcome: 'judged', verdict_result: 'favorable', next_session_date: null,
    }));
  });
});

import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import LegalClientsWorkspace from '../../src/components/legal/LegalClientsWorkspace.jsx';

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  // Local date, like the component; toISOString() is UTC and shifts the day after midnight.
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

vi.mock('../../src/api/legal.js', () => ({
  getLegalClientsOverview: vi.fn().mockResolvedValue({
    clients: [
      {
        id: 42, name: 'أحمد سمير', phone: '0100', email: 'a@x.com', created_at: new Date().toISOString(),
        cases_count: 4, active_cases: 3, main_case_type: 'civil', contract_total: 10000, paid_total: 7000,
        outstanding_fees: 0, last_contact_at: new Date().toISOString(), powers_count: 1,
        poa_number: '4421', poa_scope: 'عام', poa_expires_at: null,
      },
      {
        id: 38, name: 'شركة النيل للتوريدات', phone: '0101', email: null, created_at: '2024-01-01',
        cases_count: 9, active_cases: 6, main_case_type: 'commercial', contract_total: 20000, paid_total: 9000,
        outstanding_fees: 11000, last_contact_at: null, powers_count: 1,
        poa_number: '1180', poa_scope: 'خاص', poa_expires_at: futureDate(6),
      },
      {
        id: 51, name: 'كريم فؤاد', phone: null, email: null, created_at: '2024-01-01',
        cases_count: 0, active_cases: 0, main_case_type: null, contract_total: 0, paid_total: 0,
        outstanding_fees: 0, last_contact_at: null, powers_count: 0,
        poa_number: null, poa_scope: null, poa_expires_at: null,
      },
      {
        id: 60, name: 'منى الأرشيف', phone: '0102', email: null, created_at: '2024-01-01', is_active: 0,
        cases_count: 1, active_cases: 0, main_case_type: 'civil', contract_total: 0, paid_total: 0,
        outstanding_fees: 0, last_contact_at: null, powers_count: 0,
        poa_number: null, poa_scope: null, poa_expires_at: null,
      },
    ],
    followUps: [{ id: 1, customer_id: 51, type: 'call', subject: 'عرض الأتعاب', client_name: 'كريم فؤاد' }],
  }),
}));

describe('LegalClientsWorkspace', () => {
  it('classifies clients, flags the expiring power of attorney and the overdue fees', async () => {
    render(<LegalClientsWorkspace refreshKey={0} onOpenClient={() => {}} />);

    const rows = (await screen.findByRole('table')).querySelectorAll('tbody tr');
    const companyRow = rows[1];
    expect(within(companyRow).getByText('شركة')).toBeInTheDocument();
    expect(within(companyRow).getByText('خاص · ينتهي بعد 6 يوم')).toBeInTheDocument();
    expect(within(companyRow).getByText(/متأخر/)).toBeInTheDocument();

    expect(within(rows[2]).getByText('محتمل')).toBeInTheDocument();
    expect(within(rows[0]).getByText('CL-1042')).toBeInTheDocument();
  });

  it('keeps archived clients out of the list until the archive filter is chosen', async () => {
    render(<LegalClientsWorkspace refreshKey={0} onOpenClient={() => {}} />);
    await screen.findByRole('table');
    expect(screen.queryByText('منى الأرشيف')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /الأرشيف/ }));
    expect(screen.getByText('منى الأرشيف')).toBeInTheDocument();
    expect(screen.queryByText('أحمد سمير')).not.toBeInTheDocument();
  });

  it('filters the list down to clients that owe fees', async () => {
    render(<LegalClientsWorkspace refreshKey={0} onOpenClient={() => {}} />);
    fireEvent.click(await screen.findByRole('button', { name: /عليهم مستحقات/ }));
    expect(screen.getAllByText('شركة النيل للتوريدات').length).toBeGreaterThan(0);
    expect(screen.queryByText('أحمد سمير')).not.toBeInTheDocument();
  });
});

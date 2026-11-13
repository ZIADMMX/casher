import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import * as customersApi from '../../src/api/customers.js';
import * as legalApi from '../../src/api/legal.js';
import LegalClientWizard, { clientCompletion } from '../../src/components/legal/LegalClientWizard.jsx';

vi.mock('../../src/api/customers.js', () => ({ addCustomer: vi.fn().mockResolvedValue({ id: 7 }) }));
vi.mock('../../src/api/legal.js', () => ({
  getCaseLawyers: vi.fn().mockResolvedValue([{ id: 1, full_name: 'أ. محمود' }]),
  updateLegalClientProfile: vi.fn().mockResolvedValue({}),
  createCustomerPowerOfAttorney: vi.fn().mockResolvedValue({ id: 3 }),
}));

describe('LegalClientWizard', () => {
  beforeEach(() => localStorage.clear());

  it('scores how complete the case file is', () => {
    expect(clientCompletion({ name: 'أحمد', phone: '0100' })).toEqual({ percent: 33, missing: 4 });
  });

  it('blocks the first step without a name, then saves client, profile and power of attorney', async () => {
    const onSaved = vi.fn();
    render(<LegalClientWizard onClose={() => {}} onSaved={onSaved} />);

    fireEvent.click(screen.getByRole('button', { name: /التالي: التوكيل/ }));
    expect(screen.getByRole('alert')).toHaveTextContent('اكتب اسم الموكل الرباعي');

    fireEvent.change(screen.getByLabelText(/الاسم الرباعي/), { target: { value: 'أحمد سمير عبد الله' } });
    fireEvent.change(screen.getByLabelText(/الهاتف الأساسي/), { target: { value: '01002345566' } });
    fireEvent.click(screen.getByRole('button', { name: /التالي: التوكيل/ }));

    fireEvent.change(screen.getByLabelText('رقم التوكيل'), { target: { value: '4421' } });
    fireEvent.change(screen.getByLabelText('تاريخ التحرير'), { target: { value: '2025-01-10' } });
    fireEvent.click(screen.getByRole('button', { name: /التالي: الأتعاب/ }));
    fireEvent.change(screen.getByLabelText(/الأتعاب المتفق عليها/), { target: { value: '60000' } });
    fireEvent.click(screen.getByRole('button', { name: /التالي: مراجعة وحفظ/ }));
    fireEvent.click(screen.getByRole('button', { name: /حفظ الموكل/ }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith(7));
    expect(customersApi.addCustomer).toHaveBeenCalledWith({ name: 'أحمد سمير عبد الله', phone: '01002345566', email: null });
    expect(legalApi.updateLegalClientProfile).toHaveBeenCalledWith(7, expect.objectContaining({ kind: 'individual', fee_amount: 60000 }));
    expect(legalApi.createCustomerPowerOfAttorney).toHaveBeenCalledWith(7, expect.objectContaining({ number: '4421', scope: 'عام' }));
    expect(screen.getByText(/تم حفظ ملف/)).toBeInTheDocument();
  });
});

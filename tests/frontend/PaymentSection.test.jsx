import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import PaymentSection from '../../src/components/PaymentSection.jsx';

function renderPayment(props = {}) {
  const handlers = {
    setPaymentMethod: vi.fn(),
    setCashReceived: vi.fn(),
    setCreditCustomerName: vi.fn(),
    setCreditCustomerPhone: vi.fn(),
    setCreditDueDate: vi.fn(),
    onNavigate: vi.fn(),
  };
  render(
    <PaymentSection
      total={150}
      paymentMethod="cash"
      cashReceived=""
      changeDue={null}
      creditCustomerName=""
      creditCustomerPhone=""
      creditDueDate=""
      {...handlers}
      {...props}
    />,
  );
  return handlers;
}

describe('PaymentSection', () => {
  afterEach(() => localStorage.clear());

  test('switching away from cash clears the cash received', () => {
    const { setPaymentMethod, setCashReceived } = renderPayment();

    fireEvent.click(screen.getByRole('button', { name: /فيزا/ }));

    expect(setPaymentMethod).toHaveBeenCalledWith('card');
    expect(setCashReceived).toHaveBeenCalledWith('');
  });

  test('the selected method is marked as pressed', () => {
    renderPayment({ paymentMethod: 'credit' });
    expect(screen.getByRole('button', { name: /آجل/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /كاش/ })).toHaveAttribute('aria-pressed', 'false');
  });

  test('"exact" fills the cash field with the total', () => {
    const { setCashReceived } = renderPayment();
    fireEvent.click(screen.getByRole('button', { name: 'بالضبط' }));
    expect(setCashReceived).toHaveBeenCalledWith('150');
  });

  test('quick cash amounts below the total are disabled', () => {
    renderPayment({ total: 150 });
    expect(screen.getByRole('button', { name: '100' })).toBeDisabled();
    expect(screen.getByRole('button', { name: '200' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '500' })).toBeEnabled();
  });

  test('quick cash buttons are disabled for an empty cart', () => {
    renderPayment({ total: 0 });
    expect(screen.getByRole('button', { name: 'بالضبط' })).toBeDisabled();
  });

  test('shows the change due to the customer', () => {
    renderPayment({ cashReceived: '200', changeDue: 50 });
    expect(screen.getByText('الباقي للعميل')).toBeInTheDocument();
    expect(screen.getByText('50.00 ج.م')).toBeInTheDocument();
  });

  test('warns when the cash received is less than the total', () => {
    renderPayment({ cashReceived: '100', changeDue: 0, isCashInvalid: true });
    expect(screen.getByText('المبلغ أقل من الإجمالي')).toBeInTheDocument();
  });

  test('typing in the cash field reports the raw value', () => {
    const { setCashReceived } = renderPayment();
    fireEvent.change(screen.getByLabelText('المستلم'), { target: { value: '175.5' } });
    expect(setCashReceived).toHaveBeenCalledWith('175.5');
  });

  test('card payment hides the cash fields', () => {
    renderPayment({ paymentMethod: 'card' });
    expect(screen.queryByLabelText('المستلم')).not.toBeInTheDocument();
    expect(screen.getByText(/ماكينة الـ POS/)).toBeInTheDocument();
  });

  test('credit: "add customer" stores the typed customer and opens the customers page', () => {
    const { onNavigate } = renderPayment({
      paymentMethod: 'credit',
      creditCustomerName: '  محمد علي  ',
      creditCustomerPhone: ' 01012345678 ',
    });

    fireEvent.click(screen.getByRole('button', { name: /إضافة عميل يدويًا/ }));

    expect(JSON.parse(localStorage.getItem('kashiear_pending_customer'))).toEqual({
      name: 'محمد علي',
      phone: '01012345678',
      email: '',
    });
    expect(onNavigate).toHaveBeenCalledWith('customers');
  });
});

import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import CartPanel from '../../src/components/CartPanel.jsx';
import ShiftGateBanner from '../../src/components/pos/ShiftGateBanner.jsx';

const cartItem = {
  variantId: 1,
  productName: 'حليب كامل الدسم',
  unitPrice: 42,
  quantity: 1,
  maxStock: 10,
};

function renderCart(props = {}) {
  const handleCompleteSale = vi.fn();
  render(
    <CartPanel
      cart={[cartItem]}
      changeQuantity={vi.fn()}
      removeFromCart={vi.fn()}
      clearCart={vi.fn()}
      subtotal={42}
      total={42}
      paymentMethod="card"
      setPaymentMethod={vi.fn()}
      setCashReceived={vi.fn()}
      changeDue={null}
      handleCompleteSale={handleCompleteSale}
      sectorConfig={{ orderTerm: 'فاتورة سريعة', unitTerm: 'قطعة' }}
      {...props}
    />,
  );
  return { handleCompleteSale };
}

function attendanceState(overrides = {}) {
  return {
    canManage: true,
    isPresent: false,
    isCheckedIn: false,
    isCheckedOut: false,
    buttonText: 'تسجيل الحضور',
    buttonDisabled: false,
    toggle: vi.fn(),
    ...overrides,
  };
}

describe('POS closed-shift gating', () => {
  it('locks the pay button and explains why while no shift is open', () => {
    const { handleCompleteSale } = renderCart({ isShiftOpen: false });
    const payButton = screen.getByRole('button', { name: /افتح الوردية أولاً لإتمام البيع/ });
    expect(payButton).toBeDisabled();
    fireEvent.click(payButton);
    expect(handleCompleteSale).not.toHaveBeenCalled();
  });

  it('enables the pay button once a shift is open', () => {
    const { handleCompleteSale } = renderCart({ isShiftOpen: true });
    const payButton = screen.getByRole('button', { name: /إتمام عملية البيع وطباعة الفاتورة/ });
    expect(payButton).toBeEnabled();
    fireEvent.click(payButton);
    expect(handleCompleteSale).toHaveBeenCalledTimes(1);
  });

  it('shows the attendance and open-shift steps in order', () => {
    const attendance = attendanceState();
    const onOpenStartShift = vi.fn();
    render(<ShiftGateBanner attendance={attendance} onOpenStartShift={onOpenStartShift} />);

    fireEvent.click(screen.getByRole('button', { name: 'تسجيل الحضور' }));
    expect(attendance.toggle).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: /فتح وردية/ }));
    expect(onOpenStartShift).toHaveBeenCalledTimes(1);
  });

  it('marks attendance as done without repeating the attendance button', () => {
    render(
      <ShiftGateBanner
        attendance={attendanceState({ isPresent: true, isCheckedIn: true, buttonText: 'تسجيل الانصراف' })}
        onOpenStartShift={vi.fn()}
      />,
    );
    expect(screen.getByText('تم تسجيل حضورك')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'تسجيل الانصراف' })).not.toBeInTheDocument();
  });
});

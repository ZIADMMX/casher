import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import CouponInput from '../../src/components/CouponInput.jsx';

describe('CouponInput', () => {
  test('typing reports the new value', () => {
    const onChange = vi.fn();
    render(<CouponInput value="" onChange={onChange} onApply={vi.fn()} />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: '50' } });

    expect(onChange).toHaveBeenCalledWith('50');
  });

  test('Enter and the apply button both apply the discount', () => {
    const onApply = vi.fn();
    render(<CouponInput value="50" onChange={vi.fn()} onApply={onApply} />);

    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'تطبيق' }));

    expect(onApply).toHaveBeenCalledTimes(2);
  });

  test('a success message is styled as success, others as info', () => {
    const { rerender } = render(
      <CouponInput value="" onChange={vi.fn()} onApply={vi.fn()} message="تم تطبيق الخصم" />,
    );
    expect(screen.getByText('تم تطبيق الخصم')).toHaveClass('success');

    rerender(<CouponInput value="" onChange={vi.fn()} onApply={vi.fn()} message="أدخل قيمة صحيحة" />);
    expect(screen.getByText('أدخل قيمة صحيحة')).toHaveClass('info');
  });

  test('no message renders nothing below the input', () => {
    const { container } = render(<CouponInput value="" onChange={vi.fn()} onApply={vi.fn()} />);
    expect(container.querySelector('.pos-coupon-message')).toBeNull();
  });
});

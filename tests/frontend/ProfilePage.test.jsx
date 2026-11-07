import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import ProfilePage from '../../src/pages/ProfilePage.jsx';
import ProfileModal from '../../src/components/ProfileModal.jsx';
import { passwordStrength } from '../../src/utils/passwordStrength.js';
import * as authApi from '../../src/api/auth.js';

const updateProfile = vi.fn();

vi.mock('../../src/contexts/UserContext.jsx', () => ({
  useUser: () => ({
    currentUser: { id: 1, username: 'admin', role: 'admin' },
    setCurrentUser: vi.fn(),
    updateProfile,
  }),
}));

vi.mock('../../src/api/auth.js', () => {
  const method = (impl) => Object.assign(vi.fn(impl), { isAvailable: () => true });
  return { getMyProfile: method(), saveMyProfile: method() };
});

vi.mock('../../src/api/audit.js', () => ({
  getAuditLogs: Object.assign(vi.fn().mockResolvedValue({ items: [] }), { isAvailable: () => true }),
}));

describe('passwordStrength', () => {
  it('grades empty, weak, medium and strong passwords', () => {
    expect(passwordStrength('')).toBe(0);
    expect(passwordStrength('abc')).toBe(1);
    expect(passwordStrength('abcd1234')).toBe(2);
    expect(passwordStrength('abcd1234!')).toBe(3);
  });
});

describe('ProfilePage', () => {
  it('shows completion and an add button for empty fields', async () => {
    authApi.getMyProfile.mockResolvedValue({
      id: 1, username: 'admin', role: 'admin', phone: '01286622370', gender: 'male', createdAt: '2026-11-05',
    });
    render(<ProfilePage onOpenAccountSettings={() => {}} />);

    expect(await screen.findByText('لا يوجد بريد إلكتروني مسجّل')).toBeInTheDocument();
    expect(screen.getByText('22%')).toBeInTheDocument(); // 2 of 9 fields filled
    expect(screen.getByText('ذكر')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'إضافة الاسم الأول' }));
    expect(screen.getByLabelText('الاسم الأول')).toBeInTheDocument();
  });
});

describe('ProfileModal', () => {
  it('hides new-password fields until the switch is on and blocks mismatches', () => {
    render(<ProfileModal onClose={() => {}} />);
    expect(screen.queryByLabelText('كلمة المرور الجديدة')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(screen.getByLabelText(/كلمة المرور الحالية/), { target: { value: 'old-pass' } });
    fireEvent.change(screen.getByLabelText('كلمة المرور الجديدة'), { target: { value: 'abcd1234' } });
    fireEvent.change(screen.getByLabelText('تأكيد كلمة المرور'), { target: { value: 'other' } });
    expect(screen.getByText('متوسطة')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'حفظ التعديلات' }));
    expect(screen.getByRole('alert')).toHaveTextContent('غير متطابقين');
    expect(updateProfile).not.toHaveBeenCalled();
  });
});

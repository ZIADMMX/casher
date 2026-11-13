import React from 'react';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { vi } from 'vitest';
import CourtsPage from '../../src/pages/CourtsPage.jsx';
import * as legalApi from '../../src/api/legal.js';

vi.mock('../../src/api/legal.js', () => ({
  getCourts: vi.fn(),
  getCourtsOverview: vi.fn(),
  getCourtProfile: vi.fn(),
  createCourt: vi.fn(),
  updateCourt: vi.fn().mockResolvedValue({}),
  deactivateCourt: vi.fn(),
  createCourtSession: vi.fn().mockResolvedValue({ id: 9 }),
}));

const court = {
  id: 'c1', name: 'محكمة شمال القاهرة الابتدائية', court_type: 'first_instance', specialization: 'مدني كلي',
  city: 'القاهرة', address: 'ش رمسيس', phone: '+20 2 2405 8844', notes: '', is_active: 1,
};

describe('CourtsPage', () => {
  beforeEach(() => {
    legalApi.getCourts.mockResolvedValue({ items: [court], total: 1 });
    legalApi.getCourtsOverview.mockResolvedValue({
      courts: { total: 1, active: 1, inactive: 0, missing: 0 },
      byType: { first_instance: 1 },
      cases: { linked: 2, open: 1, judged: 1, unlinked: 0 },
      sessions: { week: 1, tomorrow: 0 },
      upcoming: [],
      perCourt: [{ court_id: 'c1', cases: 2, next_session: null }],
    });
    legalApi.getCourtProfile.mockResolvedValue({
      court,
      stats: { total: 2, open: 1, judged: 1, closed: 0, avg_days: 240, urgent: 1 },
      upcoming: [{ id: 1, session_date: '2099-01-04T09:30', session_reason: 'مرافعة', case_id: 5, case_number: '8432/2026', circuit_name: 'الدائرة ٣', client_name: 'شركة النيل' }],
      cases: [{ id: 5, case_number: '8432/2026', status: 'active', subject: 'تعويض', client_name: 'شركة النيل' }],
      documents: [], expenses: [], expensesTotal: 0,
      circuits: [{ name: 'الدائرة ٣', cases: 2, weekdays: [0, 3], time: '09:00' }],
      activity: [],
    });
  });

  it('opens a court page from the list and schedules a session on one of its cases', async () => {
    const onNavigate = vi.fn();
    render(<CourtsPage onNavigate={onNavigate} />);

    fireEvent.click(await screen.findByRole('button', { name: `فتح ${court.name}` }));
    expect(await screen.findByRole('heading', { level: 1, name: court.name })).toBeInTheDocument();
    expect(legalApi.getCourtProfile).toHaveBeenCalledWith('c1');
    expect(screen.getByText('الأحد والأربعاء — ٩:٠٠ ص')).toBeInTheDocument();

    fireEvent.click(screen.getByText('شركة النيل'));
    expect(onNavigate).toHaveBeenCalledWith('cases', { caseId: 5 });

    fireEvent.click(screen.getByRole('button', { name: 'تسجيل جلسة' }));
    const dialog = await screen.findByRole('dialog');
    fireEvent.change(within(dialog).getByLabelText(/موعد الجلسة/), { target: { value: '2099-02-01T10:00' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'حفظ الجلسة' }));
    await vi.waitFor(() => expect(legalApi.createCourtSession).toHaveBeenCalledWith(
      expect.objectContaining({ case_id: 5, session_date: '2099-02-01T10:00', status: 'scheduled' }),
    ));

    fireEvent.click(screen.getByRole('button', { name: 'دليل المحاكم' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'دليل المحاكم' })).toBeInTheDocument();
  });
});

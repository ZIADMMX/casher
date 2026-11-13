import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import LawFirmTodayPage from '../../src/components/legal/LawFirmTodayPage.jsx';
import * as legalApi from '../../src/api/legal.js';

const today = new Date();
const ymd = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-');

vi.mock('../../src/api/legal.js', () => ({
  getLawFirmDashboard: vi.fn(),
  updateCaseTask: vi.fn().mockResolvedValue({}),
}));

describe('LawFirmTodayPage', () => {
  it('shows each hearing with its state and ticks a task off', async () => {
    legalApi.getLawFirmDashboard.mockResolvedValue({
      caseStats: { active_cases: 3 },
      sessionStats: { today_sessions: 2 },
      financialStats: {},
      todaySessions: [
        { id: 1, case_id: 1, case_number: '8432/2026', case_type: 'civil', status: 'attended', session_date: `${ymd} 00:01:00` },
        { id: 2, case_id: 2, case_number: '120/2026', status: 'scheduled', session_date: `${ymd} 23:59:00`, session_reason: 'حضور ومرافعة' },
      ],
      upcomingSessions: [],
      financialMovements: [],
      criticalDeadlines: [],
      todayTasks: [{ id: 7, case_id: 1, case_number: '8432/2026', title: 'تجهيز مذكرة', status: 'pending', days_offset: 0 }],
    });
    render(<LawFirmTodayPage onNavigate={() => {}} />);

    expect(await screen.findByText('قضية 120/2026')).toBeInTheDocument();
    expect(screen.getByText('تم الحضور')).toBeInTheDocument();
    expect(screen.getByText('حضور ومرافعة')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'تسجيل الإجراء' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('checkbox'));
    expect(legalApi.updateCaseTask).toHaveBeenCalledWith(7, { status: 'completed' });
    expect(screen.getByRole('checkbox')).toBeChecked();
  });
});

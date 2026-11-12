import { describe, expect, it } from 'vitest';
import {
  APPOINTMENT_STATUS, commissionLabel, summarizeAppointments, summarizeTeam,
} from '../../src/components/salon/salonFormat.js';

describe('salon helpers', () => {
  it('labels percentage, fixed and missing commissions', () => {
    expect(commissionLabel({ commission_type: 'percentage', commission_value: 20 })).toBe('٢٠%');
    expect(commissionLabel({ commission_type: 'fixed', commission_value: 50 })).toBe('٥٠ ج.م ثابت');
    expect(commissionLabel({ commission_value: 0 })).toBe('بدون عمولة');
  });

  it('adds up team totals and counts only staff who served someone', () => {
    const totals = summarizeTeam([
      { servicesCount: 3, totalSales: 450, totalCommission: 90, totalTips: 20 },
      { servicesCount: 0, totalSales: 0, totalCommission: 0, totalTips: 0 },
      { servicesCount: 1, totalSales: 150.5, totalCommission: 30, totalTips: 0 },
    ]);
    expect(totals).toEqual({ services: 4, sales: 600.5, commission: 120, tips: 20, active: 2 });
    expect(summarizeTeam()).toEqual({ services: 0, sales: 0, commission: 0, tips: 0, active: 0 });
  });

  it('splits appointments into waiting, done and lost', () => {
    const counts = summarizeAppointments(
      ['booked', 'confirmed', 'in_service', 'completed', 'cancelled', 'no_show'].map((status) => ({ status })),
    );
    expect(counts).toEqual({ total: 6, waiting: 3, completed: 1, lost: 2 });
  });

  it('only allows moves to statuses the database accepts', () => {
    const keys = Object.keys(APPOINTMENT_STATUS);
    for (const meta of Object.values(APPOINTMENT_STATUS)) {
      for (const next of meta.next) expect(keys).toContain(next);
    }
  });
});

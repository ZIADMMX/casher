import { describeLeads } from '../../src/components/crm/CRMLeadsList.jsx';
import { agoText, parseDbDate } from '../../src/components/crm/crmFormat.js';

const now = new Date(2026, 10, 11, 12, 0);
// Local wall-clock time as SQLite would store it in UTC.
const db = (days, hour = 12) => new Date(2026, 10, 11 - days, hour).toISOString().replace('T', ' ').slice(0, 19);
const day = (offset) => new Date(2026, 10, 11 + offset).toLocaleDateString('en-CA');

describe('CRM leads list', () => {
  test('next step, overdue step and stale follow-up', () => {
    const leads = [
      { id: 1, status: 'contacted', updated_at: db(20), created_at: db(30) },
      { id: 2, status: 'new', updated_at: db(11), created_at: db(11) },
      { id: 3, status: 'new', updated_at: db(1), created_at: db(1) },
      { id: 4, status: 'qualified', updated_at: db(40), created_at: db(40) },
    ];
    const activities = [
      { record_type: 'lead', record_id: 1, status: 'open', activity_type: 'task', title: 'عرض سعر', due_at: `${day(1)} 10:00:00`, created_at: db(2) },
      { record_type: 'lead', record_id: 1, status: 'open', activity_type: 'call', title: 'متابعة', due_at: null, created_at: db(2) },
      { record_type: 'lead', record_id: 3, status: 'open', activity_type: 'call', title: 'أول مكالمة', due_at: db(3), created_at: db(3) },
      { record_type: 'customer', record_id: 2, status: 'open', activity_type: 'call', title: 'not a lead', due_at: null, created_at: db(0) },
    ];
    const info = describeLeads(leads, activities, 7, now);

    // Earliest dated open activity wins over an undated one.
    expect(info.get(1).nextStep).toEqual({ text: 'عرض سعر — غداً', tone: 'due' });
    expect(info.get(1).stale).toBe(false);
    // No activity and untouched for 11 days: stale.
    expect(info.get(2)).toMatchObject({ stale: true, idleDays: 11, nextStep: { tone: 'none' } });
    // A call due 3 days ago is overdue.
    expect(info.get(3).nextStep).toEqual({ text: 'مكالمة متأخرة', tone: 'late' });
    // Qualified leads are not flagged as stale.
    expect(info.get(4).stale).toBe(false);
  });

  test('date helpers', () => {
    expect(parseDbDate('2026-11-11').getDate()).toBe(11);
    expect(parseDbDate('2026-11-11 10:00:00').toISOString()).toBe('2026-11-11T10:00:00.000Z');
    expect(parseDbDate('bad')).toBeNull();
    expect(agoText(0)).toBe('اليوم');
    expect(agoText(2)).toBe('منذ يومين');
    expect(agoText(5)).toBe('منذ ٥ أيام');
    expect(agoText(14)).toBe('منذ ١٤ يوم');
  });
});

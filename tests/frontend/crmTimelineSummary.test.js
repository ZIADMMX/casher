import { summarizeTimeline } from '../../src/components/crm/CustomerTimelineDrawer.jsx';

const now = new Date(2026, 10, 11, 12, 0);
const at = (days) => new Date(2026, 10, 11 + days, 10).toISOString();

describe('Customer 360° summary', () => {
  test('nets returns from sales and finds the latest contact', () => {
    const summary = summarizeTimeline([
      { type: 'sale', amount: 500, created_at: at(-10) },
      { type: 'sale', amount: '250', created_at: at(-3) },
      { type: 'return', amount: 100, created_at: at(-2) },
      { type: 'payment', amount: 300, created_at: at(-1) },
      { type: 'call', created_at: at(-6) },
      { type: 'note', created_at: at(-2) },
      { type: 'opportunity', created_at: at(0) },
    ], now);

    expect(summary).toEqual({ sales: 2, salesTotal: 650, contacts: 2, lastContactDays: 2 });
  });

  test('an empty timeline has no last contact', () => {
    expect(summarizeTimeline([], now)).toEqual({ sales: 0, salesTotal: 0, contacts: 0, lastContactDays: null });
  });
});

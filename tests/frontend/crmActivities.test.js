import { buildSchedule } from '../../src/components/crm/CRMActivitiesList.jsx';

const now = new Date(2026, 10, 11, 12, 0);
const at = (days, hour = 10) => new Date(2026, 10, 11 + days, hour).toISOString();
const a = (id, status, due, extra = {}) => ({ id, status, due_at: due, title: `t${id}`, activity_type: 'call', ...extra });

describe('CRM activities schedule', () => {
  test('groups open activities by day and counts the cards on top', () => {
    const { stats, groups } = buildSchedule([
      a(1, 'open', at(-4)),
      a(2, 'open', at(-2)),
      a(3, 'open', at(0, 9)),
      a(4, 'open', at(0, 8)),
      a(5, 'open', at(1)),
      a(6, 'open', at(9)),
      a(7, 'open', null),
      a(8, 'completed', at(-1), { updated_at: at(-2) }),
      a(9, 'completed', at(-20), { updated_at: at(-20) }),
      a(10, 'cancelled', at(0)),
    ], now);

    expect(stats).toEqual({ overdue: 2, today: 2, week: 3, doneThisWeek: 1 });
    expect(groups.map((group) => group.key.slice(0, 7))).toEqual(
      ['overdue', new Date(2026, 10, 11).toDateString().slice(0, 7), new Date(2026, 10, 12).toDateString().slice(0, 7),
        new Date(2026, 10, 20).toDateString().slice(0, 7), 'undated', 'done'],
    );
    // Most overdue first, with the day count.
    expect(groups[0].rows.map((row) => [row.activity.id, row.when])).toEqual([[1, 'متأخرة ٤ أيام'], [2, 'متأخرة يومين']]);
    // Same day sorted by time; today and tomorrow are named.
    expect(groups[1].rows.map((row) => row.activity.id)).toEqual([4, 3]);
    expect(groups[1].title.startsWith('اليوم — ')).toBe(true);
    expect(groups[2].title.startsWith('غداً — ')).toBe(true);
  });

  test('no activities means no groups', () => {
    expect(buildSchedule([], now).groups).toEqual([]);
  });
});

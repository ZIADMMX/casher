const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const gym = require('../../electron/services/gymTraining.service');

const today = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();

describe('gym training service', () => {
  let trainerId;
  let members;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
    trainerId = gym.createTrainer({ name: 'م. حسام', specialty: 'قوة', session_rate: 420 }).id;
    members = ['أ', 'ب', 'ج'].map((name) => db.prepare('INSERT INTO customers (name) VALUES (?)').run(name).lastInsertRowid);
  });
  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('prices packages with the plan discount (matches the approved mockup)', () => {
    expect(gym.quotePackage(420, 8).total).toBe(3360);
    expect(gym.quotePackage(420, 12).total).toBe(4788);
    expect(gym.quotePackage(420, 16).total).toBe(6048);
    expect(() => gym.quotePackage(420, 10)).toThrow();
  });

  it('computes commission as % of PT value plus a fee per group class', () => {
    const c = gym.commissionOf({ commission_pct: 18, group_fee: 35 }, 15960, 12);
    expect(c).toEqual({ ptCommission: 2873, groupCommission: 420, total: 3293 });
  });

  it('puts members on the waiting list when full and promotes them on cancel', () => {
    const cls = gym.createClass({ name: 'زومبا', trainer_id: trainerId, weekday: gym.weekdayOf(today), start_time: '13:00', capacity: 1 }).id;
    const first = gym.bookClass({ classId: cls, customerId: members[0], date: today });
    const second = gym.bookClass({ classId: cls, customerId: members[1], date: today });
    expect(first.status).toBe('booked');
    expect(second.status).toBe('waitlist');
    expect(() => gym.bookClass({ classId: cls, customerId: members[0], date: today })).toThrow('محجوز بالفعل');
    expect(() => gym.bookClass({ classId: cls, customerId: members[2], date: gym.addDays(today, 1) })).toThrow('يوم الحصة');

    gym.cancelBooking(first.id);
    const roster = gym.getClassRoster({ classId: cls, date: today });
    expect(roster).toHaveLength(1);
    expect(roster[0]).toMatchObject({ customer_id: members[1], status: 'booked' });

    const week = gym.getWeekSchedule({ weekStart: today });
    expect(week.classes.find((c) => c.id === cls)).toMatchObject({ booked: 1, waitlist: 0, date: today });
  });

  it('logs PT sessions until the package is used up and feeds the trainer stats', () => {
    const { id } = gym.createPackage({ customerId: members[2], trainerId, sessions: 8 });
    for (let i = 0; i < 8; i += 1) gym.logPtSession(id);
    expect(() => gym.logPtSession(id)).toThrow('خلصت');
    expect(gym.getPackages().find((p) => p.id === id)).toMatchObject({ remaining: 0, status: 'used_up' });

    const trainer = gym.getTrainersOverview({ date: today }).find((t) => t.id === trainerId);
    expect(trainer.month.ptSessions).toBe(8);
    expect(trainer.month.ptValue).toBe(3360);
    expect(trainer.commission.ptCommission).toBe(Math.round(3360 * 0.18));
  });
});

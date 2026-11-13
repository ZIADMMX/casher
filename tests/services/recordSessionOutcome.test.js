jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return { db };
});

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(() => ({ id: 1 })),
}));

const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../../electron/database/db');
const casesService = require('../../electron/services/cases.service');

function seedSession() {
  db.exec(`
    DELETE FROM case_financials;
    DELETE FROM legal_case_tasks;
    DELETE FROM legal_client_interactions;
    DELETE FROM court_sessions;
    DELETE FROM legal_cases;
    DELETE FROM customers;
    INSERT INTO customers (id, name) VALUES (1, 'أحمد سمير');
    INSERT INTO legal_cases (id, case_number, court_name, client_id, opponent_name, subject, contract_amount)
    VALUES (1, '8432/2026', 'شمال القاهرة', 1, 'شركة المستقبل', 'مطالبة مالية', 240000);
    INSERT INTO court_sessions (id, case_id, session_date, court_room, status)
    VALUES (1, 1, '2026-11-12 09:30:00', 'قاعة 3', 'scheduled');
  `);
}

describe('recordSessionOutcome', () => {
  beforeAll(() => {
    db.exec(fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf8'));
  });
  beforeEach(seedSession);
  afterAll(() => db.close());

  test('postponing schedules the next hearing, the prep task and the expenses in one go', () => {
    const result = casesService.recordSessionOutcome(1, {
      outcome: 'postponed',
      next_session_date: '2026-12-06T09:30:00',
      next_session_reason: 'لتقديم مستندات',
      preparation: 'حافظة مستندات + مذكرة بدفاع',
      decision: 'طلبنا أجلًا لتقديم المستندات',
      expenses: [
        { type: 'expert_fee', amount: 500, description: 'رسوم خبير', paid_by_client: true },
        { type: 'court_fee', amount: 0, description: 'متجاهَل', paid_by_client: false },
      ],
    }, { id: null });

    expect(result.session.status).toBe('postponed');
    expect(result.session.decision).toBe('تأجيل — طلبنا أجلًا لتقديم المستندات');
    expect(result.nextSession.session_date).toBe('2026-12-06T09:30:00');
    expect(result.nextSession.session_reason).toBe('لتقديم مستندات');
    expect(result.nextSession.court_room).toBe('قاعة 3');

    // the case itself follows the hearing
    expect(db.prepare('SELECT status FROM legal_cases WHERE id = 1').get().status).toBe('adjourned');

    const task = db.prepare('SELECT * FROM legal_case_tasks').get();
    expect(task.title).toBe('حافظة مستندات + مذكرة بدفاع');
    expect(task.due_at.slice(0, 10)).toBe('2026-12-04');
    expect(task.session_id).toBe(result.nextSession.id);

    const expenses = db.prepare('SELECT * FROM case_financials').all();
    expect(expenses).toHaveLength(1);
    expect(expenses[0].amount).toBe(500);
    expect(expenses[0].paid_by_client).toBe(1);

    const interaction = db.prepare('SELECT * FROM legal_client_interactions').get();
    expect(interaction.customer_id).toBe(1);
    expect(interaction.subject).toContain('تأجيل');
  });

  test('a verdict closes the case without a next hearing and keeps its result and date', () => {
    const result = casesService.recordSessionOutcome(1, {
      outcome: 'judged', decision: 'حكم برفض الدعوى', verdict_result: 'unfavorable',
    });
    expect(result.session.status).toBe('judged');
    expect(result.nextSession).toBeNull();
    expect(db.prepare('SELECT status, verdict_result, verdict_date FROM legal_cases WHERE id = 1').get())
      .toEqual({ status: 'judged', verdict_result: 'unfavorable', verdict_date: '2026-11-12' });
  });

  test('a verdict without its result for the client is refused and changes nothing', () => {
    expect(() => casesService.recordSessionOutcome(1, { outcome: 'judged', verdict_result: 'won' }))
      .toThrow('حدد نتيجة الحكم بالنسبة للموكل');
    expect(db.prepare('SELECT status FROM court_sessions WHERE id = 1').get().status).toBe('scheduled');
  });

  test('rejects a postponement without a next hearing date and changes nothing', () => {
    expect(() => casesService.recordSessionOutcome(1, { outcome: 'postponed' }))
      .toThrow('تاريخ الجلسة القادمة مطلوب');
    expect(db.prepare('SELECT status FROM court_sessions WHERE id = 1').get().status).toBe('scheduled');
  });

  test('rejects an unknown outcome', () => {
    expect(() => casesService.recordSessionOutcome(1, { outcome: 'constructor' }))
      .toThrow('نتيجة الجلسة غير صحيحة');
  });
});

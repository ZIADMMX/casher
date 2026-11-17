/**
 * @file lawReports.test.js
 * @description المحاماة: الرول اليومي (ترتيب بالمحكمة والساعة ولليوم المطلوب بس) وتفصيل أتعاب ومصاريف القضية.
 */
jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));

const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations();
const reports = require('../../electron/repositories/cases/reports');

const TAG = 'LAWT';
let clientId;
let lawyerId;
const ids = { cases: [], users: [] };

const newCase = (extra = {}) => {
  const number = `${TAG}-${Date.now()}-${ids.cases.length}`;
  const id = Number(db.prepare(`INSERT INTO legal_cases (case_number, court_name, client_id, opponent_name, subject, assigned_lawyer_id, contract_amount, paid_amount)
    VALUES (?, ?, ?, 'خصم', 'موضوع', ?, ?, ?)`).run(number, extra.court || 'محكمة القاهرة', clientId, lawyerId, extra.contract ?? 10_000, extra.recorded ?? 0).lastInsertRowid);
  ids.cases.push(id);
  return id;
};
const session = (caseId, when) => db.prepare("INSERT INTO court_sessions (case_id, session_date, assigned_lawyer_id, status) VALUES (?, ?, ?, 'scheduled')").run(caseId, when, lawyerId);
const money = (caseId, type, amount, paidByClient = 1) => db.prepare('INSERT INTO case_financials (case_id, type, amount, paid_by_client) VALUES (?, ?, ?, ?)').run(caseId, type, amount, paidByClient);

function wipe() {
  for (const id of ids.cases) {
    db.prepare('DELETE FROM court_sessions WHERE case_id = ?').run(id);
    db.prepare('DELETE FROM case_financials WHERE case_id = ?').run(id);
    db.prepare('DELETE FROM lawyer_time_logs WHERE case_id = ?').run(id);
    db.prepare('DELETE FROM legal_cases WHERE id = ?').run(id);
  }
  ids.cases = [];
}

beforeAll(() => {
  clientId = Number(db.prepare("INSERT INTO customers (name) VALUES ('موكل اختبار الرول')").run().lastInsertRowid);
  lawyerId = Number(db.prepare("INSERT INTO users (username, password_hash, role, full_name) VALUES (?, 'x', 'admin', 'أ. منى')").run(`law_${Date.now()}`).lastInsertRowid);
});
afterAll(() => {
  wipe();
  db.prepare('DELETE FROM customers WHERE id = ?').run(clientId);
  db.prepare('DELETE FROM users WHERE id = ?').run(lawyerId);
});
afterEach(wipe);

describe('daily docket', () => {
  test('lists only the requested day, by court and then by time, with client and lawyer names', () => {
    const cairo2 = newCase({ court: 'محكمة القاهرة' });
    const cairo1 = newCase({ court: 'محكمة القاهرة' });
    const giza = newCase({ court: 'محكمة الجيزة' });
    const other = newCase();
    session(cairo2, '2031-03-10 11:00');
    session(cairo1, '2031-03-10 09:00');
    session(giza, '2031-03-10 08:00');
    session(other, '2031-03-11 09:00'); // another day

    const docket = reports.getDailyDocket('2031-03-10');
    expect(docket.map((s) => [s.court_name, s.session_date.slice(11)])).toEqual([['محكمة الجيزة', '08:00'], ['محكمة القاهرة', '09:00'], ['محكمة القاهرة', '11:00']].sort((x, y) => (x[0] === y[0] ? x[1].localeCompare(y[1]) : x[0].localeCompare(y[0]))));
    expect(docket.every((s) => s.client_name === 'موكل اختبار الرول' && s.assigned_lawyer_name === 'أ. منى')).toBe(true);
    expect(docket.find((s) => s.case_id === other)).toBeUndefined();
  });

  test('a day with no sessions is an empty list', () => {
    expect(reports.getDailyDocket('2031-04-01')).toEqual([]);
  });
});

describe('case financial breakdown', () => {
  test('fees, retainer, expenses paid from it or by the office, and time billing', () => {
    const id = newCase({ contract: 10_000, recorded: 4_000 });
    money(id, 'fee_payment', 3_000);
    money(id, 'retainer_deposit', 2_000);
    money(id, 'court_fee', 500, 1); // paid from the client's retainer
    money(id, 'court_fee', 300, 0); // paid by the office
    db.prepare("INSERT INTO lawyer_time_logs (case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date) VALUES (?, ?, 2.5, 400, 1000, 'مذكرة', '2031-03-01')").run(id, lawyerId);

    expect(reports.getCaseFinancialBreakdown(id)).toMatchObject({
      contract_amount: 10_000,
      paid_amount: 3_000,
      recorded_paid_amount: 4_000,
      fee_payment_discrepancy: 1_000, // the case says 4,000 were paid, the receipts add up to 3,000
      remaining_fees: 7_000,
      total_retainers: 2_000,
      total_court_expenses: 800,
      expenses_paid_from_retainer: 500,
      expenses_paid_by_office: 300,
      retainer_balance: 1_500,
      total_logged_hours: 2.5,
      total_time_billing: 1_000,
      time_logs_count: 1,
    });
  });

  test('remaining fees never go below zero when the client paid more than the contract', () => {
    const id = newCase({ contract: 1_000 });
    money(id, 'fee_payment', 1_500);
    expect(reports.getCaseFinancialBreakdown(id).remaining_fees).toBe(0);
  });

  test('a case with no money recorded is all zeros, and an unknown case is null', () => {
    const id = newCase({ contract: 2_000 });
    expect(reports.getCaseFinancialBreakdown(id)).toMatchObject({ paid_amount: 0, remaining_fees: 2_000, total_retainers: 0, retainer_balance: 0, time_logs_count: 0 });
    expect(reports.getCaseFinancialBreakdown(99999999)).toBeNull();
  });
});

jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return { db };
});

const fs = require('node:fs');
const path = require('node:path');
const { db } = require('../../electron/database/db');
const reports = require('../../electron/repositories/cases/reports');

const TODAY = new Date().toISOString().slice(0, 10);

function futureDate(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

describe('getLegalClientsOverview', () => {
  beforeAll(() => {
    db.exec(fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf8'));
    db.exec(`
      INSERT INTO customers (id, name, phone, email) VALUES
        (1, 'أحمد سمير', '0100', 'a@x.com'),
        (2, 'شركة النيل', '0101', NULL),
        (3, 'كريم فؤاد', NULL, NULL);
      INSERT INTO legal_cases (case_number, court_name, client_id, opponent_name, subject, case_type, status, contract_amount, paid_amount)
      VALUES
        ('1/2026', 'شمال القاهرة', 1, 'خصم', 'موضوع', 'civil', 'active', 10000, 7000),
        ('2/2026', 'شمال القاهرة', 1, 'خصم', 'موضوع', 'civil', 'closed', 5000, 5000),
        ('3/2026', 'شمال القاهرة', 2, 'خصم', 'موضوع', 'commercial', 'adjourned', 20000, 0);
      INSERT INTO customer_power_of_attorneys (customer_id, number, issued_at, scope, expires_at) VALUES
        (1, '4421', '2024-01-01', 'عام', NULL),
        (2, '1180', '2024-01-01', 'خاص', '${futureDate(6)}');
      INSERT INTO legal_client_interactions (customer_id, type, subject, follow_up_date) VALUES
        (3, 'call', 'مكالمة بخصوص عرض الأتعاب', '${TODAY}'),
        (1, 'note', 'ملاحظة قديمة', '2020-01-01');
    `);
  });

  afterAll(() => db.close());

  test('aggregates cases, fees and the latest power of attorney per client', () => {
    const { clients } = reports.getLegalClientsOverview(TODAY);
    const byId = Object.fromEntries(clients.map((c) => [c.id, c]));

    expect(clients).toHaveLength(3);
    expect(byId[1].cases_count).toBe(2);
    expect(byId[1].active_cases).toBe(1);
    expect(byId[1].contract_total).toBe(15000);
    expect(byId[1].paid_total).toBe(12000);
    // only the open case counts as outstanding fees
    expect(byId[1].outstanding_fees).toBe(3000);
    expect(byId[1].poa_number).toBe('4421');
    expect(byId[1].poa_expires_at).toBeNull();

    expect(byId[2].poa_expires_at).toBe(futureDate(6));
    expect(byId[2].main_case_type).toBe('commercial');

    expect(byId[3].cases_count).toBe(0);
    expect(byId[3].powers_count).toBe(0);
    expect(byId[3].outstanding_fees).toBe(0);
  });

  test("returns only today's follow-ups", () => {
    const { followUps } = reports.getLegalClientsOverview(TODAY);
    expect(followUps).toHaveLength(1);
    expect(followUps[0].client_name).toBe('كريم فؤاد');
    expect(followUps[0].type).toBe('call');
  });
});

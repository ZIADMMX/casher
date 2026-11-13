jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  return { db };
});

const { db } = require('../../electron/database/db');
const courtsRepository = require('../../electron/repositories/courts.repository');
const courtsService = require('../../electron/services/courts.service');

describe('courts directory', () => {
  beforeEach(() => {
    db.exec(`
      CREATE TABLE courts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        court_type TEXT NOT NULL,
        specialization TEXT,
        notes TEXT,
        phone TEXT,
        city TEXT,
        address TEXT,
        working_hours TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_courts_name_active
        ON courts(name COLLATE NOCASE) WHERE is_active = 1;
    `);
  });

  afterEach(() => {
    db.exec('DROP TABLE courts');
  });

  afterAll(() => db.close());

  test('creates, searches, paginates, and updates a court', () => {
    const first = courtsService.createCourt({
      name: 'محكمة القاهرة الابتدائية',
      court_type: 'first_instance',
      city: 'القاهرة',
      phone: '',
    });
    courtsService.createCourt({
      name: 'محكمة الأسرة',
      court_type: 'family',
      city: 'الجيزة',
    });

    const result = courtsService.getCourts({ search: 'القاهرة', page: '1', pageSize: '10' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(first.id);
    expect(result.items[0].phone).toBeNull();

    const updated = courtsService.updateCourt(first.id, { city: 'الإسكندرية' });
    expect(updated.city).toBe('الإسكندرية');
  });

  test('prevents duplicate active names, validates types, and deactivates without deleting', () => {
    const court = courtsService.createCourt({
      name: 'محكمة تجارية',
      court_type: 'commercial',
    });

    expect(() => courtsService.createCourt({
      name: 'محكمة تجارية',
      court_type: 'commercial',
    })).toThrow();
    expect(() => courtsService.createCourt({
      name: 'محكمة إدارية',
      court_type: 'unsupported',
    })).toThrow('نوع المحكمة غير معتمد');

    const deactivated = courtsRepository.deactivateCourt(court.id);
    expect(deactivated.is_active).toBe(0);
    expect(courtsService.getCourts({ status: 'active' }).total).toBe(0);
    expect(courtsService.getCourts({ status: 'inactive' }).total).toBe(1);
  });

  test('builds a court page: KPIs, upcoming sessions, circuits, expenses and activity', () => {
    db.exec(`
      CREATE TABLE customers (id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE legal_cases (id INTEGER PRIMARY KEY, case_number TEXT, court_id TEXT, circuit_name TEXT,
        client_id INTEGER, subject TEXT, status TEXT, created_at TEXT, updated_at TEXT, verdict_result TEXT, verdict_date TEXT);
      CREATE TABLE court_sessions (id INTEGER PRIMARY KEY, case_id INTEGER, session_date TEXT, court_room TEXT,
        session_reason TEXT, status TEXT, next_session_date TEXT, updated_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE case_documents (id INTEGER PRIMARY KEY, case_id INTEGER, title TEXT, doc_type TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
      CREATE TABLE case_financials (id INTEGER PRIMARY KEY, case_id INTEGER, type TEXT, amount REAL, date TEXT, description TEXT);
    `);
    try {
      const court = courtsService.createCourt({ name: 'محكمة شمال القاهرة', court_type: 'first_instance' });
      const other = courtsService.createCourt({ name: 'محكمة أخرى', court_type: 'family' });
      db.exec(`
        INSERT INTO customers VALUES (1, 'شركة النيل');
        INSERT INTO legal_cases VALUES
          (1, '8432/2026', '${court.id}', 'الدائرة 3 مدني كلي', 1, 'تعويض', 'active', '2026-01-01', '2026-01-01', NULL, NULL),
          (2, '445/2026', '${court.id}', 'الدائرة 3 مدني كلي', 1, 'إيجار', 'judged', date('now', '-3 months'), date('now'), 'favorable', date('now', '-1 month')),
          (3, '999/2026', '${other.id}', 'الدائرة 1', 1, 'نفقة', 'active', '2026-01-01', '2026-01-01', NULL, NULL);
        INSERT INTO court_sessions (id, case_id, session_date, session_reason, status) VALUES
          (1, 1, strftime('%Y-%m-%dT10:00', 'now', 'localtime', '+2 days'), 'مرافعة', 'scheduled'),
          (2, 2, '2026-02-01T09:00', NULL, 'postponed'),
          (3, 3, strftime('%Y-%m-%dT10:00', 'now', 'localtime', '+1 days'), NULL, 'scheduled');
        INSERT INTO case_financials VALUES
          (1, 1, 'court_fee', 150, '2026-02-01', 'رسوم قيد'),
          (2, 1, 'retainer_deposit', 5000, '2026-02-01', NULL);
      `);

      const profile = courtsService.getCourtProfile(court.id);
      expect(profile.court.name).toBe('محكمة شمال القاهرة');
      expect(profile.stats).toMatchObject({ total: 2, open: 1, judged: 1, urgent: 1, verdicts_year: 1, favorable_year: 1 });
      // measured to the verdict date (~2 months), not to the later file update (~3 months)
      expect(profile.stats.avg_days).toBeGreaterThan(55);
      expect(profile.stats.avg_days).toBeLessThan(65);
      expect(profile.upcoming).toHaveLength(1);
      expect(profile.upcoming[0]).toMatchObject({ case_number: '8432/2026', client_name: 'شركة النيل', session_reason: 'مرافعة' });
      expect(profile.circuits).toEqual([expect.objectContaining({ name: 'الدائرة 3 مدني كلي', cases: 2 })]);
      expect(profile.circuits[0].weekdays.length).toBeGreaterThan(0);
      expect(profile.expenses).toHaveLength(1); // deposits are money held, not expenses
      expect(profile.expensesTotal).toBe(150);
      expect(profile.activity.map((item) => item.kind)).toEqual(expect.arrayContaining(['session', 'case']));
      expect(courtsService.getCourtsOverview().upcoming[0].court_id).toBe(other.id);
      expect(() => courtsService.getCourtProfile('not an id')).toThrow();
    } finally {
      db.exec('DROP TABLE customers; DROP TABLE legal_cases; DROP TABLE court_sessions; DROP TABLE case_documents; DROP TABLE case_financials;');
    }
  });
});

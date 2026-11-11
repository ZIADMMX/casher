jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  return { db };
});

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(() => ({ id: 101 })),
}));

const { db } = require('../../electron/database/db');
const casesRepository = require('../../electron/repositories/cases.repository');
const customersRepository = require('../../electron/repositories/customers.repository');
const casesService = require('../../electron/services/cases.service');
const NotificationsService = require('../../electron/services/notifications.service');

function createSchema() {
  db.exec(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT NOT NULL,
      full_name TEXT,
      first_name TEXT,
      last_name TEXT,
      job_title TEXT,
      is_active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT
    );
    CREATE TABLE customer_power_of_attorneys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id),
      FOREIGN KEY (created_by) REFERENCES users(id)
    );
    CREATE TABLE legal_cases (
      id INTEGER PRIMARY KEY,
      case_number TEXT NOT NULL,
      court_name TEXT NOT NULL,
      court_id TEXT,
      circuit_name TEXT,
      client_id INTEGER NOT NULL,
      client_role TEXT NOT NULL DEFAULT 'plaintiff',
      opponent_name TEXT NOT NULL,
      opponent_lawyer TEXT,
      subject TEXT NOT NULL,
      case_type TEXT DEFAULT 'civil',
      assigned_lawyer_id INTEGER,
      billing_type TEXT NOT NULL DEFAULT 'fixed',
      contract_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      hourly_rate REAL DEFAULT 0,
      power_of_attorney_num TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (client_id) REFERENCES customers(id),
      FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id)
    );
    CREATE TABLE court_sessions (
      id INTEGER PRIMARY KEY,
      case_id INTEGER NOT NULL,
      session_date TEXT NOT NULL,
      court_room TEXT,
      assigned_lawyer_id INTEGER,
      session_reason TEXT,
      decision TEXT,
      next_session_date TEXT,
      status TEXT DEFAULT 'scheduled',
      reminder_sent INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES legal_cases(id),
      FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id)
    );
    CREATE TABLE legal_case_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id INTEGER NOT NULL,
      session_id INTEGER,
      title TEXT NOT NULL,
      description TEXT,
      due_at TEXT NOT NULL,
      reminder_at TEXT,
      assigned_lawyer_id INTEGER,
      priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
      reminder_sent INTEGER NOT NULL DEFAULT 0 CHECK(reminder_sent IN (0, 1)),
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
      FOREIGN KEY (session_id) REFERENCES court_sessions(id) ON DELETE SET NULL,
      FOREIGN KEY (assigned_lawyer_id) REFERENCES users(id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE TABLE case_documents (
      id INTEGER PRIMARY KEY,
      case_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      doc_type TEXT DEFAULT 'pleading',
      file_path TEXT NOT NULL,
      file_size INTEGER,
      version INTEGER DEFAULT 1,
      uploaded_by INTEGER,
      notes TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES legal_cases(id),
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );
    CREATE TABLE case_document_versions (
      id INTEGER PRIMARY KEY,
      document_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      uploaded_by INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, version),
      FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id)
    );
    CREATE TABLE case_financials (
      id INTEGER PRIMARY KEY,
      case_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount REAL NOT NULL,
      date TEXT DEFAULT CURRENT_TIMESTAMP,
      description TEXT,
      paid_by_client INTEGER DEFAULT 1,
      receipt_number TEXT,
      user_id INTEGER,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES legal_cases(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
    CREATE TABLE lawyer_time_logs (
      id INTEGER PRIMARY KEY,
      case_id INTEGER NOT NULL,
      lawyer_id INTEGER NOT NULL,
      hours REAL NOT NULL,
      hourly_rate REAL NOT NULL DEFAULT 0,
      total_amount REAL NOT NULL DEFAULT 0,
      activity_description TEXT NOT NULL,
      date TEXT NOT NULL,
      is_billed INTEGER DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (case_id) REFERENCES legal_cases(id),
      FOREIGN KEY (lawyer_id) REFERENCES users(id)
    );
  `);
  db.prepare('INSERT INTO users (id, username, full_name, is_active) VALUES (1, ?, ?, 1), (2, ?, ?, 0)')
    .run('lawyer', 'محامي نشط', 'inactive', 'محامي غير نشط');
  db.prepare('INSERT INTO customers (id, name) VALUES (1, ?)').run('عميل');
  db.prepare(`
    INSERT INTO legal_cases (
      id, case_number, court_name, client_id, opponent_name, subject,
      assigned_lawyer_id, contract_amount, paid_amount
    ) VALUES (1, 'CASE-1', 'محكمة', 1, 'خصم', 'موضوع', 1, 1000, 100)
  `).run();
}

describe('cases repository updates', () => {
  beforeEach(createSchema);

  afterEach(() => {
    NotificationsService.notify.mockClear();
    db.exec(`
      DROP TABLE lawyer_time_logs;
      DROP TABLE case_financials;
      DROP TABLE case_document_versions;
      DROP TABLE case_documents;
      DROP TABLE legal_case_tasks;
      DROP TABLE customer_power_of_attorneys;
      DROP TABLE court_sessions;
      DROP TABLE legal_cases;
      DROP TABLE customers;
      DROP TABLE users;
    `);
  });

  afterAll(() => db.close());

  test('next session is the earliest scheduled one still ahead, with its reason', () => {
    db.exec(`
      INSERT INTO court_sessions (case_id, session_date, status, session_reason) VALUES
        (1, datetime('now', 'localtime', '-2 hours'), 'scheduled', 'فاتت'),
        (1, datetime('now', 'localtime', '+1 day'), 'postponed', 'مؤجلة'),
        (1, datetime('now', 'localtime', '+3 days'), 'scheduled', 'مرافعة'),
        (1, datetime('now', 'localtime', '+40 days'), 'scheduled', 'حجز للحكم');
    `);
    const [legalCase] = casesRepository.getAllCases();
    expect(legalCase.next_session_reason).toBe('مرافعة');
    expect(legalCase.next_session_date).toBe(db.prepare("SELECT session_date FROM court_sessions WHERE session_reason = 'مرافعة'").get().session_date);
    expect(casesRepository.getCasesByClientId(1)[0].next_session_date).toBe(legalCase.next_session_date);
    // Only the scheduled session inside the next 30 days counts as upcoming.
    expect(casesRepository.getCasesSummaryStats().next_hearings_count).toBe(1);
  });

  test('rejects an opening payment above the agreed fees', () => {
    const base = { case_number: 'NEW-1', court_name: 'محكمة', client_id: 1, opponent_name: 'خصم', subject: 'موضوع' };
    expect(() => casesService.createCase({ ...base, contract_amount: 1000, paid_amount: 1500 })).toThrow('أكبر من إجمالي');
    expect(() => casesService.createCase({ ...base, contract_amount: -5 })).toThrow('غير صالح');
    expect(casesService.createCase({ ...base, contract_amount: 1000, paid_amount: 1000 }).paid_amount).toBe(1000);
    expect(() => casesService.updateCase(1, { contract_amount: -1 })).toThrow('غير صالح');
  });

  test('counts cases per status with the list search and type filters', () => {
    db.exec(`
      INSERT INTO legal_cases (id, case_number, court_name, client_id, opponent_name, subject, case_type, status) VALUES
        (2, 'CASE-2', 'محكمة', 1, 'خصم', 'موضوع', 'commercial', 'closed'),
        (3, 'CASE-3', 'محكمة', 1, 'شركة النور', 'موضوع', 'commercial', 'appealed');
    `);
    expect(casesRepository.getCaseStatusCounts()).toEqual({ all: 3, active: 1, adjourned: 0, judged: 0, appealed: 1, closed: 1 });
    expect(casesRepository.getCaseStatusCounts({ case_type: 'commercial', status: 'closed' }))
      .toEqual({ all: 2, active: 0, adjourned: 0, judged: 0, appealed: 1, closed: 1 });
    expect(casesRepository.getCaseStatusCounts({ search: 'النور' }).all).toBe(1);
    expect(casesRepository.getAllCases({ case_type: 'commercial', status: 'closed' }).map((c) => c.id)).toEqual([2]);
    expect(casesRepository.getCasesSummaryStats().appealed_cases).toBe(1);
  });

  test('lists only active team members and supports clearing case assignment', () => {
    expect(casesRepository.getCaseLawyers().map((lawyer) => lawyer.id)).toEqual([1]);

    const updated = casesRepository.updateCase(1, {
      case_number: 'CASE-UPDATED',
      assigned_lawyer_id: null,
      circuit_name: null,
    });

    expect(updated.case_number).toBe('CASE-UPDATED');
    expect(updated.assigned_lawyer_id).toBeNull();
    expect(updated.circuit_name).toBeNull();
  });

  test('stores the linked court id while retaining the court name snapshot', () => {
    const updated = casesRepository.updateCase(1, {
      court_id: '485da370-3dcb-44f4-bcea-5d4cd3b1ab69',
      court_name: 'محكمة الاستئناف',
    });

    expect(updated.court_id).toBe('485da370-3dcb-44f4-bcea-5d4cd3b1ab69');
    expect(updated.court_name).toBe('محكمة الاستئناف');
  });

  test('records an initial fee payment in the ledger atomically with the case', () => {
    const legalCase = casesRepository.createCase({
      case_number: 'CASE-NEW',
      court_name: 'محكمة القاهرة',
      client_id: 1,
      opponent_name: 'خصم جديد',
      subject: 'موضوع جديد',
      paid_amount: 275,
      user_id: 1,
    });

    expect(legalCase.paid_amount).toBe(275);
    expect(legalCase.financials).toHaveLength(1);
    expect(legalCase.financials[0]).toMatchObject({
      type: 'fee_payment',
      amount: 275,
      user_id: 1,
    });
  });

  test('claims an upcoming session reminder once and allows it to be re-claimed after rescheduling', () => {
    const created = db.prepare(`
      INSERT INTO court_sessions (case_id, session_date, status)
      VALUES (1, datetime('now', 'localtime', '+1 hour'), 'scheduled')
    `).run();
    const sessionId = created.lastInsertRowid;
    expect(casesRepository.getDueCourtSessionReminders(48).map((session) => session.id)).toContain(sessionId);
    expect(casesRepository.claimSessionReminder(sessionId).changes).toBe(1);
    expect(casesRepository.claimSessionReminder(sessionId).changes).toBe(0);
    expect(casesRepository.getDueCourtSessionReminders(48).map((session) => session.id)).not.toContain(sessionId);

    casesRepository.updateSession(sessionId, {
      session_date: "datetime('now', 'localtime', '+2 hours')",
    });

    expect(db.prepare('SELECT reminder_sent FROM court_sessions WHERE id = ?').get(sessionId).reminder_sent).toBe(0);
  });

  test('sends one reminder to the assigned case lawyer', () => {
    db.prepare(`
      INSERT INTO court_sessions (case_id, session_date, status)
      VALUES (1, datetime('now', 'localtime', '+1 hour'), 'scheduled')
    `).run();

    expect(casesService.checkDueCourtSessionReminders(48)).toBe(1);
    expect(NotificationsService.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      linkPage: 'cases',
      title: 'تذكير بجلسة محكمة قادمة ⚖️',
    }));
    expect(casesService.checkDueCourtSessionReminders(48)).toBe(0);
    expect(NotificationsService.notify).toHaveBeenCalledTimes(1);
  });

  test('creates, updates, and links tasks to a hearing decision', () => {
    const session = casesRepository.createSession({
      case_id: 1,
      session_date: '2026-11-02 10:00',
      decision: 'تقديم المستندات',
      next_session_date: '2026-11-20 10:00',
      status: 'postponed',
    });
    const task = casesService.createCaseTask({
      case_id: 1,
      session_id: session.id,
      title: 'تجهيز المستندات المطلوبة',
      description: 'تجهيز حافظة المستندات',
      due_at: '2026-11-19T10:00',
      reminder_at: '2026-11-18T10:00',
      priority: 'high',
    }, 1);

    expect(task).toMatchObject({
      case_id: 1,
      session_id: session.id,
      title: 'تجهيز المستندات المطلوبة',
      assigned_lawyer_id: 1,
      assigned_lawyer_name: 'محامي نشط',
    });
    expect(casesRepository.getCaseById(1).tasks).toEqual([
      expect.objectContaining({ id: task.id, session_decision: 'تقديم المستندات' }),
    ]);

    const updated = casesService.updateCaseTask(task.id, { status: 'completed' });
    expect(updated.status).toBe('completed');
    expect(casesService.deleteCaseTask(task.id)).toEqual({ success: true });
    expect(casesRepository.getTasksByCaseId(1)).toHaveLength(0);
  });

  test('rejects invalid task dates and sessions from another case', () => {
    const session = casesRepository.createSession({
      case_id: 1,
      session_date: '2026-11-02 10:00',
    });
    db.prepare(`
      INSERT INTO legal_cases (id, case_number, court_name, client_id, opponent_name, subject)
      VALUES (2, 'CASE-2', 'محكمة أخرى', 1, 'خصم آخر', 'موضوع آخر')
    `).run();

    expect(() => casesService.createCaseTask({
      case_id: 1,
      title: 'مهمة',
      due_at: '2026-02-31T10:00',
    }, 1)).toThrow('موعد استحقاق المهمة غير صالح');
    expect(() => casesService.createCaseTask({
      case_id: 2,
      session_id: session.id,
      title: 'مهمة',
      due_at: '2026-11-20T10:00',
    }, 1)).toThrow('الجلسة المرتبطة لا تنتمي إلى هذه القضية');
  });

  test('sends each due legal task reminder once and does not alert on completed tasks', () => {
    const dueAt = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString().slice(0, 16);
    const reminderAt = new Date(Date.now() - 60 * 1000).toISOString().slice(0, 16);
    const task = casesService.createCaseTask({
      case_id: 1,
      title: 'متابعة ميعاد الجلسة',
      due_at: dueAt,
      reminder_at: reminderAt,
    }, 1);

    expect(casesService.checkDueCaseTaskReminders()).toBe(1);
    expect(NotificationsService.notify).toHaveBeenCalledWith(expect.objectContaining({
      userId: 1,
      linkPage: 'cases',
      title: 'تذكير بمتابعة قضية ⚖️',
    }));
    expect(casesService.checkDueCaseTaskReminders()).toBe(0);

    const anotherTask = casesService.createCaseTask({
      case_id: 1,
      title: 'مهمة منتهية',
      due_at: dueAt,
      reminder_at: reminderAt,
    }, 1);
    casesService.updateCaseTask(anotherTask.id, { status: 'completed' });
    expect(casesService.checkDueCaseTaskReminders()).toBe(0);
    expect(NotificationsService.notify).toHaveBeenCalledTimes(1);
    expect(casesRepository.getTaskById(task.id).reminder_sent).toBe(1);
  });

  test('summarizes court sessions and legal financial movements for the dashboard and reports', () => {
    db.prepare(`
      INSERT INTO court_sessions (case_id, session_date, status, session_reason)
      VALUES (1, '2026-11-02 10:30:00', 'scheduled', 'مرافعة')
    `).run();
    db.prepare(`
      INSERT INTO case_financials (case_id, type, amount, date, description)
      VALUES
        (1, 'fee_payment', 300, '2026-11-02 09:00:00', 'دفعة أتعاب'),
        (1, 'retainer_deposit', 500, '2026-11-02 09:15:00', 'أمانة موكل'),
        (1, 'court_fee', 75, '2026-11-02 09:30:00', 'رسوم')
    `).run();

    const dashboard = casesRepository.getLawFirmDashboard('2026-11-02', '2026-11-08');
    const report = casesRepository.getLawFirmReport('2026-11-02', '2026-11-02');

    expect(dashboard.sessionStats.today_sessions).toBe(1);
    expect(dashboard.todaySessions).toHaveLength(1);
    expect(dashboard.financialStats).toMatchObject({
      fees_collected: 300,
      client_deposits: 500,
      court_expenses: 75,
      movement_count: 3,
    });
    expect(dashboard.financialMovements[0]).toHaveProperty('case_id', 1);
    expect(report.periodStats.total_sessions).toBe(1);
    expect(report.periodStats.scheduled_sessions).toBe(1);
    expect(report.courtBreakdown).toEqual([
      expect.objectContaining({ court_name: 'محكمة', sessions_count: 1 }),
    ]);
    expect(report.financialMovements).toHaveLength(3);
    expect(report.financialStats).toMatchObject({
      fees_collected: 300,
      client_deposits: 500,
      court_expenses: 75,
      expenses_paid_from_retainer: 75,
      expenses_paid_by_office: 0,
      movement_count: 3,
    });
    expect(report.caseStats.fees_collected_total).toBe(300);
    expect(report.financialMovements[0]).toHaveProperty('paid_by_client', 1);
  });

  test('returns and accounts for every report movement beyond the former 100-row limit', () => {
    const insertMovement = db.prepare(`
      INSERT INTO case_financials (case_id, type, amount, date, paid_by_client)
      VALUES (1, 'announcement_fee', 10, '2026-11-02 09:00:00', ?)
    `);
    for (let index = 0; index < 105; index += 1) {
      insertMovement.run(index % 2);
    }

    const report = casesRepository.getLawFirmReport('2026-11-02', '2026-11-02');

    expect(report.financialMovements).toHaveLength(105);
    expect(report.financialStats).toMatchObject({
      court_expenses: 1050,
      expenses_paid_from_retainer: 520,
      expenses_paid_by_office: 530,
      movement_count: 105,
    });
    expect(report.financialMovements[0]).toHaveProperty('paid_by_client');
  });

  test('uses the fee ledger as the financial total and reports stored amount discrepancies', () => {
    db.prepare(`
      INSERT INTO case_financials (case_id, type, amount, date, paid_by_client)
      VALUES (1, 'fee_payment', 300, '2026-11-02', 1),
        (1, 'court_fee', 25, '2026-11-02', 0)
    `).run();

    const breakdown = casesRepository.getCaseFinancialBreakdown(1);

    expect(breakdown).toMatchObject({
      paid_amount: 300,
      recorded_paid_amount: 100,
      fee_payment_discrepancy: -200,
      remaining_fees: 700,
      expenses_paid_by_office: 25,
    });
  });

  test('lists every case for a client and manages their powers of attorney', () => {
    db.prepare(`
      INSERT INTO legal_cases (
        id, case_number, court_name, client_id, opponent_name, subject, status
      ) VALUES (2, 'CASE-2', 'محكمة الأسرة', 1, 'خصم آخر', 'موضوع آخر', 'active')
    `).run();
    const mandate = customersRepository.createPowerOfAttorney({
      customer_id: 1,
      number: '١٢٣/أ',
      issued_at: '2026-10-15',
      scope: 'المرافعة في القضية CASE-1',
      expires_at: '2027-10-15',
      created_by: 1,
    });

    expect(casesRepository.getCasesByClientId(1)).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 1, case_number: 'CASE-1', court_name: 'محكمة' }),
      expect.objectContaining({ id: 2, case_number: 'CASE-2', court_name: 'محكمة الأسرة' }),
    ]));
    expect(customersRepository.getPowerOfAttorneys(1)).toEqual([
      expect.objectContaining({ id: mandate.id, number: '١٢٣/أ', scope: 'المرافعة في القضية CASE-1' }),
    ]);

    const updated = customersRepository.updatePowerOfAttorney(mandate.id, {
      scope: 'المرافعة ومتابعة التنفيذ',
      expires_at: null,
    });
    expect(updated.scope).toBe('المرافعة ومتابعة التنفيذ');
    expect(updated.expires_at).toBeNull();
    expect(customersRepository.deletePowerOfAttorney(mandate.id).changes).toBe(1);
    expect(customersRepository.getPowerOfAttorneys(1)).toHaveLength(0);
  });

  test('validates power of attorney dates and required legal scope', () => {
    expect(() => casesService.createCustomerPowerOfAttorney(1, {
      number: 'POA-1',
      issued_at: '2026-02-30',
      scope: 'مرافعة',
    }, 1)).toThrow('تاريخ إصدار التوكيل غير صالح');

    expect(() => casesService.createCustomerPowerOfAttorney(1, {
      number: 'POA-2',
      issued_at: '2026-11-02',
      expires_at: '2026-10-01',
      scope: 'مرافعة',
    }, 1)).toThrow('تاريخ انتهاء التوكيل يجب أن يكون بعد تاريخ إصداره');
  });

  test('keeps the case paid total in sync when fee payments are edited or deleted', () => {
    const payment = casesRepository.createFinancial({
      case_id: 1,
      type: 'fee_payment',
      amount: 200,
    });
    expect(casesRepository.getCaseById(1).paid_amount).toBe(300);

    casesRepository.updateFinancial(payment.id, { amount: 250 });
    expect(casesRepository.getCaseById(1).paid_amount).toBe(350);

    casesRepository.updateFinancial(payment.id, { type: 'court_fee' });
    expect(casesRepository.getCaseById(1).paid_amount).toBe(100);

    casesRepository.updateFinancial(payment.id, { type: 'fee_payment', amount: 125 });
    expect(casesRepository.getCaseById(1).paid_amount).toBe(225);

    casesRepository.deleteFinancial(payment.id);
    expect(casesRepository.getCaseById(1).paid_amount).toBe(100);
  });

  test('updates lawyer time totals when logged hours or rate changes', () => {
    const result = db.prepare(`
      INSERT INTO lawyer_time_logs
        (case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date)
      VALUES (1, 1, 1, 50, 50, 'بحث قانوني', '2026-11-02')
    `).run();

    const updated = casesRepository.updateTimeLog(result.lastInsertRowid, {
      hours: 2,
      hourly_rate: 75,
    });

    expect(updated.hours).toBe(2);
    expect(updated.total_amount).toBe(150);
  });

  test('keeps immutable document versions when replacing an archived file', () => {
    const document = casesRepository.createDocument({
      case_id: 1,
      title: 'مذكرة دفاع',
      file_path: 'C:\\\\archive\\\\memo-v1.pdf',
      file_size: 120,
      uploaded_by: 1,
    });

    const updated = casesRepository.updateDocument(document.id, {
      title: 'مذكرة دفاع محدثة',
      versionFile: {
        file_path: 'C:\\\\archive\\\\memo-v2.pdf',
        file_size: 250,
        uploaded_by: 1,
      },
    });
    const versions = casesRepository.getDocumentVersions(document.id);
    const removed = casesRepository.deleteDocument(document.id);

    expect(updated.version).toBe(2);
    expect(versions.map((version) => version.version)).toEqual([2, 1]);
    expect(removed.files.sort()).toEqual([
      'C:\\\\archive\\\\memo-v1.pdf',
      'C:\\\\archive\\\\memo-v2.pdf',
    ].sort());
  });
});

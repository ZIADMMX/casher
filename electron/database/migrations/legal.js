const { db } = require('../connection');
const { foreignKeyViolationCounts, assertNoNewForeignKeyViolations } = require('./helpers');

function migrateCasesTables(dbInstance = db) {
  const hasLawyerTimeLogs = dbInstance.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lawyer_time_logs'").get();
  if (hasLawyerTimeLogs) {
    const fks = dbInstance.prepare('PRAGMA foreign_key_list(lawyer_time_logs)').all();
    const userFk = fks.find((f) => f.from === 'lawyer_id' && f.table === 'users');
    if (userFk && userFk.on_delete === 'SET NULL') {
      // Rebuilt with foreign keys off; violations are compared before and after
      // inside the transaction, so a rebuild that breaks links rolls back.
      const fkBefore = foreignKeyViolationCounts(dbInstance);
      dbInstance.pragma('foreign_keys = OFF');
      try {
        dbInstance.transaction(() => {
          dbInstance.exec(`
          DROP TRIGGER IF EXISTS trg_restrict_case_delete_with_history;
          CREATE TABLE lawyer_time_logs_migrated (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              case_id INTEGER NOT NULL,
              lawyer_id INTEGER NOT NULL,
              hours REAL NOT NULL CHECK(hours > 0),
              hourly_rate REAL NOT NULL DEFAULT 0,
              total_amount REAL NOT NULL DEFAULT 0,
              activity_description TEXT NOT NULL,
              date DATE NOT NULL,
              is_billed INTEGER DEFAULT 0,
              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
              FOREIGN KEY (case_id) REFERENCES legal_cases(id) ON DELETE CASCADE,
              FOREIGN KEY (lawyer_id) REFERENCES users(id) ON DELETE RESTRICT
          );
          INSERT INTO lawyer_time_logs_migrated (
            id, case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date, is_billed, created_at
          )
          SELECT 
            id, case_id, lawyer_id, hours, hourly_rate, total_amount, activity_description, date, is_billed, created_at
          FROM lawyer_time_logs;
          DROP TABLE lawyer_time_logs;
          ALTER TABLE lawyer_time_logs_migrated RENAME TO lawyer_time_logs;
          CREATE INDEX IF NOT EXISTS idx_lawyer_time_logs_case ON lawyer_time_logs(case_id);
          CREATE TRIGGER IF NOT EXISTS trg_restrict_case_delete_with_history
          BEFORE DELETE ON legal_cases
          WHEN (SELECT foreign_keys FROM pragma_foreign_keys) = 1
           AND (EXISTS (SELECT 1 FROM case_financials WHERE case_id = OLD.id)
            OR EXISTS (SELECT 1 FROM court_sessions WHERE case_id = OLD.id)
            OR EXISTS (SELECT 1 FROM case_documents WHERE case_id = OLD.id)
            OR EXISTS (SELECT 1 FROM lawyer_time_logs WHERE case_id = OLD.id))
          BEGIN
              SELECT RAISE(ABORT, 'Close cases instead of deleting case and financial history');
          END;
        `);
          assertNoNewForeignKeyViolations(fkBefore, 'lawyer_time_logs', dbInstance);
        })();
      } finally {
        dbInstance.pragma('foreign_keys = ON');
      }
    }
  }
}

function migrateLegalCaseTasks(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS legal_case_tasks (
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
    CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_case_due
      ON legal_case_tasks(case_id, status, due_at);
    CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_reminders
      ON legal_case_tasks(status, reminder_sent, reminder_at);
    CREATE INDEX IF NOT EXISTS idx_legal_case_tasks_assignee
      ON legal_case_tasks(assigned_lawyer_id, status, due_at);
  `);
}

function migrateLegalClientInteractions(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS legal_client_interactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      created_by INTEGER,
      type TEXT NOT NULL CHECK(type IN ('call', 'message', 'note', 'complaint')),
      subject TEXT NOT NULL,
      details TEXT,
      follow_up_date TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_legal_client_interactions_customer
      ON legal_client_interactions(customer_id, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_legal_client_interactions_followup
      ON legal_client_interactions(follow_up_date);
  `);
}

function migrateCustomerPowerOfAttorneyTables(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS customer_power_of_attorneys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      number TEXT NOT NULL,
      issued_at TEXT NOT NULL,
      scope TEXT NOT NULL,
      expires_at TEXT,
      notes TEXT,
      created_by INTEGER,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
      FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_customer_power_of_attorneys_customer
      ON customer_power_of_attorneys(customer_id, issued_at DESC);
    CREATE INDEX IF NOT EXISTS idx_customer_power_of_attorneys_expiry
      ON customer_power_of_attorneys(expires_at);
  `);
}

function migrateCourtsTables(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS courts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      court_type TEXT NOT NULL CHECK(court_type IN (
        'first_instance', 'cassation', 'appeals', 'family',
        'criminal', 'commercial', 'labor', 'administrative'
      )),
      specialization TEXT,
      notes TEXT,
      phone TEXT,
      city TEXT,
      address TEXT,
      is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_courts_name_active
      ON courts(name COLLATE NOCASE) WHERE is_active = 1;
    CREATE INDEX IF NOT EXISTS idx_courts_type_active ON courts(court_type, is_active);
  `);

  const caseColumns = dbInstance.prepare('PRAGMA table_info(legal_cases)').all();
  if (caseColumns.length && !caseColumns.some((column) => column.name === 'court_id')) {
    dbInstance.exec('ALTER TABLE legal_cases ADD COLUMN court_id TEXT');
  }
}

function migrateLegalCaseArchiveFinance(dbInstance = db) {
  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS case_document_versions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      version INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      file_size INTEGER,
      uploaded_by INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(document_id, version),
      FOREIGN KEY (document_id) REFERENCES case_documents(id) ON DELETE CASCADE,
      FOREIGN KEY (uploaded_by) REFERENCES users(id) ON DELETE SET NULL
    );
    CREATE INDEX IF NOT EXISTS idx_case_document_versions_document
      ON case_document_versions(document_id, version DESC);
  `);

  const hasDocuments = dbInstance.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'case_documents'"
  ).get();
  if (hasDocuments) {
    dbInstance.exec(`
      INSERT OR IGNORE INTO case_document_versions
        (document_id, version, file_path, file_size, uploaded_by, created_at)
      SELECT id, COALESCE(version, 1), file_path, file_size, uploaded_by, created_at
      FROM case_documents
    `);
  }

  const hasCases = dbInstance.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'legal_cases'"
  ).get();
  const hasFinancials = dbInstance.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'case_financials'"
  ).get();
  if (hasCases && hasFinancials) {
    const reconcile = dbInstance.transaction(() => {
      dbInstance.exec(`
        INSERT INTO case_financials
          (case_id, type, amount, date, description, paid_by_client)
        SELECT c.id, 'fee_payment',
               c.paid_amount - COALESCE((
                 SELECT SUM(f.amount) FROM case_financials f
                 WHERE f.case_id = c.id AND f.type = 'fee_payment'
               ), 0),
               c.created_at,
               'دفعة أتعاب افتتاحية لمزامنة الرصيد السابق مع سجل الحركات',
               1
        FROM legal_cases c
        WHERE c.paid_amount > COALESCE((
          SELECT SUM(f.amount) FROM case_financials f
          WHERE f.case_id = c.id AND f.type = 'fee_payment'
        ), 0)
      `);
      dbInstance.exec(`
        UPDATE legal_cases
        SET paid_amount = COALESCE((
          SELECT SUM(f.amount) FROM case_financials f
          WHERE f.case_id = legal_cases.id AND f.type = 'fee_payment'
        ), 0)
        WHERE paid_amount != COALESCE((
          SELECT SUM(f.amount) FROM case_financials f
          WHERE f.case_id = legal_cases.id AND f.type = 'fee_payment'
        ), 0)
      `);
    });
    reconcile();
  }
}

module.exports = {
  migrateCasesTables,
  migrateLegalCaseTasks,
  migrateLegalClientInteractions,
  migrateCustomerPowerOfAttorneyTables,
  migrateCourtsTables,
  migrateLegalCaseArchiveFinance,
};

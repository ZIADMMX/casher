const { db } = require('../connection');
const { assertNoNewForeignKeyViolations, foreignKeyViolationCounts } = require('./helpers');

// 'file' is allowed by the schema now so the next type does not need another table rebuild;
// the service decides which types can actually be created.
const CUSTOM_FIELD_TYPES_SQL = "'text', 'number', 'date', 'boolean', 'select', 'file'";

/**
 * Databases created before choice lists have crm_custom_fields with a CHECK that only allows four
 * types, and SQLite cannot alter a CHECK. Rebuild the table once, keeping ids so stored values stay linked.
 */
function upgradeCustomFieldsTable(database) {
  const table = database.prepare(`
    SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'crm_custom_fields'
  `).get();
  if (!table || table.sql.includes("'select'")) return;

  const foreignKeysWereOn = database.pragma('foreign_keys', { simple: true }) === 1;
  const fkBefore = foreignKeyViolationCounts(database);
  database.pragma('foreign_keys = OFF');
  try {
    database.transaction(() => {
      database.exec(`
        CREATE TABLE crm_custom_fields_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'company', 'lead', 'opportunity')),
          field_key TEXT NOT NULL,
          label TEXT NOT NULL,
          field_type TEXT NOT NULL DEFAULT 'text' CHECK(field_type IN (${CUSTOM_FIELD_TYPES_SQL})),
          is_required INTEGER NOT NULL DEFAULT 0,
          options_json TEXT,
          display_order INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entity_type, field_key)
        );
        INSERT INTO crm_custom_fields_new (id, entity_type, field_key, label, field_type, is_required, display_order, created_at)
        SELECT id, entity_type, field_key, label, field_type, is_required, id, created_at FROM crm_custom_fields;
        DROP TABLE crm_custom_fields;
        ALTER TABLE crm_custom_fields_new RENAME TO crm_custom_fields;
      `);
      assertNoNewForeignKeyViolations(fkBefore, 'crm_custom_fields', database);
    })();
  } finally {
    if (foreignKeysWereOn) database.pragma('foreign_keys = ON');
  }
}

function migrateCRMTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS crm_interactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        campaign_id INTEGER,
        user_id INTEGER,
        type TEXT NOT NULL CHECK(type IN ('call', 'note', 'message', 'complaint', 'offer')),
        subject TEXT NOT NULL,
        details TEXT,
        status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'resolved', 'pending')),
        follow_up_date DATETIME,
        reminder_sent_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (campaign_id) REFERENCES crm_campaigns(id) ON DELETE SET NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crm_opportunities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id INTEGER NOT NULL,
        user_id INTEGER,
        title TEXT NOT NULL,
        expected_value REAL DEFAULT 0,
        stage TEXT NOT NULL DEFAULT 'lead' CHECK(stage IN ('lead', 'qualified', 'proposal', 'won', 'lost')),
        expected_close_date DATETIME,
        notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
    );

    CREATE TABLE IF NOT EXISTS crm_campaigns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        target_criteria TEXT,
        discount_percentage REAL DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_crm_interactions_customer ON crm_interactions(customer_id);
    CREATE INDEX IF NOT EXISTS idx_crm_interactions_type ON crm_interactions(type);
    CREATE INDEX IF NOT EXISTS idx_crm_interactions_followup ON crm_interactions(follow_up_date);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_customer ON crm_opportunities(customer_id);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage ON crm_opportunities(stage);
  `);
  const interactionColumns = db.prepare('PRAGMA table_info(crm_interactions)').all().map((column) => column.name);
  if (!interactionColumns.includes('campaign_id')) {
    db.exec('ALTER TABLE crm_interactions ADD COLUMN campaign_id INTEGER REFERENCES crm_campaigns(id) ON DELETE SET NULL;');
  }
  if (!interactionColumns.includes('reminder_sent_at')) {
    db.exec('ALTER TABLE crm_interactions ADD COLUMN reminder_sent_at DATETIME;');
  }
  const customersTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'customers'"
  ).get();
  if (!customersTable) {
    throw new Error('لا يمكن ترحيل CRM لأن جدول customers غير موجود');
  }
  const customerColumns = db.prepare('PRAGMA table_info(customers)').all()
    .map((column) => column.name);
  if (!customerColumns.includes('last_interaction_at')) {
    db.exec('ALTER TABLE customers ADD COLUMN last_interaction_at DATETIME;');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_crm_campaign_customer ON crm_interactions(campaign_id, customer_id) WHERE campaign_id IS NOT NULL;');
  db.exec(`
    UPDATE customers
    SET last_interaction_at = (
      SELECT MAX(ci.created_at) FROM crm_interactions ci WHERE ci.customer_id = customers.id
    )
    WHERE last_interaction_at IS NULL
      AND EXISTS (SELECT 1 FROM crm_interactions ci WHERE ci.customer_id = customers.id);
  `);
  console.log('تم التحقق من جداول مركز اتصالات العملاء والـ CRM (crm)');
}

function migrateAdvancedCRMTables(database = db) {
  const addColumn = (table, name, definition) => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === name)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  };

  addColumn('customers', 'company_id', 'INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL');
  addColumn('customers', 'lead_source', 'TEXT');
  addColumn('customers', 'email_consent', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('customers', 'sms_consent', 'INTEGER NOT NULL DEFAULT 0');
  addColumn('customers', 'consent_updated_at', 'DATETIME');
  addColumn('customers', 'gdpr_deleted_at', 'DATETIME');
  addColumn('crm_opportunities', 'company_id', 'INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'lead_id', 'INTEGER REFERENCES crm_leads(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'probability', 'INTEGER NOT NULL DEFAULT 10');
  addColumn('crm_opportunities', 'pipeline_stage_id', 'INTEGER REFERENCES crm_pipeline_stages(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'last_stage_changed_at', 'DATETIME');
  addColumn('crm_opportunities', 'updated_by', 'INTEGER REFERENCES users(id) ON DELETE SET NULL');
  addColumn('crm_opportunities', 'closed_at', 'DATETIME');
  addColumn('crm_opportunities', 'stage_stale_reminded_at', 'DATETIME');

  database.exec(`
    CREATE TABLE IF NOT EXISTS crm_companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      parent_company_id INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL,
      name TEXT NOT NULL,
      industry TEXT,
      website TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      notes TEXT,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      company_id INTEGER REFERENCES crm_companies(id) ON DELETE SET NULL,
      customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
      source TEXT,
      status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new', 'contacted', 'qualified', 'converted', 'lost')),
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      notes TEXT,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_pipeline_stages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stage_key TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      outcome TEXT NOT NULL DEFAULT 'open' CHECK(outcome IN ('open', 'won', 'lost')),
      probability INTEGER NOT NULL DEFAULT 10 CHECK(probability BETWEEN 0 AND 100),
      display_order INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL COLLATE NOCASE UNIQUE,
      color TEXT NOT NULL DEFAULT '#64748b',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_record_tags (
      tag_id INTEGER NOT NULL REFERENCES crm_tags(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      PRIMARY KEY(tag_id, record_type, record_id)
    );

    CREATE TABLE IF NOT EXISTS crm_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      activity_type TEXT NOT NULL CHECK(activity_type IN ('call', 'meeting', 'task', 'email', 'note')),
      title TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'completed', 'cancelled')),
      due_at DATETIME,
      owner_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reminder_sent_at DATETIME,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      body TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_type TEXT NOT NULL CHECK(record_type IN ('customer', 'company', 'lead', 'opportunity')),
      record_id INTEGER NOT NULL,
      file_name TEXT NOT NULL,
      file_path TEXT NOT NULL,
      mime_type TEXT,
      size_bytes INTEGER NOT NULL DEFAULT 0,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'company', 'lead', 'opportunity')),
      field_key TEXT NOT NULL,
      label TEXT NOT NULL,
      field_type TEXT NOT NULL DEFAULT 'text' CHECK(field_type IN (${CUSTOM_FIELD_TYPES_SQL})),
      is_required INTEGER NOT NULL DEFAULT 0,
      options_json TEXT,
      display_order INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(entity_type, field_key)
    );

    CREATE TABLE IF NOT EXISTS crm_custom_field_values (
      field_id INTEGER NOT NULL REFERENCES crm_custom_fields(id) ON DELETE CASCADE,
      record_id INTEGER NOT NULL,
      value TEXT,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY(field_id, record_id)
    );

    CREATE TABLE IF NOT EXISTS crm_saved_filters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'company', 'lead', 'opportunity', 'activity')),
      filters_json TEXT NOT NULL DEFAULT '{}',
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, entity_type, name)
    );

    CREATE TABLE IF NOT EXISTS crm_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      to_customer_id INTEGER NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
      relationship_type TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CHECK(from_customer_id != to_customer_id),
      UNIQUE(from_customer_id, to_customer_id, relationship_type)
    );

    CREATE TABLE IF NOT EXISTS crm_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      changes_json TEXT NOT NULL DEFAULT '{}',
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS crm_automation_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      is_enabled INTEGER NOT NULL DEFAULT 1,
      trigger_type TEXT NOT NULL,
      config_json TEXT NOT NULL DEFAULT '{}',
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_crm_companies_parent ON crm_companies(parent_company_id);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_status ON crm_leads(status);
    CREATE INDEX IF NOT EXISTS idx_crm_leads_owner ON crm_leads(owner_user_id);
    CREATE INDEX IF NOT EXISTS idx_crm_activities_due ON crm_activities(status, due_at);
    CREATE INDEX IF NOT EXISTS idx_crm_activities_record ON crm_activities(record_type, record_id);
    CREATE INDEX IF NOT EXISTS idx_crm_opportunities_stage_id ON crm_opportunities(pipeline_stage_id);
    CREATE INDEX IF NOT EXISTS idx_crm_audit_entity ON crm_audit_log(entity_type, entity_id, created_at);
  `);

  const insertStage = database.prepare(`
    INSERT OR IGNORE INTO crm_pipeline_stages (stage_key, label, outcome, probability, display_order)
    VALUES (?, ?, ?, ?, ?)
  `);
  [
    ['lead', 'عميل محتمل', 'open', 10, 0],
    ['qualified', 'مؤهل', 'open', 25, 1],
    ['proposal', 'عرض سعر', 'open', 60, 2],
    ['won', 'ناجحة', 'won', 100, 3],
    ['lost', 'خاسرة', 'lost', 0, 4],
  ].forEach((stage) => insertStage.run(...stage));
  database.prepare(`
    INSERT OR IGNORE INTO crm_automation_rules (name, trigger_type, config_json)
    VALUES ('تنبيه الصفقات المتوقفة', 'opportunity_stale', '{"days":7}')
  `).run();

  database.exec(`
    UPDATE crm_opportunities
    SET pipeline_stage_id = (
      SELECT id FROM crm_pipeline_stages WHERE stage_key = crm_opportunities.stage
    ),
    last_stage_changed_at = COALESCE(last_stage_changed_at, updated_at)
    WHERE pipeline_stage_id IS NULL;
  `);
  database.exec(`
    UPDATE crm_opportunities
    SET closed_at = COALESCE(closed_at, updated_at)
    WHERE stage IN ('won', 'lost') AND closed_at IS NULL;
  `);
}

/** v25: choice-list custom fields (with order), a lead's expected value, and why a deal was lost. */
function migrateCRMFieldsAndValues(database = db) {
  upgradeCustomFieldsTable(database);
  const addColumn = (table, name, definition) => {
    const columns = database.prepare(`PRAGMA table_info(${table})`).all();
    if (!columns.some((column) => column.name === name)) {
      database.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${definition}`);
    }
  };
  addColumn('crm_leads', 'expected_value', 'REAL NOT NULL DEFAULT 0');
  addColumn('crm_opportunities', 'lost_reason', 'TEXT');
}

module.exports = {
  migrateCRMTables,
  migrateAdvancedCRMTables,
  migrateCRMFieldsAndValues,
  migrateDailyMessages,
};

// Which "today's messages" rows were sent over WhatsApp, so a row is not offered twice.
function migrateDailyMessages(database = db) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS daily_messages_sent (
      kind TEXT NOT NULL,
      ref_id INTEGER NOT NULL,
      sent_on TEXT NOT NULL,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      sent_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (kind, ref_id, sent_on)
    );
  `);
}

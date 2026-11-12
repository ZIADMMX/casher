const fs = require('node:fs');
const path = require('node:path');

// A database whose crm_custom_fields CHECK only allows four types. The upgrade must rebuild the
// table so choice lists can be stored, keep ids so saved values stay linked, and add the new columns.
describe('CRM custom fields upgrade', () => {
  const baseTestDir = path.join(__dirname, '../../.jest-cache');
  if (!fs.existsSync(baseTestDir)) fs.mkdirSync(baseTestDir, { recursive: true });

  it('rebuilds crm_custom_fields, keeps values, and adds lead value and lost reason', () => {
    const tempDir = fs.mkdtempSync(path.join(baseTestDir, 'foxcloud-crm-fields-'));
    process.env.FOX_USER_DATA_DIR = tempDir;
    jest.resetModules();

    const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db.js');
    try {
      runAllMigrations();
      // Put the table back the way old builds created it.
      db.pragma('foreign_keys = OFF');
      db.exec(`
        DROP TABLE crm_custom_fields;
        CREATE TABLE crm_custom_fields (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          entity_type TEXT NOT NULL CHECK(entity_type IN ('customer', 'company', 'lead', 'opportunity')),
          field_key TEXT NOT NULL,
          label TEXT NOT NULL,
          field_type TEXT NOT NULL DEFAULT 'text' CHECK(field_type IN ('text', 'number', 'date', 'boolean')),
          is_required INTEGER NOT NULL DEFAULT 0,
          created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(entity_type, field_key)
        );
        INSERT INTO crm_custom_fields (id, entity_type, field_key, label, field_type) VALUES (5, 'customer', 'tax_number', 'الرقم الضريبي', 'text');
        DELETE FROM crm_custom_field_values;
        INSERT INTO crm_custom_field_values (field_id, record_id, value) VALUES (5, 1, '123');
      `);
      db.pragma('foreign_keys = ON');
      db.pragma('user_version = 24');

      expect(() => runAllMigrations()).not.toThrow();
      expect(db.pragma('user_version', { simple: true })).toBe(require('../../electron/database/connection').DATABASE_SCHEMA_VERSION);

      const sql = db.prepare("SELECT sql FROM sqlite_master WHERE name = 'crm_custom_fields'").get().sql;
      expect(sql).toContain("'select'");
      expect(db.prepare('SELECT id, field_key, display_order FROM crm_custom_fields').get())
        .toEqual({ id: 5, field_key: 'tax_number', display_order: 5 });
      expect(db.prepare('SELECT value FROM crm_custom_field_values WHERE field_id = 5').get().value).toBe('123');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);

      const leadColumns = db.prepare('PRAGMA table_info(crm_leads)').all().map((column) => column.name);
      const dealColumns = db.prepare('PRAGMA table_info(crm_opportunities)').all().map((column) => column.name);
      expect(leadColumns).toContain('expected_value');
      expect(dealColumns).toContain('lost_reason');

      // A choice-list field can be stored now, and deleting a field removes its values.
      db.prepare(`
        INSERT INTO crm_custom_fields (entity_type, field_key, label, field_type, options_json)
        VALUES ('customer', 'payment', 'طريقة الدفع', 'select', '["كاش","آجل"]')
      `).run();
      db.prepare('DELETE FROM crm_custom_fields WHERE id = 5').run();
      expect(db.prepare('SELECT COUNT(*) AS n FROM crm_custom_field_values WHERE field_id = 5').get().n).toBe(0);
    } finally {
      closeDatabase();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

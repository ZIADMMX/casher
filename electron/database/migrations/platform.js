const crypto = require('node:crypto');
const { db } = require('../connection');

function migrateUIConfigTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ui_configurations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        scope TEXT NOT NULL,
        config_key TEXT NOT NULL DEFAULT '_all',
        config_json TEXT NOT NULL DEFAULT '{}',
        role_or_user TEXT DEFAULT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(scope, config_key, role_or_user)
    );

    DELETE FROM ui_configurations
    WHERE id NOT IN (
      SELECT MAX(id)
      FROM ui_configurations
      GROUP BY scope, config_key, COALESCE(role_or_user, '')
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ui_configurations_unique_scope_key_role
      ON ui_configurations(scope, config_key, COALESCE(role_or_user, ''));
  `);
  
  const scopes = ['dashboard', 'pos', 'products_table', 'shortcuts', 'invoice', 'order_form'];
  const insertStmt = db.prepare(`
    INSERT OR IGNORE INTO ui_configurations (scope, config_key, config_json)
    VALUES (?, '_all', ?)
  `);
  
  const initDefaults = db.transaction(() => {
    // We only insert default configurations if the table is empty for these scopes
    const countStmt = db.prepare('SELECT COUNT(*) as count FROM ui_configurations');
    if (countStmt.get().count === 0) {
      const defaults = {
        dashboard: { cards: [{id: 'sales_today', visible: true, order: 1}, {id: 'revenue_today', visible: true, order: 2}, {id: 'low_stock_count', visible: true, order: 3}, {id: 'customers_count', visible: true, order: 4}, {id: 'top_products', visible: true, order: 5}, {id: 'recent_sales', visible: true, order: 6}] },
        pos: { fields: [{id: 'barcode_search', visible: true, order: 1}, {id: 'category_filter', visible: true, order: 2}, {id: 'customer_select', visible: true, order: 3}, {id: 'discount_field', visible: true, order: 4}, {id: 'notes_field', visible: true, order: 5}] },
        products_table: { columns: [{id: 'name', visible: true, order: 1}, {id: 'sku', visible: true, order: 2}, {id: 'barcode', visible: true, order: 3}, {id: 'category', visible: true, order: 4}, {id: 'price', visible: true, order: 5}, {id: 'stock', visible: true, order: 6}, {id: 'image', visible: true, order: 7}] },
        shortcuts: { buttons: [{id: 'new_sale', visible: true, order: 1}, {id: 'quick_return', visible: true, order: 2}, {id: 'hold_order', visible: true, order: 3}, {id: 'open_drawer', visible: true, order: 4}] },
        invoice: { sections: [{id: 'header', visible: true, order: 1}, {id: 'logo', visible: true, order: 2}, {id: 'items_table', visible: true, order: 3}, {id: 'totals', visible: true, order: 4}, {id: 'footer', visible: true, order: 5}, {id: 'qr_code', visible: true, order: 6}] },
        order_form: { fields: [{id: 'customer_name', required: true, visible: true, order: 1}, {id: 'phone', required: true, visible: true, order: 2}, {id: 'address', required: false, visible: true, order: 3}, {id: 'delivery_date', required: false, visible: true, order: 4}, {id: 'notes', required: false, visible: true, order: 5}, {id: 'priority', required: false, visible: true, order: 6}] }
      };
      
      for (const scope of scopes) {
        insertStmt.run(scope, JSON.stringify(defaults[scope]));
      }
    }
  });
  
  initDefaults();
  console.log('تم التحقق من جدول إعدادات الشاشة (ui_configurations)');
}

function migrateOnboardingTables() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS onboarding_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        sector_key TEXT UNIQUE NOT NULL,
        sector_name TEXT NOT NULL,
        sector_tagline TEXT,
        icon TEXT,
        primary_action_title TEXT NOT NULL,
        primary_action_route TEXT NOT NULL,
        terminology_json TEXT NOT NULL DEFAULT '{}',
        enabled_modules_json TEXT NOT NULL DEFAULT '[]',
        default_units_json TEXT NOT NULL DEFAULT '[]',
        starter_categories_json TEXT NOT NULL DEFAULT '[]',
        starter_products_json TEXT NOT NULL DEFAULT '[]',
        starter_stations_json TEXT NOT NULL DEFAULT '[]',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS onboarding_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        is_completed INTEGER NOT NULL DEFAULT 0,
        current_step INTEGER NOT NULL DEFAULT 1,
        selected_sector TEXT,
        custom_sector_name TEXT,
        setup_summary_json TEXT DEFAULT '{}',
        completed_at DATETIME,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_onboarding_presets_key ON onboarding_presets(sector_key);
  `);

  // التحقق من وجود الأعمدة الجديدة
  try {
    const cols = db.prepare('PRAGMA table_info(onboarding_presets)').all().map((c) => c.name);
    if (!cols.includes('starter_working_hours_json')) {
      db.exec("ALTER TABLE onboarding_presets ADD COLUMN starter_working_hours_json TEXT DEFAULT '{}';");
    }
    if (!cols.includes('starter_addons_json')) {
      db.exec("ALTER TABLE onboarding_presets ADD COLUMN starter_addons_json TEXT DEFAULT '[]';");
    }
  } catch {}

  // تهيئة حالة الـ Onboarding الأولية إذا لم تكن موجودة
  db.prepare(`
    INSERT OR IGNORE INTO onboarding_state (id, is_completed, current_step)
    VALUES (1, 0, 1)
  `).run();

  // تغذية القوالب الافتراضية
  try {
    const { SECTOR_PRESETS } = require('./onboardingPresets.data');
    const insertPreset = db.prepare(`
      INSERT INTO onboarding_presets (
        sector_key, sector_name, sector_tagline, icon,
        primary_action_title, primary_action_route,
        terminology_json, enabled_modules_json, default_units_json,
        starter_working_hours_json, starter_categories_json,
        starter_addons_json, starter_products_json, starter_stations_json
      ) VALUES (
        @sector_key, @sector_name, @sector_tagline, @icon,
        @primary_action_title, @primary_action_route,
        @terminology_json, @enabled_modules_json, @default_units_json,
        @starter_working_hours_json, @starter_categories_json,
        @starter_addons_json, @starter_products_json, @starter_stations_json
      )
      ON CONFLICT(sector_key) DO UPDATE SET
        sector_name = excluded.sector_name,
        sector_tagline = excluded.sector_tagline,
        icon = excluded.icon,
        primary_action_title = excluded.primary_action_title,
        primary_action_route = excluded.primary_action_route,
        terminology_json = excluded.terminology_json,
        enabled_modules_json = excluded.enabled_modules_json,
        default_units_json = excluded.default_units_json,
        starter_working_hours_json = excluded.starter_working_hours_json,
        starter_categories_json = excluded.starter_categories_json,
        starter_addons_json = excluded.starter_addons_json,
        starter_products_json = excluded.starter_products_json,
        starter_stations_json = excluded.starter_stations_json
    `);

    const seedTx = db.transaction(() => {
      for (const preset of SECTOR_PRESETS) {
        insertPreset.run({
          sector_key: preset.sector_key,
          sector_name: preset.sector_name,
          sector_tagline: preset.sector_tagline || '',
          icon: preset.icon || 'store',
          primary_action_title: preset.primary_action_title,
          primary_action_route: preset.primary_action_route,
          terminology_json: JSON.stringify(preset.terminology || {}),
          enabled_modules_json: JSON.stringify(preset.enabled_modules || []),
          default_units_json: JSON.stringify(preset.default_units || []),
          starter_working_hours_json: JSON.stringify(preset.starter_working_hours || null),
          starter_categories_json: JSON.stringify(preset.starter_categories || []),
          starter_addons_json: JSON.stringify(preset.starter_addons || []),
          starter_products_json: JSON.stringify(preset.starter_products || []),
          starter_stations_json: JSON.stringify(preset.starter_stations || []),
        });
      }
    });
    seedTx();
    console.log('تم التحقق من جداول وقوالب معالج التهيئة الأولى (onboarding_presets)');
  } catch (err) {
    console.error('خطأ أثناء تهيئة قوالب onboarding:', err);
  }
}

function migrateCloudSyncV3(dbInstance = db) {
  const syncTables = [
    'sales',
    'sale_items',
    'products',
    'product_variants',
    'customers',
    'returns',
    'shifts',
    'orders',
  ];

  dbInstance.transaction(() => {
    for (const table of syncTables) {
      const hasTable = dbInstance
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
        .get(table);
      if (!hasTable) continue;

      const columns = dbInstance
        .prepare(`PRAGMA table_info(${table})`)
        .all()
        .map((c) => c.name);

      if (!columns.includes('uuid')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN uuid TEXT;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود uuid إلى ${table}:`, e.message);
          }
        }
      }

      if (!columns.includes('is_synced')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN is_synced INTEGER NOT NULL DEFAULT 0;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود is_synced إلى ${table}:`, e.message);
          }
        }
      }

      if (!columns.includes('synced_at')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN synced_at DATETIME;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود synced_at إلى ${table}:`, e.message);
          }
        }
      }

      if (!columns.includes('updated_at')) {
        try {
          dbInstance.exec(`ALTER TABLE ${table} ADD COLUMN updated_at DATETIME DEFAULT CURRENT_TIMESTAMP;`);
        } catch (e) {
          if (!e.message.includes('duplicate column')) {
            console.warn(`[SyncMigration] تنبيه إضافة عمود updated_at إلى ${table}:`, e.message);
          }
        }
      }

      // فهارس تسريع الاستعلامات والمزامنة
      try {
        dbInstance.exec(`
          CREATE INDEX IF NOT EXISTS idx_${table}_sync ON ${table}(is_synced);
          CREATE UNIQUE INDEX IF NOT EXISTS idx_${table}_uuid ON ${table}(uuid) WHERE uuid IS NOT NULL;
        `);
      } catch {}

      // توليد UUID فوري للسجلات الحالية التي لا تملك UUID
      try {
        const rowsWithoutUuid = dbInstance
          .prepare(`SELECT id FROM ${table} WHERE uuid IS NULL OR uuid = '' LIMIT 5000`)
          .all();
        if (rowsWithoutUuid.length > 0) {
          const updateStmt = dbInstance.prepare(`UPDATE ${table} SET uuid = ? WHERE id = ?`);
          for (const row of rowsWithoutUuid) {
            updateStmt.run(crypto.randomUUID(), row.id);
          }
        }
      } catch {}
    }
  })();

  // فحص سلامة وتكامل المفاتيح الأجنبية
  try {
    const fkIssues = dbInstance.prepare('PRAGMA foreign_key_check').all();
    if (fkIssues.length > 0) {
      console.warn('[DB] تنبيه تكامل المفاتيح الأجنبية:', fkIssues);
    }
  } catch {}
}

module.exports = {
  migrateUIConfigTables,
  migrateOnboardingTables,
  migrateCloudSyncV3,
};

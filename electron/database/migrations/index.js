const { db, DATABASE_SCHEMA_VERSION } = require('../connection');
const { initDatabase } = require('../initDatabase');
const {
  migrateSalesTable,
  migrateUsersTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateCashierAuditLogsTable,
  migrateRevokedTokens,
} = require('./core');
const {
  migrateReviewsTables,
  migrateLeaveRequestsTable,
  migrateShiftsTable,
  migrateCommissionsTables,
} = require('./hr');
const {
  migrateSuppliersTable,
  migrateReturnsTable,
  migrateCustomersTable,
  migrateOrdersTables,
  migrateInventoryWarehouses,
  migrateChannelsTables,
  migrateGroceryTables,
  migrateKitchenOrdersV5,
} = require('./commerce');
const {
  migrateAppointmentsTables,
  migrateSubscriptionsTables,
} = require('./services');
const {
  migrateCRMTables,
  migrateAdvancedCRMTables,
  migrateCRMFieldsAndValues,
  migrateDailyMessages,
} = require('./crm');
const {
  migrateCasesTables,
  migrateLegalCaseTasks,
  migrateLegalClientInteractions,
  migrateCustomerPowerOfAttorneyTables,
  migrateCourtsTables,
  migrateLegalCaseArchiveFinance,
} = require('./legal');
const {
  migrateUIConfigTables,
  migrateOnboardingTables,
  migrateCloudSyncV3,
} = require('./platform');
const { ensureSalesLedgerGuards, backfillSaleItemCosts } = require('./salesLedger');
const { ensureKitchenLedger } = require('./kitchenLedger');
const { ensureDiningTables, allowSplitPayments } = require('./diningTables');
const { ensureRecipes } = require('./recipes');
const { ensureProductLedger } = require('./productLedger');
const { ensureSyncMetadata, ensureDeleteTombstones } = require('./syncMetadata');
const { addColumnIfMissing } = require('./helpers');

function runAllMigrations(dbInstance = db) {
  const currentVersion = dbInstance.pragma('user_version', { simple: true }) || 0;

  if (currentVersion >= DATABASE_SCHEMA_VERSION) {
    // قاعدة البيانات محدثة بالفعل للإصدار المستهدف، تخطي الترحيلات لتسريع إقلاع التطبيق
    return;
  }

  console.log(`[DB] بدء فحص وترقية قاعدة البيانات (الإصدار الحالي: ${currentVersion} -> المستهدف: ${DATABASE_SCHEMA_VERSION})...`);

  // إذا كانت قاعدة بيانات جديدة أو قديمة بدون schema، قم بتهيئتها
  initDatabase();

  // ترحيلات الإصدارات السابقة (v1 -> v2)
  if (currentVersion < 2) {
    const migrations = [
      ['migrateSalesTable', migrateSalesTable],
      ['migrateUsersTable', migrateUsersTable],
      ['migrateReviewsTables', migrateReviewsTables],
      ['migrateLeaveRequestsTable', migrateLeaveRequestsTable],
      ['migrateReturnsTable', migrateReturnsTable],
      ['migrateSuppliersTable', migrateSuppliersTable],
      ['migrateShiftsTable', migrateShiftsTable],
      ['migrateSettingsTable', migrateSettingsTable],
      ['migrateNotificationsTable', migrateNotificationsTable],
      ['migrateCustomersTable', migrateCustomersTable],
      ['migrateOrdersTables', migrateOrdersTables],
      ['migrateAppointmentsTables', migrateAppointmentsTables],
      ['migrateSubscriptionsTables', migrateSubscriptionsTables],
      ['migrateCommissionsTables', migrateCommissionsTables],
      ['migrateCRMTables', migrateCRMTables],
      ['migrateCashierAuditLogsTable', migrateCashierAuditLogsTable],
      ['migrateInventoryWarehouses', migrateInventoryWarehouses],
      ['migrateChannelsTables', migrateChannelsTables],
      ['migrateUIConfigTables', migrateUIConfigTables],
      ['migrateOnboardingTables', migrateOnboardingTables],
      ['migrateGroceryTables', migrateGroceryTables],
      ['migrateCasesTables', () => migrateCasesTables(dbInstance)],
    ];

    for (const [name, fn] of migrations) {
      try {
        fn();
      } catch (err) {
        err.message = `[${name}] ${err.message}`;
        throw err;
      }
    }
    dbInstance.pragma('user_version = 2');
  }

  // ترقية الإصدار 3 (أعمدة المزامنة السحابية ومعرفات UUID وفهارس الأداء)
  if (currentVersion < 3) {
    migrateCloudSyncV3(dbInstance);
    dbInstance.pragma('user_version = 3');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 3 (دعم المزامنة ومعرفات UUID).');
  }

  if (currentVersion < 4) {
    migrateShiftsTable();
    dbInstance.pragma('user_version = 4');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 4 (ربط الوردية بسجل الحضور).');
  }

  if (currentVersion < 5) {
    migrateKitchenOrdersV5(dbInstance);
    dbInstance.pragma('user_version = 5');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 5 (أوضاع طلبات المطاعم وحالة المطبخ).');
  }

  if (currentVersion < 6) {
    migrateAdvancedCRMTables(dbInstance);
    dbInstance.pragma('user_version = 6');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 6 (وحدات CRM المتقدمة).');
  }

  if (currentVersion < 7) {
    migrateCourtsTables(dbInstance);
    dbInstance.pragma('user_version = 7');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 7 (دليل المحاكم).');
  }

  if (currentVersion < 8) {
    migrateLegalCaseArchiveFinance(dbInstance);
    dbInstance.pragma('user_version = 8');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 8 (أرشيف وماليات القضايا).');
  }

  if (currentVersion < 9) {
    migrateCustomerPowerOfAttorneyTables(dbInstance);
    dbInstance.pragma('user_version = 9');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 9 (توكيلات الموكلين).');
  }

  if (currentVersion < 10) {
    migrateLegalClientInteractions(dbInstance);
    dbInstance.pragma('user_version = 10');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 10 (سجل تواصل قانوني مستقل).');
  }

  if (currentVersion < 11) {
    migrateLegalCaseTasks(dbInstance);
    dbInstance.pragma('user_version = 11');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 11 (مهام ومتابعات القضايا).');
  }

  if (currentVersion < 12) {
    migrateRevokedTokens(dbInstance);
    dbInstance.pragma('user_version = 12');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 12 (حفظ الجلسات الملغاة).');
  }

  if (currentVersion < 13) {
    // Inventory got its own permissions (view/transfer/adjust/manage) instead of
    // riding on products.edit. Existing roles keep read-only access to the screen;
    // write access must be granted explicitly by the owner.
    dbInstance.prepare(`
      INSERT OR IGNORE INTO role_permissions (role_key, permission_key)
      SELECT role_key, 'inventory.view' FROM role_permissions WHERE permission_key = 'products.view'
    `).run();
    dbInstance.pragma('user_version = 13');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 13 (صلاحيات المخزون المستقلة).');
  }

  if (currentVersion < 14) {
    // Sales, sale lines and returns become append-only, and each sale line keeps
    // its own unit cost so past profit no longer follows today's purchase price.
    ensureSalesLedgerGuards(dbInstance);
    backfillSaleItemCosts(dbInstance);
    dbInstance.pragma('user_version = 14');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 14 (قفل سجل المبيعات وتثبيت التكلفة).');
  }

  if (currentVersion < 15) {
    // Kitchen status changes are recorded and can only move one step at a time.
    ensureKitchenLedger(dbInstance);
    dbInstance.pragma('user_version = 15');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 15 (سجل حركة المطبخ).');
  }

  if (currentVersion < 16) {
    // Product changes get an append-only history and prices must be numbers.
    // Cashiers can now open the catalog read-only (they already sell from it).
    ensureProductLedger(dbInstance);
    dbInstance.pragma('user_version = 16');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 16 (سجل تعديلات المنتجات).');
  }

  if (currentVersion < 17) {
    // Cashier and branch-manager roles get what their daily work needs (cashiers
    // could not open their own shift; managers could not edit products).
    // Only adds rights; anything the owner granted or removed elsewhere stays.
    const { CASHIER_PERMISSIONS, MANAGER_PERMISSIONS } = require('../../services/enterprise/defaults');
    const hasRoles = dbInstance.prepare(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'role_permissions'"
    ).get();
    if (hasRoles) {
      const grant = dbInstance.prepare(`
        INSERT OR IGNORE INTO role_permissions (role_key, permission_key)
        SELECT ?, ? WHERE EXISTS (SELECT 1 FROM system_roles WHERE role_key = ?)
      `);
      dbInstance.transaction(() => {
        for (const permission of CASHIER_PERMISSIONS) grant.run('cashier', permission, 'cashier');
        for (const permission of MANAGER_PERMISSIONS) grant.run('manager', permission, 'manager');
      })();
    }
    dbInstance.pragma('user_version = 17');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 17 (صلاحيات الكاشير ومدير الفرع).');
  }

  if (currentVersion < 18) {
    // Every syncable row gets a cross-device uuid and an updated_at that the
    // database keeps current by itself (the v3 columns were never filled).
    ensureSyncMetadata(dbInstance);
    dbInstance.pragma('user_version = 18');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 18 (معرفات المزامنة وتاريخ آخر تعديل).');
  }

  if (currentVersion < 19) {
    // Restaurant tables: an open check per table, sent to the kitchen in rounds.
    ensureDiningTables(dbInstance);
    dbInstance.pragma('user_version = 19');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 19 (طاولات المطعم والحسابات المفتوحة).');
  }

  if (currentVersion < 20) {
    // Item add-ons: each sold or sent line keeps a JSON copy of its add-ons.
    addColumnIfMissing('sale_items', 'modifiers', 'TEXT', dbInstance);
    addColumnIfMissing('table_tab_items', 'modifiers', 'TEXT', dbInstance);
    dbInstance.pragma('user_version = 20');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 20 (إضافات الأصناف).');
  }

  if (currentVersion < 21) {
    // A free note per line ("no onion, well done") for the kitchen ticket.
    addColumnIfMissing('sale_items', 'note', 'TEXT', dbInstance);
    addColumnIfMissing('table_tab_items', 'note', 'TEXT', dbInstance);
    dbInstance.pragma('user_version = 21');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 21 (ملاحظة الصنف للمطبخ).');
  }

  if (currentVersion < 22) {
    // Recipes: selling a menu item takes its ingredients out of stock.
    ensureRecipes(dbInstance);
    dbInstance.pragma('user_version = 22');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 22 (وصفات الأصناف وخصم المكونات).');
  }

  if (currentVersion < 23) {
    // Dine-in service charge / delivery fee (part of total_amount) and the delivery address.
    addColumnIfMissing('sales', 'service_charge', 'REAL NOT NULL DEFAULT 0 CHECK(service_charge >= 0)', dbInstance);
    addColumnIfMissing('sales', 'delivery_address', 'TEXT', dbInstance);
    dbInstance.pragma('user_version = 23');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 23 (رسوم الخدمة وبيانات التوصيل).');
  }

  if (currentVersion < 24) {
    // Split checks: each table line remembers the sale that paid it.
    allowSplitPayments(dbInstance);
    dbInstance.pragma('user_version = 24');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 24 (تقسيم فاتورة الطاولة).');
  }

  if (currentVersion < 25) {
    migrateCRMFieldsAndValues(dbInstance);
    dbInstance.pragma('user_version = 25');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 25 (قوائم اختيار للحقول المخصصة وقيمة العميل المحتمل وسبب الخسارة).');
  }

  if (currentVersion < 26) {
    migrateDailyMessages(dbInstance);
    dbInstance.pragma('user_version = 26');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 26 (رسائل اليوم).');
  }

  // Earlier steps may rebuild the sales tables; make sure the guards exist at the end.
  ensureSalesLedgerGuards(dbInstance);
  ensureKitchenLedger(dbInstance);
  ensureProductLedger(dbInstance);
  ensureDeleteTombstones(dbInstance);
}

module.exports = { runAllMigrations };

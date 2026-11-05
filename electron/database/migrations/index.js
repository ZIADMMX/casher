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

  // Earlier steps may rebuild the sales tables; make sure the guards exist at the end.
  ensureSalesLedgerGuards(dbInstance);
  ensureKitchenLedger(dbInstance);
}

module.exports = { runAllMigrations };

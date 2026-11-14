const { db, DATABASE_SCHEMA_VERSION } = require('../connection');
const { initDatabase } = require('../initDatabase');
const {
  migrateSalesTable,
  migrateUsersTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateNotificationReads,
  migrateCashierAuditLogsTable,
  migrateRevokedTokens,
} = require('./core');
const {
  migrateReviewsTables,
  migrateLeaveRequestsTable,
  migrateShiftsTable,
  migrateCommissionsTables,
  migratePayrollRules,
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
const { ensureEInvoice } = require('./einvoice');
const { ensurePrivacyConsent } = require('./privacy');
const { ensureWorkshopTickets } = require('./workshop');
const { ensureProductLedger } = require('./productLedger');
const { ensureSyncMetadata, ensureDeleteTombstones } = require('./syncMetadata');
const { ensureWebhooks } = require('./webhooks');
const { ensureGymTraining } = require('./gym');
const { addColumnIfMissing } = require('./helpers');

// The v1 -> v2 upgrade steps. Every one checks before it alters, so re-running is safe.
function runLegacyMigrations(dbInstance = db) {
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
}

// Columns the app reads unconditionally. user_version can say "current" while one is missing
// (a restored or copied database file skipped the v1 -> v2 steps), and a missing one breaks
// shifts:getCurrent and selling with "no such column". One sentinel per legacy step.
const LEGACY_SCHEMA_SENTINELS = [
  ['sales', 'invoice_number'],
  ['returns', 'shift_id'],
  ['customer_payments', 'shift_id'],
  ['orders', 'vehicle_plate'],
  ['packages', 'is_active'],
  ['crm_interactions', 'reminder_sent_at'],
  ['onboarding_presets', 'starter_working_hours_json'],
];

function findLegacySchemaDrift(dbInstance = db) {
  return LEGACY_SCHEMA_SENTINELS.filter(([table, column]) => (
    !dbInstance.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column)
  ));
}

function describeDrift(drift) {
  return drift.map(([table, column]) => `${table}.${column}`).join(', ');
}

function repairLegacySchemaDrift(dbInstance = db) {
  const drift = findLegacySchemaDrift(dbInstance);
  if (drift.length === 0) return;
  console.warn(`[DB] نقص في أعمدة قاعدة البيانات: ${describeDrift(drift)}`);

  // Safety copy first; the repair itself only adds missing columns and tables.
  const file = dbInstance.name;
  if (file && file !== ':memory:') {
    try {
      const backup = `${file}.pre-schema-repair-${Date.now()}.bak`;
      dbInstance.exec(`VACUUM INTO '${backup.replace(/'/g, "''")}'`);
    } catch (err) {
      console.warn('[DB] تعذر أخذ نسخة احتياطية قبل إصلاح الأعمدة:', err.message);
    }
  }

  runLegacyMigrations(dbInstance);
  // No legacy step adds these two; fresh installs get them from schema.sql (e-invoice reads them).
  addColumnIfMissing('sales', 'invoice_number', 'TEXT', dbInstance);
  addColumnIfMissing('sales', 'notes', 'TEXT', dbInstance);

  const left = findLegacySchemaDrift(dbInstance);
  if (left.length > 0) console.error(`[DB] ما زال ينقص بعد الإصلاح: ${describeDrift(left)}`);
  else console.log('[DB] تم إصلاح أعمدة قاعدة البيانات الناقصة.');
}

function runAllMigrations(dbInstance = db) {
  const currentVersion = dbInstance.pragma('user_version', { simple: true }) || 0;

  if (currentVersion >= DATABASE_SCHEMA_VERSION) {
    // محدثة بالفعل للإصدار المستهدف: لا ترحيلات، فقط فحص سريع للأعمدة الأساسية
    repairLegacySchemaDrift(dbInstance);
    return;
  }

  console.log(`[DB] بدء فحص وترقية قاعدة البيانات (الإصدار الحالي: ${currentVersion} -> المستهدف: ${DATABASE_SCHEMA_VERSION})...`);

  // إذا كانت قاعدة بيانات جديدة أو قديمة بدون schema، قم بتهيئتها
  initDatabase();

  // ترحيلات الإصدارات السابقة (v1 -> v2)
  if (currentVersion < 2) {
    runLegacyMigrations(dbInstance);
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

  if (currentVersion < 27) {
    migratePayrollRules(dbInstance);
    dbInstance.pragma('user_version = 27');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 27 (أقساط السلف وبدل المواصلات وطريقة صرف المسير).');
  }

  if (currentVersion < 28) {
    // مواعيد الطعن والمدد القانونية: أعمدة جديدة على جدول مهام القضايا.
    migrateLegalCaseTasks(dbInstance);
    dbInstance.pragma('user_version = 28');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 28 (مواعيد الطعن والمدد القانونية).');
  }

  if (currentVersion < 29) {
    // طابور الفاتورة الإلكترونية (مصلحة الضرائب) وكود الصنف لدى المصلحة.
    ensureEInvoice(dbInstance);
    dbInstance.pragma('user_version = 29');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 29 (الفاتورة الإلكترونية).');
  }

  if (currentVersion < 30) {
    // الإيصال الإلكتروني: نوع المستند وسلسلة uuid على نفس الطابور.
    ensureEInvoice(dbInstance);
    dbInstance.pragma('user_version = 30');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 30 (الإيصال الإلكتروني).');
  }

  if (currentVersion < 31) {
    // موافقة الواتساب ونسخة سياسة الخصوصية اللي العميل وافق عليها.
    ensurePrivacyConsent(dbInstance);
    dbInstance.pragma('user_version = 31');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 31 (موافقات حماية البيانات).');
  }

  if (currentVersion < 32) {
    // مستند المرتجع (إشعار خصم / إيصال استرداد): مستند تاني على نفس المبيعة،
    // فقيد الطابور بقى على (sale_id, return_id).
    ensureEInvoice(dbInstance);
    dbInstance.pragma('user_version = 32');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 32 (مستندات المرتجعات).');
  }

  if (currentVersion < 33) {
    // تذكرة الورشة بقت تتحصّل في الكاشير: سيريال الجهاز والتكلفة والضمان
    // والفاتورة اللي اتحصّلت بيها.
    ensureWorkshopTickets(dbInstance);
    dbInstance.pragma('user_version = 33');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 33 (تحصيل تذاكر الورشة وضمان الإصلاح).');
  }

  if (currentVersion < 34) {
    // ملف الموكل، مواعيد عمل المحكمة، ونتيجة الحكم: أعمدة اتضافت لخطوات v7/v10
    // فقواعد البيانات اللي عدّت الخطوات دي مكانتش بتاخدها. الدالتين آمنين للتكرار.
    migrateCourtsTables(dbInstance);
    migrateLegalClientInteractions(dbInstance);
    dbInstance.pragma('user_version = 34');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 34 (ملف الموكل ومواعيد المحاكم ونتيجة الحكم).');
  }

  if (currentVersion < 35) {
    // حالة "مقروء" لكل مستخدم في الإشعارات العامة، ومفتاح يمنع تكرار نفس التنبيه.
    migrateNotificationReads(dbInstance);
    dbInstance.pragma('user_version = 35');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 35 (حالة قراءة الإشعارات لكل مستخدم).');
  }

  if (currentVersion < 36) {
    // أعمدة تجميد الاشتراك المؤقت وترقية الباقة (frozen_until و upgraded_from_id) اتضافت في آخر
    // الدالة فقط، وقواعد البيانات اللي على v35 كانت بتخرج بدري ومكانتش بتاخدها.
    ensureGymTraining(dbInstance);
    dbInstance.pragma('user_version = 36');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 36 (تجميد مؤقت وترقية باقات الجيم).');
  }

  if (currentVersion < 37) {
    // جدول أكواد QR العشوائية لأعضاء الجيم (gym_member_codes).
    ensureGymTraining(dbInstance);
    dbInstance.pragma('user_version = 37');
    console.log('[DB] تمت ترقية قاعدة البيانات بنجاح إلى الإصدار 37 (أكواد QR فريدة لأعضاء الجيم).');
  }

  // Earlier steps may rebuild the sales tables; make sure the guards exist at the end.
  ensureSalesLedgerGuards(dbInstance);
  ensureKitchenLedger(dbInstance);
  ensureProductLedger(dbInstance);
  ensureDeleteTombstones(dbInstance);
  ensureWebhooks(dbInstance);
  ensureGymTraining(dbInstance);
}

module.exports = { runAllMigrations, findLegacySchemaDrift, repairLegacySchemaDrift };

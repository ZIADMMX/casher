// Public entry point for the local SQLite database.
// The connection lives in connection.js, the base schema in initDatabase.js,
// and the versioned upgrades in migrations/ (runAllMigrations is in migrations/index.js).
const { db, dbPath, configureDatabaseConnection, checkpointWalIfNeeded, closeDatabase } = require('./connection');
const { initDatabase } = require('./initDatabase');
const { runAllMigrations } = require('./migrations');
const {
  migrateSalesTable,
  migrateUsersTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateCashierAuditLogsTable,
  migrateRevokedTokens,
} = require('./migrations/core');
const {
  migrateReviewsTables,
  migrateLeaveRequestsTable,
  migrateShiftsTable,
  migrateCommissionsTables,
} = require('./migrations/hr');
const {
  migrateSuppliersTable,
  migrateReturnsTable,
  migrateCustomersTable,
  migrateOrdersTables,
  migrateInventoryWarehouses,
  migrateChannelsTables,
  migrateGroceryTables,
  migrateKitchenOrdersV5,
} = require('./migrations/commerce');
const {
  migrateAppointmentsTables,
  migrateSubscriptionsTables,
} = require('./migrations/services');
const {
  migrateCRMTables,
  migrateAdvancedCRMTables,
} = require('./migrations/crm');
const {
  migrateCasesTables,
  migrateLegalCaseTasks,
  migrateLegalClientInteractions,
  migrateCustomerPowerOfAttorneyTables,
  migrateCourtsTables,
  migrateLegalCaseArchiveFinance,
} = require('./migrations/legal');
const {
  migrateUIConfigTables,
  migrateOnboardingTables,
  migrateCloudSyncV3,
} = require('./migrations/platform');

module.exports = {
  db,
  configureDatabaseConnection,
  checkpointWalIfNeeded,
  initDatabase,
  runAllMigrations,
  migrateCloudSyncV3,
  migrateSalesTable,
  migrateUsersTable,
  migrateReviewsTables,
  migrateLeaveRequestsTable,
  migrateSuppliersTable,
  migrateShiftsTable,
  migrateKitchenOrdersV5,
  migrateReturnsTable,
  migrateSettingsTable,
  migrateNotificationsTable,
  migrateCustomersTable,
  migrateOrdersTables,
  migrateAppointmentsTables,
  migrateLegalCaseTasks,
  migrateRevokedTokens,
  migrateSubscriptionsTables,
  migrateCommissionsTables,
  migrateCRMTables,
  migrateAdvancedCRMTables,
  migrateCourtsTables,
  migrateLegalCaseArchiveFinance,
  migrateCustomerPowerOfAttorneyTables,
  migrateLegalClientInteractions,
  migrateCashierAuditLogsTable,
  migrateInventoryWarehouses,
  migrateChannelsTables,
  migrateUIConfigTables,
  migrateOnboardingTables,
  migrateGroceryTables,
  migrateCasesTables,
  closeDatabase,
  dbPath
};

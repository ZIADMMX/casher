// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Backups; Store Settings & System Customization & Backup
import { bridgeMethod } from './bridge.js';

export const backupNow = bridgeMethod('backupNow');
export const restoreBackup = bridgeMethod('restoreBackup');
export const getSettings = bridgeMethod('getSettings');
export const saveSettings = bridgeMethod('saveSettings');
export const backupDatabase = bridgeMethod('backupDatabase');
export const restoreDatabase = bridgeMethod('restoreDatabase');
export const uploadStoreLogo = bridgeMethod('uploadStoreLogo');
export const getCloudSyncStatus = bridgeMethod('getCloudSyncStatus');
export const configureCloudSync = bridgeMethod('configureCloudSync');
export const syncCloudNow = bridgeMethod('syncCloudNow');

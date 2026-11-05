// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Cashier & User Audit Trail System
import { bridgeMethod } from './bridge.js';

export const getAuditLogs = bridgeMethod('getAuditLogs');
export const getCashierAuditSummary = bridgeMethod('getCashierAuditSummary');
export const logClientAuditAction = bridgeMethod('logClientAuditAction');

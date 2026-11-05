// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Commissions & Incentives Engine
import { bridgeMethod } from './bridge.js';

export const getAllCommissionRules = bridgeMethod('getAllCommissionRules');
export const createCommissionRule = bridgeMethod('createCommissionRule');
export const updateCommissionRule = bridgeMethod('updateCommissionRule');
export const toggleCommissionRule = bridgeMethod('toggleCommissionRule');
export const deleteCommissionRule = bridgeMethod('deleteCommissionRule');
export const getAllCommissionEarnings = bridgeMethod('getAllCommissionEarnings');
export const payoutCommissionEarnings = bridgeMethod('payoutCommissionEarnings');
export const getCommissionSummary = bridgeMethod('getCommissionSummary');

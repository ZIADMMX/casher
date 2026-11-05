// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Subscriptions & Packages
import { bridgeMethod } from './bridge.js';

export const getAllPackages = bridgeMethod('getAllPackages');
export const createPackage = bridgeMethod('createPackage');
export const updatePackage = bridgeMethod('updatePackage');
export const deletePackage = bridgeMethod('deletePackage');
export const getAllSubscriptions = bridgeMethod('getAllSubscriptions');
export const getActiveSubscriptionByCustomer = bridgeMethod('getActiveSubscriptionByCustomer');
export const subscribeCustomer = bridgeMethod('subscribeCustomer');
export const consumeSubscriptionCredit = bridgeMethod('consumeSubscriptionCredit');
export const freezeSubscription = bridgeMethod('freezeSubscription');
export const unfreezeSubscription = bridgeMethod('unfreezeSubscription');
export const renewSubscription = bridgeMethod('renewSubscription');
export const getSubscriptionStats = bridgeMethod('getSubscriptionStats');

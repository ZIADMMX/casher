const { safeHandle } = require('./safeHandle');
const subscriptionsService = require('../services/subscriptions.service');

function registerSubscriptionsHandlers() {
  safeHandle('subscriptions:getAllPackages', () => {
    return subscriptionsService.getAllPackages();
  });

  safeHandle('subscriptions:createPackage', (event, packageData) => {
    return subscriptionsService.createPackage(packageData);
  });

  safeHandle('subscriptions:updatePackage', (event, payload) => {
    const { id, packageData } = payload || {};
    return subscriptionsService.updatePackage(id, packageData);
  });

  safeHandle('subscriptions:deletePackage', (event, packageId) => {
    return subscriptionsService.deletePackage(packageId);
  });

  safeHandle('subscriptions:getAll', (event, filters) => {
    return subscriptionsService.getAllSubscriptions(filters);
  });

  safeHandle('subscriptions:getActiveByCustomer', (event, customerId) => {
    return subscriptionsService.getActiveSubscriptionByCustomer(customerId);
  });

  safeHandle('subscriptions:subscribeCustomer', (event, data) => {
    return subscriptionsService.subscribeCustomer(data, {});
  });

  safeHandle('subscriptions:consumeCredit', (event, payload) => {
    const { subscriptionId, creditsDeducted, saleId, notes } = payload || {};
    return subscriptionsService.consumeCredit(subscriptionId, creditsDeducted, {}, saleId, notes);
  });

  safeHandle('subscriptions:freeze', (event, payload) => {
    const { subscriptionId, reason } = payload || {};
    return subscriptionsService.freezeSubscription(subscriptionId, reason, {});
  });

  safeHandle('subscriptions:unfreeze', (event, subscriptionId) => {
    return subscriptionsService.unfreezeSubscription(subscriptionId, {});
  });

  safeHandle('subscriptions:renew', (event, subscriptionId) => {
    return subscriptionsService.renewSubscription(subscriptionId, {});
  });

  safeHandle('subscriptions:getStats', () => {
    return subscriptionsService.getSubscriptionStats();
  });
}

module.exports = { registerSubscriptionsHandlers };

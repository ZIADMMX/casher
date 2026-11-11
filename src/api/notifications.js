// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Real-time Notifications System
import { bridgeMethod } from './bridge.js';

export const getNotifications = bridgeMethod('getNotifications');
export const getUnreadNotificationsCount = bridgeMethod('getUnreadNotificationsCount');
export const markNotificationAsRead = bridgeMethod('markNotificationAsRead');
export const markAllNotificationsAsRead = bridgeMethod('markAllNotificationsAsRead');
export const clearAllNotifications = bridgeMethod('clearAllNotifications');
export const onNotificationReceived = bridgeMethod('onNotificationReceived');
export const onNotificationClicked = bridgeMethod('onNotificationClicked');

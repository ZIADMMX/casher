// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// Authentication & Recovery
import { bridgeMethod } from './bridge.js';

export const isSetupRequired = bridgeMethod('isSetupRequired');
export const createInitialAdmin = bridgeMethod('createInitialAdmin');
export const login = bridgeMethod('login');
export const logout = bridgeMethod('logout');
export const getSession = bridgeMethod('getSession');
export const refreshSession = bridgeMethod('refreshSession');
export const updateProfile = bridgeMethod('updateProfile');
export const getMyProfile = bridgeMethod('getMyProfile');
export const saveMyProfile = bridgeMethod('saveMyProfile');
export const changePassword = bridgeMethod('changePassword');
export const getRecoveryChallenge = bridgeMethod('getRecoveryChallenge');
export const resetAdminPasswordWithRecoveryKey = bridgeMethod('resetAdminPasswordWithRecoveryKey');
export const resetAdminPasswordWithChallenge = bridgeMethod('resetAdminPasswordWithChallenge');

// GENERATED from electron/preload.js by scripts/generate-renderer-api.js. Do not edit by hand.
// License & Software Activation
import { bridgeMethod } from './bridge.js';

export const getLicenseStatus = bridgeMethod('getLicenseStatus');
export const activateSoftware = bridgeMethod('activateSoftware');
export const onLicenseStatusChanged = bridgeMethod('onLicenseStatusChanged');
export const onLicenseVerificationFailed = bridgeMethod('onLicenseVerificationFailed');

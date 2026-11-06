// Throwaway Ed25519 key pair for tests. Require this before the license or auth
// services: it points FOX_LICENSE_PUBLIC_KEY (honoured only under NODE_ENV=test)
// at a key the tests can sign with, so no test needs the vendor's private key.
const crypto = require('node:crypto');
const { signLicenseKey, signRecoveryResponse } = require('../../electron/security/licenseSigning');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
process.env.FOX_LICENSE_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

module.exports = {
  privateKey,
  generateLicenseKey: ({ hwid, expiryTimestamp }) => signLicenseKey({ hwid, expiryTimestamp, privateKey }),
  generateDeveloperRecoveryOtp: (challengeCode) => signRecoveryResponse(challengeCode, privateKey),
};

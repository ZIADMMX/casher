// Fake license time server for tests: signs answers with a throwaway key that
// FOX_TIME_PUBLIC_KEY (honoured only under NODE_ENV=test) points the app at.
const crypto = require('node:crypto');
const { TIME_DOMAIN } = require('../../electron/security/licenseSigning');

const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
process.env.FOX_TIME_PUBLIC_KEY = publicKey.export({ format: 'der', type: 'spki' }).toString('base64');

function signAnswer({ utc, trialStart, device, nonce, key = privateKey }) {
  const sig = crypto.sign(null, Buffer.from(`${TIME_DOMAIN}${utc}|${device}|${nonce}|${trialStart}`), key).toString('base64');
  return { utc, trialStart, sig };
}

/** fetch mock that answers like license-server/src/index.js for the request's device and nonce. */
function signedFetch({ utc, trialStart = Date.parse(utc), key } = {}) {
  return async (url) => {
    const params = new URL(String(url)).searchParams;
    const body = signAnswer({ utc, trialStart, device: params.get('device'), nonce: params.get('nonce'), key });
    return { ok: true, json: async () => body };
  };
}

module.exports = { signAnswer, signedFetch };

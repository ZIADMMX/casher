const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

// The vendor's signing key lives outside the repository. Override the location
// with FOX_LICENSE_PRIVATE_KEY_FILE (for example a mounted encrypted drive).
function privateKeyPath() {
  return process.env.FOX_LICENSE_PRIVATE_KEY_FILE
    || path.join(os.homedir(), '.foxcloud', 'license-signing-key.pem');
}

function readPrivateKey() {
  const file = privateKeyPath();
  if (!fs.existsSync(file)) {
    throw new Error(`مفتاح التوقيع غير موجود في ${file}. شغّل: node scripts/license-init.js`);
  }
  return fs.readFileSync(file);
}

module.exports = { privateKeyPath, readPrivateKey };

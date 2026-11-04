const path = require('node:path');
require('dotenv').config({ path: path.resolve(__dirname, '..', '.env') });

const endpoint = String(process.env.FOX_LICENSE_TIME_URL || '').trim();
if (!endpoint) {
  throw new Error('Set FOX_LICENSE_TIME_URL to your deployed HTTPS /api/license/time endpoint before packaging.');
}

let parsed;
try {
  parsed = new URL(endpoint);
} catch {
  throw new Error('FOX_LICENSE_TIME_URL must be a valid HTTPS URL.');
}

if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.search || parsed.hash) {
  throw new Error('FOX_LICENSE_TIME_URL must use HTTPS and must not contain credentials, query, or hash.');
}

if (parsed.pathname !== '/api/license/time') {
  throw new Error('FOX_LICENSE_TIME_URL must use the /api/license/time path.');
}

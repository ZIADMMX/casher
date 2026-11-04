const DEFAULT_ALLOWED_ORIGINS = [
  'null',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5174',
];

const DEFAULT_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
const DEFAULT_HEADERS = 'Content-Type, Authorization, X-Requested-With, X-Branch-Warehouse-Id';

function getAllowedOrigins() {
  const configuredOrigins = (process.env.CORS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return new Set([...DEFAULT_ALLOWED_ORIGINS, ...configuredOrigins]);
}

function applyCorsPolicy(req, res, { methods = DEFAULT_METHODS, headers = DEFAULT_HEADERS } = {}) {
  const origin = req.headers.origin;
  const vary = res.getHeader('Vary');
  const varyValues = String(vary || '')
    .split(',')
    .map((value) => value.trim().toLowerCase());

  if (!varyValues.includes('origin')) {
    res.setHeader('Vary', vary ? `${vary}, Origin` : 'Origin');
  }

  if (origin && !getAllowedOrigins().has(origin)) {
    return false;
  }

  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', methods);
    res.setHeader('Access-Control-Allow-Headers', headers);
    res.writeHead(204);
    res.end();
    return true;
  }

  return true;
}

module.exports = {
  applyCorsPolicy,
};

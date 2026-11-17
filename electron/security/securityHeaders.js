// Headers every API response carries, and the one place that decides "production".
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'no-referrer',
  'Cache-Control': 'no-store',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cross-Origin-Resource-Policy': 'same-origin',
};

// Anything that is not explicitly development or test counts as production.
function isProduction() {
  return !['development', 'test'].includes(process.env.NODE_ENV);
}

function applySecurityHeaders(res) {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
}

module.exports = { SECURITY_HEADERS, isProduction, applySecurityHeaders };

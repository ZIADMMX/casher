const tls = require('node:tls');
const https = require('node:https');
const net = require('node:net');

// Certificate pinning for the LAN server: terminals trust exactly the certificate
// whose SHA-256 fingerprint the user confirmed, instead of installing the server
// certificate (a CA) into the operating system trust store.

const FINGERPRINT_PATTERN = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

function normalizeFingerprint(value) {
  const hex = String(value || '').toUpperCase().replace(/[^0-9A-F]/g, '');
  if (hex.length !== 64) return '';
  return hex.match(/.{2}/g).join(':');
}

function isValidFingerprint(value) {
  return FINGERPRINT_PATTERN.test(String(value || ''));
}

function toPem(raw) {
  const body = raw.toString('base64').match(/.{1,64}/g).join('\n');
  return `-----BEGIN CERTIFICATE-----\n${body}\n-----END CERTIFICATE-----\n`;
}

function serverName(hostname) {
  return net.isIP(hostname) ? undefined : hostname;
}

/**
 * Read the server certificate without trusting it yet (trust on first use).
 * The caller must show the fingerprint to the user for comparison before pinning it.
 */
function fetchServerCertificate(baseUrl, timeoutMs = 3000) {
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:') return Promise.reject(new Error('اتصال الأجهزة يتطلب HTTPS'));
  return new Promise((resolve, reject) => {
    const socket = tls.connect({
      host: url.hostname,
      port: Number(url.port) || 443,
      servername: serverName(url.hostname),
      // Verification happens through the fingerprint the user confirms, not a CA.
      rejectUnauthorized: false,
      timeout: timeoutMs,
    });
    socket.once('secureConnect', () => {
      const cert = socket.getPeerCertificate();
      socket.end();
      if (!cert?.raw) return reject(new Error('لم يرسل الخادم شهادة'));
      resolve({ fingerprint256: normalizeFingerprint(cert.fingerprint256), pem: toPem(cert.raw) });
    });
    socket.once('timeout', () => {
      socket.destroy();
      reject(new Error('انتهت مهلة الاتصال بالخادم'));
    });
    socket.once('error', (err) => reject(new Error(`فشل الاتصال: ${err.message}`)));
  });
}

/**
 * HTTPS request that only accepts the pinned certificate. Returns a minimal
 * fetch-like response: { ok, status, headers.get(), json() }.
 */
function pinnedRequest(url, { method = 'GET', headers = {}, body, timeoutMs = 5000, pin }) {
  if (!pin?.pem || !isValidFingerprint(pin.fingerprint256)) {
    return Promise.reject(new Error('لم يتم تثبيت بصمة الخادم على هذا الجهاز'));
  }
  const target = new URL(url);
  return new Promise((resolve, reject) => {
    const req = https.request(target, {
      method,
      headers,
      ca: pin.pem,
      servername: serverName(target.hostname),
      agent: false,
      timeout: timeoutMs,
      // The pinned fingerprint is the server identity; no hostname/SAN check is needed.
      checkServerIdentity: (_host, cert) => (
        normalizeFingerprint(cert.fingerprint256) === pin.fingerprint256
          ? undefined
          : new Error('بصمة شهادة الخادم تغيّرت. أعد ربط الجهاز وتحقق من البصمة على شاشة الخادم')
      ),
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          ok: res.statusCode >= 200 && res.statusCode < 300,
          status: res.statusCode,
          headers: { get: (name) => res.headers[String(name).toLowerCase()] ?? null },
          json: async () => JSON.parse(text),
        });
      });
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('انتهت مهلة الاتصال بالخادم')));
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

/**
 * Discover a server: read its certificate, then call /api/health pinned to it.
 */
async function probeServer(baseUrl, timeoutMs = 3000) {
  const pin = await fetchServerCertificate(baseUrl, timeoutMs);
  const response = await pinnedRequest(`${baseUrl}/api/health`, { timeoutMs, pin });
  if (!response.ok) throw new Error(`الخادم رد برمز خطأ: ${response.status}`);
  const serverInfo = await response.json().catch(() => ({}));
  return { serverInfo, fingerprint256: pin.fingerprint256 };
}

module.exports = {
  normalizeFingerprint,
  isValidFingerprint,
  fetchServerCertificate,
  pinnedRequest,
  probeServer,
};

/**
 * SSL Certificate Manager — Kashiear POS
 *
 * Generates a self-signed TLS certificate on first run using Node.js built-ins only
 * (zero external dependencies). Certificate is stored in userData/ssl/ and reused
 * on subsequent launches.
 *
 * Compatible with Node.js >= 22 (uses crypto.X509Certificate + generateKeyPairSync)
 * Validity: 10 years — LAN internal use only.
 */

const fs     = require('node:fs');
const path   = require('node:path');
const crypto = require('node:crypto');
const net    = require('node:net');
const os     = require('node:os');

let _certCache = null;
let _certCacheKey = null;

// ── ASN.1 / DER helpers ──────────────────────────────────────────────────────

function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x100) return Buffer.from([0x81, len]);
  return Buffer.from([0x82, (len >> 8) & 0xff, len & 0xff]);
}

function tlv(tag, value) {
  const v = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([Buffer.from([tag]), encodeLength(v.length), v]);
}

function seq(contents)  { return tlv(0x30, Buffer.concat(contents)); }
function set_(contents) { return tlv(0x31, Buffer.concat(contents)); }
function oid(hex)       { return tlv(0x06, Buffer.from(hex, 'hex')); }
function utf8str(s)     { return tlv(0x0c, Buffer.from(s, 'utf8')); }
function bitstr(buf)    { return tlv(0x03, Buffer.concat([Buffer.from([0x00]), buf])); }
function octetstr(buf)  { return tlv(0x04, buf); }
function integer(buf)   {
  // Prepend 0x00 if high bit set (positive)
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf);
  return tlv(0x02, (b[0] & 0x80) ? Buffer.concat([Buffer.from([0x00]), b]) : b);
}
function ctx(tag, contents) {
  const v = Buffer.concat(contents);
  return Buffer.concat([Buffer.from([0xa0 | tag]), encodeLength(v.length), v]);
}
function generalizedTime(d) {
  const pad = (n, w = 2) => String(n).padStart(w, '0');
  const s = `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  return tlv(0x18, Buffer.from(s, 'ascii'));
}

// OIDs
const OID_RSA          = '2a864886f70d010101'; // rsaEncryption
const OID_SHA256_RSA   = '2a864886f70d01010b'; // sha256WithRSAEncryption
const OID_SAN          = '551d11';               // subjectAltName
const OID_BASIC_CONST  = '551d13';               // basicConstraints
const OID_KEY_USAGE    = '551d0f';               // keyUsage
const OID_SKI          = '551d0e';               // subjectKeyIdentifier
const OID_EXT_KEY_USAGE = '551d25';              // extendedKeyUsage
const OID_SERVER_AUTH  = '2b06010505070301';     // id-kp-serverAuth

function buildName(cn) {
  return seq([
    set_([
      seq([
        oid('550403'),   // commonName
        utf8str(cn),
      ]),
    ]),
  ]);
}

function buildSANValue(ips, dns) {
  const parts = [];
  for (const ip of ips) {
    const bytes = ip.split('.').map(Number);
    parts.push(tlv(0x87, Buffer.from(bytes))); // iPAddress [7]
  }
  for (const d of dns) {
    parts.push(tlv(0x82, Buffer.from(d, 'ascii'))); // dNSName [2]
  }
  return octetstr(seq(parts));
}

function encodeExtensions(spkiDer, sanIps, sanDns) {
  // SubjectKeyIdentifier value = SHA-1 hash of public key BIT STRING content
  const spkiBuf   = Buffer.isBuffer(spkiDer) ? spkiDer : Buffer.from(spkiDer);
  const ski       = crypto.createHash('sha1').update(spkiBuf).digest();

  const sanExt = seq([
    oid(OID_SAN),
    buildSANValue(sanIps, sanDns),
  ]);

  const bcExt = seq([
    oid(OID_BASIC_CONST),
    tlv(0x01, Buffer.from([0xff])),   // critical = TRUE
    octetstr(seq([tlv(0x01, Buffer.from([0xff]))])), // CA:TRUE
  ]);

  const keyUsageExt = seq([
    oid(OID_KEY_USAGE),
    tlv(0x01, Buffer.from([0xff])),
    octetstr(tlv(0x03, Buffer.from([0x01, 0xa6]))),
  ]);

  const extendedKeyUsageExt = seq([
    oid(OID_EXT_KEY_USAGE),
    octetstr(seq([oid(OID_SERVER_AUTH)])),
  ]);

  const skiExt = seq([
    oid(OID_SKI),
    octetstr(tlv(0x04, ski)),
  ]);

  return ctx(3, [seq([sanExt, bcExt, keyUsageExt, extendedKeyUsageExt, skiExt])]);
}

/**
 * Build a minimal self-signed X.509 DER certificate.
 */
function buildCertDER({ publicKeyDer, privateKey, cn, notBefore, notAfter, serial, sanIps, sanDns }) {
  const spki = seq([
    seq([oid(OID_RSA), tlv(0x05, Buffer.alloc(0))]), // NULL params
    bitstr(publicKeyDer),
  ]);

  const tbsSeq = seq([
    ctx(0, [tlv(0x02, Buffer.from([0x02]))]),         // version v3
    integer(serial),
    seq([oid(OID_SHA256_RSA), tlv(0x05, Buffer.alloc(0))]),
    buildName(cn),                                     // issuer == subject
    seq([generalizedTime(notBefore), generalizedTime(notAfter)]),
    buildName(cn),
    spki,
    encodeExtensions(publicKeyDer, sanIps, sanDns),
  ]);

  // Sign TBSCertificate with SHA-256 + RSA
  const sig = crypto.sign('sha256', tbsSeq, { key: privateKey, padding: crypto.constants.RSA_PKCS1_PADDING });

  const certDer = seq([
    tbsSeq,
    seq([oid(OID_SHA256_RSA), tlv(0x05, Buffer.alloc(0))]),
    bitstr(sig),
  ]);

  return certDer;
}

function derToPem(type, der) {
  const b64 = Buffer.isBuffer(der) ? der.toString('base64') : Buffer.from(der).toString('base64');
  const lines = b64.match(/.{1,64}/g).join('\n');
  return `-----BEGIN ${type}-----\n${lines}\n-----END ${type}-----\n`;
}

function getSubjectAltNames() {
  const ips = new Set(['127.0.0.1']);
  const dns = new Set(['localhost', os.hostname()]);

  for (const interfaces of Object.values(os.networkInterfaces())) {
    for (const iface of interfaces || []) {
      if (iface.family === 'IPv4' && !iface.internal && net.isIP(iface.address) === 4) {
        ips.add(iface.address);
      }
    }
  }

  for (const host of (process.env.KASHIEAR_TLS_HOSTS || '').split(',')) {
    const value = host.trim();
    if (!value) continue;
    if (net.isIP(value) === 4) {
      ips.add(value);
    } else if (/^(?=.{1,253}$)(?!-)[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(value)) {
      dns.add(value.toLowerCase());
    } else {
      throw new Error(`اسم مضيف TLS غير صالح في KASHIEAR_TLS_HOSTS: ${value}`);
    }
  }

  return {
    ips: [...ips].sort(),
    dns: [...dns].filter(Boolean).map((value) => value.toLowerCase()).sort(),
  };
}

function certificateMatches(keyPem, certPem, sanIps, sanDns) {
  try {
    const cert = new crypto.X509Certificate(certPem);
    const keyPublic = crypto.createPublicKey(keyPem).export({ format: 'der', type: 'spki' });
    const certPublic = cert.publicKey.export({ format: 'der', type: 'spki' });
    if (!cert.ca || !keyPublic.equals(certPublic) || Date.parse(cert.validTo) <= Date.now()) return false;

    const actualNames = new Set((cert.subjectAltName || '').split(',').map((name) => name.trim()));
    return sanIps.every((ip) => actualNames.has(`IP Address:${ip}`))
      && sanDns.every((host) => actualNames.has(`DNS:${host}`));
  } catch {
    return false;
  }
}

function writePrivateFile(filePath, contents, mode) {
  const temporaryPath = `${filePath}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, contents, { encoding: 'utf8', mode, flag: 'wx' });
    fs.renameSync(temporaryPath, filePath);
  } finally {
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
  }
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns the SSL credentials { key, cert, certPath }.
 * Generates and persists a new cert if one doesn't exist yet.
 * Must be called AFTER app.getPath() is available (i.e. after app.whenReady).
 */
function getOrCreateCert(userDataPath) {
  // Allow passing userDataPath directly (useful in non-Electron contexts like api-server.js)
  let certDir;
  if (userDataPath) {
    certDir = path.join(userDataPath, 'ssl');
  } else {
    try {
      const { app } = require('electron');
      certDir = path.join(app.getPath('userData'), 'ssl');
    } catch {
      // Fallback for non-Electron context (api-server.js standalone)
      certDir = path.join(process.env.APPDATA || process.env.HOME || '.', 'kashiear', 'ssl');
    }
  }

  const keyPath  = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.cert');
  const { ips: sanIps, dns: sanDns } = getSubjectAltNames();
  const cacheKey = `${certDir}\0${sanIps.join(',')}\0${sanDns.join(',')}`;
  if (_certCache && _certCacheKey === cacheKey) return _certCache;

  // ── Reuse existing cert ──────────────────────────────────────────
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    const key = fs.readFileSync(keyPath, 'utf8');
    const cert = fs.readFileSync(certPath, 'utf8');
    if (certificateMatches(key, cert, sanIps, sanDns)) {
      _certCache = {
        key,
        cert,
        certPath,
        fingerprint256: new crypto.X509Certificate(cert).fingerprint256,
      };
      _certCacheKey = cacheKey;
      return _certCache;
    }
    console.warn('[SSL] Existing certificate is invalid or its SAN list changed; rotating certificate.');
  }

  // ── Generate new self-signed RSA-2048 + SHA-256 cert ────────────
  console.log('[SSL] Generating self-signed certificate...');

  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });

  const publicKeyDer = publicKey.export({ type: 'pkcs1', format: 'der' });
  const serial       = crypto.randomBytes(16);
  const notBefore    = new Date(Date.now() - 5 * 60 * 1000);
  const notAfter     = new Date(notBefore.getTime() + 10 * 365.25 * 24 * 3600 * 1000); // 10 years

  const certDer = buildCertDER({
    publicKeyDer,
    privateKey,
    cn: 'kashiear-pos-lan',
    notBefore,
    notAfter,
    serial,
    sanIps,
    sanDns,
  });

  const keyPem  = privateKey.export({ type: 'pkcs8', format: 'pem' });
  const certPem = derToPem('CERTIFICATE', certDer);

  fs.mkdirSync(certDir, { recursive: true, mode: 0o700 });
  writePrivateFile(keyPath, keyPem, 0o600);
  writePrivateFile(certPath, certPem, 0o644);

  console.log(`[SSL] ✅ Certificate saved → ${certDir}`);
  console.log(`[SSL] 📋 Install the public certificate "${certPath}" in the trusted root store on cashier terminals.`);

  _certCache = {
    key: keyPem,
    cert: certPem,
    certPath,
    fingerprint256: new crypto.X509Certificate(certPem).fingerprint256,
  };
  _certCacheKey = cacheKey;
  return _certCache;
}

/** Clear the in-memory cache (useful in tests) */
function clearCertCache() {
  _certCache = null;
  _certCacheKey = null;
}

module.exports = { getOrCreateCert, clearCertCache };

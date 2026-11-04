/**
 * Unit Tests — electron/security/sslCert.js
 *
 * Covers:
 *  1. Certificate generation (first run)
 *  2. PEM format validity (key + cert headers)
 *  3. In-memory caching (second call returns same object)
 *  4. Disk persistence (cert & key files saved correctly)
 *  5. Disk reuse (loads from disk without re-generating)
 *  6. File permissions (key is written with mode 0o600)
 *  7. RSA key pair integrity (can sign + verify with generated key)
 *  8. Certificate DER structure (valid SEQUENCE tag)
 *  9. SAN extension present in cert bytes
 * 10. Concurrent calls don't generate multiple certs
 * 11. clearCertCache() forces fresh load on next call
 */

const fs     = require('node:fs');
const path   = require('node:path');
const os     = require('node:os');
const crypto = require('node:crypto');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Create a fresh isolated temp directory for each test */
function makeTempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ssl-test-'));
  return dir;
}

/** Remove a directory recursively (cleanup) */
function rmrf(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/** Decode PEM → DER Buffer */
function pemToDer(pem) {
  const b64 = pem
    .split('\n')
    .filter((l) => !l.startsWith('---'))
    .join('');
  return Buffer.from(b64, 'base64');
}

// ── Module loading with electron mock ────────────────────────────────────────

let mockCurrentDataDir = null;

jest.mock('electron', () => ({
  app: {
    getPath: () => mockCurrentDataDir,
  },
}), { virtual: true });

function loadFreshModule(dataDir) {
  mockCurrentDataDir = dataDir;
  // Clear module registry so each test gets a clean module instance
  jest.isolateModules(() => {});
  // We need to manually reset the cache for sslCert.js
  const mod = require('../../electron/security/sslCert');
  mod.clearCertCache();
  return mod;
}

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('sslCert — Self-Signed Certificate Manager', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTempDir();
  });

  afterEach(() => {
    // Clear in-memory cache between tests
    const mod = require('../../electron/security/sslCert');
    mod.clearCertCache();
    rmrf(tmpDir);
  });

  // ── 1. Generation ────────────────────────────────────────────────────────

  describe('certificate generation (first run)', () => {
    test('returns an object with key and cert strings', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const result = getOrCreateCert(tmpDir);

      expect(result).toBeDefined();
      expect(typeof result.key).toBe('string');
      expect(typeof result.cert).toBe('string');
    });

    test('cert and key are non-empty', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const result = getOrCreateCert(tmpDir);

      expect(result.key.length).toBeGreaterThan(100);
      expect(result.cert.length).toBeGreaterThan(100);
    });

    test('exposes certPath pointing to the ssl subdirectory', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const result = getOrCreateCert(tmpDir);

      expect(result.certPath).toContain('ssl');
      expect(result.certPath).toContain('server.cert');
    });
  });

  // ── 2. PEM Format ─────────────────────────────────────────────────────────

  describe('PEM format validity', () => {
    test('private key has correct PEM header/footer', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { key } = getOrCreateCert(tmpDir);

      expect(key).toMatch(/^-----BEGIN (PRIVATE KEY|RSA PRIVATE KEY)-----/);
      expect(key).toMatch(/-----END (PRIVATE KEY|RSA PRIVATE KEY)-----\n?$/);
    });

    test('certificate has correct PEM header/footer', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      expect(cert).toMatch(/^-----BEGIN CERTIFICATE-----/);
      expect(cert).toMatch(/-----END CERTIFICATE-----\n?$/);
    });

    test('PEM lines are max 64 characters wide (RFC 7468)', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      const dataLines = cert
        .split('\n')
        .filter((l) => l && !l.startsWith('---'));

      dataLines.forEach((line) => {
        expect(line.length).toBeLessThanOrEqual(64);
      });
    });
  });

  // ── 3. In-Memory Caching ──────────────────────────────────────────────────

  describe('in-memory caching', () => {
    test('second call returns the exact same object reference', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const first  = getOrCreateCert(tmpDir);
      const second = getOrCreateCert(tmpDir);

      expect(first).toBe(second);
    });

    test('cert content is identical across multiple calls', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const first  = getOrCreateCert(tmpDir);
      const second = getOrCreateCert(tmpDir);
      const third  = getOrCreateCert(tmpDir);

      expect(first.cert).toBe(second.cert);
      expect(second.cert).toBe(third.cert);
    });
  });

  // ── 4. Disk Persistence ───────────────────────────────────────────────────

  describe('disk persistence', () => {
    test('creates ssl/ subdirectory inside the provided dataDir', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      getOrCreateCert(tmpDir);

      expect(fs.existsSync(path.join(tmpDir, 'ssl'))).toBe(true);
    });

    test('writes server.key to disk', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      getOrCreateCert(tmpDir);

      const keyPath = path.join(tmpDir, 'ssl', 'server.key');
      expect(fs.existsSync(keyPath)).toBe(true);
    });

    test('writes server.cert to disk', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      getOrCreateCert(tmpDir);

      const certPath = path.join(tmpDir, 'ssl', 'server.cert');
      expect(fs.existsSync(certPath)).toBe(true);
    });

    test('disk cert content matches returned cert string', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const result = getOrCreateCert(tmpDir);

      const onDisk = fs.readFileSync(path.join(tmpDir, 'ssl', 'server.cert'), 'utf8');
      expect(onDisk).toBe(result.cert);
    });

    test('disk key content matches returned key string', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const result = getOrCreateCert(tmpDir);

      const onDisk = fs.readFileSync(path.join(tmpDir, 'ssl', 'server.key'), 'utf8');
      expect(onDisk).toBe(result.key);
    });
  });

  // ── 5. Disk Reuse ─────────────────────────────────────────────────────────

  describe('disk reuse (no re-generation)', () => {
    test('loads existing cert from disk after clearCertCache()', () => {
      const { getOrCreateCert, clearCertCache } = require('../../electron/security/sslCert');

      // Generate and save to disk
      const original = getOrCreateCert(tmpDir);
      clearCertCache();

      // Should reload from disk — same content
      const reloaded = getOrCreateCert(tmpDir);
      expect(reloaded.cert).toBe(original.cert);
      expect(reloaded.key).toBe(original.key);
    });

    test('does NOT overwrite existing key file on reload', () => {
      const { getOrCreateCert, clearCertCache } = require('../../electron/security/sslCert');
      getOrCreateCert(tmpDir);

      const keyPath = path.join(tmpDir, 'ssl', 'server.key');
      const mtimeBefore = fs.statSync(keyPath).mtimeMs;

      clearCertCache();
      // Small delay to detect any write
      getOrCreateCert(tmpDir);

      const mtimeAfter = fs.statSync(keyPath).mtimeMs;
      expect(mtimeAfter).toBe(mtimeBefore);
    });
  });

  // ── 6. File Permissions ───────────────────────────────────────────────────

  describe('file permissions', () => {
    // Windows doesn't enforce Unix permissions — skip gracefully
    const isUnix = process.platform !== 'win32';

    test('private key file has restrictive permissions (0o600) on Unix', () => {
      if (!isUnix) return;

      const { getOrCreateCert } = require('../../electron/security/sslCert');
      getOrCreateCert(tmpDir);

      const keyPath = path.join(tmpDir, 'ssl', 'server.key');
      const mode = fs.statSync(keyPath).mode & 0o777;
      expect(mode).toBe(0o600);
    });

    test('certificate file is world-readable (0o644) on Unix', () => {
      if (!isUnix) return;

      const { getOrCreateCert } = require('../../electron/security/sslCert');
      getOrCreateCert(tmpDir);

      const certPath = path.join(tmpDir, 'ssl', 'server.cert');
      const mode = fs.statSync(certPath).mode & 0o777;
      expect(mode).toBe(0o644);
    });
  });

  // ── 7. RSA Key Pair Integrity ─────────────────────────────────────────────

  describe('RSA key pair integrity', () => {
    test('generated private key can sign data', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { key } = getOrCreateCert(tmpDir);

      const data = Buffer.from('kashiear-pos-test-payload');
      expect(() => {
        crypto.sign('sha256', data, { key, padding: crypto.constants.RSA_PKCS1_PADDING });
      }).not.toThrow();
    });

    test('key is RSA (minimum 2048 bits)', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { key } = getOrCreateCert(tmpDir);

      // Import and inspect modulus length
      const keyObj = crypto.createPrivateKey(key);
      expect(keyObj.asymmetricKeyDetails.modulusLength).toBeGreaterThanOrEqual(2048);
    });
  });

  // ── 8. Certificate DER Structure ──────────────────────────────────────────

  describe('certificate DER/ASN.1 structure', () => {
    test('DER starts with SEQUENCE tag (0x30)', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      const der = pemToDer(cert);
      expect(der[0]).toBe(0x30);   // ASN.1 SEQUENCE
    });

    test('DER is non-trivially large (contains real content)', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      const der = pemToDer(cert);
      expect(der.length).toBeGreaterThan(200);
    });

    test('base64 body of PEM decodes without error', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      expect(() => pemToDer(cert)).not.toThrow();
    });
  });

  // ── 9. SAN Extension ──────────────────────────────────────────────────────

  describe('Subject Alternative Name (SAN) extension', () => {
    test('DER bytes contain the localhost ASCII string', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      const der = pemToDer(cert);
      const localhostBytes = Buffer.from('localhost', 'ascii');
      expect(der.indexOf(localhostBytes)).toBeGreaterThan(-1);
    });

    test('DER bytes contain 127.0.0.1 IP octets', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { cert } = getOrCreateCert(tmpDir);

      const der = pemToDer(cert);
      // 127.0.0.1 in bytes
      const ipBytes = Buffer.from([127, 0, 0, 1]);
      expect(der.indexOf(ipBytes)).toBeGreaterThan(-1);
    });

    test('certificate is a trusted CA with a matching private key and server identity', () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');
      const { key, cert: pem } = getOrCreateCert(tmpDir);
      const certificate = new crypto.X509Certificate(pem);
      const keyPublic = crypto.createPublicKey(key).export({ format: 'der', type: 'spki' });
      const certPublic = certificate.publicKey.export({ format: 'der', type: 'spki' });

      expect(certificate.ca).toBe(true);
      expect(keyPublic.equals(certPublic)).toBe(true);
      expect(certificate.subjectAltName).toContain('IP Address:127.0.0.1');
      expect(certificate.subjectAltName).toContain('DNS:localhost');
      expect(certificate.subjectAltName).not.toContain('IP Address:0.0.0.0');
    });

    test('rotates the certificate when the configured DNS identity changes', () => {
      const { getOrCreateCert, clearCertCache } = require('../../electron/security/sslCert');
      const originalHost = process.env.KASHIEAR_TLS_HOSTS;
      try {
        process.env.KASHIEAR_TLS_HOSTS = 'cashier-a.example.test';
        const first = getOrCreateCert(tmpDir);
        clearCertCache();
        process.env.KASHIEAR_TLS_HOSTS = 'cashier-b.example.test';
        const second = getOrCreateCert(tmpDir);

        expect(second.cert).not.toBe(first.cert);
        expect(new crypto.X509Certificate(second.cert).subjectAltName)
          .toContain('DNS:cashier-b.example.test');
      } finally {
        if (originalHost === undefined) delete process.env.KASHIEAR_TLS_HOSTS;
        else process.env.KASHIEAR_TLS_HOSTS = originalHost;
      }
    });
  });

  // ── 10. Concurrent Calls ──────────────────────────────────────────────────

  describe('concurrency safety', () => {
    test('multiple simultaneous calls all return the same cert content', async () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');

      const results = await Promise.all(
        Array.from({ length: 10 }, () =>
          Promise.resolve(getOrCreateCert(tmpDir))
        )
      );

      const firstCert = results[0].cert;
      results.forEach((r) => {
        expect(r.cert).toBe(firstCert);
      });
    });

    test('only one server.cert file exists after concurrent calls', async () => {
      const { getOrCreateCert } = require('../../electron/security/sslCert');

      await Promise.all(
        Array.from({ length: 5 }, () =>
          Promise.resolve(getOrCreateCert(tmpDir))
        )
      );

      const sslDir  = path.join(tmpDir, 'ssl');
      const entries = fs.readdirSync(sslDir);
      // Only server.key and server.cert should exist
      expect(entries).toHaveLength(2);
      expect(entries).toContain('server.key');
      expect(entries).toContain('server.cert');
    });
  });

  // ── 11. clearCertCache ────────────────────────────────────────────────────

  describe('clearCertCache()', () => {
    test('next call after clear loads from disk (different object reference)', () => {
      const { getOrCreateCert, clearCertCache } = require('../../electron/security/sslCert');

      const first = getOrCreateCert(tmpDir);
      clearCertCache();
      const second = getOrCreateCert(tmpDir);

      // Different object in memory (reloaded from disk)
      expect(first).not.toBe(second);
      // But same content
      expect(first.cert).toBe(second.cert);
    });

    test('calling clearCertCache() multiple times does not throw', () => {
      const { clearCertCache } = require('../../electron/security/sslCert');
      expect(() => {
        clearCertCache();
        clearCertCache();
        clearCertCache();
      }).not.toThrow();
    });
  });
});

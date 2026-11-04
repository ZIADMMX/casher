const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');

const { getOrCreateCert } = require('../../electron/security/sslCert');
const tlsPin = require('../../electron/security/tlsPin');

// Real TLS: two LAN servers with certificates generated exactly like the app does.
function startServer(certDir) {
  const creds = getOrCreateCert(certDir);
  const server = https.createServer({ key: creds.key, cert: creds.cert }, (req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'online', path: req.url, method: req.method }));
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({
      server,
      baseUrl: `https://127.0.0.1:${server.address().port}`,
      fingerprint256: creds.fingerprint256,
    }));
  });
}

describe('Security: LAN certificate pinning (real TLS)', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'fox-tls-pin-'));
  let real;
  let impostor;

  beforeAll(async () => {
    real = await startServer(path.join(tmp, 'real'));
    impostor = await startServer(path.join(tmp, 'impostor'));
  });

  afterAll(async () => {
    await Promise.all([real, impostor].map(({ server }) => new Promise((r) => server.close(r))));
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  test('reads the same fingerprint the server screen shows', async () => {
    const { fingerprint256, pem } = await tlsPin.fetchServerCertificate(real.baseUrl);
    expect(fingerprint256).toBe(real.fingerprint256);
    expect(pem).toContain('BEGIN CERTIFICATE');
  });

  test('the server certificate is not trusted without pinning', async () => {
    await expect(new Promise((resolve, reject) => {
      https.get(`${real.baseUrl}/api/health`, resolve).on('error', reject);
    })).rejects.toThrow();
  });

  test('pinned requests to the paired server succeed', async () => {
    const pin = await tlsPin.fetchServerCertificate(real.baseUrl);
    const res = await tlsPin.pinnedRequest(`${real.baseUrl}/api/sales/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ total: 10 }),
      pin,
    });
    expect(res.ok).toBe(true);
    expect(await res.json()).toEqual({ status: 'online', path: '/api/sales/create', method: 'POST' });
  });

  test('a different server on the same address is rejected (impersonation)', async () => {
    const pin = await tlsPin.fetchServerCertificate(real.baseUrl);
    await expect(tlsPin.pinnedRequest(`${impostor.baseUrl}/api/health`, { pin })).rejects.toThrow();
  });

  test('a forged fingerprint for the real certificate is rejected', async () => {
    const pin = await tlsPin.fetchServerCertificate(real.baseUrl);
    const forged = { ...pin, fingerprint256: Array(32).fill('00').join(':') };
    await expect(tlsPin.pinnedRequest(`${real.baseUrl}/api/health`, { pin: forged })).rejects.toThrow('تغيّرت');
  });

  test('probeServer returns health info and the fingerprint', async () => {
    await expect(tlsPin.probeServer(real.baseUrl)).resolves.toEqual({
      serverInfo: { status: 'online', path: '/api/health', method: 'GET' },
      fingerprint256: real.fingerprint256,
    });
  });
});

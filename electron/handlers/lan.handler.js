const { safeHandle } = require('./safeHandle');
const lanServer = require('../services/lanServer.service');
const https = require('node:https');
const { configureSystemCertificateTrust } = require('../security/tlsTrust');

function getSecureHealthUrl(targetUrl) {
  const parsed = new URL(targetUrl);
  if (!['http:', 'https:'].includes(parsed.protocol)
    || parsed.username || parsed.password
    || (parsed.pathname && parsed.pathname !== '/')
    || parsed.search || parsed.hash) {
    throw new Error('عنوان الخادم غير صالح');
  }
  if (parsed.protocol === 'http:') {
    const legacyPort = parsed.port ? Number(parsed.port) : 5000;
    if (!Number.isInteger(legacyPort) || legacyPort < 1 || legacyPort + 443 > 65535) {
      throw new Error('منفذ الخادم غير صالح');
    }
    parsed.protocol = 'https:';
    parsed.port = String(legacyPort + 443);
  }
  if (!parsed.port) parsed.port = '5443';
  parsed.pathname = '/api/health';
  return parsed;
}

// منع حقن أوامر النظام عبر تمرير منفذ غير رقمي لأوامر netsh/powershell
function parsePort(rawPort) {
  if (rawPort === undefined || rawPort === null || rawPort === '') return 5000;
  const port = Number(rawPort);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('رقم المنفذ غير صالح (يجب أن يكون رقماً صحيحاً بين 1 و 65535)');
  }
  return port;
}

function registerLanHandlers() {
  safeHandle('lan:getStatus', () => {
    return lanServer.getStatus();
  });

  safeHandle('lan:getLocalIps', () => {
    return lanServer.getLocalIpAddresses();
  });

  safeHandle('lan:start', async (_event, payload) => {
    const port = parsePort(payload && payload.port);
    return await lanServer.startServer(port);
  });

  safeHandle('lan:stop', async () => {
    return await lanServer.stopServer();
  });

  safeHandle('lan:openFirewall', async (_event, payload) => {
    const port = parsePort(payload && payload.port);
    return await lanServer.openWindowsFirewallPort(port);
  });

  safeHandle('lan:testConnection', (_event, targetUrl) => {
    return new Promise((resolve) => {
      try {
        if (!targetUrl || typeof targetUrl !== 'string') {
          return resolve({ success: false, message: 'عنوان الخادم غير صحيح' });
        }

        const pingEndpoint = getSecureHealthUrl(targetUrl);
        configureSystemCertificateTrust();

        const req = https.get(pingEndpoint, { timeout: 3000 }, (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const parsed = JSON.parse(data);
                resolve({ success: true, serverInfo: parsed });
              } catch {
                resolve({ success: true, message: 'تم الاتصال بالخادم بنجاح' });
              }
            } else {
              resolve({ success: false, message: `الخادم رد برمز خطأ: ${res.statusCode}` });
            }
          });
        });

        req.on('error', (err) => {
          resolve({ success: false, message: `فشل الاتصال: ${err.message}` });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, message: 'انتهت مهلة الاتصال بالخادم (Timeout)' });
        });
      } catch (err) {
        resolve({ success: false, message: err.message });
      }
    });
  });
}

module.exports = { registerLanHandlers };

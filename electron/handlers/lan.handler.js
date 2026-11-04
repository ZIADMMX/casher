const { safeHandle } = require('./safeHandle');
const lanServer = require('../services/lanServer.service');
const { probeServer } = require('../security/tlsPin');

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

  // Discovery only: reads the server certificate and returns its fingerprint so the
  // user can compare it with the server screen before pairing (central:configure).
  safeHandle('lan:testConnection', async (_event, targetUrl) => {
    try {
      if (!targetUrl || typeof targetUrl !== 'string') {
        return { success: false, message: 'عنوان الخادم غير صحيح' };
      }
      const { origin } = getSecureHealthUrl(targetUrl);
      const { serverInfo, fingerprint256 } = await probeServer(origin);
      return { success: true, serverInfo, fingerprint256 };
    } catch (err) {
      return { success: false, message: err.message };
    }
  });
}

module.exports = { registerLanHandlers };

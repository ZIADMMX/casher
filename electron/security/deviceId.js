const os = require('node:os');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

let cachedDeviceId = null;

// The OS install's own ID: renaming the PC or adding RAM does not change it,
// only reinstalling the operating system does.
function readOsMachineId() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 5000,
      });
      return out.match(/MachineGuid\s+REG_SZ\s+(\S+)/)?.[1] || null;
    }
    return fs.readFileSync('/etc/machine-id', 'utf8').trim() || null;
  } catch {
    return null;
  }
}

/** Full 64-hex device ID, sent to the license time server to remember the trial. */
function getDeviceId() {
  if (!cachedDeviceId) {
    const source = readOsMachineId()
      || [os.hostname(), os.arch(), os.platform(), os.cpus()?.[0]?.model || 'GENERIC_CPU', os.totalmem()].join('||');
    cachedDeviceId = crypto.createHash('sha256').update(`foxcloud-device:${source}`).digest('hex');
  }
  return cachedDeviceId;
}

/** Short 8-character machine code the customer reads out to support (HWID). */
function getMachineHardwareId() {
  return getDeviceId().substring(0, 8).toUpperCase();
}

module.exports = { getDeviceId, getMachineHardwareId };

// Centralised error logger for critical failures
// Writes to console.error and app data log file
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function getLogFile() {
  const isDev = !app?.isPackaged;
  const baseDir = app?.getPath
    ? app.getPath('userData')
    : ((isDev && fs.existsSync(path.join(__dirname, '..', '..', 'data')))
        ? path.join(__dirname, '..', '..', 'data')
        : path.join(process.env.APPDATA || __dirname, 'kashiear'));
  // Ensure the 'kashiear' subdirectory exists
  const appDir = path.join(baseDir, 'kashiear');
  if (!fs.existsSync(appDir)) {
    fs.mkdirSync(appDir, { recursive: true });
  }
  const logsDir = path.join(appDir, 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  return path.join(logsDir, 'error.log');
}

function logError(context, err) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${context}] ${err instanceof Error ? err.stack : String(err)}\n`;
  try {
    fs.appendFileSync(getLogFile(), message);
  } catch {
    // If logging fails, fallback to console only
  }
  console.error(message);
}

module.exports = { logError };

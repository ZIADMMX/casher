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

// The log is capped: past MAX_LOG_BYTES it moves to error.log.1 (replacing the older one) and starts again.
const MAX_LOG_BYTES = 5 * 1024 * 1024;

function rotateIfLarge(logFile) {
  try {
    if (fs.statSync(logFile).size > MAX_LOG_BYTES) fs.renameSync(logFile, `${logFile}.1`);
  } catch {
    // no log yet, or it is locked: keep appending
  }
}

function logError(context, err) {
  const timestamp = new Date().toISOString();
  const message = `[${timestamp}] [${context}] ${err instanceof Error ? err.stack : String(err)}\n`;
  try {
    const logFile = getLogFile();
    rotateIfLarge(logFile);
    fs.appendFileSync(logFile, message);
  } catch {
    // If logging fails, fallback to console only
  }
  console.error(message);
  try {
    require('./errorReporter.service').report(context, err);
  } catch {
    // reporting is best effort
  }
}

module.exports = { logError, MAX_LOG_BYTES };

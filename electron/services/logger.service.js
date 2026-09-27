// Centralised error logger for critical failures
// Writes to console.error and app data log file
const { app } = require('electron');
const path = require('node:path');
const fs = require('node:fs');

function getLogFile() {
  const logsDir = path.join(app.getPath('appData'), 'kashiear', 'logs');
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

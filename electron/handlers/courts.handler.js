const { safeHandle } = require('./safeHandle');
const fs = require('node:fs');
const { dialog } = require('electron');
const courtsService = require('../services/courts.service');
const { readTableFile } = require('../services/excel.util');

// Opens an Excel/CSV file and returns its first sheet as [header, ...rows] of text.
async function readCourtsImportFile() {
  const result = await dialog.showOpenDialog({
    title: 'اختر ملف المحاكم',
    filters: [{ name: 'Excel / CSV', extensions: ['xlsx', 'csv'] }],
    properties: ['openFile'],
  });
  if (result.canceled || !result.filePaths.length) return null;
  const filePath = result.filePaths[0];
  if (fs.statSync(filePath).size > 25 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 25 ميجابايت');
  const records = await readTableFile(filePath);
  const header = records.length ? Object.keys(records[0]) : [];
  const text = (value) => (value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? ''));
  return [header, ...records.map((record) => header.map((key) => text(record[key])))];
}

function registerCourtsHandlers() {
  safeHandle('courts:getAll', (event, filters) => courtsService.getCourts(filters || {}));
  safeHandle('courts:getById', (event, id) => courtsService.getCourtById(id));
  safeHandle('courts:create', (event, data) => courtsService.createCourt(data || {}));
  safeHandle('courts:update', (event, payload) => {
    const { id, data } = payload || {};
    return courtsService.updateCourt(id, data || {});
  });
  safeHandle('courts:getOverview', () => courtsService.getCourtsOverview());
  safeHandle('courts:getProfile', (event, id) => courtsService.getCourtProfile(id));
  safeHandle('courts:deactivate', (event, id) => courtsService.deactivateCourt(id));
  safeHandle('courts:readImportFile', () => readCourtsImportFile());
}

module.exports = { registerCourtsHandlers };

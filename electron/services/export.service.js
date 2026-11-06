const { dialog } = require('electron');
const path = require('node:path');
const { writeXlsxFile, writeCsvFile } = require('./excel.util');

async function exportToExcel(data, sheetName, defaultFileName) {
  if (!data || data.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const result = dialog.showSaveDialogSync({
    title: 'تصدير إلى Excel',
    defaultPath: defaultFileName,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });

  if (!result) {
    return { canceled: true };
  }

  await writeXlsxFile(result, sheetName, data);
  return { canceled: false, path: result };
}

async function exportToExcelOrCsv(data, sheetName, defaultFileName) {
  if (!data || data.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const result = dialog.showSaveDialogSync({
    title: 'تصدير بيانات الموظفين',
    defaultPath: defaultFileName,
    filters: [
      { name: 'Excel Workbook', extensions: ['xlsx'] },
      { name: 'CSV UTF-8', extensions: ['csv'] },
    ],
  });
  if (!result) return { canceled: true };

  if (path.extname(result).toLowerCase() === '.csv') {
    writeCsvFile(result, data);
  } else {
    await writeXlsxFile(result, sheetName, data);
  }
  return { canceled: false, path: result };
}

// Internal tables and columns that are not the shop's business data.
const SKIPPED_TABLES = new Set(['settings', 'revoked_tokens']);
const SECRET_COLUMN = /hash|secret|token|password/i;

/** Every business table into one workbook, one sheet per table (used from the lock screen). */
function buildFullExportWorkbook(database) {
  const ExcelJS = require('exceljs');
  const workbook = new ExcelJS.Workbook();
  const tables = database.prepare(
    "SELECT name, sql FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  ).all();
  const virtualNames = tables.filter((t) => /^create virtual table/i.test(t.sql || '')).map((t) => t.name);
  const usedSheetNames = new Set();

  for (const { name, sql } of tables) {
    const isVirtualOrShadow = !sql || virtualNames.some((v) => name === v || name.startsWith(`${v}_`));
    if (SKIPPED_TABLES.has(name) || isVirtualOrShadow) continue;

    // Array.from: exceljs checks `instanceof Array`, which fails for arrays made from native results under jest.
    const columns = Array.from(database.prepare(`PRAGMA table_info("${name.replace(/"/g, '""')}")`).all(), (c) => c.name)
      .filter((c) => !SECRET_COLUMN.test(c));
    if (columns.length === 0) continue;

    // Excel sheet names: at most 31 characters and unique.
    let sheetName = name.slice(0, 31);
    for (let i = 2; usedSheetNames.has(sheetName); i++) sheetName = `${name.slice(0, 28)}_${i}`;
    usedSheetNames.add(sheetName);

    const sheet = workbook.addWorksheet(sheetName);
    sheet.addRow(columns);
    const select = `SELECT ${columns.map((c) => `"${c.replace(/"/g, '""')}"`).join(', ')} FROM "${name.replace(/"/g, '""')}"`;
    for (const row of database.prepare(select).iterate()) {
      sheet.addRow(columns.map((c) => (Buffer.isBuffer(row[c]) ? null : row[c])));
    }
  }
  return workbook;
}

async function exportAllData() {
  const { db } = require('../database/db');
  const result = dialog.showSaveDialogSync({
    title: 'تصدير كل بيانات المحل',
    defaultPath: `foxcloud-كل-البيانات-${new Date().toISOString().slice(0, 10)}.xlsx`,
    filters: [{ name: 'Excel Files', extensions: ['xlsx'] }],
  });
  if (!result) return { canceled: true };

  await buildFullExportWorkbook(db).xlsx.writeFile(result);
  return { canceled: false, path: result };
}

module.exports = { exportToExcel, exportToExcelOrCsv, exportAllData, buildFullExportWorkbook };

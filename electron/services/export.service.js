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

module.exports = { exportToExcel, exportToExcelOrCsv };

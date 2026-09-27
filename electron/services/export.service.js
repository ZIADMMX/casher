const XLSX = require('xlsx');
const { dialog } = require('electron');

function exportToExcel(data, sheetName, defaultFileName) {
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

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, result);

  return { canceled: false, path: result };
}

module.exports = { exportToExcel };

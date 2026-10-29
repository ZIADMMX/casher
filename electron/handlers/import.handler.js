const { processExcelFile, createImportTemplate } = require('../services/import.service');
const { safeHandle } = require('./safeHandle');
const { dialog } = require('electron');
const authService = require('../services/auth.service');

function registerImportHandlers() {
  // دالة لجلب مسار الملف من المستخدم عبر نافذة حوار
  safeHandle('import:selectFile', async () => {
    authService.requireAdmin();
    const result = await dialog.showOpenDialog({
      title: 'اختر ملف الموظفين',
      filters: [{ name: 'Excel/CSV Files', extensions: ['xlsx', 'csv'] }],
      properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  safeHandle('import:excel', (event, { filePath, type }) => {
    authService.requireAdmin();
    return processExcelFile(filePath, type);
  });

  safeHandle('import:downloadTemplate', (event, type) => {
    authService.requireAdmin();
    return createImportTemplate(type);
  });
}

module.exports = { registerImportHandlers };

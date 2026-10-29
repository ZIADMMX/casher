const ExcelJS = require('exceljs');
const fs = require('node:fs');
const path = require('node:path');

/**
 * تحويل قيمة خلية exceljs إلى قيمة بسيطة للصفوف المستوردة
 */
function getCellValue(cell) {
  if (!cell || cell.value == null || cell.value === '') return null;
  const value = cell.value;
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) {
      const text = value.richText.map((part) => part.text || '').join('');
      return text === '' ? null : text;
    }
    if (value.hyperlink && value.text != null) return value.text;
    if (value.result !== undefined) return value.result == null ? null : value.result;
    if (value.text != null) return value.text;
    if (value.error) return null;
  }
  return value;
}

/**
 * قراءة أول ورقة من ملف xlsx أو csv إلى مصفوفة كائنات (الصف الأول عناوين)
 */
async function readTableFile(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  const workbook = new ExcelJS.Workbook();

  if (extension === '.csv') {
    await workbook.csv.readFile(filePath);
  } else if (extension === '.xlsx') {
    await workbook.xlsx.readFile(filePath);
  } else if (extension === '.xls') {
    throw new Error('صيغة .xls القديمة غير مدعومة؛ احفظ الملف كـ xlsx أو csv');
  } else {
    throw new Error('صيغة الملف غير مدعومة؛ استخدم Excel أو CSV');
  }

  // #region agent log
  fetch('http://127.0.0.1:7663/ingest/cb7ceca9-c700-418f-a333-62e87ee82704',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9ca281'},body:JSON.stringify({sessionId:'9ca281',hypothesisId:'C',location:'excel.util.js:readTableFile',message:'قراءة جدول Excel عبر exceljs',data:{engine:'exceljs',extension,sheetCount:workbook.worksheets.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion

  const worksheet = workbook.worksheets[0];
  if (!worksheet) return [];

  const rows = [];
  let headers = [];
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    if (rowNumber === 1) {
      headers = [];
      row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
        const header = getCellValue(cell);
        headers[colNumber] = header == null ? '' : String(header).trim();
      });
      return;
    }

    const obj = {};
    let hasAny = false;
    headers.forEach((header, colNumber) => {
      if (!header) return;
      const value = getCellValue(row.getCell(colNumber));
      obj[header] = value;
      if (value != null && value !== '') hasAny = true;
    });
    if (hasAny) rows.push(obj);
  });

  return rows;
}

/**
 * كتابة ملف xlsx: إما صف عناوين فقط أو مصفوفة كائنات
 */
async function writeXlsxFile(filePath, sheetName, dataOrColumns) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetName || 'Sheet1');

  if (!Array.isArray(dataOrColumns) || dataOrColumns.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }

  const first = dataOrColumns[0];
  if (first != null && typeof first === 'object' && !Array.isArray(first)) {
    const keys = Object.keys(first);
    sheet.addRow(keys);
    for (const row of dataOrColumns) {
      sheet.addRow(keys.map((key) => (row[key] == null ? null : row[key])));
    }
  } else {
    sheet.addRow(dataOrColumns);
  }

  await workbook.xlsx.writeFile(filePath);

  // #region agent log
  fetch('http://127.0.0.1:7663/ingest/cb7ceca9-c700-418f-a333-62e87ee82704',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'9ca281'},body:JSON.stringify({sessionId:'9ca281',hypothesisId:'C',location:'excel.util.js:writeXlsxFile',message:'كتابة xlsx عبر exceljs',data:{engine:'exceljs',rowCount:dataOrColumns.length},timestamp:Date.now()})}).catch(()=>{});
  // #endregion
}

function sanitizeCsvCell(value) {
  if (value == null) return '';
  let text = String(value);
  if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function writeCsvFile(filePath, data) {
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('لا توجد بيانات للتصدير');
  }
  const keys = Object.keys(data[0]);
  const lines = [
    keys.map(sanitizeCsvCell).join(','),
    ...data.map((row) => keys.map((key) => sanitizeCsvCell(row[key])).join(',')),
  ];
  fs.writeFileSync(filePath, `\uFEFF${lines.join('\r\n')}`, 'utf8');
}

module.exports = {
  readTableFile,
  writeXlsxFile,
  writeCsvFile,
};

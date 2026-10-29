const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readTableFile, writeXlsxFile, writeCsvFile } = require('../../electron/services/excel.util');

describe('excel.util', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'kashiear-excel-'));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test('writes and reads an xlsx table without using xlsx package', async () => {
    const filePath = path.join(tempDir, 'products.xlsx');
    const rows = [
      { 'اسم المنتج': 'قميص', 'سعر البيع': 120 },
      { 'اسم المنتج': 'حذاء', 'سعر البيع': 250 },
    ];
    await writeXlsxFile(filePath, 'البيانات', rows);
    const loaded = await readTableFile(filePath);
    expect(loaded).toEqual(rows);
  });

  test('writes csv with formula injection neutralized', () => {
    const filePath = path.join(tempDir, 'employees.csv');
    writeCsvFile(filePath, [{ name: '=cmd|"/c calc"', city: 'Cairo' }]);
    const content = fs.readFileSync(filePath, 'utf8');
    expect(content.includes("'=cmd")).toBe(true);
  });
});

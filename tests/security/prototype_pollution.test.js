const pkg = require('../../package.json');

describe('Security: Prototype Pollution & RCE Prevention', () => {
  afterEach(() => {
    delete Object.prototype.polluted;
    delete Object.prototype.NODE_OPTIONS;
  });

  test('community xlsx is replaced with exceljs', () => {
    expect(pkg.dependencies.xlsx).toBeUndefined();
    expect(pkg.dependencies.exceljs).toBeDefined();
    expect(() => require('exceljs')).not.toThrow();
  });

  test('Import processing strips prototype pollution keys', () => {
    const { sanitizeImportRows } = require('../../electron/services/import.service');
    const malicious = JSON.parse('{"__proto__":{"polluted":true},"constructor":"x","الاسم":"أ"}');
    const rows = sanitizeImportRows([malicious]);
    expect(rows[0]).toEqual({ الاسم: 'أ' });
    expect(Object.prototype.polluted).toBeUndefined();
  });

  test('Resilience worker environment strips NODE_OPTIONS', () => {
    const resilienceService = require('../../electron/services/resilience.service');
    expect(resilienceService).toBeDefined();
    expect(process.env.NODE_OPTIONS).toBeUndefined();
  });
});

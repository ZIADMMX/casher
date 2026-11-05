import normalizeErrorMessage from '../../src/utils/normalizeError.js';

describe('normalizeErrorMessage', () => {
  test('strips the Electron IPC prefix so the cashier sees only the real message', () => {
    const error = new Error("Error invoking remote method 'sales:create': Error: الكمية غير متوفرة في المخزن");
    expect(normalizeErrorMessage(error)).toBe('الكمية غير متوفرة في المخزن');
  });

  test('strips nested Error: prefixes and extra whitespace', () => {
    expect(normalizeErrorMessage('Error:   Error:  رصيد   غير كافٍ ')).toBe('رصيد غير كافٍ');
  });

  test('reads message from plain objects and from cause', () => {
    expect(normalizeErrorMessage({ message: 'فشل الحفظ' })).toBe('فشل الحفظ');
    expect(normalizeErrorMessage({ cause: { message: 'انقطع الاتصال' } })).toBe('انقطع الاتصال');
  });

  test('falls back when there is nothing useful to show', () => {
    expect(normalizeErrorMessage(null)).toBe('حدث خطأ غير متوقع');
    expect(normalizeErrorMessage(new Error('Error'))).toBe('حدث خطأ غير متوقع');
    expect(normalizeErrorMessage("Error invoking remote method 'x': Error", 'تعذر التنفيذ')).toBe('تعذر التنفيذ');
  });
});

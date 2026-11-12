import { describe, it, expect } from 'vitest';
import { integerInWords, amountInWords } from '../../src/utils/arabicAmountWords.js';

describe('integerInWords', () => {
  it('يفقّط الآحاد والعشرات', () => {
    expect(integerInWords(0)).toBe('صفر');
    expect(integerInWords(7)).toBe('سبعة');
    expect(integerInWords(13)).toBe('ثلاثة عشر');
    expect(integerInWords(21)).toBe('واحد وعشرون');
    expect(integerInWords(90)).toBe('تسعون');
  });

  it('يفقّط المئات', () => {
    expect(integerInWords(100)).toBe('مائة');
    expect(integerInWords(200)).toBe('مئتان');
    expect(integerInWords(345)).toBe('ثلاثمائة وخمسة وأربعون');
  });

  it('يفرّق بين مفرد ومثنى وجمع الألف', () => {
    expect(integerInWords(1000)).toBe('ألف');
    expect(integerInWords(2000)).toBe('ألفان');
    expect(integerInWords(5000)).toBe('خمسة آلاف');
    expect(integerInWords(13000)).toBe('ثلاثة عشر ألف');
  });

  it('يفقّط الملايين مع الباقي', () => {
    expect(integerInWords(1_000_000)).toBe('مليون');
    expect(integerInWords(2_500_000)).toBe('مليونان وخمسمائة ألف');
    expect(integerInWords(40_350)).toBe('أربعون ألف وثلاثمائة وخمسون');
  });
});

describe('amountInWords', () => {
  it('يكتب صيغة القسيمة كاملة', () => {
    expect(amountInWords(13000)).toBe('فقط ثلاثة عشر ألف جنيه مصري لا غير.');
  });

  it('يضيف القروش عند وجود كسور', () => {
    expect(amountInWords(1250.5)).toBe('فقط ألف ومئتان وخمسون جنيه مصري وخمسون قرشًا لا غير.');
  });

  it('يتعامل مع الصفر والقيم غير الصالحة', () => {
    expect(amountInWords(0)).toBe('فقط صفر جنيه مصري لا غير.');
    expect(amountInWords(null)).toBe('فقط صفر جنيه مصري لا غير.');
    expect(amountInWords(undefined)).toBe('فقط صفر جنيه مصري لا غير.');
  });

  it('يقرّب لأقرب قرش بدل ما يطلع ٩٩ قرش من كسر عائم', () => {
    expect(amountInWords(10.999)).toBe('فقط أحد عشر جنيه مصري لا غير.');
  });
});

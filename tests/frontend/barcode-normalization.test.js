import { describe, expect, it } from 'vitest';
import { normalizeBarcodeText } from '../../src/hooks/useBarcodeScanner.js';

describe('normalizeBarcodeText', () => {
  it('trims whitespace and converts Arabic-Indic digits', () => {
    expect(normalizeBarcodeText('  ١٢٣٤٥  ')).toBe('12345');
  });

  it('converts Persian digits', () => {
    expect(normalizeBarcodeText('۰۱۲۳۴۵۶۷۸۹')).toBe('0123456789');
  });

  it('returns an empty string for empty input', () => {
    expect(normalizeBarcodeText('')).toBe('');
    expect(normalizeBarcodeText(null)).toBe('');
  });
});
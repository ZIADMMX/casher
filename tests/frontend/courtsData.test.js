import { describe, expect, it } from 'vitest';
import { CSV_HEADER, csvCell, csvToCourts, parseCsv } from '../../src/components/legal/courtsData.js';

describe('courts CSV', () => {
  it('parses quoted cells with commas, quotes and new lines', () => {
    expect(parseCsv('﻿a,"b, c","say ""hi""\nthere"\r\n1,2,3\n\n')).toEqual([
      ['a', 'b, c', 'say "hi"\nthere'],
      ['1', '2', '3'],
    ]);
  });

  it('reads back what the export writes, mapping Arabic type labels', () => {
    const row = ['محكمة شمال القاهرة', 'الأسرة', 'مدني، كلي', 'القاهرة', 'ش رمسيس, العباسية', '+20 2', 'الأحد – الخميس', '4', 'نشطة', 'بوابة "خلفية"'];
    const text = [CSV_HEADER.join(','), row.map(csvCell).join(','), ',غير معروف'].join('\n');
    expect(csvToCourts(text)).toEqual([{
      name: 'محكمة شمال القاهرة',
      court_type: 'family',
      specialization: 'مدني، كلي',
      city: 'القاهرة',
      address: 'ش رمسيس, العباسية',
      phone: '+20 2',
      working_hours: 'الأحد – الخميس',
      notes: 'بوابة "خلفية"',
    }]);
  });

  it('rejects a file without a court name column', () => {
    expect(() => csvToCourts('x,y\n1,2')).toThrow('المحكمة');
  });
});

const {
  v,
  ValidationError,
  shiftFiltersSchema,
} = require('../../electron/validators/schema');

describe('database input validation', () => {
  test('rejects non-finite numeric input', () => {
    expect(() => v.number().validate('Infinity')).toThrow(ValidationError);
    expect(() => v.number().validate(NaN)).toThrow(ValidationError);
  });

  test('accepts parameterized shift filters', () => {
    expect(shiftFiltersSchema.validate({
      limit: 25,
      offset: 0,
      status: 'closed',
      userId: 3,
      startDate: '2026-09-01',
      endDate: '2026-09-24',
    })).toMatchObject({
      limit: 25,
      offset: 0,
      status: 'closed',
      userId: 3,
    });
  });

  test('rejects invalid shift filter values before database access', () => {
    expect(() => shiftFiltersSchema.validate({ status: 'closed; DROP TABLE shifts' }))
      .toThrow(ValidationError);
    expect(() => shiftFiltersSchema.validate({ limit: 101 }))
      .toThrow(ValidationError);
    expect(() => shiftFiltersSchema.validate({ startDate: 'not-a-date' }))
      .toThrow(ValidationError);
  });
});

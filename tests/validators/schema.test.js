const {
  v,
  ValidationError,
  addUserSchema,
  personalProfileSchema,
  createLeaveRequestSchema,
  leaveRequestDecisionSchema,
  shiftFiltersSchema,
  reviewSchema,
} = require('../../electron/validators/schema');
const { validateProducts } = require('../../electron/validators/onboarding.validator');

describe('database input validation', () => {
  test('keeps services out of inventory while preserving normal product stock', () => {
    const [service] = validateProducts([{
      name: 'خدمة صالون',
      selling_price: 150,
      stock_quantity: 999,
      low_stock_threshold: 5,
      is_service: true,
    }]);
    const [product] = validateProducts([{
      name: 'منتج مخزون',
      selling_price: 100,
      stock_quantity: 10,
      low_stock_threshold: 3,
    }]);

    expect(service).toMatchObject({ is_service: true, stock_quantity: 0, low_stock_threshold: 0 });
    expect(product).toMatchObject({ is_service: false, stock_quantity: 10, low_stock_threshold: 3 });
  });

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

  test('validates employee role and compensation inputs', () => {
    expect(addUserSchema.validate({
      username: 'new-manager',
      password: 'secret123',
      role: 'admin',
      payType: 'hourly',
      payAmount: 150,
      commissionRate: 10,
      isActive: false,
    })).toMatchObject({
      role: 'admin',
      payType: 'hourly',
      payAmount: 150,
      commissionRate: 10,
      isActive: false,
    });

    expect(() => addUserSchema.validate({
      username: 'new-user',
      password: 'secret123',
      commissionRate: 101,
    })).toThrow(ValidationError);
    expect(() => addUserSchema.validate({
      username: 'new-user',
      password: 'secret123',
      payType: 'monthly',
    })).toThrow(ValidationError);
  });

  test('validates personal profile fields and rejects malformed input', () => {
    expect(personalProfileSchema.validate({
      firstName: 'Sara',
      email: 'sara@example.com',
      gender: 'female',
      dateOfBirth: '1995-04-12',
      country: 'Egypt',
    })).toMatchObject({
      firstName: 'Sara',
      email: 'sara@example.com',
      gender: 'female',
      dateOfBirth: '1995-04-12',
    });

    expect(() => personalProfileSchema.validate({ email: 'not-an-email' }))
      .toThrow(ValidationError);
    expect(() => personalProfileSchema.validate({ dateOfBirth: '2026-02-30' }))
      .toThrow(ValidationError);
    expect(() => personalProfileSchema.validate({ gender: 'unknown' }))
      .toThrow(ValidationError);
    expect(() => personalProfileSchema.validate({}))
      .toThrow(ValidationError);
    expect(() => personalProfileSchema.validate({ role: 'admin' }))
      .toThrow(ValidationError);
  });

  test('validates leave request dates, reason, and decision', () => {
    expect(createLeaveRequestSchema.validate({
      userId: 2,
      startDate: '2026-10-08',
      endDate: '2026-10-10',
      reason: 'Annual leave',
      autoApprove: true,
    })).toMatchObject({
      userId: 2,
      autoApprove: true,
    });
    expect(() => createLeaveRequestSchema.validate({
      userId: 2,
      startDate: '2026-10-10',
      endDate: '2026-10-08',
      reason: 'Reversed range',
      autoApprove: false,
    })).toThrow(ValidationError);
    expect(() => leaveRequestDecisionSchema.validate({ requestId: 2, decision: 'maybe' }))
      .toThrow(ValidationError);
  });

  test('validates ratings, optional comments, and positive-review consent', () => {
    expect(reviewSchema.validate({ rating: 3, tags: ['النظام بطيء'], comment: '' }))
      .toMatchObject({ rating: 3, consent: undefined });
    expect(reviewSchema.validate({ rating: 5, consent: false }))
      .toMatchObject({ rating: 5, consent: false });

    expect(() => reviewSchema.validate({ rating: 5 }))
      .toThrow(ValidationError);
    expect(() => reviewSchema.validate({ rating: 2, comment: 'قصير' }))
      .toThrow(ValidationError);
    expect(() => reviewSchema.validate({ rating: 4, consent: true, comment: 'x'.repeat(1001) }))
      .toThrow(ValidationError);
    expect(() => reviewSchema.validate({ rating: 2, consent: true }))
      .toThrow(ValidationError);
  });
});

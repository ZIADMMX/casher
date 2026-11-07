import { computeCartTotals } from '../../src/utils/cartTotals.js';

const item = (unitPrice, quantity = 1) => ({ unitPrice, quantity });

describe('computeCartTotals', () => {
  test('sums unit price times quantity and rounds to piasters', () => {
    const { subtotal, total } = computeCartTotals({
      cart: [item(0.1, 3), item(0.2, 1)],
      paymentMethod: 'card',
    });
    expect(subtotal).toBe(0.5);
    expect(total).toBe(0.5);
  });

  test('an empty cart totals zero', () => {
    expect(computeCartTotals({ cart: [], paymentMethod: 'cash' })).toMatchObject({
      subtotal: 0,
      total: 0,
      changeDue: null,
      isCashInvalid: false,
    });
  });

  test('manual discount and automatic offer do not stack; the larger wins', () => {
    const cart = [item(100, 2)];
    expect(computeCartTotals({ cart, discount: '30', bundlePromotion: { discount: 50 }, paymentMethod: 'card' }))
      .toMatchObject({ effectiveDiscount: 50, total: 150 });
    expect(computeCartTotals({ cart, discount: 70, bundlePromotion: { discount: 50 }, paymentMethod: 'card' }))
      .toMatchObject({ effectiveDiscount: 70, total: 130 });
  });

  test('a discount larger than the subtotal never makes the total negative', () => {
    expect(computeCartTotals({ cart: [item(40)], discount: 100, paymentMethod: 'card' }).total).toBe(0);
  });

  test('cash: computes the change and flags too little cash', () => {
    const cart = [item(42.5)];
    expect(computeCartTotals({ cart, paymentMethod: 'cash', cashReceived: '50' }))
      .toMatchObject({ changeDue: 7.5, isCashInvalid: false });
    expect(computeCartTotals({ cart, paymentMethod: 'cash', cashReceived: '40' }))
      .toMatchObject({ changeDue: 0, isCashInvalid: true });
  });

  test('cash: an empty cash field is not an error and shows no change yet', () => {
    expect(computeCartTotals({ cart: [item(10)], paymentMethod: 'cash', cashReceived: '' }))
      .toMatchObject({ changeDue: null, isCashInvalid: false });
  });

  test('change is only computed for cash payments', () => {
    expect(computeCartTotals({ cart: [item(10)], paymentMethod: 'card', cashReceived: '50' }).changeDue).toBeNull();
  });

  test('credit sale needs a customer name and a due date', () => {
    const cart = [item(10)];
    expect(computeCartTotals({ cart, paymentMethod: 'credit', creditCustomerName: '   ', creditDueDate: '2026-12-01' })
      .isCreditInvalid).toBe(true);
    expect(computeCartTotals({ cart, paymentMethod: 'credit', creditCustomerName: 'أحمد', creditDueDate: '' })
      .isCreditInvalid).toBe(true);
    expect(computeCartTotals({ cart, paymentMethod: 'credit', creditCustomerName: 'أحمد', creditDueDate: '2026-12-01' })
      .isCreditInvalid).toBe(false);
  });

  test('adds the dine-in service charge after the discount, and a fixed delivery fee', () => {
    const items = [{ unitPrice: 100, quantity: 2 }];
    const dineIn = computeCartTotals({ cart: items, discount: 20, paymentMethod: 'card', serviceChargePercent: 12 });
    expect(dineIn).toMatchObject({ subtotal: 200, serviceCharge: 21.6, total: 201.6 });
    expect(computeCartTotals({ cart: items, paymentMethod: 'card', fixedCharge: 15 })).toMatchObject({ serviceCharge: 15, total: 215 });
    expect(computeCartTotals({ cart: [], paymentMethod: 'card', fixedCharge: 15 }).total).toBe(0);
  });
});

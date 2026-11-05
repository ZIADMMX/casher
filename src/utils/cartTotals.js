// Cart money math for the POS screen. Kept pure so it can be tested directly.

const roundMoney = (value) => Math.round(value * 100) / 100;

/**
 * @param {object} input
 * @param {Array<{unitPrice:number, quantity:number}>} input.cart
 * @param {number|string} input.discount  manual discount typed by the cashier
 * @param {{discount:number}|null} input.bundlePromotion  best automatic offer
 * @param {'cash'|'card'|'credit'} input.paymentMethod
 * @param {string} input.cashReceived  raw value of the cash field ('' when empty)
 * @param {string} input.creditCustomerName
 * @param {string} input.creditDueDate
 */
export function computeCartTotals({
  cart = [],
  discount = 0,
  bundlePromotion = null,
  paymentMethod,
  cashReceived = '',
  creditCustomerName = '',
  creditDueDate = '',
}) {
  const subtotal = roundMoney(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  // The manual discount and an automatic offer never stack: the larger one wins.
  const effectiveDiscount = Math.max(Number(discount || 0), bundlePromotion?.discount || 0);
  const total = roundMoney(Math.max(subtotal - effectiveDiscount, 0));
  const changeDue =
    paymentMethod === 'cash' && cashReceived !== ''
      ? roundMoney(Math.max(Number(cashReceived) - total, 0))
      : null;
  const isCreditInvalid = paymentMethod === 'credit' && (!creditCustomerName.trim() || !creditDueDate);
  const isCashInvalid = paymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < total;

  return { subtotal, effectiveDiscount, total, changeDue, isCreditInvalid, isCashInvalid };
}

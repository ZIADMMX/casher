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
 * @param {number} input.serviceChargePercent  dine-in service, % of the total after discount
 * @param {number} input.fixedCharge  delivery fee, added as is
 */
export function computeCartTotals({
  cart = [],
  discount = 0,
  bundlePromotion = null,
  paymentMethod,
  cashReceived = '',
  creditCustomerName = '',
  creditDueDate = '',
  serviceChargePercent = 0,
  fixedCharge = 0,
}) {
  const subtotal = roundMoney(cart.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0));
  // The manual discount and an automatic offer never stack: the larger one wins.
  const effectiveDiscount = Math.max(Number(discount || 0), bundlePromotion?.discount || 0);
  const afterDiscount = roundMoney(Math.max(subtotal - effectiveDiscount, 0));
  // Same formula as the server (sales.service.js), so the till shows what is charged.
  const serviceCharge = afterDiscount > 0
    ? roundMoney(afterDiscount * (Number(serviceChargePercent) || 0) / 100 + (Number(fixedCharge) || 0))
    : 0;
  const total = roundMoney(afterDiscount + serviceCharge);
  const changeDue =
    paymentMethod === 'cash' && cashReceived !== ''
      ? roundMoney(Math.max(Number(cashReceived) - total, 0))
      : null;
  const isCreditInvalid = paymentMethod === 'credit' && (!creditCustomerName.trim() || !creditDueDate);
  const isCashInvalid = paymentMethod === 'cash' && cashReceived !== '' && Number(cashReceived) < total;

  return { subtotal, effectiveDiscount, serviceCharge, total, changeDue, isCreditInvalid, isCashInvalid };
}

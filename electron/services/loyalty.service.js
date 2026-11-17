/**
 * نقاط الولاء: العميل بيكسب نقاط على كل فاتورة، وبيستبدلها بخصم في فاتورة جاية.
 * كل تغيير في الرصيد سطر في loyalty_ledger، والرصيد الحالي في customers.loyalty_points.
 * الحساب كله هنا على السيرفر: الكاشير يبعت عدد النقاط اللي عايز يستبدلها بس، والقيمة بتتحسب هنا.
 */
const { db } = require('../database/db');
const SettingsRepository = require('../repositories/settings.repository');
const { requireAuth } = require('./auth.service');

const DEFAULTS = { earnPer100: 10, redeemValuePer100: 10, minRedeem: 100 };

const number = (value, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

// Off until the owner turns it on in Settings.
function getSettings() {
  const get = (key) => { try { return SettingsRepository.get(key); } catch { return null; } };
  return {
    enabled: get('loyalty_enabled') === '1',
    earnPer100: number(get('loyalty_earn_per_100'), DEFAULTS.earnPer100), // points earned for each 100 EGP paid
    redeemValuePer100: number(get('loyalty_redeem_value_per_100'), DEFAULTS.redeemValuePer100), // EGP off for each 100 points
    minRedeem: Math.max(1, Math.floor(number(get('loyalty_min_redeem'), DEFAULTS.minRedeem))),
  };
}

const round2 = (n) => Math.round(n * 100) / 100;
const getPoints = (customerId) => Number(db.prepare('SELECT loyalty_points FROM customers WHERE id = ?').get(customerId)?.loyalty_points) || 0;
const valueOf = (points, settings) => round2((points / 100) * settings.redeemValuePer100);

function addLedger(customerId, saleId, points, reason, baseAmount, note) {
  db.prepare('UPDATE customers SET loyalty_points = COALESCE(loyalty_points, 0) + ? WHERE id = ?').run(points, customerId);
  const balance = getPoints(customerId);
  db.prepare(`INSERT INTO loyalty_ledger (customer_id, sale_id, points, reason, base_amount, balance_after, note) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(customerId, saleId ?? null, points, reason, baseAmount ?? null, balance, note ?? null);
  return balance;
}

/** What the till shows next to the customer: balance and what it is worth. */
function getCustomerPoints(customerId) {
  requireAuth();
  const settings = getSettings();
  const points = getPoints(Number(customerId));
  return { enabled: settings.enabled, points, value: valueOf(points, settings), minRedeem: settings.minRedeem, earnPer100: settings.earnPer100, redeemValuePer100: settings.redeemValuePer100 };
}

function getHistory(customerId, limit = 50) {
  requireAuth();
  return db.prepare('SELECT id, sale_id, points, reason, balance_after, note, created_at FROM loyalty_ledger WHERE customer_id = ? ORDER BY id DESC LIMIT ?')
    .all(Number(customerId), Math.min(Math.max(Number(limit) || 50, 1), 200));
}

/**
 * Called by createSale before the sale is saved: how much discount the requested points give.
 * maxDiscount is what is left to pay, so points never pay for more than the invoice.
 */
function planRedemption(customerId, requestedPoints, maxDiscount) {
  const requested = Number(requestedPoints) || 0;
  if (requested === 0) return { points: 0, discount: 0 };
  const settings = getSettings();
  if (!settings.enabled) throw new Error('نقاط الولاء مش مفعّلة');
  if (!Number.isSafeInteger(requested) || requested < 0) throw new Error('عدد النقاط غير صالح');
  if (!customerId) throw new Error('اختار العميل قبل استخدام النقاط');
  if (requested < settings.minRedeem) throw new Error(`أقل عدد نقاط للاستبدال ${settings.minRedeem}`);
  if (requested > getPoints(customerId)) throw new Error('رصيد النقاط مش كافي');
  if (settings.redeemValuePer100 <= 0) throw new Error('قيمة النقاط غير مضبوطة');

  let points = requested;
  let discount = valueOf(points, settings);
  if (discount > maxDiscount) {
    // never more than the invoice: use only the points that are needed
    points = Math.floor((maxDiscount / settings.redeemValuePer100) * 100);
    discount = valueOf(points, settings);
  }
  return points > 0 ? { points, discount } : { points: 0, discount: 0 };
}

/**
 * Inside the sale transaction: takes the redeemed points and gives the earned ones.
 * earnBase = what the customer paid for goods (after every discount, without service or delivery fees).
 */
function recordSale({ customerId, saleId, redeemPoints = 0, earnBase = 0, paymentMethod }) {
  if (!customerId) return { earned: 0, redeemed: 0, balance: null };
  const settings = getSettings();
  if (!settings.enabled) return { earned: 0, redeemed: 0, balance: null };

  let balance = null;
  if (redeemPoints > 0) {
    // runs inside the sale transaction (one writer at a time): another till cannot spend these points between this check and the update
    if (getPoints(customerId) < redeemPoints) throw new Error('رصيد النقاط اتغيّر، أعد المحاولة');
    balance = addLedger(customerId, saleId, -redeemPoints, 'redeem', null, 'استبدال نقاط بخصم');
  }

  // a credit sale is not paid yet: no points until money is collected (shortcut: collecting later does not award them)
  const earned = paymentMethod === 'credit' ? 0 : Math.floor((Math.max(earnBase, 0) / 100) * settings.earnPer100);
  if (earned > 0) balance = addLedger(customerId, saleId, earned, 'earn', Math.max(earnBase, 0), 'نقاط من فاتورة');
  return { earned, redeemed: redeemPoints, balance: balance ?? getPoints(customerId) };
}

/**
 * A return takes back the points that sale earned, in the same proportion as the money returned.
 * shortcut: redeemed points are not given back on a return, only the earned ones are taken back.
 */
function reverseForReturn(saleId, refundAmount) {
  const earn = db.prepare("SELECT customer_id, points, base_amount FROM loyalty_ledger WHERE sale_id = ? AND reason = 'earn'").get(saleId);
  if (!earn || !(earn.base_amount > 0)) return 0;
  const already = db.prepare("SELECT COALESCE(SUM(-points), 0) AS n FROM loyalty_ledger WHERE sale_id = ? AND reason = 'return'").get(saleId).n;
  const returnedShare = Math.min(1, Math.max(Number(refundAmount) || 0, 0) / earn.base_amount);
  const wanted = Math.floor(earn.points * returnedShare) - already;
  // the balance never goes below zero: points already spent stay spent
  const take = Math.min(Math.max(wanted, 0), getPoints(earn.customer_id));
  if (take <= 0) return 0;
  addLedger(earn.customer_id, saleId, -take, 'return', null, 'مرتجع من الفاتورة');
  return take;
}

/** Manager correction (gift, complaint, wrong entry); the reason is required. */
function adjust(customerId, delta, note) {
  requireAuth();
  const id = Number(customerId);
  const change = Number(delta);
  if (!Number.isSafeInteger(id) || id <= 0 || !db.prepare('SELECT 1 FROM customers WHERE id = ?').get(id)) throw new Error('العميل غير موجود');
  if (!Number.isSafeInteger(change) || change === 0 || Math.abs(change) > 100000) throw new Error('عدد النقاط غير صالح');
  const reason = String(note ?? '').trim().slice(0, 120);
  if (!reason) throw new Error('اكتب سبب التعديل');
  if (change < 0 && -change > getPoints(id)) throw new Error('الخصم أكبر من رصيد العميل');
  return addLedger(id, null, change, 'adjust', null, reason);
}

module.exports = { getSettings, getCustomerPoints, getHistory, planRedemption, recordSale, reverseForReturn, adjust };

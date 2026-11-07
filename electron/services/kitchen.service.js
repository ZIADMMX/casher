const kitchenRepo = require('../repositories/kitchen.repository');
const tablesRepo = require('../repositories/tables.repository');
const { requireAuth, getCurrentSession } = require('./auth.service');
const { checkTransition } = require('./kitchenFlow');

// Delivered table rounds stay on the board for a while, like sale orders.
const SERVED_ROUNDS_ON_BOARD = 12;

// Sale orders and table rounds on one board. `key` is unique across both.
function getKitchenOrders() {
  requireAuth();
  const sales = kitchenRepo.getOrders().map((order) => ({ ...order, key: `sale-${order.id}` }));
  const rounds = tablesRepo.getKitchenRounds(SERVED_ROUNDS_ON_BOARD).map((round) => ({
    id: round.round_id,
    key: `round-${round.round_id}`,
    round_id: round.round_id,
    round_no: round.round_no,
    table_name: round.table_name,
    order_mode: 'dine_in',
    kitchen_status: round.kitchen_status,
    cashier_name: round.cashier_name,
    created_at: round.created_at,
    status_changed_at: round.status_changed_at,
    items: round.items,
  }));
  return [...sales, ...rounds].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
}

function parseId(value) {
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

// One step forward, or undo the last step within two minutes. Anything else is refused.
function updateKitchenOrderStatus({ saleId, roundId, status } = {}) {
  requireAuth();
  const session = getCurrentSession();

  if (roundId !== undefined && roundId !== null) {
    const parsedRoundId = parseId(roundId);
    if (!parsedRoundId) throw new Error('رقم الطلب غير صالح');
    const round = tablesRepo.getRoundState(parsedRoundId);
    if (!round) throw new Error('طلب المطبخ غير موجود أو ليس من طلبات اليوم');
    checkTransition(round.kitchen_status, status, tablesRepo.getRoundLastChange(parsedRoundId));
    return tablesRepo.moveRound(parsedRoundId, round.kitchen_status, status, session?.id);
  }

  const parsedSaleId = parseId(saleId);
  if (!parsedSaleId) throw new Error('رقم الطلب غير صالح');
  const order = kitchenRepo.getOrderState(parsedSaleId);
  if (!order) throw new Error('طلب المطبخ غير موجود أو ليس من طلبات اليوم');

  const lastChange = kitchenRepo.getLastChange(parsedSaleId);
  checkTransition(order.kitchen_status, status, lastChange);
  return kitchenRepo.moveOrder(parsedSaleId, order.kitchen_status, status, session?.id);
}

module.exports = { getKitchenOrders, updateKitchenOrderStatus };

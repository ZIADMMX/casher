// The kitchen order flow, shared by the local app and the central server.
// An order only moves one step forward: new → preparing → ready → served.
// The last step can be undone (one step back) within UNDO_WINDOW_SECONDS,
// so a mis-tap is fixable but history can't be rewritten later.

const STATUSES = ['new', 'preparing', 'ready', 'served'];
const NEXT = { new: 'preparing', preparing: 'ready', ready: 'served' };
const PREVIOUS = { preparing: 'new', ready: 'preparing', served: 'ready' };
const UNDO_WINDOW_SECONDS = 120;

class KitchenFlowError extends Error {}

// lastChange: the latest recorded move for this order ({ fromStatus, toStatus, ageSeconds }), if any.
function checkTransition(current, requested, lastChange = null) {
  const from = current || 'new';
  if (!STATUSES.includes(requested)) throw new KitchenFlowError('حالة طلب المطبخ غير صالحة');
  if (from === requested) throw new KitchenFlowError('الطلب اتحدث بالفعل من شاشة تانية');
  if (NEXT[from] === requested) return 'forward';
  if (PREVIOUS[from] === requested) {
    const undoesLastMove = lastChange
      && lastChange.toStatus === from
      && lastChange.fromStatus === requested
      && lastChange.ageSeconds <= UNDO_WINDOW_SECONDS;
    if (undoesLastMove) return 'undo';
    throw new KitchenFlowError('التراجع متاح لمدة دقيقتين بعد آخر نقل فقط');
  }
  throw new KitchenFlowError('لا يمكن نقل الطلب لهذه المرحلة مباشرة');
}

module.exports = {
  STATUSES,
  NEXT,
  PREVIOUS,
  UNDO_WINDOW_SECONDS,
  KitchenFlowError,
  checkTransition,
};

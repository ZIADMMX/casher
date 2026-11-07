// Restaurant tables and their open checks. Paying a check goes through the
// normal sales service (see createSale's tableTabId), so stock, shifts and
// reports work exactly as for any other sale.
const tablesRepo = require('../repositories/tables.repository');
const variantsRepo = require('../repositories/productVariants.repository');
const shiftsRepo = require('../repositories/shifts.repository');
const { requireAuth, getCurrentSession } = require('./auth.service');
const { resolveModifiers, cleanNote, getCatalog: getAddonCatalog } = require('./modifiers.service');

const MAX_TABLES = 200;

function positiveId(value, label) {
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error(`${label} غير صالح`);
  return id;
}

// Same rule as a normal sale: no open shift (which needs attendance), no orders.
function requireOpenShift() {
  const session = getCurrentSession();
  const shift = shiftsRepo.getCurrentOpenShift(session?.id) || shiftsRepo.getCurrentOpenShift();
  if (!shift) throw new Error('افتح الوردية أولاً قبل استقبال طلبات الطاولات');
}

function getTables() {
  requireAuth();
  return tablesRepo.getTables();
}

function addTable(name) {
  requireAuth();
  const tables = tablesRepo.getTables();
  if (tables.length >= MAX_TABLES) throw new Error('وصلت للحد الأقصى لعدد الطاولات');
  const cleanName = String(name ?? '').trim() || `طاولة ${tables.length + 1}`;
  if (cleanName.length > 40) throw new Error('اسم الطاولة طويل جدًا');
  if (tables.some((table) => table.name === cleanName)) throw new Error('فيه طاولة بنفس الاسم');
  tablesRepo.addTable(cleanName);
  return tablesRepo.getTables();
}

function removeTable(tableId) {
  requireAuth();
  const id = positiveId(tableId, 'رقم الطاولة');
  if (!tablesRepo.getTable(id)) throw new Error('الطاولة غير موجودة');
  if (tablesRepo.getOpenTabForTable(id)) throw new Error('الطاولة عليها حساب مفتوح؛ اقفله الأول');
  tablesRepo.retireTable(id);
  return tablesRepo.getTables();
}

function tabWithItems(tabId) {
  const tab = tablesRepo.getTab(tabId);
  const items = tablesRepo.getTabItems(tabId);
  const sum = (list) => Math.round(list.reduce((acc, item) => acc + item.quantity * item.unit_price, 0) * 100) / 100;
  // total is what is still unpaid; parts of a split check may already be paid.
  return { ...tab, items, total: sum(items.filter((item) => item.paid_sale_id == null)), paid_total: sum(items.filter((item) => item.paid_sale_id != null)) };
}

// Opens the table's check, or returns the one already open.
function openTab(tableId) {
  requireAuth();
  requireOpenShift();
  const id = positiveId(tableId, 'رقم الطاولة');
  if (!tablesRepo.getTable(id)) throw new Error('الطاولة غير موجودة');
  const existing = tablesRepo.getOpenTabForTable(id);
  if (existing) return tabWithItems(existing.id);
  return tabWithItems(tablesRepo.openTab(id, getCurrentSession()?.id));
}

function getOpenTab(tabId) {
  requireAuth();
  const tab = tablesRepo.getTab(positiveId(tabId, 'رقم الحساب'));
  if (!tab || tab.status !== 'open') throw new Error('الحساب ده اتقفل بالفعل');
  return tabWithItems(tab.id);
}

// Sends new items to the kitchen as one round. Prices come from the catalog, not the till.
function sendRound(tabId, items) {
  requireAuth();
  requireOpenShift();
  const id = positiveId(tabId, 'رقم الحساب');
  const tab = tablesRepo.getTab(id);
  if (!tab || tab.status !== 'open') throw new Error('الحساب ده اتقفل بالفعل');
  if (!Array.isArray(items) || items.length === 0) throw new Error('مفيش أصناف جديدة تتبعت للمطبخ');
  if (items.length > 100) throw new Error('أصناف كتير في دفعة واحدة');

  const catalog = getAddonCatalog();
  const lines = items.map((item) => {
    const variantId = positiveId(item?.variantId, 'الصنف');
    const quantity = Number(item?.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1000) throw new Error('الكمية غير صالحة');
    const variant = variantsRepo.getById(variantId);
    if (!variant) throw new Error('صنف غير موجود في المنيو');
    const { modifiers, extra } = resolveModifiers(item?.modifiers, catalog);
    const unitPrice = Math.round(((Number(variant.selling_price) || 0) + extra) * 100) / 100;
    return { variantId, quantity, unitPrice, modifiers, note: cleanNote(item?.note) };
  });

  const roundId = tablesRepo.addRound(id, lines, getCurrentSession()?.id);
  // roundId lets the till print this round's kitchen ticket.
  return { ...tabWithItems(id), roundId };
}

// Only an empty check can be cancelled; anything the kitchen received must be paid.
function cancelTab(tabId) {
  requireAuth();
  const id = positiveId(tabId, 'رقم الحساب');
  if (tablesRepo.getTabItems(id).length > 0) throw new Error('الحساب فيه أصناف اتبعتت للمطبخ؛ لازم يتدفع');
  const result = tablesRepo.closeTab(id, 'cancelled');
  if (!result.changes) throw new Error('الحساب ده اتقفل بالفعل');
  return tablesRepo.getTables();
}

module.exports = {
  getTables,
  addTable,
  removeTable,
  openTab,
  getOpenTab,
  sendRound,
  cancelTab,
};

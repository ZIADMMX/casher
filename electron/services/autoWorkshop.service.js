const { db } = require('../database/db');
const repo = require('../repositories/autoWorkshop.repository');
const purchases = require('./purchases.service');
const auth = require('./auth.service');
const SettingsRepository = require('../repositories/settings.repository');
const { warrantyUntilFor } = require('./enterprise/workflows');
const INTAKE = require('../../shared/vehicleIntake.json');

// Workshop notifications: bell + in-app toast + a Windows toast. They never break the action that raised them.
function alertWorkshop(payload) {
  try { require('./notifications.service').notify({ linkPage: 'work-orders', ...payload }); } catch { /* a notification must never fail the work */ }
}
const carOf = (o) => `${[o.make, o.model].filter(Boolean).join(' ') || 'مركبة'} (${o.plate})`;

// Allowed moves. 'delivered' is reached only through billing (see deliver()).
const NEXT = {
  received: ['diagnosing', 'in_progress', 'cancelled'],
  diagnosing: ['awaiting_approval', 'in_progress', 'cancelled'],
  awaiting_approval: ['in_progress', 'cancelled'],
  in_progress: ['awaiting_approval', 'ready', 'cancelled'],
  ready: ['in_progress', 'delivered', 'cancelled'],
  delivered: [],
  cancelled: [],
};
const LABEL = { received: 'تم الاستلام', diagnosing: 'قيد الفحص', awaiting_approval: 'بانتظار الموافقة', in_progress: 'قيد التنفيذ', ready: 'جاهزة', delivered: 'تم التسليم', cancelled: 'ملغاة' };
const FROZEN = ['delivered', 'cancelled']; // lines and fields can no longer change
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const todayIso = () => new Date().toISOString().slice(0, 10);

const text = (v, max = 500) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return s ? s.slice(0, max) : null;
};
const posInt = (v, label) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 1) throw new Error(`${label} غير صالح`);
  return n;
};
const nonNegInt = (v, label) => {
  const n = Number(v);
  if (!Number.isSafeInteger(n) || n < 0) throw new Error(`${label} غير صالح`);
  return n;
};
const money = (v, label) => {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label} غير صالح`);
  return Math.round(n * 100) / 100;
};
// Plates compare without spaces/dashes and in upper case: "أ ب ج 123" == "أبج-123".
const AR_DIGITS = '٠١٢٣٤٥٦٧٨٩';
const normalizePlate = (p) => String(p || '')
  .replace(/[٠-٩]/g, (d) => AR_DIGITS.indexOf(d))
  .replace(/[\s-]+/g, '').toUpperCase();
const PLATE_KINDS = ['private', 'authority', 'military'];

function vehicleFields(data, current = {}) {
  const plate = normalizePlate(data.plate ?? current.plate);
  if (plate.length < 3) throw new Error('رقم اللوحة مطلوب');
  const year = data.year == null || data.year === '' ? null : posInt(data.year, 'سنة الصنع');
  if (year !== null && (year < 1950 || year > 2100)) throw new Error('سنة الصنع غير صالحة');
  const customerId = posInt(data.customer_id ?? current.customer_id, 'العميل');
  if (!repo.customerExists(customerId)) throw new Error('العميل غير موجود');
  const other = repo.getVehicleByPlate(plate);
  if (other && other.id !== current.id) throw new Error('اللوحة دي مسجلة لسيارة تانية');
  return {
    customer_id: customerId, plate, year,
    plate_city: text(data.plate_city ?? current.plate_city, 40),
    plate_kind: PLATE_KINDS.includes(data.plate_kind) ? data.plate_kind : (current.plate_kind || 'private'),
    make: text(data.make, 60), model: text(data.model, 60), vin: text(data.vin, 40),
    color: text(data.color, 30), notes: text(data.notes),
  };
}

function createVehicle(data = {}) {
  const f = vehicleFields(data);
  const odometer = data.odometer == null ? 0 : nonNegInt(data.odometer, 'عداد الكيلومترات');
  const id = db.transaction(() => {
    const vid = repo.insertVehicle({ ...f, odometer });
    if (odometer > 0) repo.insertReading(vid, odometer, todayIso(), 'manual');
    return vid;
  })();
  return repo.getVehicle(id);
}

function updateVehicle(id, data = {}) {
  const current = repo.getVehicle(posInt(id, 'السيارة'));
  if (!current) throw new Error('السيارة غير موجودة');
  repo.updateVehicle(current.id, vehicleFields(data, current));
  return repo.getVehicle(current.id);
}

const searchVehicles = (q) => repo.searchVehicles(String(q || '').trim());

function getVehicleHistory(id) {
  const vehicle = repo.getVehicle(posInt(id, 'السيارة'));
  if (!vehicle) throw new Error('السيارة غير موجودة');
  return { vehicle, orders: repo.listOrders({ vehicleId: vehicle.id }), reminders: repo.getReminders(vehicle.id) };
}

function openOrder(data = {}) {
  const vehicle = repo.getVehicle(posInt(data.vehicle_id, 'السيارة'));
  if (!vehicle || !vehicle.is_active) throw new Error('السيارة غير موجودة');
  const odometer = nonNegInt(data.odometer_in, 'عداد الكيلومترات');
  if (odometer < vehicle.odometer) {
    throw new Error(`قراءة العداد (${odometer}) أقل من آخر قراءة مسجلة (${vehicle.odometer})`);
  }
  const days = data.warranty_days == null ? 0 : nonNegInt(data.warranty_days, 'مدة الضمان');
  return db.transaction(() => {
    const id = repo.insertOrder({
      vehicle_id: vehicle.id, customer_id: vehicle.customer_id, odometer_in: odometer,
      complaint: text(data.complaint), mechanic: text(data.mechanic, 80), warranty_days: days,
    });
    repo.raiseOdometer(vehicle.id, odometer);
    repo.insertReading(vehicle.id, odometer, todayIso(), 'work_order');
    return getOrder(id);
  })();
}

function getOrder(id) {
  const order = repo.getOrder(posInt(id, 'أمر الشغل'));
  if (!order) throw new Error('أمر الشغل غير موجود');
  const lines = repo.getLines(order.id);
  const sum = (kind) => Math.round(lines.filter((l) => l.kind === kind).reduce((s, l) => s + l.line_total, 0) * 100) / 100;
  const parts = sum('part');
  const labor = sum('labor');
  const waiting = lines.find((l) => l.po_status === 'sent');
  const pending = waiting ? { id: waiting.parts_order_id, po_number: waiting.po_number, expected_date: waiting.po_expected_date } : null;
  return { ...order, lines, pending_parts_order: pending, parts_total: parts, labor_total: labor, total: Math.round((parts + labor) * 100) / 100 };
}

const listOrders = (filters = {}) => repo.listOrders({ status: text(filters.status, 30), vehicleId: filters.vehicleId });

function requireEditable(id) {
  const order = repo.getOrder(posInt(id, 'أمر الشغل'));
  if (!order) throw new Error('أمر الشغل غير موجود');
  if (FROZEN.includes(order.status) || order.sale_id) throw new Error('أمر الشغل مقفول ومينفعش يتعدّل');
  return order;
}

function updateOrder(id, data = {}) {
  const order = requireEditable(id);
  repo.updateOrderFields(order.id, {
    diagnosis: text(data.diagnosis, 2000), mechanic: text(data.mechanic, 80), complaint: text(data.complaint),
    warranty_days: data.warranty_days == null ? null : nonNegInt(data.warranty_days, 'مدة الضمان'),
  });
  return getOrder(order.id);
}

function addLine(orderId, data = {}) {
  const order = requireEditable(orderId);
  const kind = data.kind;
  if (kind !== 'part' && kind !== 'labor') throw new Error('نوع البند لازم يكون قطعة أو مصنعية');
  const quantity = Number(data.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('الكمية غير صالحة');

  let variant = null;
  if (kind === 'part') {
    variant = repo.getVariantForLine(posInt(data.variant_id, 'القطعة'));
    if (!variant) throw new Error('القطعة غير موجودة في المخزون');
  }
  const description = text(data.description, 200) || variant?.product_name;
  if (!description) throw new Error('وصف البند مطلوب');
  // Price/cost come from the catalog unless the workshop overrides the price; cost is never taken from the client.
  const id = repo.insertLine({
    work_order_id: order.id, kind, variant_id: variant ? variant.id : null, description, quantity,
    unit_price: data.unit_price == null ? money(variant?.price, 'السعر') : money(data.unit_price, 'السعر'),
    unit_cost: variant ? variant.cost_price : 0,
  });
  return { id, order: getOrder(order.id) };
}

function removeLine(lineId) {
  const line = repo.getLine(posInt(lineId, 'البند'));
  if (!line) throw new Error('البند غير موجود');
  requireEditable(line.work_order_id);
  repo.deleteLine(line.id);
  return getOrder(line.work_order_id);
}

function setLineQuantity(lineId, quantity) {
  const line = repo.getLine(posInt(lineId, 'البند'));
  if (!line) throw new Error('البند غير موجود');
  requireEditable(line.work_order_id);
  const q = Number(quantity);
  if (!Number.isFinite(q) || q <= 0) throw new Error('الكمية غير صالحة');
  repo.setLineQuantity(line.id, q);
  return getOrder(line.work_order_id);
}

function setStatus(id, status) {
  const order = repo.getOrder(posInt(id, 'أمر الشغل'));
  if (!order) throw new Error('أمر الشغل غير موجود');
  if (!NEXT[order.status]?.includes(status)) throw new Error('الانتقال بين الحالتين دي مش مسموح');
  if (status === 'ready') {
    const waiting = getOrder(order.id).pending_parts_order;
    if (waiting) throw new Error(`بانتظار توريد القطع (${waiting.po_number}). سجّل استلامها الأول`);
  }
  if (status === 'delivered' && !order.sale_id) throw new Error('لازم أمر الشغل يتحصّل الأول قبل التسليم');
  repo.setStatus(order.id, status, FROZEN.includes(status));
  const after = getOrder(order.id);
  if (status === 'ready') {
    alertWorkshop({ type: 'workshop_ready', title: 'مركبة جاهزة للتسليم', message: `${carOf(after)} جاهزة. كلّم العميل ${after.customer_name}${after.customer_phone ? ` على ${after.customer_phone}` : ''}`, dedupeKey: `wo_ready:${after.id}` });
  } else if (status === 'awaiting_approval') {
    alertWorkshop({ type: 'workshop_approval', title: 'بانتظار موافقة العميل', message: `${after.order_number} · ${carOf(after)}: عرّف ${after.customer_name} بالتكلفة واطلب موافقته` });
  }
  return after;
}

// ---- parts purchase orders: one PO covers the order's short parts that are not already on order ----
const shortLines = (order) => order.lines.filter((l) => l.kind === 'part' && !l.parts_order_id && Number(l.stock_quantity) < l.quantity);

// What the order panel shows: each short part with the last supplier and cost for it.
function getPartsOrderDraft(orderId) {
  return shortLines(getOrder(orderId)).map((l) => ({
    line_id: l.id, variant_id: l.variant_id, description: l.description, barcode: l.barcode, unit_cost: l.unit_cost,
    stock: Number(l.stock_quantity), required: l.quantity, shortage: l.quantity - Number(l.stock_quantity), last: repo.lastSupply(l.variant_id),
  }));
}

function orderMissingParts(orderId, data = {}) {
  const order = requireEditable(orderId);
  const supplierId = posInt(data.supplier_id, 'المورد');
  if (!require('../repositories/suppliers.repository').getById(supplierId)) throw new Error('المورد غير موجود');
  const expected = data.expected_date ? String(data.expected_date) : null;
  if (expected && !DATE_RE.test(expected)) throw new Error('تاريخ التوريد غير صالح');
  const short = shortLines(getOrder(order.id));
  if (!short.length) throw new Error('مفيش قطع ناقصة محتاجة أمر شراء');
  // The panel may raise or lower what is ordered per part; anything else keeps the shortage.
  const wanted = new Map((Array.isArray(data.items) ? data.items : []).map((i) => [Number(i.variant_id), Number(i.quantity)]));
  for (const [variantId, q] of wanted) {
    if (!short.some((l) => l.variant_id === variantId)) throw new Error('صنف مش ضمن القطع الناقصة');
    if (!Number.isFinite(q) || q <= 0) throw new Error('الكمية غير صالحة');
  }
  const id = db.transaction(() => repo.insertPartsOrder({
    supplier_id: supplierId, work_order_id: order.id, expected_date: expected, lineIds: short.map((l) => l.id),
    items: short.map((l) => ({ variant_id: l.variant_id, quantity: wanted.get(l.variant_id) ?? l.quantity - Number(l.stock_quantity), unit_cost: l.unit_cost })),
  }))();
  const po = getPartsOrder(id);
  alertWorkshop({ type: 'workshop_parts_ordered', title: 'أمر شراء قطع غيار', message: `${po.po_number} للمورد ${po.supplier_name} لأمر الشغل ${order.order_number}` });
  return { parts_order: po, order: getOrder(order.id) };
}

function getPartsOrder(id) {
  const po = repo.getPartsOrder(posInt(id, 'أمر الشراء'));
  if (!po) throw new Error('أمر الشراء غير موجود');
  return { ...po, items: repo.getPartsOrderItems(po.id) };
}

// Receiving books a normal supplier invoice (stock in, unpaid balance owed to the supplier), once.
function receivePartsOrder(id) {
  const po = getPartsOrder(id);
  if (po.status !== 'sent') throw new Error('أمر الشراء ده مش مفتوح');
  db.transaction(() => {
    const invoice = purchases.createPurchase({
      supplierId: po.supplier_id, invoiceNumber: po.po_number, paidAmount: 0, notes: `استلام أمر الشراء ${po.po_number}`,
      items: po.items.map((i) => ({ variant_id: i.variant_id, product_name: i.product_name, size: i.size, color: i.color, quantity: i.quantity, purchase_price: i.unit_cost })),
    });
    repo.setPartsOrderStatus(po.id, 'received', Number(invoice.purchaseId));
  })();
  return { parts_order: getPartsOrder(po.id), order: getOrder(po.work_order_id) };
}

function cancelPartsOrder(id) {
  const po = getPartsOrder(id);
  if (po.status !== 'sent') throw new Error('أمر الشراء ده مش مفتوح');
  db.transaction(() => { repo.setPartsOrderStatus(po.id, 'cancelled'); repo.unlinkPartsOrder(po.id); })();
  return { parts_order: getPartsOrder(po.id), order: getOrder(po.work_order_id) };
}

// ---- profit: owner/manager only. Costs never reach a cashier's screen. ----
function isAdmin() {
  try { auth.requireAdmin(); return true; } catch { return false; }
}

// A result that carries order lines loses their cost for anyone who may not see profit.
function stripCosts(value) {
  if (!value || isAdmin()) return value;
  const strip = (o) => (o && Array.isArray(o.lines) ? { ...o, lines: o.lines.map((l) => { const copy = { ...l }; delete copy.unit_cost; return copy; }) } : o);
  return value.order ? { ...value, order: strip(value.order) } : strip(value);
}

const round2 = (n) => Math.round(n * 100) / 100;

function getOrderProfit(orderId) {
  if (!isAdmin()) return { hidden: true };
  const order = getOrder(orderId);
  const hourly = Number(SettingsRepository.get('workshop_labor_cost_per_hour')) || 0;
  const target = Number(SettingsRepository.get('workshop_target_margin')) || 15;
  const parts = order.lines.filter((l) => l.kind === 'part');
  const costed = parts.filter((l) => l.unit_cost > 0);
  const missing = parts.filter((l) => !(l.unit_cost > 0)).map((l) => ({ line_id: l.id, variant_id: l.variant_id, description: l.description }));
  const partsCost = round2(costed.reduce((t, l) => t + l.unit_cost * l.quantity, 0));
  const hours = order.lines.filter((l) => l.kind === 'labor').reduce((t, l) => t + l.quantity, 0);
  const laborCost = round2(hours * hourly);
  const revenue = order.total;
  const complete = missing.length === 0;
  const net = complete ? round2(revenue - partsCost - laborCost) : null;
  return {
    hidden: false, revenue, labor_total: order.labor_total, parts_total: order.parts_total,
    parts_cost: partsCost, costed_lines: costed.length, parts_lines: parts.length, missing,
    hours, hourly_cost: hourly, labor_cost: laborCost, target_margin: target,
    net, margin: complete && revenue > 0 ? round2((net / revenue) * 100) : null,
  };
}

function setPartCost(variantId, cost) {
  auth.requireAdmin();
  const id = posInt(variantId, 'القطعة');
  if (!repo.getVariantForLine(id)) throw new Error('القطعة غير موجودة في المخزون');
  const c = money(cost, 'سعر التكلفة');
  db.transaction(() => { repo.setVariantCost(id, c); repo.setOpenLinesCost(id, c); })();
  return { variant_id: id, cost: c };
}

function setLaborCostPerHour(value) {
  auth.requireAdmin();
  SettingsRepository.set('workshop_labor_cost_per_hour', money(value, 'تكلفة الساعة'));
  return { hourly_cost: Number(SettingsRepository.get('workshop_labor_cost_per_hour')) };
}

// The till bills what the order says (the server fixes the prices, same as a table check).
function getBilling(id) {
  const order = getOrder(id);
  if (order.status !== 'ready') throw new Error('أمر الشغل لسه مش جاهز للتحصيل');
  if (order.sale_id) throw new Error(`أمر الشغل اتحصّل بالفعل في فاتورة #${order.sale_id}`);
  if (!order.lines.length) throw new Error('أمر الشغل مفيهوش بنود');
  const items = order.lines.map((l) => (l.kind === 'part'
    ? { variantId: l.variant_id, quantity: l.quantity, unitPrice: l.unit_price }
    : { variantId: repo.laborVariantId(), quantity: 1, unitPrice: l.line_total, note: l.description }));
  return { order, items };
}

// Inside the sale transaction: bill it once, then hand the car over.
function settleOrder(orderId, saleId) {
  markBilled(orderId, saleId);
  repo.setStatus(orderId, 'delivered', true);
}

// Called by the till inside the sale transaction (same contract as markTicketBilled).
function markBilled(orderId, saleId, from = new Date()) {
  const order = repo.getOrder(orderId);
  if (!order) throw new Error('أمر الشغل غير موجود');
  if (!['ready', 'delivered'].includes(order.status)) throw new Error('أمر الشغل لسه مش جاهز للتحصيل');
  if (repo.markBilled(order.id, saleId, warrantyUntilFor(order, from)) !== 1) {
    throw new Error('أمر الشغل اتحصّل بالفعل');
  }
}

function addReminder(vehicleId, data = {}) {
  const vehicle = repo.getVehicle(posInt(vehicleId, 'السيارة'));
  if (!vehicle) throw new Error('السيارة غير موجودة');
  const kind = text(data.kind, 80);
  if (!kind) throw new Error('نوع الصيانة مطلوب');
  const dueDate = text(data.due_date, 10);
  if (dueDate && !DATE_RE.test(dueDate)) throw new Error('تاريخ الاستحقاق غير صالح');
  const dueKm = data.due_odometer == null || data.due_odometer === '' ? null : nonNegInt(data.due_odometer, 'عداد الاستحقاق');
  if (!dueDate && dueKm === null) throw new Error('حدد تاريخ أو كيلومترات للتذكير');
  const sendAt = text(data.send_at, 10);
  if (sendAt && !DATE_RE.test(sendAt)) throw new Error('تاريخ الإرسال غير صالح');
  return repo.insertReminder({ vehicle_id: vehicle.id, kind, due_date: dueDate, due_odometer: dueKm, send_at: sendAt });
}

function completeReminder(id) {
  if (repo.completeReminder(posInt(id, 'التذكير')) !== 1) throw new Error('التذكير غير موجود أو اتنفّذ قبل كده');
  return true;
}

const getDueReminders = (today = new Date().toISOString().slice(0, 10)) => repo.getDueReminders(today);

// "Next service" state for the list: overdue / soon / ok / none, with the label the screen shows.
const SOON_DAYS = 14;
const SOON_KM = 1000;
function dueState(vehicle, reminder, today) {
  if (!reminder) return { status: 'none', label: 'بانتظار الجدولة' };
  const day = 86400000;
  const days = reminder.due_date ? Math.round((Date.parse(reminder.due_date) - Date.parse(today)) / day) : null;
  const km = reminder.due_odometer != null ? reminder.due_odometer - vehicle.odometer : null;
  const late = (days !== null && days < 0) || (km !== null && km <= 0);
  if (late) return { status: 'overdue', label: km !== null && km <= 0 && !(days < 0) ? `متأخرة ${-km} كم` : `متأخرة ${-days} يوم` };
  const soon = (days !== null && days <= SOON_DAYS) || (km !== null && km <= SOON_KM);
  const useKm = km !== null && (days === null || km <= SOON_KM);
  return { status: soon ? 'soon' : 'ok', label: useKm ? `بعد ${km} كم` : `بعد ${days} يوم` };
}

function getVehiclesOverview(filters = {}) {
  const today = new Date().toISOString().slice(0, 10);
  const q = String(filters.q || '').trim().replace(/[%_]/g, '');
  const rows = repo.listVehicles(q).map((v) => {
    const r = v.next_reminder_id ? repo.getReminder(v.next_reminder_id) : null;
    return { ...v, next_service: dueState(v, r, today) };
  });
  const counts = { all: rows.length, soon: 0, overdue: 0 };
  for (const v of rows) if (counts[v.next_service.status] !== undefined) counts[v.next_service.status] += 1;
  const makes = [...new Set(rows.map((v) => v.make).filter(Boolean))].sort();
  const filtered = rows.filter((v) => (!filters.status || filters.status === 'all' || v.next_service.status === filters.status)
    && (!filters.make || v.make === filters.make));
  const pageSize = [10, 25, 50].includes(Number(filters.pageSize)) ? Number(filters.pageSize) : 10;
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(Math.max(1, Number(filters.page) || 1), pages);

  const monthStart = today.slice(0, 8) + '01';
  const prev = new Date(Date.parse(monthStart) - 86400000).toISOString().slice(0, 8) + '01';
  const c = repo.vehicleCounts(monthStart, prev);
  return {
    items: filtered.slice((page - 1) * pageSize, page * pageSize),
    total: filtered.length, page, pages, pageSize, makes,
    stats: { total: c.total, newThisMonth: c.new_this_month, servicedMonth: c.serviced_month, servicedPrev: c.serviced_prev, soon: counts.soon, overdue: counts.overdue },
  };
}

// Soft delete: the vehicle's service history stays. Refused while a work order is still open.
function deactivateVehicle(id) {
  const vehicle = repo.getVehicle(posInt(id, 'السيارة'));
  if (!vehicle) throw new Error('السيارة غير موجودة');
  if (repo.openOrderCount(vehicle.id) > 0) throw new Error('عليها أمر شغل مفتوح. أقفله الأول');
  repo.setVehicleActive(vehicle.id, false);
  return true;
}

// A manual odometer reading: it can only move forward and raises the vehicle's odometer.
function addOdometerReading(vehicleId, data = {}) {
  const vehicle = repo.getVehicle(posInt(vehicleId, 'السيارة'));
  if (!vehicle) throw new Error('السيارة غير موجودة');
  const km = nonNegInt(data.km, 'قراءة العداد');
  if (km < vehicle.odometer) throw new Error(`القراءة (${km}) أقل من آخر قراءة مسجلة (${vehicle.odometer})`);
  const readAt = text(data.read_at, 10) || todayIso();
  if (!DATE_RE.test(readAt)) throw new Error('تاريخ القراءة غير صالح');
  db.transaction(() => {
    repo.insertReading(vehicle.id, km, readAt, 'manual');
    repo.raiseOdometer(vehicle.id, km);
  })();
  return getVehicleProfile(vehicle.id);
}

function markReminderSent(id) {
  if (repo.markReminderSent(posInt(id, 'التذكير')) !== 1) throw new Error('التذكير غير موجود أو اتنفّذ قبل كده');
  return true;
}

// Everything the vehicle drawer shows: details, work orders with their lines, odometer history, reminders.
function getVehicleProfile(id) {
  const vehicle = repo.getVehicle(posInt(id, 'السيارة'));
  if (!vehicle) throw new Error('السيارة غير موجودة');
  const today = todayIso();
  const orders = repo.listOrders({ vehicleId: vehicle.id }, 100).map((o) => getOrder(o.id));
  const reminders = repo.getReminders(vehicle.id).map((r) => ({
    ...r, state: r.done_at ? { status: 'done', label: 'تمت' } : dueState(vehicle, r, today),
  }));
  const open = reminders.filter((r) => !r.done_at);
  const nextReminder = open.slice().sort((a, b) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))[0];
  const readings = repo.getReadings(vehicle.id);
  const lastOrder = orders.find((o) => o.status !== 'cancelled');
  const first = readings[0];
  const last = readings[readings.length - 1];
  const months = first && last ? Math.max(1, (Date.parse(last.read_at) - Date.parse(first.read_at)) / (30 * 86400000)) : 0;
  return {
    vehicle: { ...vehicle, next_service: dueState(vehicle, nextReminder || null, today) },
    orders,
    spent: Math.round(orders.filter((o) => o.status === 'delivered').reduce((s, o) => s + o.total, 0) * 100) / 100,
    readings,
    odometerStats: {
      sinceService: lastOrder ? Math.max(0, vehicle.odometer - lastOrder.odometer_in) : null,
      monthlyAvg: readings.length > 1 ? Math.round((last.km - first.km) / months) : null,
      nextServiceKm: nextReminder?.due_odometer ?? null,
    },
    reminders,
  };
}

// One customer's workshop file: their cars, every visit (what was done, what was paid, when) and totals.
function getCustomerProfile(customerId) {
  const customer = repo.getCustomer(posInt(customerId, 'العميل'));
  if (!customer) throw new Error('العميل غير موجود');
  const visits = repo.listOrderIdsOfCustomer(customer.id).map((id) => {
    const o = getOrder(id);
    const sale = o.sale_id ? repo.getSaleBrief(o.sale_id) : null;
    return {
      id: o.id, order_number: o.order_number, status: o.status, opened_at: o.opened_at, closed_at: o.closed_at,
      plate: o.plate, make: o.make, model: o.model, odometer_in: o.odometer_in, complaint: o.complaint, mechanic: o.mechanic,
      total: o.total,
      services: o.lines.filter((l) => l.kind === 'labor').map((l) => l.description),
      parts: o.lines.filter((l) => l.kind === 'part').map((l) => ({ description: l.description, quantity: l.quantity })),
      payment: sale ? { sale_id: sale.id, amount: sale.total_amount, method: sale.payment_method, at: sale.created_at } : null,
    };
  });
  const done = visits.filter((v) => v.status !== 'cancelled');
  const paid = visits.filter((v) => v.payment && v.payment.method !== 'credit');
  const owed = visits.filter((v) => v.payment && v.payment.method === 'credit');
  return {
    customer, vehicles: repo.listVehiclesOfCustomer(customer.id), visits,
    stats: {
      visits: done.length,
      open: visits.filter((v) => !['delivered', 'cancelled'].includes(v.status)).length,
      total_paid: round2(paid.reduce((t, v) => t + v.payment.amount, 0)),
      on_credit: round2(owed.reduce((t, v) => t + v.payment.amount, 0)),
      last_visit: done[0]?.opened_at || null,
      first_visit: done.length ? done[done.length - 1].opened_at : null,
    },
  };
}

// Live duplicate check for the new-vehicle form. Returns just enough to tell the user whose car it is.
function findVehicleByPlate(plate) {
  const v = repo.getVehicleByPlate(normalizePlate(plate));
  return v ? { id: v.id, plate: v.plate, make: v.make, model: v.model, year: v.year, customer_name: v.customer_name, is_active: v.is_active } : null;
}

// ---- check-in ("استلام مركبة") ----
const CHECKLIST_KEYS = Object.values(INTAKE.checklist).flat().map((i) => i.key);
const PHOTO_KEYS = INTAKE.photoSlots.map((s) => s.key);
const DATA_URL = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;
const MAX_PHOTO = 900_000; // characters of base64 per photo, about 650 KB
const MAX_SIGNATURE = 400_000;

function cleanDamages(list) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 30) throw new Error('ملاحظات الهيكل غير صالحة');
  return list.map((d) => {
    const x = Number(d?.x); const y = Number(d?.y);
    if (!INTAKE.damageTypes[d?.type]) throw new Error('نوع ملاحظة الهيكل غير صالح');
    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 100 || y < 0 || y > 100) throw new Error('موضع ملاحظة الهيكل غير صالح');
    return { type: d.type, x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, zone: text(d.zone, 60) || '', note: text(d.note, 200) || '' };
  });
}

function cleanChecklist(map) {
  const out = {};
  for (const key of CHECKLIST_KEYS) {
    const v = map?.[key];
    if (v !== 'present' && v !== 'missing') throw new Error('قائمة الفحص غير مكتملة');
    out[key] = v;
  }
  return out;
}

function cleanPhotos(map) {
  const out = {};
  for (const key of PHOTO_KEYS) {
    const v = map?.[key];
    if (!v) continue;
    if (typeof v !== 'string' || !DATA_URL.test(v) || v.length > MAX_PHOTO) throw new Error('إحدى الصور غير صالحة أو كبيرة');
    out[key] = v;
  }
  return out;
}

// Opens the work order and records the check-in sheet in one transaction.
function checkInVehicle(data = {}, receivedBy = null) {
  const complaint = text(data.complaint, 500);
  if (!complaint) throw new Error('شكوى العميل مطلوبة');
  const fuel = Number(data.fuel_level);
  if (!Number.isInteger(fuel) || fuel < 0 || fuel > 4) throw new Error('مستوى الوقود غير صالح');
  const signature = data.signature;
  if (typeof signature !== 'string' || !DATA_URL.test(signature) || signature.length > MAX_SIGNATURE) throw new Error('توقيع العميل مطلوب');
  const damages = cleanDamages(data.damages);
  const checklist = cleanChecklist(data.checklist);
  const photos = cleanPhotos(data.photos);
  const result = db.transaction(() => {
    const order = openOrder({ vehicle_id: data.vehicle_id, odometer_in: data.odometer_in, complaint, warranty_days: data.warranty_days });
    repo.insertIntake({
      work_order_id: order.id, fuel_level: fuel, damages: JSON.stringify(damages), checklist: JSON.stringify(checklist),
      photos: JSON.stringify(photos), signature, received_by: text(receivedBy, 80),
    });
    return getCheckIn(order.id);
  })();
  alertWorkshop({ type: 'workshop_received', title: 'استلام مركبة', message: `${carOf(result.order)} للعميل ${result.order.customer_name}. أمر الشغل ${result.order.order_number}` });
  return result;
}

function getCheckIn(orderId) {
  const order = getOrder(orderId);
  const row = repo.getIntake(order.id);
  if (!row) return { order, intake: null };
  return {
    order,
    intake: { ...row, damages: JSON.parse(row.damages), checklist: JSON.parse(row.checklist), photos: JSON.parse(row.photos) },
  };
}

// ---- work orders screen (table + board) ----
const OPEN_STATUSES = ['received', 'diagnosing', 'awaiting_approval', 'in_progress'];
const LATE_AFTER_MINUTES = 24 * 60; // shortcut: one fixed limit for every open status; make it a setting when workshops ask

function getWorkOrderBoard(filters = {}) {
  const days = [1, 7, 30, 90].includes(Number(filters.days)) ? Number(filters.days) : 30;
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);
  const now = Date.now();
  const items = repo.listBoardOrders(since).map((o) => {
    const opened = Date.parse(`${String(o.opened_at).replace(' ', 'T')}Z`);
    const age = Number.isNaN(opened) ? 0 : Math.max(0, Math.round((now - opened) / 60000));
    return { ...o, total: Math.round(o.total * 100) / 100, age_minutes: age, late: OPEN_STATUSES.includes(o.status) && age > LATE_AFTER_MINUTES };
  });
  const active = items.filter((o) => o.status !== 'delivered' && o.status !== 'cancelled');
  return {
    items,
    mechanics: [...new Set(items.map((o) => o.mechanic).filter(Boolean))].sort(),
    stats: { active: active.length, activeValue: Math.round(active.reduce((s, o) => s + o.total, 0) * 100) / 100, late: items.filter((o) => o.late).length },
  };
}

// Run every few minutes by the main process: late orders and due service reminders, once a day each.
function checkWorkshopAlerts() {
  const board = getWorkOrderBoard({ days: 1 });
  for (const o of board.items.filter((x) => x.late)) {
    alertWorkshop({ type: 'workshop_late', title: 'أمر شغل متأخر', message: `${o.order_number} · ${carOf(o)} لسه ${LABEL[o.status] || 'مفتوح'} بعد أكتر من 24 ساعة`, dedupeKey: `wo_late:${o.id}` });
  }
  for (const r of getDueReminders()) {
    alertWorkshop({ type: 'service_due', title: 'موعد صيانة مستحق', message: `${r.plate}: ${r.kind} للعميل ${r.customer_name}${r.customer_phone ? ` (${r.customer_phone})` : ''}`, linkPage: 'vehicles', dedupeKey: `service_due:${r.id}` });
  }
}

module.exports = {
  checkWorkshopAlerts,
  getWorkOrderBoard,
  checkInVehicle, getCheckIn,
  findVehicleByPlate,
  getVehicleProfile, addOdometerReading, markReminderSent,
  getVehiclesOverview, deactivateVehicle,
  createVehicle, updateVehicle, searchVehicles, getVehicleHistory,
  openOrder, getOrder, listOrders, updateOrder, addLine, removeLine, setLineQuantity, getBilling, settleOrder, getCustomerProfile, getOrderProfit, setPartCost, setLaborCostPerHour, stripCosts, getPartsOrderDraft, orderMissingParts, getPartsOrder, receivePartsOrder, cancelPartsOrder, setStatus, markBilled,
  addReminder, completeReminder, getDueReminders,
};

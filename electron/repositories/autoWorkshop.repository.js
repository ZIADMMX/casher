const { db } = require('../database/db');

const VEHICLE_SELECT = `
  SELECT v.*, c.name AS customer_name, c.phone AS customer_phone
  FROM vehicles v JOIN customers c ON c.id = v.customer_id`;

const getVehicle = (id) => db.prepare(`${VEHICLE_SELECT} WHERE v.id = ?`).get(id) || null;
const getVehicleByPlate = (plate) => db.prepare(`${VEHICLE_SELECT} WHERE v.plate = ?`).get(plate) || null;

function searchVehicles(q, limit = 50) {
  const like = `%${q}%`;
  return db.prepare(`${VEHICLE_SELECT}
    WHERE v.is_active = 1 AND (v.plate LIKE ? OR c.name LIKE ? OR c.phone LIKE ? OR v.vin LIKE ?)
    ORDER BY v.id DESC LIMIT ?`).all(like, like, like, like, limit);
}

function insertVehicle(v) {
  return db.prepare(`
    INSERT INTO vehicles (customer_id, plate, plate_city, plate_kind, make, model, year, vin, color, odometer, notes)
    VALUES (@customer_id, @plate, @plate_city, @plate_kind, @make, @model, @year, @vin, @color, @odometer, @notes)
  `).run(v).lastInsertRowid;
}

function updateVehicle(id, v) {
  db.prepare(`
    UPDATE vehicles SET customer_id=@customer_id, plate=@plate, plate_city=@plate_city, plate_kind=@plate_kind, make=@make, model=@model, year=@year,
      vin=@vin, color=@color, notes=@notes WHERE id=@id
  `).run({ ...v, id });
}

// MAX: an odometer reading can only go forward.
const raiseOdometer = (id, km) => db.prepare('UPDATE vehicles SET odometer = MAX(odometer, ?) WHERE id = ?').run(km, id);

// One row per active vehicle with its last service date and its soonest open reminder (the list screen).
function listVehicles(q = '') {
  return db.prepare(`
    SELECT v.*, c.name AS customer_name, c.phone AS customer_phone,
      (SELECT MAX(date(o.opened_at)) FROM work_orders o WHERE o.vehicle_id = v.id AND o.status <> 'cancelled') AS last_service_date,
      (SELECT r.id FROM service_reminders r WHERE r.vehicle_id = v.id AND r.done_at IS NULL
         ORDER BY COALESCE(r.due_date, '9999-12-31'), r.id LIMIT 1) AS next_reminder_id
    FROM vehicles v JOIN customers c ON c.id = v.customer_id
    WHERE v.is_active = 1 AND (@q = '' OR v.plate LIKE @like OR v.vin LIKE @like OR c.name LIKE @like OR c.phone LIKE @like)
    ORDER BY v.id DESC
  `).all({ q, like: `%${q}%` });
}

const getReminder = (id) => db.prepare('SELECT * FROM service_reminders WHERE id = ?').get(id) || null;
const setVehicleActive = (id, active) => db.prepare('UPDATE vehicles SET is_active = ? WHERE id = ?').run(active ? 1 : 0, id);
const openOrderCount = (vehicleId) => db.prepare("SELECT COUNT(*) AS n FROM work_orders WHERE vehicle_id = ? AND status NOT IN ('delivered','cancelled')").get(vehicleId).n;
const vehicleCounts = (monthStart, prevMonthStart) => db.prepare(`
  SELECT (SELECT COUNT(*) FROM vehicles WHERE is_active = 1) AS total,
    (SELECT COUNT(*) FROM vehicles WHERE is_active = 1 AND date(created_at) >= @monthStart) AS new_this_month,
    (SELECT COUNT(DISTINCT vehicle_id) FROM work_orders WHERE status <> 'cancelled' AND date(opened_at) >= @monthStart) AS serviced_month,
    (SELECT COUNT(DISTINCT vehicle_id) FROM work_orders WHERE status <> 'cancelled' AND date(opened_at) >= @prevMonthStart AND date(opened_at) < @monthStart) AS serviced_prev
`).get({ monthStart, prevMonthStart });

const insertReading = (vehicleId, km, readAt, source) => db.prepare(
  'INSERT INTO odometer_readings (vehicle_id, km, read_at, source) VALUES (?, ?, ?, ?)').run(vehicleId, km, readAt, source).lastInsertRowid;
const getReadings = (vehicleId) => db.prepare(
  'SELECT id, km, read_at, source FROM odometer_readings WHERE vehicle_id = ? ORDER BY read_at, id').all(vehicleId);
const markReminderSent = (id) => db.prepare(
  "UPDATE service_reminders SET sent_at = datetime('now','localtime') WHERE id = ? AND done_at IS NULL").run(id).changes;

const insertIntake = (i) => db.prepare(`
  INSERT INTO work_order_intakes (work_order_id, fuel_level, damages, checklist, photos, signature, received_by)
  VALUES (@work_order_id, @fuel_level, @damages, @checklist, @photos, @signature, @received_by)`).run(i);
const getIntake = (orderId) => db.prepare('SELECT * FROM work_order_intakes WHERE work_order_id = ?').get(orderId) || null;

// The work orders screen: every open order, plus orders closed (delivered / cancelled) since a date.
const listBoardOrders = (since) => db.prepare(`
  SELECT o.id, o.order_number, o.status, o.opened_at, o.closed_at, o.mechanic, o.complaint, o.odometer_in, o.sale_id, o.vehicle_id,
    v.plate, v.plate_city, v.plate_kind, v.make, v.model, v.year, c.name AS customer_name, c.phone AS customer_phone,
    (SELECT COUNT(*) FROM work_order_lines l WHERE l.work_order_id = o.id) AS lines_count,
    EXISTS (SELECT 1 FROM parts_orders po WHERE po.work_order_id = o.id AND po.status = 'sent') AS waiting_parts,
    COALESCE((SELECT SUM(l.quantity * l.unit_price) FROM work_order_lines l WHERE l.work_order_id = o.id), 0) AS total
  FROM work_orders o JOIN vehicles v ON v.id = o.vehicle_id JOIN customers c ON c.id = o.customer_id
  WHERE o.status NOT IN ('delivered', 'cancelled') OR date(COALESCE(o.closed_at, o.opened_at)) >= @since
  ORDER BY o.id DESC LIMIT 1000
`).all({ since });

const getCustomer = (id) => db.prepare('SELECT id, name, phone, created_at FROM customers WHERE id = ?').get(id) || null;
const listVehiclesOfCustomer = (customerId) => db.prepare(
  'SELECT id, plate, plate_city, plate_kind, make, model, year, color, odometer FROM vehicles WHERE customer_id = ? AND is_active = 1 ORDER BY id').all(customerId);
const listOrderIdsOfCustomer = (customerId, limit = 300) => db.prepare(
  'SELECT id FROM work_orders WHERE customer_id = ? ORDER BY id DESC LIMIT ?').all(customerId, limit).map((r) => r.id);
// What the till actually took for the order (the paid side of a visit).
const getSaleBrief = (saleId) => db.prepare('SELECT id, total_amount, discount, payment_method, created_at FROM sales WHERE id = ?').get(saleId) || null;

const customerExists = (id) => !!db.prepare('SELECT 1 FROM customers WHERE id = ? AND is_active = 1').get(id);

const getOrder = (id) => db.prepare(`
  SELECT o.*, v.plate, v.plate_city, v.plate_kind, v.make, v.model, v.year, c.name AS customer_name, c.phone AS customer_phone
  FROM work_orders o JOIN vehicles v ON v.id = o.vehicle_id JOIN customers c ON c.id = o.customer_id
  WHERE o.id = ?`).get(id) || null;

function listOrders({ status, vehicleId } = {}, limit = 200) {
  return db.prepare(`
    SELECT o.*, v.plate, v.make, v.model, c.name AS customer_name,
      COALESCE((SELECT SUM(quantity * unit_price) FROM work_order_lines WHERE work_order_id = o.id), 0) AS total
    FROM work_orders o JOIN vehicles v ON v.id = o.vehicle_id JOIN customers c ON c.id = o.customer_id
    WHERE (@status IS NULL OR o.status = @status) AND (@vehicleId IS NULL OR o.vehicle_id = @vehicleId)
    ORDER BY o.id DESC LIMIT @limit
  `).all({ status: status || null, vehicleId: vehicleId || null, limit });
}

function insertOrder(o) {
  const info = db.prepare(`
    INSERT INTO work_orders (order_number, vehicle_id, customer_id, odometer_in, complaint, mechanic, warranty_days)
    VALUES ('PENDING', @vehicle_id, @customer_id, @odometer_in, @complaint, @mechanic, @warranty_days)
  `).run(o);
  const id = Number(info.lastInsertRowid);
  // Numbered from the row id: unique by construction, no race between two tills.
  db.prepare('UPDATE work_orders SET order_number = ? WHERE id = ?').run(`WO-${String(id).padStart(6, '0')}`, id);
  insertEvent(id, 'status', 'received');
  return id;
}

const updateOrderFields = (id, f) => db.prepare(`
  UPDATE work_orders SET diagnosis = COALESCE(@diagnosis, diagnosis), mechanic = COALESCE(@mechanic, mechanic),
    complaint = COALESCE(@complaint, complaint), warranty_days = COALESCE(@warranty_days, warranty_days)
  WHERE id = @id`).run({ diagnosis: null, mechanic: null, complaint: null, warranty_days: null, ...f, id });

const setStatus = (id, status, closed) => {
  const info = db.prepare(`UPDATE work_orders SET status = ?, closed_at = ${closed ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`).run(status, id);
  insertEvent(id, 'status', status);
  return info;
};

// ---- customer tracking: history the customer sees, photos, link token
function insertEvent(orderId, kind, status, note = null) {
  return db.prepare('INSERT INTO work_order_events (work_order_id, kind, status, note) VALUES (?, ?, ?, ?)').run(orderId, kind, kind === 'status' ? status : null, note);
}
const listEvents = (orderId) => db.prepare('SELECT id, kind, status, note, created_at FROM work_order_events WHERE work_order_id = ? ORDER BY id').all(orderId);
const insertPhoto = (orderId, phase, caption, data) => Number(db.prepare('INSERT INTO work_order_photos (work_order_id, phase, caption, data) VALUES (?, ?, ?, ?)').run(orderId, phase, caption, data).lastInsertRowid);
const listPhotos = (orderId) => db.prepare('SELECT id, phase, caption, data FROM work_order_photos WHERE work_order_id = ? ORDER BY id').all(orderId);
const countPhotos = (orderId) => db.prepare('SELECT COUNT(*) AS n FROM work_order_photos WHERE work_order_id = ?').get(orderId).n;
const deletePhoto = (id) => db.prepare('DELETE FROM work_order_photos WHERE id = ?').run(id).changes;
const setLineDone = (lineId, done) => db.prepare('UPDATE work_order_lines SET done = ? WHERE id = ?').run(done ? 1 : 0, lineId).changes;
const setTrackingToken = (id, token) => db.prepare('UPDATE work_orders SET tracking_token = ? WHERE id = ? AND tracking_token IS NULL').run(token, id).changes;
const setTrackingHash = (id, hash) => db.prepare('UPDATE work_orders SET tracking_hash = ? WHERE id = ?').run(hash, id);
// Orders that have a link and are still open, or closed in the last 30 days (the customer may reopen the page after pickup).
const listTrackedOrders = () => db.prepare(`SELECT id, tracking_hash FROM work_orders WHERE tracking_token IS NOT NULL AND (closed_at IS NULL OR closed_at >= datetime('now', '-30 days'))`).all();
const getVehicleDueReminder = (vehicleId) => db.prepare('SELECT kind, due_date, due_odometer FROM service_reminders WHERE vehicle_id = ? AND done_at IS NULL ORDER BY due_date IS NULL, due_date LIMIT 1').get(vehicleId) || null;

// changes === 1 is the "billed once" guard, same as workflow_tickets.
const markBilled = (id, saleId, warrantyUntil) => db.prepare(
  'UPDATE work_orders SET sale_id = ?, warranty_until = ? WHERE id = ? AND sale_id IS NULL'
).run(saleId, warrantyUntil, id).changes;

const getLines = (orderId) => db.prepare(`
  SELECT l.*, ROUND(l.quantity * l.unit_price, 2) AS line_total, pv.barcode, pv.stock_quantity, pv.low_stock_threshold,
    po.po_number, po.status AS po_status, po.expected_date AS po_expected_date
  FROM work_order_lines l LEFT JOIN product_variants pv ON pv.id = l.variant_id LEFT JOIN parts_orders po ON po.id = l.parts_order_id
  WHERE l.work_order_id = ? ORDER BY l.id`).all(orderId);

const setLineQuantity = (id, quantity) => db.prepare('UPDATE work_order_lines SET quantity = ? WHERE id = ?').run(quantity, id);

const getLine = (id) => db.prepare('SELECT * FROM work_order_lines WHERE id = ?').get(id) || null;

const insertLine = (l) => db.prepare(`
  INSERT INTO work_order_lines (work_order_id, kind, variant_id, description, quantity, unit_price, unit_cost)
  VALUES (@work_order_id, @kind, @variant_id, @description, @quantity, @unit_price, @unit_cost)
`).run(l).lastInsertRowid;

const deleteLine = (id) => db.prepare('DELETE FROM work_order_lines WHERE id = ?').run(id);

// Who supplied this item last, and when (the order panel suggests them).
const lastSupply = (variantId) => db.prepare(`
  SELECT s.id AS supplier_id, s.name AS supplier_name, pi.purchase_price AS cost, date(p.created_at) AS date
  FROM purchase_items pi JOIN purchases p ON p.id = pi.purchase_id JOIN suppliers s ON s.id = p.supplier_id
  WHERE pi.variant_id = ? ORDER BY p.created_at DESC, p.id DESC LIMIT 1`).get(variantId) || null;

const PARTS_ORDER_SELECT = `
  SELECT po.*, s.name AS supplier_name, s.phone AS supplier_phone
  FROM parts_orders po JOIN suppliers s ON s.id = po.supplier_id`;
const getPartsOrder = (id) => db.prepare(`${PARTS_ORDER_SELECT} WHERE po.id = ?`).get(id) || null;
const getPartsOrderItems = (id) => db.prepare(`
  SELECT i.*, p.name AS product_name, pv.size, pv.color, pv.barcode
  FROM parts_order_items i JOIN product_variants pv ON pv.id = i.variant_id JOIN products p ON p.id = pv.product_id
  WHERE i.parts_order_id = ? ORDER BY i.id`).all(id);
function insertPartsOrder({ supplier_id, work_order_id, expected_date, items, lineIds }) {
  const id = Number(db.prepare("INSERT INTO parts_orders (po_number, supplier_id, work_order_id, expected_date) VALUES ('PENDING', ?, ?, ?)").run(supplier_id, work_order_id, expected_date).lastInsertRowid);
  db.prepare('UPDATE parts_orders SET po_number = ? WHERE id = ?').run(`PO-${String(id).padStart(4, '0')}`, id);
  const add = db.prepare('INSERT INTO parts_order_items (parts_order_id, variant_id, quantity, unit_cost) VALUES (?, ?, ?, ?)');
  for (const i of items) add.run(id, i.variant_id, i.quantity, i.unit_cost);
  const link = db.prepare('UPDATE work_order_lines SET parts_order_id = ? WHERE id = ?');
  for (const lid of lineIds) link.run(id, lid);
  return id;
}
const setPartsOrderStatus = (id, status, purchaseId = null) => db.prepare(
  `UPDATE parts_orders SET status = ?, purchase_id = ?, received_at = ${status === 'received' ? 'CURRENT_TIMESTAMP' : 'NULL'} WHERE id = ?`
).run(status, purchaseId, id);
const unlinkPartsOrder = (id) => db.prepare('UPDATE work_order_lines SET parts_order_id = NULL WHERE parts_order_id = ?').run(id);

// Labor has no catalog item, so it is sold as one service item (created once, price set per sale).
const LABOR_SKU = 'WORKSHOP-LABOR';
function laborVariantId() {
  const found = db.prepare('SELECT id FROM product_variants WHERE sku = ?').get(LABOR_SKU);
  if (found) return found.id;
  return db.transaction(() => {
    const productId = Number(db.prepare("INSERT INTO products (name, description, is_service) VALUES ('مصنعية الورشة', 'بند تلقائي لمصنعية أوامر الشغل', 1)").run().lastInsertRowid);
    return Number(db.prepare(
      'INSERT INTO product_variants (product_id, sku, barcode, purchase_price, selling_price, stock_quantity, low_stock_threshold) VALUES (?, ?, NULL, 0, 0, 0, 0)'
    ).run(productId, LABOR_SKU).lastInsertRowid);
  })();
}

const setVariantCost = (variantId, cost) => db.prepare('UPDATE product_variants SET purchase_price = ? WHERE id = ?').run(cost, variantId);
// Open orders keep a snapshot of the cost; refresh it so the profit card is not stale. Closed orders are history.
const setOpenLinesCost = (variantId, cost) => db.prepare(`
  UPDATE work_order_lines SET unit_cost = ? WHERE variant_id = ? AND work_order_id IN
    (SELECT id FROM work_orders WHERE status NOT IN ('delivered','cancelled') AND sale_id IS NULL)`).run(cost, variantId);

const getVariantForLine = (variantId) => db.prepare(`
  SELECT pv.id, pv.selling_price AS price, pv.purchase_price AS cost_price, p.name AS product_name
  FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?`).get(variantId) || null;

const insertReminder = (r) => db.prepare(
  'INSERT INTO service_reminders (vehicle_id, kind, due_date, due_odometer, send_at) VALUES (@vehicle_id, @kind, @due_date, @due_odometer, @send_at)'
).run(r).lastInsertRowid;

const completeReminder = (id) => db.prepare(
  'UPDATE service_reminders SET done_at = CURRENT_TIMESTAMP WHERE id = ? AND done_at IS NULL').run(id).changes;

const getReminders = (vehicleId) => db.prepare(
  'SELECT * FROM service_reminders WHERE vehicle_id = ? ORDER BY done_at IS NOT NULL, id DESC').all(vehicleId);

// Open reminders whose date has come or whose odometer target is reached.
const getDueReminders = (today) => db.prepare(`
  SELECT r.*, v.plate, v.odometer, c.name AS customer_name, c.phone AS customer_phone
  FROM service_reminders r JOIN vehicles v ON v.id = r.vehicle_id JOIN customers c ON c.id = v.customer_id
  WHERE r.done_at IS NULL AND v.is_active = 1
    AND ((r.due_date IS NOT NULL AND r.due_date <= @today) OR (r.due_odometer IS NOT NULL AND v.odometer >= r.due_odometer))
  ORDER BY COALESCE(r.due_date, '9999-12-31')`).all({ today });

// Active vehicles joined with owner (for the reminders dashboard).
const listActiveVehiclesWithOwner = () => db.prepare(`
  SELECT v.id, v.plate, v.plate_city, v.plate_kind, v.make, v.model, v.year, v.odometer, v.created_at,
         c.name AS customer_name, c.phone AS customer_phone
  FROM vehicles v JOIN customers c ON c.id = v.customer_id
  WHERE v.is_active = 1
  ORDER BY v.id DESC`).all();

// Last completed reminder of a kind on a vehicle (for the "every X km / Y months" recurrence).
const getLastDoneReminder = (vehicleId, kind) => db.prepare(
  "SELECT id, due_date, due_odometer, done_at FROM service_reminders WHERE vehicle_id = ? AND kind = ? AND done_at IS NOT NULL ORDER BY done_at DESC LIMIT 1"
).get(vehicleId, kind) || null;

// The one open reminder a (vehicle, kind) carries right now (sent_at / booked_for live on this row).
const getOpenReminder = (vehicleId, kind) => db.prepare(
  'SELECT * FROM service_reminders WHERE vehicle_id = ? AND kind = ? AND done_at IS NULL ORDER BY id DESC LIMIT 1'
).get(vehicleId, kind) || null;

const bookReminder = (id, forDate) => db.prepare(
  'UPDATE service_reminders SET booked_for = ? WHERE id = ? AND done_at IS NULL'
).run(forDate, id).changes;

// The oldest odometer reading the vehicle has, as the baseline for "every N km".
const getFirstReading = (vehicleId) => db.prepare(
  'SELECT km, read_at FROM odometer_readings WHERE vehicle_id = ? ORDER BY read_at, id LIMIT 1'
).get(vehicleId) || null;

// Counts the dashboard header cards show. All over the current month.
const reminderMonthCounts = (monthStart) => db.prepare(`
  SELECT
    (SELECT COUNT(*) FROM service_reminders WHERE sent_at IS NOT NULL AND date(sent_at) >= @monthStart) AS sent_month,
    (SELECT COUNT(*) FROM service_reminders WHERE booked_for IS NOT NULL AND booked_for >= @monthStart) AS booked_month
`).get({ monthStart });

module.exports = {
  listBoardOrders, insertIntake, getIntake, insertReading, getReadings, markReminderSent, listVehicles, getReminder, setVehicleActive, openOrderCount, vehicleCounts,
  getVehicle, getVehicleByPlate, searchVehicles, insertVehicle, updateVehicle, raiseOdometer, customerExists,
  getOrder, listOrders, insertOrder, updateOrderFields, setStatus, markBilled,
  insertEvent, listEvents, insertPhoto, listPhotos, countPhotos, deletePhoto, setLineDone, setTrackingToken, setTrackingHash, listTrackedOrders, getVehicleDueReminder,
  getLines, getLine, insertLine, deleteLine, setLineQuantity,
  getCustomer, listVehiclesOfCustomer, listOrderIdsOfCustomer, getSaleBrief, laborVariantId, lastSupply, setVariantCost, setOpenLinesCost, getPartsOrder, getPartsOrderItems, insertPartsOrder, setPartsOrderStatus, unlinkPartsOrder, getVariantForLine,
  insertReminder, completeReminder, getReminders, getDueReminders,
  listActiveVehiclesWithOwner, getLastDoneReminder, getOpenReminder, bookReminder, reminderMonthCounts, getFirstReading,
};

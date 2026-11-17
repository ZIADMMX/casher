/**
 * @file autoWorkshop.test.js
 * @description أساسيات ورش السيارات: سجل السيارات، أمر الشغل (قطع + مصنعية)،
 * عداد الكيلومترات اللي ما بيرجعش، التحصيل مرة واحدة والتذكيرات.
 */

jest.mock('electron', () => ({ BrowserWindow: { getAllWindows: () => [] }, Notification: null }));
jest.mock('../../electron/services/auth.service', () => ({ requireAdmin: jest.fn(() => ({ id: null })) }));
const auth = require('../../electron/services/auth.service');
const { db, initDatabase, runAllMigrations } = require('../../electron/database/db');
initDatabase();
runAllMigrations(); // creates the notifications tables the workshop alerts write to
require('../../electron/database/migrations/autoWorkshop').ensureAutoWorkshop(db);

const svc = require('../../electron/services/autoWorkshop.service');

let customerId;
let variantId;
let vehicle;

beforeAll(() => {
  customerId = Number(db.prepare("INSERT INTO customers (name, phone) VALUES ('ورشة اختبار', '01011112222')").run().lastInsertRowid);
  const productId = Number(db.prepare("INSERT INTO products (name) VALUES ('فلتر زيت اختبار')").run().lastInsertRowid);
  variantId = Number(db.prepare(
    "INSERT INTO product_variants (product_id, purchase_price, selling_price, stock_quantity) VALUES (?, 60, 100, 10)"
  ).run(productId).lastInsertRowid);
});

beforeEach(() => {
  db.exec('DELETE FROM service_reminders; DELETE FROM work_order_lines; DELETE FROM work_orders; DELETE FROM vehicles;');
  vehicle = svc.createVehicle({ customer_id: customerId, plate: 'أ ب ج-123', make: 'تويوتا', model: 'كورولا', year: 2018, odometer: 50000 });
});

const open = (extra = {}) => svc.openOrder({ vehicle_id: vehicle.id, odometer_in: 51000, complaint: 'صوت في الفرامل', warranty_days: 30, ...extra });

describe('السيارات', () => {
  test('اللوحة بتتوحّد ومينفعش تتكرر', () => {
    expect(vehicle.plate).toBe('أبج123');
    expect(() => svc.createVehicle({ customer_id: customerId, plate: 'أبج 123' })).toThrow('مسجلة');
  });

  test('بيرفض عميل مش موجود وسنة غريبة', () => {
    expect(() => svc.createVehicle({ customer_id: 99999, plate: 'XYZ999' })).toThrow('العميل');
    expect(() => svc.createVehicle({ customer_id: customerId, plate: 'XYZ999', year: 1800 })).toThrow('سنة');
  });

  test('البحث باللوحة', () => {
    expect(svc.searchVehicles('123').map((v) => v.id)).toContain(vehicle.id);
  });
});

describe('أمر الشغل', () => {
  test('بيترقّم ويرفع عداد السيارة', () => {
    const order = open();
    expect(order.order_number).toMatch(/^WO-\d{6}$/);
    expect(order.status).toBe('received');
    expect(svc.getVehicleHistory(vehicle.id).vehicle.odometer).toBe(51000);
  });

  test('بيرفض عداد أقل من آخر قراءة', () => {
    expect(() => open({ odometer_in: 40000 })).toThrow('أقل من آخر قراءة');
  });

  test('القطعة بتاخد السعر والتكلفة من الكتالوج والمصنعية وصف حر، والإجمالي بيتحسب', () => {
    const order = open();
    svc.addLine(order.id, { kind: 'part', variant_id: variantId, quantity: 2, unit_cost: 1 });
    const { order: after } = svc.addLine(order.id, { kind: 'labor', description: 'تغيير زيت', quantity: 1, unit_price: 80 });
    expect(after.parts_total).toBe(200);
    expect(after.labor_total).toBe(80);
    expect(after.total).toBe(280);
    expect(after.lines.find((l) => l.kind === 'part').unit_cost).toBe(60);
  });

  test('بيرفض قطعة من غير صنف، كمية صفر، ونوع غلط', () => {
    const order = open();
    expect(() => svc.addLine(order.id, { kind: 'part', quantity: 1 })).toThrow();
    expect(() => svc.addLine(order.id, { kind: 'part', variant_id: variantId, quantity: 0 })).toThrow('الكمية');
    expect(() => svc.addLine(order.id, { kind: 'gift', description: 'x', quantity: 1 })).toThrow('نوع البند');
  });

  test('تعديل كمية القطعة بيحدّث الإجمالي، ويرفض كمية غلط، ويتقفل مع الأمر المقفول', () => {
    const order = open();
    const { id } = svc.addLine(order.id, { kind: 'part', variant_id: variantId, quantity: 1 });
    const after = svc.setLineQuantity(id, 3);
    expect(after.total).toBe(300);
    expect(after.lines[0].stock_quantity).toBe(10);
    expect(() => svc.setLineQuantity(id, 0)).toThrow('الكمية');
    svc.setStatus(order.id, 'cancelled');
    expect(() => svc.setLineQuantity(id, 2)).toThrow('مقفول');
  });

  describe('أمر شراء القطع الناقصة', () => {
    let supplierId;
    const shortOrder = () => {
      const order = open();
      db.prepare('UPDATE product_variants SET stock_quantity = 1 WHERE id = ?').run(variantId);
      svc.addLine(order.id, { kind: 'part', variant_id: variantId, quantity: 3 });
      return order;
    };
    beforeEach(() => {
      db.exec('DELETE FROM parts_order_items; DELETE FROM parts_orders;');
      supplierId = Number(db.prepare("INSERT INTO suppliers (name) VALUES ('مورد اختبار')").run().lastInsertRowid);
    });

    test('بيطلب الناقص بس، وبيربطه بالبند، وبيمنع التجهيز للتسليم لحد الاستلام', () => {
      const order = shortOrder();
      const { parts_order: po, order: after } = svc.orderMissingParts(order.id, { supplier_id: supplierId });
      expect(po.po_number).toMatch(/^PO-[0-9]{4}$/);
      expect(po.items[0].quantity).toBe(2); // 3 needed, 1 in stock
      expect(after.pending_parts_order.po_number).toBe(po.po_number);
      expect(() => svc.orderMissingParts(order.id, { supplier_id: supplierId })).toThrow('مفيش قطع ناقصة');
      svc.setStatus(order.id, 'in_progress');
      expect(() => svc.setStatus(order.id, 'ready')).toThrow('بانتظار توريد القطع');
    });

    test('الاستلام بيزوّد المخزون ويسجل فاتورة آجلة مرة واحدة وبعدها التجهيز يتفتح', () => {
      const order = shortOrder();
      const { parts_order: po } = svc.orderMissingParts(order.id, { supplier_id: supplierId });
      svc.setStatus(order.id, 'in_progress');
      const { order: after, parts_order: done } = svc.receivePartsOrder(po.id);
      expect(done.status).toBe('received');
      expect(after.pending_parts_order).toBeNull();
      // The variant total is rebuilt from warehouse balances, which start at 0 here: only the 2 received units show.
      expect(db.prepare('SELECT stock_quantity AS s FROM product_variants WHERE id = ?').get(variantId).s).toBe(2);
      expect(db.prepare('SELECT remaining_amount AS r FROM purchases WHERE id = ?').get(done.purchase_id).r).toBe(120);
      expect(() => svc.receivePartsOrder(po.id)).toThrow('مش مفتوح');
      expect(svc.setStatus(order.id, 'ready').status).toBe('ready');
    });

    test('المسودة بتعرض الناقص وآخر مورد، والكمية ممكن تتعدّل بس لصنف ناقص فعلًا', () => {
      const order = shortOrder();
      const [row] = svc.getPartsOrderDraft(order.id);
      expect(row).toEqual(expect.objectContaining({ variant_id: variantId, required: 3, stock: 1, shortage: 2 }));
      expect(() => svc.orderMissingParts(order.id, { supplier_id: supplierId, items: [{ variant_id: variantId + 999, quantity: 1 }] })).toThrow('مش ضمن');
      expect(() => svc.orderMissingParts(order.id, { supplier_id: supplierId, items: [{ variant_id: variantId, quantity: 0 }] })).toThrow('الكمية');
      const { parts_order: po } = svc.orderMissingParts(order.id, { supplier_id: supplierId, items: [{ variant_id: variantId, quantity: 5 }] });
      expect(po.items[0].quantity).toBe(5);
    });

    test('إلغاء أمر الشراء بيفك الربط', () => {
      const order = shortOrder();
      const { parts_order: po } = svc.orderMissingParts(order.id, { supplier_id: supplierId });
      expect(svc.cancelPartsOrder(po.id).order.pending_parts_order).toBeNull();
    });
  });

  test('التحصيل: بنود الأمر بأسعاره، المصنعية بند خدمة واحد، وبعد الدفع الأمر بيتسلّم مرة واحدة', () => {
    const order = open();
    svc.addLine(order.id, { kind: 'part', variant_id: variantId, quantity: 2 });
    svc.addLine(order.id, { kind: 'labor', description: 'تغيير زيت', quantity: 1.5, unit_price: 100 });
    expect(() => svc.getBilling(order.id)).toThrow('مش جاهز');
    svc.setStatus(order.id, 'in_progress');
    svc.setStatus(order.id, 'ready');
    const { items } = svc.getBilling(order.id);
    expect(items).toEqual([
      { variantId, quantity: 2, unitPrice: 100 },
      expect.objectContaining({ quantity: 1, unitPrice: 150, note: 'تغيير زيت' }),
    ]);
    const laborVariant = items[1].variantId;
    expect(db.prepare('SELECT p.is_service AS s FROM product_variants pv JOIN products p ON p.id = pv.product_id WHERE pv.id = ?').get(laborVariant).s).toBe(1);
    const saleId = Number(db.prepare("INSERT INTO sales (total_amount, payment_method) VALUES (350, 'cash')").run().lastInsertRowid);
    svc.settleOrder(order.id, saleId);
    const done = svc.getOrder(order.id);
    expect(done.status).toBe('delivered');
    expect(done.sale_id).toBe(saleId);
    expect(() => svc.getBilling(order.id)).toThrow();
  });

  test('ملف العميل: الزيارات بما اتعمل وما اتدفع ومتى، والإجماليات من المدفوع فعلًا', () => {
    const paidOrder = open();
    svc.addLine(paidOrder.id, { kind: 'part', variant_id: variantId, quantity: 1 });
    svc.addLine(paidOrder.id, { kind: 'labor', description: 'تغيير زيت', quantity: 1, unit_price: 80 });
    svc.setStatus(paidOrder.id, 'in_progress');
    svc.setStatus(paidOrder.id, 'ready');
    const saleId = Number(db.prepare("INSERT INTO sales (total_amount, payment_method) VALUES (170, 'cash')").run().lastInsertRowid);
    svc.settleOrder(paidOrder.id, saleId);
    const openOrder = open();
    svc.addLine(openOrder.id, { kind: 'labor', description: 'فحص', quantity: 1, unit_price: 50 });
    const cancelled = open();
    svc.setStatus(cancelled.id, 'cancelled');

    const profile = svc.getCustomerProfile(customerId);
    expect(profile.customer.name).toBe('ورشة اختبار');
    expect(profile.vehicles).toHaveLength(1);
    expect(profile.visits).toHaveLength(3);
    const paid = profile.visits.find((v) => v.id === paidOrder.id);
    expect(paid.services).toEqual(['تغيير زيت']);
    expect(paid.parts).toEqual([expect.objectContaining({ quantity: 1 })]);
    expect(paid.payment).toEqual(expect.objectContaining({ amount: 170, method: 'cash', sale_id: saleId }));
    expect(profile.visits.find((v) => v.id === openOrder.id).payment).toBeNull();
    expect(profile.stats).toEqual(expect.objectContaining({ visits: 2, open: 1, total_paid: 170, on_credit: 0 }));
    expect(JSON.stringify(profile)).not.toContain('unit_cost');
    expect(() => svc.getCustomerProfile(999999)).toThrow('غير موجود');
  });

  describe('ربحية الأمر', () => {
    const profitOrder = () => {
      const order = open();
      svc.addLine(order.id, { kind: 'part', variant_id: variantId, quantity: 2 }); // price 100, cost 60
      svc.addLine(order.id, { kind: 'labor', description: 'تغيير زيت', quantity: 3, unit_price: 100 });
      return order;
    };
    afterEach(() => { auth.requireAdmin.mockImplementation(() => ({ id: null })); });

    test('الصافي = الإيراد − تكلفة القطع − (ساعات × تكلفة الساعة)، والهامش نسبة من الإيراد', () => {
      const order = profitOrder();
      svc.setLaborCostPerHour(20);
      const p = svc.getOrderProfit(order.id);
      expect(p).toEqual(expect.objectContaining({ revenue: 500, parts_cost: 120, hours: 3, labor_cost: 60, net: 320, margin: 64, missing: [] }));
    });

    test('قطعة من غير سعر تكلفة بتخلّي الربح غير مكتمل بدل رقم غلط', () => {
      const order = profitOrder();
      db.prepare('UPDATE work_order_lines SET unit_cost = 0 WHERE work_order_id = ?').run(order.id);
      const p = svc.getOrderProfit(order.id);
      expect(p.net).toBeNull();
      expect(p.margin).toBeNull();
      expect(p.missing).toHaveLength(1);
      svc.setPartCost(variantId, 70);
      expect(svc.getOrderProfit(order.id)).toEqual(expect.objectContaining({ parts_cost: 140, missing: [] }));
      expect(() => svc.setPartCost(variantId, -1)).toThrow('سعر التكلفة');
    });

    test('غير الأدمن مبيشوفش الربح ولا تكلفة البنود، ومينفعش يعدّل التكلفة', () => {
      const order = profitOrder();
      auth.requireAdmin.mockImplementation(() => { throw new Error('غير مصرح'); });
      expect(svc.getOrderProfit(order.id)).toEqual({ hidden: true });
      const shown = svc.stripCosts(svc.getOrder(order.id));
      expect(shown.lines.every((l) => !('unit_cost' in l))).toBe(true);
      expect(() => svc.setPartCost(variantId, 10)).toThrow('غير مصرح');
      expect(() => svc.setLaborCostPerHour(10)).toThrow('غير مصرح');
    });
  });

  test('الحالات: مفيش قفز للتسليم من غير تحصيل', () => {
    const order = open();
    expect(() => svc.setStatus(order.id, 'delivered')).toThrow('مش مسموح');
    svc.setStatus(order.id, 'in_progress');
    svc.setStatus(order.id, 'ready');
    expect(() => svc.setStatus(order.id, 'delivered')).toThrow('يتحصّل');
  });

  test('التحصيل مرة واحدة بس، والضمان يبدأ من التحصيل، وبعد التسليم بيتقفل', () => {
    const order = open();
    expect(() => svc.markBilled(order.id, 1)).toThrow('مش جاهز');
    svc.setStatus(order.id, 'in_progress');
    svc.setStatus(order.id, 'ready');
    const saleId = Number(db.prepare(
      "INSERT INTO sales (total_amount, payment_method) VALUES (280, 'cash')").run().lastInsertRowid);
    svc.markBilled(order.id, saleId, new Date('2026-01-01T12:00:00Z'));
    expect(svc.getOrder(order.id).warranty_until).toBe('2026-01-31');
    expect(() => svc.markBilled(order.id, saleId)).toThrow('اتحصّل بالفعل');
    svc.setStatus(order.id, 'delivered');
    expect(() => svc.addLine(order.id, { kind: 'labor', description: 'x', quantity: 1, unit_price: 1 })).toThrow('مقفول');
  });
});

describe('تذكيرات الصيانة', () => {
  test('بتظهر لما التاريخ أو الكيلومترات توصل، وبتختفي بعد التنفيذ', () => {
    svc.addReminder(vehicle.id, { kind: 'تغيير زيت', due_odometer: 55000 });
    const byDate = svc.addReminder(vehicle.id, { kind: 'ترخيص', due_date: '2026-03-01' });
    expect(svc.getDueReminders('2026-01-01')).toHaveLength(0);
    expect(svc.getDueReminders('2026-03-01').map((r) => r.id)).toEqual([byDate]);
    svc.openOrder({ vehicle_id: vehicle.id, odometer_in: 55500 });
    expect(svc.getDueReminders('2026-01-01')).toHaveLength(1);
    svc.completeReminder(byDate);
    expect(() => svc.completeReminder(byDate)).toThrow();
  });

  test('بيرفض تذكير من غير تاريخ ولا كيلومترات', () => {
    expect(() => svc.addReminder(vehicle.id, { kind: 'x' })).toThrow('حدد');
  });
});

describe('قائمة المركبات', () => {
  test('اللوحة بالأرقام العربية بتتوحّد مع الإنجليزي', () => {
    expect(svc.createVehicle({ customer_id: customerId, plate: 'ق ن ر ٣٤٨١' }).plate).toBe('قنر3481');
    expect(() => svc.createVehicle({ customer_id: customerId, plate: 'ق ن ر 3481' })).toThrow('مسجلة');
  });

  test('حالة الصيانة القادمة: متأخرة وقريبة وسليمة وبدون جدولة', () => {
    const mk = (plate, odometer) => svc.createVehicle({ customer_id: customerId, plate, odometer, make: 'كيا' });
    const late = mk('LATE111', 50000); svc.addReminder(late.id, { kind: 'زيت', due_odometer: 49200 });
    const soon = mk('SOON111', 50000); svc.addReminder(soon.id, { kind: 'زيت', due_odometer: 50600 });
    const ok = mk('OKAY111', 50000);   svc.addReminder(ok.id, { kind: 'زيت', due_date: '2999-01-01' });
    const none = mk('NONE111', 50000);
    const byPlate = Object.fromEntries(svc.getVehiclesOverview({ pageSize: 50 }).items.map((v) => [v.plate, v.next_service]));
    expect(byPlate.LATE111).toEqual({ status: 'overdue', label: 'متأخرة 800 كم' });
    expect(byPlate.SOON111).toEqual({ status: 'soon', label: 'بعد 600 كم' });
    expect(byPlate.OKAY111.status).toBe('ok');
    expect(byPlate.NONE111.status).toBe('none');
    const o = svc.getVehiclesOverview({ status: 'overdue' });
    expect(o.items.map((v) => v.plate)).toEqual(['LATE111']);
    expect(o.stats.soon).toBe(1);
    expect(o.stats.overdue).toBe(1);
  });

  test('البحث والصفحات وحذف المركبة (مرفوض لو عليها أمر مفتوح)', () => {
    for (let i = 0; i < 12; i += 1) svc.createVehicle({ customer_id: customerId, plate: `PG${100 + i}` });
    const first = svc.getVehiclesOverview({ pageSize: 10 });
    expect(first.items).toHaveLength(10);
    expect(first.pages).toBe(2);
    expect(svc.getVehiclesOverview({ q: 'PG105' }).items).toHaveLength(1);
    expect(svc.getVehiclesOverview({ q: '%' }).total).toBe(svc.getVehiclesOverview({}).total);
    open();
    expect(() => svc.deactivateVehicle(vehicle.id)).toThrow('أمر شغل مفتوح');
    const spare = svc.getVehiclesOverview({ q: 'PG100' }).items[0];
    expect(svc.deactivateVehicle(spare.id)).toBe(true);
    expect(svc.getVehiclesOverview({ q: 'PG100' }).items).toHaveLength(0);
  });
});

describe('ملف المركبة', () => {
  test('قراءات العدّاد بتتسجل من أمر الشغل ويدويًا، ومينفعش ترجع لورا', () => {
    open({ odometer_in: 52000 });
    const p = svc.addOdometerReading(vehicle.id, { km: 52500, read_at: '2026-02-01' });
    expect(p.readings.map((r) => [r.km, r.source])).toEqual(expect.arrayContaining([[50000, 'manual'], [52000, 'work_order'], [52500, 'manual']]));
    expect(p.vehicle.odometer).toBe(52500);
    expect(p.odometerStats.sinceService).toBe(500);
    expect(() => svc.addOdometerReading(vehicle.id, { km: 100 })).toThrow('أقل من آخر قراءة');
  });

  test('الملف بيرجّع أوامر الشغل بالبنود والمنفَّذ فعليًا بس للمسلَّم', () => {
    const order = open();
    svc.addLine(order.id, { kind: 'labor', description: 'فحص', quantity: 1, unit_price: 350 });
    expect(svc.getVehicleProfile(vehicle.id).spent).toBe(0);
    svc.setStatus(order.id, 'in_progress'); svc.setStatus(order.id, 'ready');
    const saleId = Number(db.prepare("INSERT INTO sales (total_amount, payment_method) VALUES (350, 'cash')").run().lastInsertRowid);
    svc.markBilled(order.id, saleId); svc.setStatus(order.id, 'delivered');
    const p = svc.getVehicleProfile(vehicle.id);
    expect(p.spent).toBe(350);
    expect(p.orders[0].lines).toHaveLength(1);
  });

  test('تتبع إرسال التذكير', () => {
    const id = svc.addReminder(vehicle.id, { kind: 'زيت', due_odometer: 55000, send_at: '2026-12-01' });
    expect(svc.getVehicleProfile(vehicle.id).reminders[0].sent_at).toBeNull();
    svc.markReminderSent(id);
    expect(svc.getVehicleProfile(vehicle.id).reminders[0].sent_at).toBeTruthy();
    svc.completeReminder(id);
    expect(() => svc.markReminderSent(id)).toThrow();
  });
});

describe('كشف تكرار اللوحة', () => {
  test('بيرجّع صاحب اللوحة بأي شكل كتابة، وnull للجديدة', () => {
    const found = svc.findVehicleByPlate('أ ب ج ١٢٣');
    expect(found).toMatchObject({ id: vehicle.id, make: 'تويوتا', customer_name: 'ورشة اختبار' });
    expect(svc.findVehicleByPlate('XYZ 000')).toBeNull();
  });
});

describe('استلام المركبة', () => {
  const SIG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';
  const checklist = () => Object.fromEntries(['spare_tire', 'tools_jack', 'extinguisher', 'rim_covers', 'radio', 'papers', 'manual', 'floor_mats'].map((k) => [k, k === 'extinguisher' ? 'missing' : 'present']));
  const sheet = (extra = {}) => ({
    vehicle_id: vehicle.id, odometer_in: 51000, complaint: 'صوت احتكاك عند الفرملة', fuel_level: 1, signature: SIG, checklist: checklist(),
    damages: [{ type: 'break', x: 80, y: 10, zone: 'الفانوس الأمامي الأيمن', note: 'شرخ' }, { type: 'scratch', x: 82, y: 30, zone: 'الرفرف الأمامي الأيمن', note: '' }], ...extra,
  });

  test('بيفتح أمر شغل ويسجّل الورقة مع بعض ويرفع العدّاد', () => {
    const { order, intake } = svc.checkInVehicle(sheet(), 'م. حسن علاء');
    expect(order.status).toBe('received');
    expect(intake.fuel_level).toBe(1);
    expect(intake.damages).toHaveLength(2);
    expect(intake.received_by).toBe('م. حسن علاء');
    expect(svc.getVehicleProfile(vehicle.id).vehicle.odometer).toBe(51000);
  });

  test('بيرفض: من غير توقيع، شكوى فاضية، قائمة ناقصة، وقود غلط، عدّاد أقل، ونوع ضرر غلط', () => {
    expect(() => svc.checkInVehicle(sheet({ signature: '' }))).toThrow('توقيع');
    expect(() => svc.checkInVehicle(sheet({ complaint: ' ' }))).toThrow('شكوى');
    expect(() => svc.checkInVehicle(sheet({ checklist: {} }))).toThrow('قائمة الفحص');
    expect(() => svc.checkInVehicle(sheet({ fuel_level: 9 }))).toThrow('الوقود');
    expect(() => svc.checkInVehicle(sheet({ odometer_in: 10 }))).toThrow('أقل من آخر قراءة');
    expect(() => svc.checkInVehicle(sheet({ damages: [{ type: 'x', x: 1, y: 1 }] }))).toThrow('نوع ملاحظة');
    expect(svc.listOrders({ vehicleId: vehicle.id })).toHaveLength(0); // nothing half-saved
  });

  test('الإيصال بيطلع فيه الرقم والشكوى والناقص والتوقيع', () => {
    const { order } = svc.checkInVehicle(sheet(), 'م. حسن علاء');
    const html = require('../../electron/services/vehicleIntakeReceipt.service').getReceiptHtml(order.id);
    expect(html).toContain(order.order_number);
    expect(html).toContain('صوت احتكاك عند الفرملة');
    expect(html).toContain('طفاية الحريق');
    expect(html).toContain(SIG);
    expect(html).toContain('ربع خزان');
  });
});

describe('شاشة أوامر الشغل', () => {
  test('بترجّع الأوامر المفتوحة بالبنود والإجمالي والتأخير والفنيين', () => {
    const a = svc.openOrder({ vehicle_id: vehicle.id, odometer_in: 51000, complaint: 'x' });
    const b = svc.openOrder({ vehicle_id: vehicle.id, odometer_in: 51000, complaint: 'y' });
    svc.updateOrder(a.id, { mechanic: 'م. حسن علاء' });
    svc.addLine(a.id, { kind: 'labor', description: 'فحص', quantity: 1, unit_price: 350 });
    db.prepare("UPDATE work_orders SET opened_at = datetime('now', '-2 days') WHERE id = ?").run(b.id);
    const board = svc.getWorkOrderBoard();
    const byId = Object.fromEntries(board.items.map((o) => [o.id, o]));
    expect(byId[a.id]).toMatchObject({ lines_count: 1, total: 350, mechanic: 'م. حسن علاء', late: false, make: 'تويوتا', plate: 'أبج123' });
    expect(byId[b.id].late).toBe(true);
    expect(board.mechanics).toEqual(['م. حسن علاء']);
    expect(board.stats).toMatchObject({ active: 2, activeValue: 350, late: 1 });
  });

  test('المسلَّمة القديمة والملغية بتختفي، والمسلَّمة الحديثة بتفضل', () => {
    const o = open();
    svc.setStatus(o.id, 'cancelled');
    db.prepare("UPDATE work_orders SET closed_at = datetime('now', '-60 days') WHERE id = ?").run(o.id);
    expect(svc.getWorkOrderBoard().items.map((x) => x.id)).not.toContain(o.id);
    const fresh = open();
    svc.setStatus(fresh.id, 'cancelled');
    expect(svc.getWorkOrderBoard().items.map((x) => x.id)).toContain(fresh.id);
  });
});

describe('إشعارات الورشة', () => {
  const rows = (type) => db.prepare('SELECT * FROM notifications WHERE type = ?').all(type);
  beforeEach(() => db.exec('DELETE FROM notifications'));

  test('جاهزة للتسليم وبانتظار الموافقة بيعملوا إشعار بنص مفهوم وصفحة الوجهة', () => {
    const o = open();
    svc.setStatus(o.id, 'diagnosing'); svc.setStatus(o.id, 'awaiting_approval');
    expect(rows('workshop_approval')).toHaveLength(1);
    svc.setStatus(o.id, 'in_progress'); svc.setStatus(o.id, 'ready');
    const [n] = rows('workshop_ready');
    expect(n.title).toBe('مركبة جاهزة للتسليم');
    expect(n.message).toContain('ورشة اختبار');
    expect(n.message).not.toMatch(/enterprise:|setWorkOrderStatus/);
    expect(n.link_page).toBe('work-orders');
  });

  test('الأوامر المتأخرة ومواعيد الصيانة بتتنبّه مرة واحدة في اليوم', () => {
    const o = open();
    db.prepare("UPDATE work_orders SET opened_at = datetime('now', '-2 days') WHERE id = ?").run(o.id);
    svc.addReminder(vehicle.id, { kind: 'تغيير زيت', due_date: '2020-01-01' });
    svc.checkWorkshopAlerts(); svc.checkWorkshopAlerts();
    expect(rows('workshop_late')).toHaveLength(1);
    expect(rows('service_due')).toHaveLength(1);
    expect(rows('service_due')[0].link_page).toBe('vehicles');
  });
});

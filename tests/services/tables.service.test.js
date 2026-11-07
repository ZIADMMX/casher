// Restaurant tables end to end on a real schema: open a check, send rounds to
// the kitchen, pay it as one normal sale, and the table is free again.
const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb, dbPath: ':memory:' }));
jest.mock('../../electron/services/notifications.service', () => ({ notify: jest.fn() }));

const { ensureDiningTables } = require('../../electron/database/migrations/diningTables');
const authService = require('../../electron/services/auth.service');
const tablesService = require('../../electron/services/tables.service');
const salesService = require('../../electron/services/sales.service');
const kitchenService = require('../../electron/services/kitchen.service');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const usersRepo = require('../../electron/repositories/users.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const inventoryRepo = require('../../electron/repositories/inventory.repository');

let burgerId;
let teaId;

function makeVariant(name, price) {
  const productId = productsRepo.create({ name, categoryId: null, description: '' });
  const variantId = variantsRepo.create({
    productId, purchasePrice: price / 2, sellingPrice: price, stockQuantity: 20, lowStockThreshold: 1,
  });
  inventoryRepo.initializeVariantStock(inventoryRepo.getDefaultWarehouseId(), variantId, 20);
  return variantId;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  mockDb.exec(fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf-8'));
  ensureDiningTables(mockDb);
  inventoryRepo.createBranch({ name: 'الفرع الرئيسي' });
  const bcrypt = require('bcryptjs');
  usersRepo.create({ username: 'admin', passwordHash: bcrypt.hashSync('admin123', 4), role: 'admin', forcePasswordChange: false });
  authService.login('admin', 'admin123');
  shiftsRepo.openShift({ openingCash: 0, userId: usersRepo.getByUsername('admin').id, openedByName: 'admin' });
  burgerId = makeVariant('برجر', 80);
  teaId = makeVariant('شاي', 15);
});

afterAll(() => {
  console.log.mockRestore();
  mockDb.close();
});

test('a table check goes to the kitchen in rounds and is paid as one sale', () => {
  const [table] = tablesService.addTable('');
  expect(table.name).toBe('طاولة 1');

  const tab = tablesService.openTab(table.id);
  expect(tablesService.openTab(table.id).id).toBe(tab.id); // same check, not a second one

  // The till's price is ignored; the catalog price is used.
  tablesService.sendRound(tab.id, [{ variantId: burgerId, quantity: 2, unitPrice: 1 }]);
  const afterSecond = tablesService.sendRound(tab.id, [{ variantId: teaId, quantity: 1 }]);
  expect(afterSecond.total).toBe(175);

  const board = kitchenService.getKitchenOrders().filter((order) => order.round_id);
  expect(board.map((order) => [order.table_name, order.round_no, order.kitchen_status]))
    .toEqual([['طاولة 1', 1, 'new'], ['طاولة 1', 2, 'new']]);
  kitchenService.updateKitchenOrderStatus({ roundId: board[0].round_id, status: 'preparing' });
  expect(() => kitchenService.updateKitchenOrderStatus({ roundId: board[0].round_id, status: 'served' }))
    .toThrow('لا يمكن نقل الطلب');

  expect(() => tablesService.cancelTab(tab.id)).toThrow('لازم يتدفع');
  expect(() => tablesService.removeTable(table.id)).toThrow('حساب مفتوح');

  // Whatever the till sends, the sale bills the check's items.
  const result = salesService.createSale({
    items: [{ variantId: teaId, quantity: 1 }],
    paymentMethod: 'cash',
    tableTabId: tab.id,
  });
  expect(result.totalAmount).toBe(175);
  expect(variantsRepo.getById(burgerId).stock_quantity).toBe(18);

  const sale = mockDb.prepare('SELECT order_mode, kitchen_status FROM sales WHERE id = ?').get(result.saleId);
  expect(sale).toEqual({ order_mode: 'dine_in', kitchen_status: 'served' });
  // The paid sale itself never shows up as a new kitchen order.
  expect(kitchenService.getKitchenOrders().some((order) => order.key === `sale-${result.saleId}`)).toBe(false);

  expect(tablesService.getTables()[0].tab_id).toBeNull();
  expect(() => salesService.createSale({
    items: [{ variantId: teaId, quantity: 1 }], paymentMethod: 'cash', tableTabId: tab.id,
  })).toThrow('اتقفل بالفعل');
  expect(() => tablesService.sendRound(tab.id, [{ variantId: teaId, quantity: 1 }])).toThrow('اتقفل بالفعل');
});

test('no open shift means no table orders, like a normal sale', () => {
  const [table] = tablesService.getTables();
  const tab = tablesService.openTab(table.id);
  const shift = shiftsRepo.getCurrentOpenShift();
  mockDb.prepare("UPDATE shifts SET status = 'closed' WHERE id = ?").run(shift.id);
  try {
    expect(() => tablesService.sendRound(tab.id, [{ variantId: teaId, quantity: 1 }])).toThrow('افتح الوردية');
    expect(() => tablesService.openTab(table.id)).toThrow('افتح الوردية');
  } finally {
    mockDb.prepare("UPDATE shifts SET status = 'open' WHERE id = ?").run(shift.id);
    tablesService.cancelTab(tab.id);
  }
});

test('an empty check can be cancelled and sent items cannot be edited', () => {
  const tables = tablesService.addTable('تراس');
  const terrace = tables.find((table) => table.name === 'تراس');
  expect(() => tablesService.addTable('تراس')).toThrow('بنفس الاسم');

  const tab = tablesService.openTab(terrace.id);
  tablesService.cancelTab(tab.id);
  expect(tablesService.getTables().find((table) => table.id === terrace.id).tab_id).toBeNull();

  const next = tablesService.sendRound(tablesService.openTab(terrace.id).id, [{ variantId: teaId, quantity: 1 }]);
  expect(() => mockDb.prepare('UPDATE table_tab_items SET quantity = 9 WHERE tab_id = ?').run(next.id))
    .toThrow('cannot be changed');
});

test('add-ons are priced by the server and kept on the kitchen ticket and the sale', () => {
  require('../../electron/repositories/settings.repository').set(
    'sector_addons',
    JSON.stringify([{ name: 'جبنة زيادة', price: 10 }, { name: 'من غير بصل', price: 0 }]),
  );

  const table = tablesService.addTable('طاولة الإضافات').find((t) => t.name === 'طاولة الإضافات');
  const tab = tablesService.openTab(table.id);
  const sent = tablesService.sendRound(tab.id, [
    { variantId: burgerId, quantity: 1, modifiers: ['جبنة زيادة', 'من غير بصل'] },
    { variantId: burgerId, quantity: 1 },
  ]);
  expect(sent.total).toBe(170);
  expect(sent.items[0].modifiers.map((m) => m.name)).toEqual(['جبنة زيادة', 'من غير بصل']);
  expect(() => tablesService.sendRound(tab.id, [{ variantId: burgerId, quantity: 1, modifiers: ['مش موجودة'] }]))
    .toThrow('مش موجودة');

  const round = kitchenService.getKitchenOrders().find((order) => order.items.some((item) => item.modifiers.length));
  expect(round.items[0].modifiers[0].name).toBe('جبنة زيادة');

  const { saleId } = salesService.createSale({ items: [], paymentMethod: 'cash', tableTabId: tab.id });
  const sale = salesService.getSaleById(saleId);
  expect(sale.total_amount).toBe(170);
  expect(sale.items.find((item) => item.modifiers.length).unit_price).toBe(90);

  // A till sale: the till sends the item's own price, the server adds the add-ons.
  const direct = salesService.createSale({
    items: [{ variantId: teaId, quantity: 2, unitPrice: 15, modifiers: ['جبنة زيادة'] }],
    paymentMethod: 'cash',
  });
  expect(salesService.getSaleById(direct.saleId).total_amount).toBe(50);
});

test('a till sale is charged the catalog price, whatever price the till sends', () => {
  const { saleId } = salesService.createSale({
    items: [{ variantId: burgerId, quantity: 1, unitPrice: 1 }],
    paymentMethod: 'cash',
  });
  expect(salesService.getSaleById(saleId).total_amount).toBe(80);

  expect(() => salesService.createSale({
    items: [{ variantId: burgerId, quantity: 1, unitPrice: 1, scaleBarcode: '2000000000000' }],
    paymentMethod: 'cash',
  })).toThrow('باركود الميزان');
});

test('kitchen tickets carry the line note and split by prep station', () => {
  const kitchenTicket = require('../../electron/services/kitchenTicket.service');
  const tablesRepo = require('../../electron/repositories/tables.repository');
  const drinksId = mockDb.prepare("INSERT INTO categories (name) VALUES ('مشروبات')").run().lastInsertRowid;
  mockDb.prepare('UPDATE products SET category_id = ? WHERE id = (SELECT product_id FROM product_variants WHERE id = ?)')
    .run(drinksId, teaId);

  const table = tablesService.addTable('طاولة الملاحظات').find((t) => t.name === 'طاولة الملاحظات');
  const tab = tablesService.openTab(table.id);
  expect(() => tablesService.sendRound(tab.id, [{ variantId: burgerId, quantity: 1, note: 'x'.repeat(121) }]))
    .toThrow('أطول من');
  const sent = tablesService.sendRound(tab.id, [
    { variantId: burgerId, quantity: 1, note: '  من غير   بصل ' },
    { variantId: teaId, quantity: 2 },
  ]);
  expect(sent.items[0].note).toBe('من غير بصل');

  const ticket = tablesRepo.getRoundTicket(sent.roundId);
  expect(ticket).toMatchObject({ table_name: 'طاولة الملاحظات', round_no: 1, order_mode: 'dine_in' });
  expect(ticket.items.map((item) => item.note)).toEqual(['من غير بصل', null]);

  const stations = kitchenTicket.getStations(JSON.stringify([{ name: 'البار', printer: 'BAR', categoryIds: [drinksId] }, { name: '' }]));
  const groups = kitchenTicket.splitByStation(ticket.items, stations, 'KITCHEN');
  expect(groups.map((g) => [g.stationName, g.printer, g.items.map((i) => i.product_name)]))
    .toEqual([[null, 'KITCHEN', ['برجر']], ['البار', 'BAR', ['شاي']]]);

  // The note reaches the paid sale too.
  const { saleId } = salesService.createSale({ items: [], paymentMethod: 'cash', tableTabId: tab.id });
  expect(salesService.getSaleById(saleId).items.map((item) => item.note).sort()).toEqual([null, 'من غير بصل'].sort());
});

test('a recipe item takes its ingredients out of stock, not itself', () => {
  const recipesService = require('../../electron/services/recipes.service');
  const returnsService = require('../../electron/services/returns.service');
  const bunId = makeVariant('عيش برجر', 4); // cost 2, stock 20
  const beefId = makeVariant('لحمة مفرومة كجم', 300); // cost 150, stock 20
  const comboId = makeVariant('كومبو برجر', 120);

  expect(() => recipesService.setRecipe(comboId, [{ variantId: comboId, quantity: 1 }])).toThrow('مكون في وصفته');
  expect(() => recipesService.setRecipe(comboId, [{ variantId: bunId, quantity: 0 }])).toThrow('كمية المكون');
  recipesService.setRecipe(comboId, [{ variantId: bunId, quantity: 1 }, { variantId: beefId, quantity: 0.15 }]);
  // One level only: a recipe item can't be an ingredient, an ingredient can't get a recipe.
  expect(() => recipesService.setRecipe(burgerId, [{ variantId: comboId, quantity: 1 }])).toThrow('ليه وصفة');
  expect(() => recipesService.setRecipe(bunId, [{ variantId: teaId, quantity: 1 }])).toThrow('مكون في وصفة تانية');

  const { saleId } = salesService.createSale({ items: [{ variantId: comboId, quantity: 2 }], paymentMethod: 'cash' });
  expect(variantsRepo.getById(comboId).stock_quantity).toBe(20);
  expect(variantsRepo.getById(bunId).stock_quantity).toBe(18);
  expect(variantsRepo.getById(beefId).stock_quantity).toBeCloseTo(19.7);
  expect(mockDb.prepare('SELECT unit_cost FROM sale_items WHERE sale_id = ?').get(saleId).unit_cost).toBeCloseTo(24.5);

  expect(() => salesService.createSale({ items: [{ variantId: comboId, quantity: 19 }], paymentMethod: 'cash' }))
    .toThrow('عيش برجر');

  // A returned dish was cooked: nothing goes back on the shelf.
  returnsService.processReturn({ saleId, variantId: comboId, quantity: 1, reason: 'test', mode: 'refund' });
  expect(variantsRepo.getById(comboId).stock_quantity).toBe(20);
  expect(variantsRepo.getById(bunId).stock_quantity).toBe(18);

  recipesService.setRecipe(comboId, []);
  expect(recipesService.getRecipe(comboId)).toEqual([]);
});

test('dine-in pays the service charge after discount; delivery needs an address and pays a fixed fee', () => {
  const settings = require('../../electron/repositories/settings.repository');
  const { normalizeReceiptSale } = require('../../electron/services/print.service');
  settings.set('service_charge_percent', '12');
  settings.set('delivery_fee', '15');
  try {
    const table = tablesService.addTable('طاولة الخدمة').find((t) => t.name === 'طاولة الخدمة');
    const tab = tablesService.openTab(table.id);
    tablesService.sendRound(tab.id, [{ variantId: burgerId, quantity: 2 }]); // 160
    const dineIn = salesService.createSale({ items: [], discount: 10, paymentMethod: 'cash', tableTabId: tab.id });
    expect(dineIn.totalAmount).toBe(168); // (160 - 10) * 1.12
    const sale = salesService.getSaleById(dineIn.saleId);
    expect(sale.service_charge).toBe(18);
    expect(normalizeReceiptSale(sale)).toMatchObject({ saleId: dineIn.saleId, subtotal: 160, serviceCharge: 18, total: 168 });

    expect(() => salesService.createSale({
      items: [{ variantId: teaId, quantity: 1 }], paymentMethod: 'cash', orderMode: 'delivery', delivery: { phone: '010' },
    })).toThrow('العنوان مطلوبين');
    const delivered = salesService.createSale({
      items: [{ variantId: teaId, quantity: 2 }],
      paymentMethod: 'cash',
      orderMode: 'delivery',
      delivery: { name: 'منى', phone: '01000000000', address: ' 5 ش النصر،  الدور 3 ' },
    });
    expect(delivered.totalAmount).toBe(45);
    const row = mockDb.prepare('SELECT customer_name, customer_phone, delivery_address, service_charge FROM sales WHERE id = ?').get(delivered.saleId);
    expect(row).toEqual({ customer_name: 'منى', customer_phone: '01000000000', delivery_address: '5 ش النصر، الدور 3', service_charge: 15 });
    expect(require('../../electron/repositories/kitchen.repository').getSaleTicket(delivered.saleId).delivery_address).toBe('5 ش النصر، الدور 3');

    // Takeaway pays neither.
    expect(salesService.createSale({ items: [{ variantId: teaId, quantity: 1 }], paymentMethod: 'cash', orderMode: 'takeaway' }).totalAmount).toBe(15);
  } finally {
    settings.set('service_charge_percent', '0');
    settings.set('delivery_fee', '0');
  }
});

test('a split check is paid in parts and the last part frees the table', () => {
  const table = tablesService.addTable('طاولة التقسيم').find((t) => t.name === 'طاولة التقسيم');
  const tab = tablesService.openTab(table.id);
  const sent = tablesService.sendRound(tab.id, [{ variantId: burgerId, quantity: 1 }, { variantId: teaId, quantity: 2 }]);
  const [burgerLine, teaLine] = sent.items;

  const first = salesService.createSale({ items: [], paymentMethod: 'cash', tableTabId: tab.id, tabItemIds: [burgerLine.id] });
  expect(first).toMatchObject({ totalAmount: 80, tabClosed: false });
  expect(tablesService.getOpenTab(tab.id)).toMatchObject({ total: 30, paid_total: 80 });
  expect(tablesService.getTables().find((t) => t.id === table.id).tab_total).toBe(30);
  // A paid line can't be paid again, and stays fixed.
  expect(() => salesService.createSale({ items: [], paymentMethod: 'cash', tableTabId: tab.id, tabItemIds: [burgerLine.id] }))
    .toThrow('اتدفعت بالفعل');
  expect(() => mockDb.prepare('UPDATE table_tab_items SET paid_sale_id = NULL WHERE id = ?').run(burgerLine.id))
    .toThrow('cannot be changed');
  // The split sales are not new kitchen orders.
  expect(kitchenService.getKitchenOrders().some((o) => o.key === `sale-${first.saleId}`)).toBe(false);

  const last = salesService.createSale({ items: [], paymentMethod: 'card', tableTabId: tab.id });
  expect(last).toMatchObject({ totalAmount: 30, tabClosed: true });
  expect(salesService.getSaleById(last.saleId).items.map((i) => i.variant_id)).toEqual([teaLine.variant_id]);
  expect(tablesService.getTables().find((t) => t.id === table.id).tab_id).toBeNull();
});

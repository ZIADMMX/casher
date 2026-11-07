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

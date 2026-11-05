// Real migrations on an in-memory database: the kitchen flow can only move one
// step at a time, undo is short-lived, and the history can't be rewritten.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

jest.mock('../../electron/services/auth.service', () => ({
  requireAuth: jest.fn(),
  getCurrentSession: jest.fn(() => ({ id: 1 })),
}));

const kitchenService = require('../../electron/services/kitchen.service');
const kitchenRepo = require('../../electron/repositories/kitchen.repository');
const { checkTransition } = require('../../electron/services/kitchenFlow');

let saleId;

function newOrder() {
  return db.prepare(`
    INSERT INTO sales (user_id, total_amount, payment_method, order_mode, kitchen_status)
    VALUES (1, 50, 'cash', 'takeaway', 'new')
  `).run().lastInsertRowid;
}

beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  runAllMigrations();
  db.pragma('foreign_keys = ON');
  db.prepare("INSERT INTO users (id, username, password_hash, role) VALUES (1, 'chef', 'x', 'cashier')").run();
});

beforeEach(() => { saleId = Number(newOrder()); });

afterAll(() => {
  console.log.mockRestore();
  closeDatabase();
});

const move = (status) => kitchenService.updateKitchenOrderStatus({ saleId, status });

test('moves forward one step at a time and records who did it', () => {
  expect(move('preparing').kitchen_status).toBe('preparing');
  expect(move('ready').kitchen_status).toBe('ready');
  expect(move('served').kitchen_status).toBe('served');
  const events = db.prepare('SELECT from_status, to_status, user_id FROM kitchen_status_events WHERE sale_id = ?').all(saleId);
  expect(events).toEqual([
    { from_status: 'new', to_status: 'preparing', user_id: 1 },
    { from_status: 'preparing', to_status: 'ready', user_id: 1 },
    { from_status: 'ready', to_status: 'served', user_id: 1 },
  ]);
});

test('refuses skipping a step or going back more than one', () => {
  expect(() => move('served')).toThrow('لا يمكن نقل الطلب');
  move('preparing');
  move('ready');
  expect(() => move('new')).toThrow('لا يمكن نقل الطلب');
});

test('undoes the last move, but only once and only within two minutes', () => {
  move('preparing');
  expect(move('new').kitchen_status).toBe('new');
  // The undo itself is the last move now, so going back again is not an undo.
  move('preparing');
  db.pragma('foreign_keys = OFF'); // age the last event to 5 minutes ago
  db.prepare("UPDATE kitchen_status_events SET created_at = datetime('now', '-5 minutes') WHERE sale_id = ?").run(saleId);
  db.pragma('foreign_keys = ON');
  expect(() => move('new')).toThrow('التراجع متاح لمدة دقيقتين');
});

test('a second screen pressing the same button gets a clear message', () => {
  move('preparing');
  expect(() => move('preparing')).toThrow('اتحدث بالفعل');
  expect(() => kitchenRepo.moveOrder(saleId, 'new', 'preparing', 1)).toThrow('اتحدث بالفعل');
});

test('the database itself refuses jumps and edits to the history', () => {
  expect(() => db.prepare("UPDATE sales SET kitchen_status = 'served' WHERE id = ?").run(saleId)).toThrow(/one step/);
  move('preparing');
  expect(() => db.prepare('DELETE FROM kitchen_status_events').run()).toThrow(/append-only/);
  expect(() => db.prepare("UPDATE kitchen_status_events SET to_status = 'served'").run()).toThrow(/append-only/);
});

test('the board lists today\'s orders with their items in one go', () => {
  const orders = kitchenService.getKitchenOrders();
  expect(orders.find((o) => o.id === saleId)).toMatchObject({ kitchen_status: 'new', items: [] });
});

test('flow rules', () => {
  expect(checkTransition('new', 'preparing')).toBe('forward');
  expect(checkTransition(null, 'preparing')).toBe('forward');
  expect(() => checkTransition('new', 'bogus')).toThrow('غير صالحة');
  expect(checkTransition('ready', 'preparing', { fromStatus: 'preparing', toStatus: 'ready', ageSeconds: 30 })).toBe('undo');
});

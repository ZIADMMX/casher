const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
  initDatabase: jest.fn(),
  migrateCashierAuditLogsTable: jest.fn(),
}));

const auditRepo = require('../../electron/repositories/audit.repository');
const auditService = require('../../electron/services/audit.service');

describe('Cashier Audit Trail & Security Service', () => {
  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    mockDb.exec(fs.readFileSync(schemaPath, 'utf8'));

    mockDb.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)").run(1, 'cashier1', 'hash1', 'cashier');
    mockDb.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)").run(99, 'test_cashier_summary', 'hash99', 'cashier');
    mockDb.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)").run(88, 'filter_test', 'hash88', 'cashier');
  });

  afterAll(() => {
    mockDb.close();
  });

  beforeEach(() => {
    mockDb.prepare('DELETE FROM cashier_audit_logs WHERE user_id IN (1, 88, 99)').run();
  });

  test('should insert audit logs correctly into database', () => {
    const logId = auditRepo.log({
      userId: 1,
      username: 'cashier1',
      shiftId: null,
      actionType: 'item_removed',
      title: 'حذف صنف من السلة (قميص كاجوال)',
      details: 'قام الكاشير بحذف صنف بقيمة 150 ج.م',
      amount: 150,
      severity: 'warning',
    });

    expect(logId).toBeDefined();
    expect(typeof logId === 'number' || typeof logId === 'bigint').toBe(true);

    const logs = auditRepo.getLogs({ userId: 1, limit: 10 });
    expect(logs.length).toBeGreaterThan(0);
    const lastLog = logs[0];
    expect(lastLog.username).toBe('cashier1');
    expect(lastLog.action_type).toBe('item_removed');
    expect(lastLog.amount).toBe(150);
    expect(lastLog.severity).toBe('warning');
  });

  test('should calculate cashier summary statistics accurately', () => {
    auditRepo.log({
      userId: 99,
      username: 'test_cashier_summary',
      actionType: 'sale_created',
      title: 'فاتورة بيع',
      amount: 500,
    });
    auditRepo.log({
      userId: 99,
      username: 'test_cashier_summary',
      actionType: 'discount_applied',
      title: 'خصم',
      amount: 50,
    });
    auditRepo.log({
      userId: 99,
      username: 'test_cashier_summary',
      actionType: 'item_removed',
      title: 'حذف صنف',
    });
    auditRepo.log({
      userId: 99,
      username: 'test_cashier_summary',
      actionType: 'cart_cleared',
      title: 'إفراغ سلة',
    });

    const summary = auditRepo.getCashierSummary(99);
    expect(summary.total_actions).toBe(4);
    expect(summary.sales_count).toBe(1);
    expect(summary.discounts_count).toBe(1);
    expect(summary.voided_items_count).toBe(1);
    expect(summary.cleared_carts_count).toBe(1);
    expect(summary.total_discounts_amount).toBe(50);
  });

  test('should filter logs by actionType and userId', () => {
    const userId = 88;
    auditRepo.log({ userId, username: 'filter_test', actionType: 'login', title: 'تسجيل دخول' });
    auditRepo.log({ userId, username: 'filter_test', actionType: 'sale_created', title: 'بيع' });
    auditRepo.log({ userId, username: 'filter_test', actionType: 'logout', title: 'خروج' });

    const loginOnly = auditRepo.getLogs({ userId, actionType: 'login' });
    expect(loginOnly.length).toBe(1);
    expect(loginOnly[0].action_type).toBe('login');

    const allUserLogs = auditRepo.getLogs({ userId });
    expect(allUserLogs.length).toBe(3);
  });

  test('auditService should delegate calls and enforce permissions', () => {
    const authService = require('../../electron/services/auth.service');
    
    // Log action directly via auditService
    const logResult = auditService.logAction({
      userId: 1,
      username: 'cashier1',
      actionType: 'sale_created',
      title: 'عملية بيع جديدة',
      amount: 200,
    });
    expect(logResult).toBeDefined();

    // Log client action
    const clientLog = auditService.logClientAction({
      actionType: 'item_removed',
      title: 'حذف صنف من الشاشة',
    });
    expect(clientLog).toBeDefined();

    // Without admin session, getAuditLogs should throw
    expect(() => auditService.getAuditLogs()).toThrow();

    // Create admin user & login
    mockDb.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, role) VALUES (?, ?, ?, ?)").run(10, 'admin_test', 'hash_admin', 'admin');
    const token = require('../../electron/services/session.service').generateToken({ id: 10, username: 'admin_test', role: 'admin' });
    authService.setSessionForCaller(undefined, token);

    // With admin session, getAuditLogs and getCashierSummary should work
    const logsResult = auditService.getAuditLogs({ userId: 1 });
    expect(logsResult).toBeDefined();
    expect(Array.isArray(logsResult.items)).toBe(true);

    const summary = auditService.getCashierSummary(1);
    expect(summary).toBeDefined();
    expect(summary.total_actions).toBeGreaterThan(0);
  });
});



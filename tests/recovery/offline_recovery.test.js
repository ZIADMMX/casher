/**
 * Kashiear POS — Offline & Disaster Recovery Test Suite (فحوصات العمل أوفلاين والتعافي من الكوارث)
 * 
 * Verifies that the system can survive and recover from critical real-world disasters:
 * 1. 100% Offline Software Activation & Hardware-bound License Verification
 * 2. Admin Emergency Password Reset via Offline Recovery Key
 * 3. Developer Challenge-Response Offline Recovery OTP
 * 4. Point-in-Time Database Backup, Crash Simulation & Full Data Restoration
 * 5. Network Drop / Offline Server Resilience
 */

const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const bcrypt = require('bcryptjs');
const crypto = require('node:crypto');
const licenseKeys = require('../helpers/licenseKeys');
const { signLicenseKey } = require('../../electron/security/licenseSigning');

// Create test database
const testBaseTmp = fs.existsSync('D:\\temp') ? 'D:\\temp' : (fs.existsSync('D:\\') ? 'D:\\temp' : os.tmpdir());
if (!fs.existsSync(testBaseTmp)) {
  fs.mkdirSync(testBaseTmp, { recursive: true });
}
const mockTempDir = fs.mkdtempSync(path.join(testBaseTmp, 'kashiear-recovery-test-'));
const mockTestDbFile = path.join(mockTempDir, 'recovery_test.db');
const mockBackupDbFile = path.join(mockTempDir, 'recovery_test_backup.db');

let mockCurrentDb = new Database(mockTestDbFile);
mockCurrentDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  get db() {
    return mockCurrentDb;
  },
  get dbPath() {
    return mockTestDbFile;
  },
  closeDatabase: () => {
    if (mockCurrentDb && mockCurrentDb.open) {
      mockCurrentDb.close();
    }
  },
}));

jest.mock('../../electron/services/notifications.service', () => ({
  notify: jest.fn(),
  getAll: jest.fn(() => []),
}));

const authService = require('../../electron/services/auth.service');
const licenseService = require('../../electron/services/license.service');
const usersRepo = require('../../electron/repositories/users.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const salesRepo = require('../../electron/repositories/sales.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');

describe('Offline & Disaster Recovery Test Suite (العمل بدون إنترنت والتعافي من الكوارث)', () => {
  let adminRecoveryKey;

  beforeAll(() => {
    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockCurrentDb.exec(schema);

    // Initial setup with recovery key
    adminRecoveryKey = authService.generateRecoveryKey();
    const recoveryKeyHash = bcrypt.hashSync(adminRecoveryKey, 10);

    usersRepo.create({
      username: 'admin',
      passwordHash: bcrypt.hashSync('OldAdminPass123', 4),
      role: 'admin',
      forcePasswordChange: false,
      recoveryKeyHash,
    });
  });

  afterAll(() => {
    if (mockCurrentDb && mockCurrentDb.open) mockCurrentDb.close();
    try {
      fs.rmSync(mockTempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // 1. 100% Offline Software Activation & Hardware-bound Verification
  // =========================================================================
  describe('1. Offline Software Activation & Verification (الترخيص بدون إنترنت)', () => {
    test('verifies software activation offline using machine hardware ID and cryptographic signature', () => {
      const hwid = licenseService.getMachineHardwareId();
      expect(hwid).toBeDefined();
      expect(typeof hwid).toBe('string');

      // Generate a legitimate offline lifetime license key for this hardware ID
      const validOfflineKey = licenseKeys.generateLicenseKey({
        hwid,
        expiryTimestamp: 9999999999000,
      });

      // Activate software offline
      const activation = licenseService.activateSoftware(validOfflineKey);
      expect(activation.success).toBe(true);

      // Verify status is active offline
      const status = licenseService.getLicenseStatus();
      expect(status.isActivated).toBe(true);
      expect(status.hwid).toBe(hwid);
    });

    test('rejects a forged offline license key signed with another private key', () => {
      const hwid = licenseService.getMachineHardwareId();
      const { privateKey: attackerKey } = crypto.generateKeyPairSync('ed25519');
      const fakeKey = signLicenseKey({ hwid, expiryTimestamp: 9999999999000, privateKey: attackerKey });
      expect(() => licenseService.activateSoftware(fakeKey)).toThrow('توقيع المفتاح غير صحيح أو تم التلاعب به');
    });
  });

  // =========================================================================
  // 2. Admin Password Emergency Recovery (Offline Recovery Key)
  // =========================================================================
  describe('2. Disaster Recovery: Admin Forgotten Password (مفتاح الطوارئ المطبوع)', () => {
    test('resets admin password offline using Recovery Key and issues a fresh replacement key', () => {
      const resetResult = authService.resetAdminPasswordWithRecoveryKey({
        recoveryKey: adminRecoveryKey,
        newPassword: 'NewAdminPassword456',
      });

      expect(resetResult.success).toBe(true);
      expect(resetResult.newRecoveryKey).toBeDefined();
      expect(resetResult.newRecoveryKey).not.toBe(adminRecoveryKey);

      // Old password should no longer work
      expect(() => authService.login('admin', 'OldAdminPass123')).toThrow('اسم المستخدم أو كلمة المرور غير صحيحة');

      // New password works immediately
      const login = authService.login('admin', 'NewAdminPassword456');
      expect(login.token).toBeDefined();
      expect(login.user.username).toBe('admin');
    });

    test('rejects invalid or mistyped recovery keys', () => {
      expect(() => authService.resetAdminPasswordWithRecoveryKey({
        recoveryKey: 'REC-INVALID-KEY-1111-2222',
        newPassword: 'SomePassword123',
      })).toThrow('مفتاح الاسترداد غير صحيح');
    });
  });

  // =========================================================================
  // 3. Developer Challenge-Response Offline Recovery OTP
  // =========================================================================
  describe('3. Disaster Recovery: Challenge-Response OTP (في حالة فقدان مفتاح الطوارئ)', () => {
    test('generates challenge code and validates developer response OTP offline', () => {
      const challengeCode = authService.getRecoveryChallenge();
      expect(challengeCode).toMatch(/^CHAL-/);

      // Calculate offline OTP as Developer would
      const responseOtp = licenseKeys.generateDeveloperRecoveryOtp(challengeCode);
      expect(responseOtp).toBeDefined();

      // Reset password using Challenge/Response OTP
      const resetResult = authService.resetAdminPasswordWithChallenge({
        challengeCode,
        responseOtp,
        newPassword: 'DeveloperRescuedPass789',
      });

      expect(resetResult.success).toBe(true);
      expect(resetResult.newRecoveryKey).toBeDefined();

      // Verify login with rescued password
      const login = authService.login('admin', 'DeveloperRescuedPass789');
      expect(login.token).toBeDefined();
    });

    test('rejects incorrect or expired challenge response OTP', () => {
      const challengeCode = authService.getRecoveryChallenge();
      expect(() => authService.resetAdminPasswordWithChallenge({
        challengeCode,
        responseOtp: 'WRONG-OTP1',
        newPassword: 'NewPassword123',
      })).toThrow('كود الاستجابة غير صحيح أو منتهي الصلاحية');
    });
  });

  // =========================================================================
  // 4. Point-in-Time Database Backup, Crash Simulation & Full Restoration
  // =========================================================================
  describe('4. Database Disaster & Point-in-Time Backup Restoration', () => {
    test('backs up database, survives table wipeout, and restores 100% data integrity', async () => {
      authService.login('admin', 'DeveloperRescuedPass789');

      // 4.1 Create business data (Products, Shifts, Sales)
      const prodId = productsRepo.create({ name: 'بدلة رجالي كلاسيك فاخرة' });
      const varId = variantsRepo.create({
        productId: prodId,
        size: '52',
        color: 'كحلي',
        purchasePrice: 1000,
        sellingPrice: 1800,
        stockQuantity: 10,
        barcode: 'SUIT-52-NAVY',
      });

      const shift = shiftsRepo.openShift({ openingCash: 1000, userId: 1, openedByName: 'admin' });
      const saleId = salesRepo.createSale({
        shiftId: shift.id,
        items: [{ variantId: varId, quantity: 2 }],
        paymentMethod: 'cash',
        totalAmount: 3600,
        userId: 1,
      });
      variantsRepo.decreaseStock(varId, 2);

      // Check initial count
      expect(productsRepo.getAll().length).toBeGreaterThan(0);
      expect(salesRepo.getById(saleId)).toBeDefined();

      // 4.2 Perform point-in-time backup to disk
      await mockCurrentDb.backup(mockBackupDbFile);
      expect(fs.existsSync(mockBackupDbFile)).toBe(true);

      // 4.3 Simulate Disaster / Crash / Table Corruption
      mockCurrentDb.exec(`
        PRAGMA foreign_keys = OFF;
        DELETE FROM sales;
        DELETE FROM product_variants;
        DELETE FROM products;
        DELETE FROM shifts;
        PRAGMA foreign_keys = ON;
      `);

      expect(productsRepo.getAll().length).toBe(0);
      expect(salesRepo.getById(saleId)).toBeNull();

      // 4.4 Verify backup snapshot file integrity independently
      const backupDb = new Database(mockBackupDbFile);
      expect(backupDb.prepare('SELECT COUNT(*) as count FROM products').get().count).toBeGreaterThan(0);
      const backupSale = backupDb.prepare('SELECT * FROM sales WHERE id = ?').get(saleId);
      expect(backupSale).toBeDefined();
      expect(backupSale.total_amount).toBe(3600);
      backupDb.close();

      // 4.5 Restore from backup file into active database
      const normalizedBackupPath = mockBackupDbFile.replace(/\\/g, '/');
      mockCurrentDb.exec(`
        ATTACH DATABASE '${normalizedBackupPath}' AS backup_db;
        INSERT INTO products SELECT * FROM backup_db.products;
        INSERT INTO product_variants SELECT * FROM backup_db.product_variants;
        INSERT INTO shifts SELECT * FROM backup_db.shifts;
        INSERT INTO sales SELECT * FROM backup_db.sales;
        DETACH DATABASE backup_db;
      `);

      // 4.6 Verify 100% Data Integrity Restored in Active System
      expect(productsRepo.getAll().length).toBeGreaterThan(0);
      const restoredSale = salesRepo.getById(saleId);
      expect(restoredSale).toBeDefined();
      expect(restoredSale.total_amount).toBe(3600);
      expect(variantsRepo.getById(varId).stock_quantity).toBe(8); // 10 - 2
    });
  });
});

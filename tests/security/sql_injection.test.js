const Database = require('better-sqlite3');
const fs = require('node:fs');
const path = require('node:path');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({
  db: mockDb,
  dbPath: ':memory:',
}));

const usersRepo = require('../../electron/repositories/users.repository');
const customersRepo = require('../../electron/repositories/customers.repository');
const productsRepo = require('../../electron/repositories/products.repository');
const variantsRepo = require('../../electron/repositories/productVariants.repository');
const reportsRepo = require('../../electron/repositories/reports.repository');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
const purchasesRepo = require('../../electron/repositories/purchases.repository');
const notificationsRepo = require('../../electron/repositories/notifications.repository');
const crmAdvancedRepo = require('../../electron/repositories/crmAdvanced.repository');

describe('Security: SQL Injection Immunity & Parameterized Queries', () => {
  beforeEach(() => {
    // Reset schema
    mockDb.exec(`
      PRAGMA foreign_keys = OFF;
      DROP TABLE IF EXISTS purchase_payments;
      DROP TABLE IF EXISTS purchase_items;
      DROP TABLE IF EXISTS purchases;
      DROP TABLE IF EXISTS supplier_ledger;
      DROP TABLE IF EXISTS suppliers;
      DROP TABLE IF EXISTS sale_items;
      DROP TABLE IF EXISTS sales;
      DROP TABLE IF EXISTS returns;
      DROP TABLE IF EXISTS return_items;
      DROP TABLE IF EXISTS product_variants;
      DROP TABLE IF EXISTS products;
      DROP TABLE IF EXISTS categories;
      DROP TABLE IF EXISTS customer_debts;
      DROP TABLE IF EXISTS customers;
      DROP TABLE IF EXISTS shifts;
      DROP TABLE IF EXISTS notifications;
      DROP TABLE IF EXISTS settings;
      DROP TABLE IF EXISTS crm_leads;
      DROP TABLE IF EXISTS crm_companies;
      DROP TABLE IF EXISTS users;
      PRAGMA foreign_keys = ON;
    `);

    const schemaPath = path.join(__dirname, '../../electron/database/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    mockDb.exec(schema);
    mockDb.exec(`
      CREATE TABLE crm_companies (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
      CREATE TABLE crm_leads (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        email TEXT,
        company_id INTEGER,
        source TEXT,
        status TEXT,
        owner_user_id INTEGER,
        notes TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO crm_leads (name, status) VALUES ('Lead One', 'new'), ('Lead Two', 'new');
    `);

    // Seed test data
    usersRepo.create({
      username: 'admin',
      passwordHash: 'admin_hash',
      role: 'admin',
      forcePasswordChange: false,
    });

    usersRepo.create({
      username: 'cashier1',
      passwordHash: 'cashier_hash',
      role: 'cashier',
      forcePasswordChange: false,
    });

    customersRepo.create({
      name: 'Ahmed Ali',
      phone: '01012345678',
      debt: 0,
    });

    const prodId = productsRepo.create({
      name: 'Classic T-Shirt',
      categoryId: null,
      description: 'Cotton',
    });

    variantsRepo.create({
      productId: prodId,
      size: 'L',
      color: 'Black',
      purchasePrice: 50,
      sellingPrice: 100,
      stockQuantity: 20,
      lowStockThreshold: 5,
      barcode: 'BARCODE-001',
      sku: 'P1-V1-L',
    });
  });

  afterAll(() => {
    if (mockDb) {
      mockDb.close();
    }
  });

  describe('Users Repository SQL Injection Tests', () => {
    const dangerousUsernames = [
      "' OR '1'='1",
      "' OR 1=1--",
      "admin' --",
      "admin' #",
      "admin'/*",
      "' UNION SELECT null, 'hacked', 'hacked', 'admin', 1, null, null, null, null--",
      "'; DROP TABLE users; --",
      "\" OR \"\"=\"",
      "admin' AND 1=(SELECT COUNT(*) FROM users); --",
    ];

    dangerousUsernames.forEach((payload) => {
      test(`safely neutralizes username payload: ${payload}`, () => {
        const user = usersRepo.getByUsername(payload);
        expect(user).toBeUndefined();

        // Verify users table still exists and untouched
        const count = usersRepo.countAll();
        expect(count).toBe(2);
      });
    });

    test('stores and retrieves literal strings containing SQL characters safely', () => {
      const maliciousName = "O'Connor'); DROP TABLE users;--";
      usersRepo.create({
        username: maliciousName,
        passwordHash: 'some_hash',
        role: 'cashier',
      });

      const retrieved = usersRepo.getByUsername(maliciousName);
      expect(retrieved).toBeDefined();
      expect(retrieved.username).toBe(maliciousName);
      expect(usersRepo.countAll()).toBe(3);
    });
  });

  describe('Customers Repository SQL Injection Tests', () => {
    const dangerousPhones = [
      "01012345678' OR '1'='1",
      "010' UNION SELECT null, 'hacked', '000', 0, null, null--",
      "'; DROP TABLE customers; --",
      "' OR ''='",
    ];

    dangerousPhones.forEach((payload) => {
      test(`safely neutralizes customer phone payload: ${payload}`, () => {
        const customer = customersRepo.getByPhone(payload);
        expect(customer).toBeUndefined();

        // Check customers table intact
        const all = customersRepo.getAll();
        expect(all.length).toBe(1);
      });
    });

    test('safely handles search and creation with quotes and SQL payloads in customer name', () => {
      const complexName = 'Robert"); DROP TABLE customers;--';
      customersRepo.create({
        name: complexName,
        phone: '01199998888',
      });

      const saved = customersRepo.getByPhone('01199998888');
      expect(saved).toBeDefined();
      expect(saved.name).toBe(complexName);
    });
  });

  describe('Products & Product Variants SQL Injection Tests', () => {
    const dangerousBarcodes = [
      "BARCODE-001' OR '1'='1",
      "'; DROP TABLE product_variants; --",
      "' UNION SELECT null, null, null, null, null, null, null, null, null, null, null--",
    ];

    dangerousBarcodes.forEach((payload) => {
      test(`safely neutralizes barcode lookup payload: ${payload}`, () => {
        const variant = variantsRepo.getByBarcode(payload);
        expect(variant).toBeUndefined();

        const all = variantsRepo.getAll();
        expect(all.length).toBe(1);
      });

      describe('CRM Repository SQL Injection Tests', () => {
        test('search treats SQL payloads as literal lead text and leaves records untouched', () => {
          const leads = crmAdvancedRepo.getLeads({ search: "' OR 1=1--" });

          expect(leads).toEqual([]);
          expect(crmAdvancedRepo.getLeads({}).map((lead) => lead.name)).toEqual([
            'Lead One',
            'Lead Two',
          ]);
          expect(mockDb.prepare(
            "SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table' AND name = 'crm_leads'"
          ).get().count).toBe(1);
        });
      });
    });
  });

  describe('Reports Repository SQL Injection Tests', () => {
    const dangerousDates = [
      "2026-01-01' OR '1'='1",
      "2026-01-01'; DROP TABLE sales; --",
      "' UNION SELECT 999999, 999999--",
    ];

    dangerousDates.forEach((payload) => {
      test(`safely neutralizes date parameters in reports summary: ${payload}`, () => {
        expect(() => {
          const summary = reportsRepo.getSummary(payload, '2026-12-31');
          expect(summary).toBeDefined();
        }).not.toThrow();

        // Ensure sales table is still intact
        expect(() => reportsRepo.getRecentInvoices('2026-01-01', payload, 10)).not.toThrow();
      });
    });
  });

  describe('Shifts & Purchases Repository SQL Injection Tests', () => {
    test('shifts repository filters safely with malicious input', () => {
      const maliciousFilter = "all' OR 1=1; DROP TABLE shifts; --";
      expect(() => {
        const shifts = shiftsRepo.getAllShifts(maliciousFilter);
        expect(Array.isArray(shifts)).toBe(true);
      }).not.toThrow();
    });

    test('purchases repository neutralizes dangerous queries', () => {
      const maliciousId = "1' OR 1=1; DROP TABLE purchases; --";
      const item = purchasesRepo.getPurchaseById(maliciousId);
      expect(item).toBeFalsy();
    });

    test('notifications repository clean up parameterized safely', () => {
      const maliciousDays = "30; DROP TABLE notifications; --";
      expect(() => {
        notificationsRepo.deleteOlderThan(maliciousDays);
      }).not.toThrow();
    });
  });
});

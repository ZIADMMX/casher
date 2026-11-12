/**
 * @file privacyConsent.test.js
 * @description موافقات التواصل وسياسة الخصوصية (قانون 151/2020).
 * الموافقة من غير نسخة السياسة وتاريخها ما بتنفعش كإثبات، والمسح لازم يشيلها.
 */

const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');
mockDb.pragma('foreign_keys = ON');

jest.mock('../../electron/database/db', () => ({ db: mockDb, dbPath: ':memory:' }));

const policy = require('../../shared/privacyPolicy.json');
const { ensurePrivacyConsent } = require('../../electron/database/migrations/privacy');
const crmRepo = require('../../electron/repositories/crmAdvanced.repository');
const customersRepo = require('../../electron/repositories/customers.repository');

// شكل جدول العملاء بعد ترحيل الـ CRM وقبل ترحيل الخصوصية.
const BEFORE_PRIVACY_SCHEMA = `
  CREATE TABLE customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT,
    email TEXT,
    address TEXT,
    notes TEXT,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    company_id INTEGER,
    lead_source TEXT,
    email_consent INTEGER NOT NULL DEFAULT 0,
    sms_consent INTEGER NOT NULL DEFAULT 0,
    consent_updated_at DATETIME,
    gdpr_deleted_at DATETIME
  );
  CREATE TABLE crm_audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type TEXT NOT NULL,
    entity_id INTEGER NOT NULL,
    action TEXT NOT NULL,
    changes_json TEXT,
    user_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`;

function customer(id) {
  return mockDb.prepare('SELECT * FROM customers WHERE id = ?').get(id);
}

describe('سياسة الخصوصية — النص نفسه', () => {
  test('فيها نسخة وتاريخ ونص موافقة وبنود', () => {
    expect(policy.version).toMatch(/^\d+\.\d+$/);
    expect(policy.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(policy.consentText.length).toBeGreaterThan(40);
    expect(policy.sections.length).toBeGreaterThanOrEqual(8);
    for (const section of policy.sections) {
      expect(section.heading).toBeTruthy();
      expect(section.body.length).toBeGreaterThan(0);
    }
  });

  test('ما فيهاش متغير غير اللي الواجهة بتملاه', () => {
    const allowed = new Set(['store_name', 'store_phone', 'store_address']);
    const text = JSON.stringify(policy);
    for (const match of text.matchAll(/\{\{(\w+)\}\}/g)) {
      expect(allowed.has(match[1])).toBe(true);
    }
  });

  test('بتغطي البنود اللي القانون بيطلبها', () => {
    const headings = policy.sections.map((section) => section.heading).join(' ');
    expect(headings).toMatch(/المسؤول/);
    expect(headings).toMatch(/حقوقك/);
    expect(headings).toMatch(/الاحتفاظ/);
    expect(headings).toMatch(/نشارك/);
  });
});

describe('موافقات التواصل', () => {
  beforeAll(() => {
    mockDb.exec(BEFORE_PRIVACY_SCHEMA);
    ensurePrivacyConsent(mockDb);
  });

  beforeEach(() => {
    mockDb.exec('DELETE FROM customers; DELETE FROM crm_audit_log;');
  });

  test('الترحيل بيضيف قناة الواتساب ونسخة السياسة', () => {
    const columns = mockDb.prepare('PRAGMA table_info(customers)').all().map((column) => column.name);
    expect(columns).toEqual(expect.arrayContaining(['whatsapp_consent', 'consent_policy_version']));
  });

  test('الترحيل بيتكرر بغير أثر', () => {
    expect(() => ensurePrivacyConsent(mockDb)).not.toThrow();
  });

  test('تسجيل الموافقة بيحفظ القناة ونسخة السياسة وتاريخها', () => {
    const id = customersRepo.create({ name: 'سعاد' });
    const saved = crmRepo.setConsent(id, { email_consent: false, sms_consent: false, whatsapp_consent: true }, 3);

    expect(saved.whatsapp_consent).toBe(1);
    expect(saved.email_consent).toBe(0);
    expect(saved.consent_policy_version).toBe(policy.version);
    expect(saved.consent_updated_at).toBeTruthy();
  });

  test('الموافقة بتتسجل في سجل التدقيق ومعاها نسخة السياسة', () => {
    const id = customersRepo.create({ name: 'سعاد' });
    crmRepo.setConsent(id, { email_consent: true, sms_consent: false, whatsapp_consent: false }, 3);

    const entry = mockDb.prepare("SELECT * FROM crm_audit_log WHERE action = 'consent_updated'").get();
    expect(entry.entity_id).toBe(id);
    expect(entry.user_id).toBe(3);
    expect(JSON.parse(entry.changes_json).policy_version).toBe(policy.version);
  });

  test('سحب الموافقة بيتسجل زي ما إعطاؤها بيتسجل', () => {
    const id = customersRepo.create({ name: 'سعاد' });
    crmRepo.setConsent(id, { email_consent: true, sms_consent: true, whatsapp_consent: true }, 3);
    const withdrawn = crmRepo.setConsent(id, { email_consent: false, sms_consent: false, whatsapp_consent: false }, 3);

    expect(withdrawn.whatsapp_consent).toBe(0);
    expect(withdrawn.consent_updated_at).toBeTruthy();
    expect(mockDb.prepare("SELECT COUNT(*) AS n FROM crm_audit_log WHERE action = 'consent_updated'").get().n).toBe(2);
  });

  test('عميل جديد موافق: نسخة السياسة وتاريخ الموافقة بيتسجلوا', () => {
    const id = customersRepo.create({ name: 'سعاد', phone: '01000000000', whatsappConsent: true });
    const row = customer(id);

    expect(row.whatsapp_consent).toBe(1);
    expect(row.consent_policy_version).toBe(policy.version);
    expect(row.consent_updated_at).toBeTruthy();
  });

  test('عميل جديد بغير موافقة: مفيش نسخة ولا تاريخ موافقة', () => {
    const row = customer(customersRepo.create({ name: 'سعاد', phone: '01000000000' }));

    expect(row.whatsapp_consent).toBe(0);
    expect(row.consent_policy_version).toBeNull();
    expect(row.consent_updated_at).toBeNull();
  });
});

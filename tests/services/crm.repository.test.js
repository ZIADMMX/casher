jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      email TEXT,
      rating INTEGER DEFAULT 5,
      tier TEXT DEFAULT 'Regular',
      last_interaction_at DATETIME
    );
    CREATE TABLE products (id INTEGER PRIMARY KEY, name TEXT NOT NULL);
    CREATE TABLE product_variants (id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL);
    CREATE TABLE sales (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE sale_items (
      id INTEGER PRIMARY KEY,
      sale_id INTEGER NOT NULL,
      variant_id INTEGER NOT NULL
    );
    CREATE TABLE crm_campaigns (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      target_criteria TEXT,
      discount_percentage REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE crm_interactions (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      campaign_id INTEGER,
      user_id INTEGER,
      type TEXT NOT NULL,
      subject TEXT NOT NULL,
      details TEXT,
      status TEXT NOT NULL DEFAULT 'open',
      follow_up_date DATETIME,
      reminder_sent_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (campaign_id) REFERENCES crm_campaigns(id)
    );
    CREATE UNIQUE INDEX idx_crm_campaign_customer
      ON crm_interactions(campaign_id, customer_id)
      WHERE campaign_id IS NOT NULL;
  `);
  return { db };
});

const { db } = require('../../electron/database/db');
const crmRepository = require('../../electron/repositories/crm.repository');

describe('CRM campaign repository', () => {
  beforeEach(() => {
    db.exec(`
      DELETE FROM crm_interactions;
      DELETE FROM crm_campaigns;
      DELETE FROM sale_items;
      DELETE FROM sales;
      DELETE FROM product_variants;
      DELETE FROM products;
      DELETE FROM customers;
    `);
  });

  test('targets lapsed product buyers and creates one follow-up per campaign', () => {
    db.prepare('INSERT INTO customers (id, name) VALUES (?, ?)').run(1, 'عميل قديم');
    db.prepare('INSERT INTO customers (id, name) VALUES (?, ?)').run(2, 'عميل حديث');
    db.prepare('INSERT INTO products (id, name) VALUES (?, ?)').run(1, 'هاتف ذكي');
    db.prepare('INSERT INTO product_variants (id, product_id) VALUES (?, ?)').run(1, 1);
    db.prepare("INSERT INTO sales (id, customer_id, created_at) VALUES (?, ?, datetime('now', '-11 months'))").run(1, 1);
    db.prepare("INSERT INTO sales (id, customer_id, created_at) VALUES (?, ?, datetime('now', '-2 months'))").run(2, 2);
    db.prepare('INSERT INTO sale_items (sale_id, variant_id) VALUES (?, ?)').run(1, 1);
    db.prepare('INSERT INTO sale_items (sale_id, variant_id) VALUES (?, ?)').run(2, 1);

    const criteria = {
      product_keyword: 'هاتف',
      months_since_purchase: 10,
      follow_up_days: 1,
      offer_title: 'عرض إكسسوارات',
      offer_details: 'ملحقات متوافقة',
      discount_percentage: 5
    };
    const campaignId = crmRepository.createCampaign({
      name: 'استعادة مشتري الهاتف',
      targetCriteria: criteria,
      discountPercentage: criteria.discount_percentage
    });
    const campaign = crmRepository.getCampaignById(campaignId);
    const audience = crmRepository.getCampaignAudience(criteria, campaignId);

    expect(audience.map((customer) => customer.id)).toEqual([1]);
    expect(crmRepository.createCampaignReminders(campaign, criteria)).toBe(1);
    expect(crmRepository.createCampaignReminders(campaign, criteria)).toBe(0);
    expect(crmRepository.getCampaignAudience(criteria, campaignId)[0].reminder_created).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS count FROM crm_interactions WHERE campaign_id = ?').get(campaignId).count).toBe(1);
    expect(db.prepare('SELECT last_interaction_at FROM customers WHERE id = 1').get().last_interaction_at).not.toBeNull();
  });
});

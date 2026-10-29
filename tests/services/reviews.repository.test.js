const Database = require('better-sqlite3');

const mockDb = new Database(':memory:');

jest.mock('../../electron/database/db', () => ({ db: mockDb }));

const reviewsRepo = require('../../electron/repositories/reviews.repository');

describe('reviews repository', () => {
  beforeAll(() => {
    mockDb.exec(`
      CREATE TABLE reviews (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        rating INTEGER NOT NULL,
        tags TEXT NOT NULL DEFAULT '[]',
        comment TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        sector TEXT,
        app_version TEXT,
        consent INTEGER NOT NULL DEFAULT 0,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (tenant_id, user_id)
      );
      CREATE TABLE review_prompt_state (
        tenant_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        first_seen_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        last_prompted_at DATETIME,
        PRIMARY KEY (tenant_id, user_id)
      );
      CREATE TABLE review_sync_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        payload_json TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id)
      );
      CREATE TABLE sales (id INTEGER PRIMARY KEY, user_id INTEGER);
      CREATE TABLE appointments (
        id INTEGER PRIMARY KEY,
        created_by_user_id INTEGER,
        status TEXT
      );
      CREATE TABLE orders (
        id INTEGER PRIMARY KEY,
        created_by_user_id INTEGER,
        status TEXT,
        appointment_id INTEGER
      );
      CREATE TABLE review_activity (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tenant_id TEXT NOT NULL,
        user_id INTEGER NOT NULL,
        activity_type TEXT NOT NULL,
        activity_id TEXT NOT NULL,
        created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(tenant_id, user_id, activity_type, activity_id)
      );
      CREATE TABLE onboarding_state (id INTEGER PRIMARY KEY, selected_sector TEXT);
    `);
  });

  beforeEach(() => {
    mockDb.exec(`
      DELETE FROM reviews;
      DELETE FROM review_prompt_state;
      DELETE FROM review_sync_queue;
      DELETE FROM sales;
      DELETE FROM appointments;
      DELETE FROM orders;
      DELETE FROM review_activity;
      DELETE FROM onboarding_state;
    `);
  });

  afterAll(() => {
    mockDb.close();
  });

  test('tracks activity and respects 14-day and 90-day prompt windows', () => {
    mockDb.prepare(`
      INSERT INTO review_prompt_state (tenant_id, user_id, first_seen_at)
      VALUES ('local', 8, datetime('now', '-15 days'))
    `).run();
    mockDb.prepare('INSERT INTO sales (user_id) VALUES (?)').run(8);
    mockDb.prepare('INSERT INTO appointments (created_by_user_id, status) VALUES (?, ?)').run(8, 'completed');
    mockDb.prepare('INSERT INTO orders (created_by_user_id, status, appointment_id) VALUES (?, ?, ?)').run(8, 'delivered', null);

    expect(reviewsRepo.getPromptData('local', 8)).toMatchObject({
      hasUsed14Days: true,
      cooldownComplete: true,
      successfulTransactions: 3,
      hasEnoughTransactions: false,
    });

    reviewsRepo.markPrompted('local', 8);
    expect(reviewsRepo.getPromptData('local', 8).cooldownComplete).toBe(false);
  });

  test('makes the automatic prompt eligible at exactly 30 successful transactions', () => {
    mockDb.prepare(`
      INSERT INTO review_prompt_state (tenant_id, user_id, first_seen_at)
      VALUES ('local', 8, datetime('now', '-15 days'))
    `).run();
    const insertSale = mockDb.prepare('INSERT INTO sales (user_id) VALUES (?)');
    for (let index = 0; index < 28; index += 1) insertSale.run(8);
    mockDb.prepare('INSERT INTO appointments (created_by_user_id, status) VALUES (?, ?)').run(8, 'completed');
    mockDb.prepare('INSERT INTO orders (created_by_user_id, status, appointment_id) VALUES (?, ?, ?)').run(8, 'delivered', null);

    expect(reviewsRepo.getPromptData('local', 8)).toMatchObject({
      successfulTransactions: 30,
      hasEnoughTransactions: true,
      hasUsed14Days: true,
      cooldownComplete: true,
    });
  });

  test('counts and de-duplicates successful centrally processed sales and bookings', () => {
    mockDb.prepare(`
      INSERT INTO review_prompt_state (tenant_id, user_id, first_seen_at)
      VALUES ('branch:5', 8, datetime('now', '-15 days'))
    `).run();
    mockDb.prepare('INSERT INTO sales (user_id) VALUES (?)').run(8);
    expect(reviewsRepo.recordRemoteActivity('branch:5', 8, 'sale', 42)).toBe(true);
    expect(reviewsRepo.recordRemoteActivity('branch:5', 8, 'sale', 42)).toBe(false);
    reviewsRepo.recordRemoteActivity('branch:5', 8, 'appointment', 7);

    expect(reviewsRepo.getPromptData('branch:5', 8)).toMatchObject({
      successfulTransactions: 2,
      hasEnoughTransactions: false,
      hasUsed14Days: true,
    });
  });

  test('upserts one editable review and one durable pending sync item per tenant user', () => {
    const original = {
      rating: 5,
      tags: ['تقارير مفيدة'],
      comment: 'تجربة ممتازة وسهلة الاستخدام',
      consent: true,
      sector: 'retail',
      appVersion: '1.0.1',
      businessName: 'متجر النور',
    };
    reviewsRepo.saveReview('branch:5', 8, original);
    const updated = { ...original, rating: 4, tags: ['دعم جيد'], consent: false, businessLogo: null };
    reviewsRepo.saveReview('branch:5', 8, updated);
    reviewsRepo.saveReview('branch:5', 9, { ...updated, comment: null });

    expect(reviewsRepo.getReview('branch:5', 8)).toMatchObject({
      rating: 4,
      tags: ['دعم جيد'],
      consent: false,
      status: 'pending',
    });
    expect(reviewsRepo.getPendingSync()).toHaveLength(2);
    expect(reviewsRepo.getPendingSyncCount('branch:5', 8)).toBe(1);
    expect(reviewsRepo.getPendingSync()[0].payload).toMatchObject(updated);

    reviewsRepo.removePendingSync(reviewsRepo.getPendingSync()[0].id);
    expect(reviewsRepo.getPendingSyncCount('branch:5', 8)).toBe(0);
    expect(reviewsRepo.getPendingSyncCount()).toBe(1);
  });
});

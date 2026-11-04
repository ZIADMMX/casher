jest.mock('../../electron/database/db', () => {
  const Database = require('better-sqlite3');
  const db = new Database(':memory:');
  return { db };
});

const { db } = require('../../electron/database/db');
const courtsRepository = require('../../electron/repositories/courts.repository');
const courtsService = require('../../electron/services/courts.service');

describe('courts directory', () => {
  beforeEach(() => {
    db.exec(`
      CREATE TABLE courts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        court_type TEXT NOT NULL,
        specialization TEXT,
        notes TEXT,
        phone TEXT,
        city TEXT,
        address TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
      CREATE UNIQUE INDEX idx_courts_name_active
        ON courts(name COLLATE NOCASE) WHERE is_active = 1;
    `);
  });

  afterEach(() => {
    db.exec('DROP TABLE courts');
  });

  afterAll(() => db.close());

  test('creates, searches, paginates, and updates a court', () => {
    const first = courtsService.createCourt({
      name: 'محكمة القاهرة الابتدائية',
      court_type: 'first_instance',
      city: 'القاهرة',
      phone: '',
    });
    courtsService.createCourt({
      name: 'محكمة الأسرة',
      court_type: 'family',
      city: 'الجيزة',
    });

    const result = courtsService.getCourts({ search: 'القاهرة', page: '1', pageSize: '10' });
    expect(result.total).toBe(1);
    expect(result.items[0].id).toBe(first.id);
    expect(result.items[0].phone).toBeNull();

    const updated = courtsService.updateCourt(first.id, { city: 'الإسكندرية' });
    expect(updated.city).toBe('الإسكندرية');
  });

  test('prevents duplicate active names, validates types, and deactivates without deleting', () => {
    const court = courtsService.createCourt({
      name: 'محكمة تجارية',
      court_type: 'commercial',
    });

    expect(() => courtsService.createCourt({
      name: 'محكمة تجارية',
      court_type: 'commercial',
    })).toThrow();
    expect(() => courtsService.createCourt({
      name: 'محكمة إدارية',
      court_type: 'unsupported',
    })).toThrow('نوع المحكمة غير معتمد');

    const deactivated = courtsRepository.deactivateCourt(court.id);
    expect(deactivated.is_active).toBe(0);
    expect(courtsService.getCourts({ status: 'active' }).total).toBe(0);
    expect(courtsService.getCourts({ status: 'inactive' }).total).toBe(1);
  });
});

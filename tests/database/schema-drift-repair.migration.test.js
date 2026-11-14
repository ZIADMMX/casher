// A database whose user_version says "current" but which skipped the v1 -> v2 steps
// (a restored or copied file) used to fail shifts:getCurrent with "no such column: shift_id",
// which the UI showed as "no open shift". runAllMigrations must put the columns back.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
const { findLegacySchemaDrift } = require('../../electron/database/migrations');
const { DATABASE_SCHEMA_VERSION } = require('../../electron/database/connection');
const shiftsRepo = require('../../electron/repositories/shifts.repository');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

describe('legacy schema drift repair', () => {
  let shiftId;

  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    runAllMigrations();
    const user = db.prepare("INSERT INTO users (username, password_hash, role) VALUES ('t', 'x', 'admin')").run();
    shiftId = db.prepare("INSERT INTO shifts (user_id, status, opening_cash) VALUES (?, 'open', 500)").run(user.lastInsertRowid).lastInsertRowid;
    // The FK columns cannot be dropped, so rename them: the code's shift_id is then missing, as in the field.
    db.exec(`
      DROP INDEX IF EXISTS idx_returns_shift;
      DROP INDEX IF EXISTS idx_customer_payments_shift;
      ALTER TABLE returns RENAME COLUMN shift_id TO shift_id_lost;
      ALTER TABLE customer_payments RENAME COLUMN shift_id TO shift_id_lost;
      ALTER TABLE crm_interactions DROP COLUMN reminder_sent_at;
    `);
    db.pragma(`user_version = ${DATABASE_SCHEMA_VERSION}`);
  });

  afterAll(() => {
    console.log.mockRestore();
    console.warn.mockRestore();
    closeDatabase();
  });

  it('breaks the live-totals query before the repair', () => {
    expect(findLegacySchemaDrift().map(([t, c]) => `${t}.${c}`)).toEqual(
      expect.arrayContaining(['returns.shift_id', 'customer_payments.shift_id', 'crm_interactions.reminder_sent_at'])
    );
    expect(() => shiftsRepo.getShiftLiveTotals(shiftId)).toThrow(/no such column/);
  });

  it('restores the missing columns on startup and keeps the version', () => {
    runAllMigrations();
    expect(findLegacySchemaDrift()).toEqual([]);
    expect(columnsOf('returns')).toContain('shift_id');
    expect(columnsOf('customer_payments')).toContain('shift_id');
    expect(columnsOf('crm_interactions')).toContain('reminder_sent_at');
    expect(db.pragma('user_version', { simple: true })).toBe(DATABASE_SCHEMA_VERSION);
  });

  it('lets an open shift report its live totals again', () => {
    const totals = shiftsRepo.getShiftLiveTotals(shiftId);
    expect(totals.openingCash).toBe(500);
    expect(totals.expectedCash).toBe(500);
  });
});

// A brand-new install runs every migration from user_version 0. Migrations that
// fail inside a try/catch only log, so check the seeded data, not just the schema.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
const { SECTOR_PRESETS } = require('../../electron/database/onboardingPresets.data');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

describe('fresh install migrations', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('reaches the latest schema version', () => {
    expect(db.pragma('user_version', { simple: true })).toBe(14);
  });

  it('seeds one onboarding preset per sector', () => {
    const count = db.prepare('SELECT COUNT(*) AS c FROM onboarding_presets').get().c;
    expect(count).toBeGreaterThan(0);
    expect(count).toBe(SECTOR_PRESETS.length);
  });
});

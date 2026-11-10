// Provisioning writes each sector's own data: gym packages land in the real
// packages table with the prices the owner edited, services carry no stock.
const originalUserDataDir = process.env.FOX_USER_DATA_DIR;
process.env.FOX_USER_DATA_DIR = ':memory:';
const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db');
const onboardingRepo = require('../../electron/repositories/onboarding.repository');
const { validateProvisionPayload } = require('../../electron/validators/onboarding.validator');
if (originalUserDataDir === undefined) delete process.env.FOX_USER_DATA_DIR;
else process.env.FOX_USER_DATA_DIR = originalUserDataDir;

describe('onboarding provisioning', () => {
  beforeAll(() => {
    jest.spyOn(console, 'log').mockImplementation(() => {});
    runAllMigrations();
  });

  afterAll(() => {
    console.log.mockRestore();
    closeDatabase();
  });

  it('creates gym packages from the edited plan items, and stock only for goods', () => {
    const preset = onboardingRepo.getPresetByKey('subscriptions_gym');
    const products = preset.starter_products.map((p) => (
      p.name.includes('شهري') ? { ...p, selling_price: 500 } : p
    ));
    // a hand-added package without terms stays a plain service, not a package
    products.push({ name: 'جلسة InBody', category_name: preset.starter_categories[0].name, selling_price: 100, is_service: true });

    const payload = validateProvisionPayload({
      sectorKey: 'subscriptions_gym',
      storeName: 'جيم تجربة',
      categories: preset.starter_categories,
      products,
    });
    const summary = onboardingRepo.provisionSectorData(payload);

    const packages = db.prepare('SELECT name, type, price, duration_days, total_credits FROM packages ORDER BY id').all();
    expect(summary.packages_count).toBe(4);
    expect(packages).toHaveLength(4);
    expect(packages.find((p) => p.name.includes('شهري'))).toMatchObject({ price: 500, duration_days: 30, type: 'time_based' });
    expect(packages.find((p) => p.name.includes('PT'))).toMatchObject({ total_credits: 12, type: 'session_based' });

    const rows = db.prepare(`
      SELECT p.name, p.is_service, v.stock_quantity, v.barcode
      FROM products p JOIN product_variants v ON v.product_id = p.id
    `).all();
    for (const row of rows.filter((r) => r.is_service)) {
      expect(row).toMatchObject({ stock_quantity: 0, barcode: null });
    }
    expect(rows.find((r) => r.name.includes('بروتين'))).toMatchObject({ is_service: 0, stock_quantity: 40 });
  });
});

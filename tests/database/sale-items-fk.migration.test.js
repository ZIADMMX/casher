const fs = require('node:fs');
const path = require('node:path');

// A database from an old build (user_version 1) whose sale_items key still blocks
// deleting a sold variant. The rebuild must keep every column, not only the first five.
describe('sale_items variant key migration', () => {
  const baseTestDir = path.join(__dirname, '../../.jest-cache');
  if (!fs.existsSync(baseTestDir)) fs.mkdirSync(baseTestDir, { recursive: true });

  it('switches the key to ON DELETE SET NULL and keeps later columns and their data', () => {
    const tempDir = fs.mkdtempSync(path.join(baseTestDir, 'foxcloud-sale-items-'));
    process.env.FOX_USER_DATA_DIR = tempDir;
    jest.resetModules();

    const schema = fs.readFileSync(path.join(__dirname, '../../electron/database/schema.sql'), 'utf8');
    const saleItems = schema.match(/CREATE TABLE IF NOT EXISTS sale_items \([\s\S]*?\n\);/)[0];
    const legacy = saleItems.replace('ON DELETE SET NULL', 'ON DELETE RESTRICT');
    expect(legacy).not.toBe(saleItems);

    const { db, runAllMigrations, closeDatabase } = require('../../electron/database/db.js');
    try {
      db.exec(schema.replace(saleItems, legacy));
      db.pragma('foreign_keys = OFF');
      db.prepare(
        'INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, unit_cost, modifiers, note) VALUES (1, 1, 2, 15, 9, ?, ?)'
      ).run('[{"name":"جبنة","price":5}]', 'من غير بصل');
      db.pragma('user_version = 1');

      expect(() => runAllMigrations()).not.toThrow();

      const variantKey = db.prepare('PRAGMA foreign_key_list(sale_items)').all().find((key) => key.from === 'variant_id');
      expect(variantKey.on_delete).toBe('SET NULL');
      expect(db.prepare('SELECT unit_cost, modifiers, note FROM sale_items').get()).toEqual({
        unit_cost: 9,
        modifiers: '[{"name":"جبنة","price":5}]',
        note: 'من غير بصل',
      });
    } finally {
      closeDatabase();
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

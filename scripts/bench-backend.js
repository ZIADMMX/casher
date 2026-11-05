/**
 * Backend performance benchmark.
 *
 * Builds a throwaway database with the real schema and migrations, fills it
 * with a realistic shop's worth of data, then times the hot repository calls
 * and flags statements whose query plan scans a large table.
 *
 *   node scripts/bench-backend.js            # default size
 *   BENCH_SCALE=0.2 node scripts/bench-backend.js   # smaller, faster run
 *
 * Nothing here touches your real data: it uses a new temp folder each run.
 */
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foxcloud-bench-'));
process.env.FOX_USER_DATA_DIR = dataDir;

const SCALE = Number(process.env.BENCH_SCALE || 1);
const N = {
  products: Math.round(5000 * SCALE),
  variantsPerProduct: 4,
  customers: Math.round(5000 * SCALE),
  sales: Math.round(200000 * SCALE),
  itemsPerSale: 3,
  days: 730,
};
const BIG_TABLES = ['sales', 'sale_items', 'product_variants', 'products', 'customers', 'returns', 'inventory_movements'];

// ---- Instrument every statement: time it and keep its SQL for EXPLAIN. ----
const Database = require('better-sqlite3');
const stats = new Map(); // sql -> { calls, ms, params }
const origPrepare = Database.prototype.prepare;
Database.prototype.prepare = function prepare(sql) {
  const stmt = origPrepare.call(this, sql);
  for (const method of ['all', 'get', 'run', 'iterate']) {
    const orig = stmt[method].bind(stmt);
    stmt[method] = (...args) => {
      const t0 = performance.now();
      const result = orig(...args);
      const ms = performance.now() - t0;
      const entry = stats.get(sql) || { calls: 0, ms: 0, params: args };
      entry.calls += 1;
      entry.ms += ms;
      stats.set(sql, entry);
      return result;
    };
  }
  return stmt;
};

function time(label, fn, runs = 5) {
  fn(); // warm-up
  const samples = [];
  for (let i = 0; i < runs; i += 1) {
    const t0 = performance.now();
    fn();
    samples.push(performance.now() - t0);
  }
  samples.sort((a, b) => a - b);
  return { label, median: samples[Math.floor(samples.length / 2)], max: samples[samples.length - 1] };
}

const t0 = performance.now();
const { db, runAllMigrations } = require('../electron/database/db');
runAllMigrations();
const startupMs = performance.now() - t0;

// ---- Seed ----
const seedStart = performance.now();
db.pragma('foreign_keys = OFF');
db.transaction(() => {
  db.prepare("INSERT OR IGNORE INTO branches (id, name) VALUES (1, 'الفرع الرئيسي')").run();
  db.prepare(`INSERT OR IGNORE INTO users (id, username, password_hash, role)
              VALUES (1, 'bench', 'x', 'admin')`).run();
  const insCat = db.prepare('INSERT INTO categories (name) VALUES (?)');
  for (let i = 0; i < 40; i += 1) insCat.run(`قسم ${i}`);
  const catIds = db.prepare('SELECT id FROM categories').all().map((r) => r.id);

  const insProduct = db.prepare('INSERT INTO products (name, category_id) VALUES (?, ?)');
  const insVariant = db.prepare(`INSERT INTO product_variants
    (product_id, size, color, sku, barcode, purchase_price, selling_price, stock_quantity)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  let v = 0;
  for (let p = 0; p < N.products; p += 1) {
    const pid = insProduct.run(`منتج تجريبي ${p}`, catIds[p % catIds.length]).lastInsertRowid;
    for (let k = 0; k < N.variantsPerProduct; k += 1) {
      v += 1;
      insVariant.run(pid, ['S', 'M', 'L', 'XL'][k], 'أسود', `SKU-${v}`, `622${String(v).padStart(10, '0')}`, 50, 100, 20);
    }
  }
  const variantCount = v;

  const insCustomer = db.prepare('INSERT INTO customers (name, phone) VALUES (?, ?)');
  for (let c = 0; c < N.customers; c += 1) insCustomer.run(`عميل ${c}`, `010${String(c).padStart(8, '0')}`);

  const insSale = db.prepare(`INSERT INTO sales
    (branch_id, customer_id, user_id, total_amount, discount, payment_method, created_at)
    VALUES (1, ?, 1, ?, 0, ?, ?)`);
  const insItem = db.prepare(`INSERT INTO sale_items (sale_id, variant_id, quantity, unit_price, unit_cost)
    VALUES (?, ?, ?, 100, 50)`);
  const now = Date.now();
  const methods = ['cash', 'card', 'credit'];
  for (let s = 0; s < N.sales; s += 1) {
    const at = new Date(now - Math.floor((s / N.sales) * N.days * 86400000)).toISOString().replace('T', ' ').slice(0, 19);
    const customer = s % 4 === 0 ? 1 + (s % N.customers) : null;
    const saleId = insSale.run(customer, 300, methods[s % 3], at).lastInsertRowid;
    for (let i = 0; i < N.itemsPerSale; i += 1) insItem.run(saleId, 1 + ((s * 7 + i) % variantCount), 1);
  }
})();
db.pragma('foreign_keys = ON');
db.pragma('optimize');
const seedMs = performance.now() - seedStart;
stats.clear();

// ---- Hot calls ----
const today = new Date().toISOString().slice(0, 10);
const monthAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
const filters = {
  today: { startDate: today, endDate: today, userId: null },
  month: { startDate: monthAgo, endDate: today, userId: null },
};

const products = require('../electron/repositories/products.repository');
const variants = require('../electron/repositories/productVariants.repository');
const customers = require('../electron/repositories/customers.repository');
const reports = require('../electron/repositories/reports.repository');

const results = [
  time('products.getAllActiveWithCategory', () => products.getAllActiveWithCategory()),
  time('variants.getAll', () => variants.getAll()),
  time('variants.getByBarcode', () => variants.getByBarcode('6220000001234')),
  time('POS catalog rebuild (after each sale)', () => {
    const productsCache = require('../electron/services/products.cache');
    productsCache.invalidate();
    require('../electron/services/products.service').getAllProductsWithVariants();
  }),
  time('POS stock refresh after a sale (new path)', () => {
    const productsCache = require('../electron/services/products.cache');
    if (!productsCache.getCatalog()) require('../electron/services/products.service').getAllProductsWithVariants();
    productsCache.refreshStockFromDatabase();
  }),
  time('customers.getBalance (one customer)', () => customers.getBalance(17)),
  time('customers.getAll', () => customers.getAll()),
  time('customers.getBalances', () => customers.getBalances()),
];
for (const [name, filter] of Object.entries(filters)) {
  for (const fn of ['getSalesSummary', 'getCostOfSales', 'getReturnsSummary', 'getPaymentBreakdown',
    'getDailyTrend', 'getTopProducts', 'getStaffPerformance']) {
    if (typeof reports[fn] === 'function') results.push(time(`reports.${fn} (${name})`, () => reports[fn](filter)));
  }
  if (typeof reports.getLedgerPage === 'function') {
    results.push(time(`reports.getLedgerPage (${name})`, () => reports.getLedgerPage(filter, {})));
  }
}

// ---- Query plans that scan a big table ----
const scans = [];
for (const [sql, entry] of stats) {
  if (!/^\s*(SELECT|WITH)/i.test(sql)) continue;
  try {
    const plan = origPrepare.call(db, `EXPLAIN QUERY PLAN ${sql}`).all(...entry.params);
    const bad = plan
      .map((row) => row.detail)
      // Plans name the alias ("SCAN s"), so check the SQL for big tables and
      // report every full scan that does not use an index.
      .filter((d) => /^SCAN /.test(d) && !/USING (COVERING )?INDEX/.test(d));
    if (!BIG_TABLES.some((t) => new RegExp(`\\b${t}\\b`).test(sql))) continue;
    if (bad.length) scans.push({ ms: entry.ms / entry.calls, sql: sql.replace(/\s+/g, ' ').trim().slice(0, 140), bad });
  } catch {
    // statements that cannot be explained with the captured params are skipped
  }
}

console.log(`\nData: ${N.products} products, ${N.products * N.variantsPerProduct} variants, ${N.customers} customers, ${N.sales} sales, ${N.sales * N.itemsPerSale} sale lines`);
console.log(`Fresh install (schema + migrations): ${startupMs.toFixed(0)} ms   Seed: ${(seedMs / 1000).toFixed(1)} s\n`);
console.log('Operation'.padEnd(48), 'median ms'.padStart(10), 'max ms'.padStart(10));
for (const r of results) console.log(r.label.padEnd(48), r.median.toFixed(1).padStart(10), r.max.toFixed(1).padStart(10));
console.log(`\nStatements that scan a large table (${scans.length}):`);
for (const s of scans.sort((a, b) => b.ms - a.ms)) {
  console.log(`  ${s.ms.toFixed(1).padStart(8)} ms  ${s.bad.join(' | ')}\n             ${s.sql}`);
}

db.close();
fs.rmSync(dataDir, { recursive: true, force: true });

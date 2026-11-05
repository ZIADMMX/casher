// Read models for the AI insights (forecasting, anomalies, pricing, copilot, reports)
// and the purchase-draft writes. Business rules stay in electron/services/ai/.
const { db } = require('../database/db');

// Units sold per variant since the date modifier, with current stock (optionally for one warehouse).
function getVariantSalesVelocity(warehouseId, dateModifier) {
  return db.prepare(`
    SELECT
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.sku,
      pv.barcode,
      pv.purchase_price,
      pv.selling_price,
      pv.low_stock_threshold,
      COALESCE(SUM(si.quantity), 0) as total_sold_in_window,
      COALESCE(
        (SELECT SUM(quantity) FROM warehouse_stock ws
         WHERE ws.variant_id = pv.id AND (? IS NULL OR ws.warehouse_id = ?)),
        pv.stock_quantity,
        0
      ) as current_stock
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_items si ON si.variant_id = pv.id
    LEFT JOIN sales s ON s.id = si.sale_id AND date(s.created_at, 'localtime') >= date('now', ?)
    GROUP BY pv.id
    ORDER BY total_sold_in_window DESC
  `).all(warehouseId, warehouseId, dateModifier);
}

// The supplier of the most recent purchase of this variant.
function getLastSupplierForVariant(variantId) {
  return db.prepare(`
    SELECT s.id as supplier_id, s.name as supplier_name, s.phone as supplier_phone, pi.purchase_price as last_purchase_price
    FROM purchase_items pi
    JOIN purchases p ON p.id = pi.purchase_id
    JOIN suppliers s ON s.id = p.supplier_id
    WHERE pi.variant_id = ?
    ORDER BY p.created_at DESC
    LIMIT 1
  `).get(variantId);
}

// Average invoice amount and invoice count since the date modifier.
function getSalesAmountStats(dateModifier) {
  return db.prepare(`
    SELECT
      AVG(total_amount) as avg_amount,
      COUNT(*) as count
    FROM sales
    WHERE date(created_at, 'localtime') >= date('now', ?)
  `).get(dateModifier);
}

// Variance of invoice amounts around avgAmount since the date modifier.
function getSalesAmountVariance(avgAmount, dateModifier) {
  return db.prepare(`
    SELECT AVG((total_amount - ?) * (total_amount - ?)) as variance
    FROM sales
    WHERE date(created_at, 'localtime') >= date('now', ?)
  `).get(avgAmount, avgAmount, dateModifier);
}

// Top 10 invoices above minAmount since the date modifier.
function getSalesAboveAmount(dateModifier, minAmount) {
  return db.prepare(`
    SELECT s.*, u.username, u.full_name as cashier_name, b.name as branch_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN branches b ON b.id = s.branch_id
    WHERE date(s.created_at, 'localtime') >= date('now', ?)
      AND s.total_amount > ?
    ORDER BY s.total_amount DESC
    LIMIT 10
  `).all(dateModifier, minAmount);
}

// Invoices discounted by 25% or more since the date modifier.
function getHighDiscountSales(dateModifier) {
  return db.prepare(`
    SELECT s.*, u.username, u.full_name as cashier_name, b.name as branch_name
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    LEFT JOIN branches b ON b.id = s.branch_id
    WHERE date(s.created_at, 'localtime') >= date('now', ?)
      AND s.discount > 0
      AND (s.discount / (s.total_amount + s.discount)) >= 0.25
    ORDER BY s.discount DESC
    LIMIT 15
  `).all(dateModifier);
}

// Cashiers with 5 or more returns since the date modifier.
function getFrequentReturnsByCashier(dateModifier) {
  return db.prepare(`
    SELECT r.user_id, u.username, u.full_name as cashier_name, COUNT(*) as return_count, SUM(r.refund_amount) as total_refunded
    FROM returns r
    LEFT JOIN users u ON u.id = r.user_id
    WHERE date(r.created_at, 'localtime') >= date('now', ?)
    GROUP BY r.user_id
    HAVING return_count >= 5
    ORDER BY return_count DESC
    LIMIT 5
  `).all(dateModifier);
}

// Sales made between 02:00 and 05:59 local time since the date modifier.
function getOffHourSales(dateModifier) {
  return db.prepare(`
    SELECT s.*, u.username, u.full_name as cashier_name, strftime('%H:%M', s.created_at, 'localtime') as sale_time
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE date(s.created_at, 'localtime') >= date('now', ?)
      AND CAST(strftime('%H', s.created_at, 'localtime') AS INTEGER) BETWEEN 2 AND 5
    ORDER BY s.created_at DESC
    LIMIT 10
  `).all(dateModifier);
}

// In-stock variants unsold for daysThreshold days, by tied-up capital (top 25).
function getClearanceCandidates(daysThreshold) {
  return db.prepare(`
    SELECT
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.purchase_price,
      pv.selling_price,
      pv.stock_quantity,
      MAX(s.created_at) as last_sale_date,
      ROUND(JULIANDAY('now') - JULIANDAY(COALESCE(MAX(s.created_at), pv.created_at))) as days_since_last_sale
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_items si ON si.variant_id = pv.id
    LEFT JOIN sales s ON s.id = si.sale_id
    WHERE pv.stock_quantity > 0
    GROUP BY pv.id
    HAVING days_since_last_sale >= ? OR last_sale_date IS NULL
    ORDER BY (pv.stock_quantity * pv.purchase_price) DESC
    LIMIT 25
  `).all(daysThreshold);
}

// Variants with 15 or more units sold in the last 30 days.
function getHighDemandVariantsLast30Days() {
  return db.prepare(`
    SELECT
      pv.id as variant_id,
      p.name as product_name,
      pv.size,
      pv.color,
      pv.purchase_price,
      pv.selling_price,
      pv.stock_quantity,
      SUM(si.quantity) as sold_last_30_days
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    JOIN sale_items si ON si.variant_id = pv.id
    JOIN sales s ON s.id = si.sale_id AND date(s.created_at, 'localtime') >= date('now', '-30 days')
    GROUP BY pv.id
    HAVING sold_last_30_days >= 15
    ORDER BY sold_last_30_days DESC
    LIMIT 10
  `).all();
}

// All in-stock variants unsold for daysThreshold days, by tied-up capital.
function getDeadStockVariants(daysThreshold) {
  return db.prepare(`
    SELECT
      pv.id as variant_id,
      p.id as product_id,
      p.name as product_name,
      cat.name as category_name,
      pv.size,
      pv.color,
      pv.sku,
      pv.barcode,
      pv.purchase_price,
      pv.selling_price,
      pv.stock_quantity,
      MAX(s.created_at) as last_sale_at,
      ROUND(JULIANDAY('now') - JULIANDAY(COALESCE(MAX(s.created_at), pv.created_at))) as days_since_last_sale
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories cat ON cat.id = p.category_id
    LEFT JOIN sale_items si ON si.variant_id = pv.id
    LEFT JOIN sales s ON s.id = si.sale_id
    WHERE pv.stock_quantity > 0
    GROUP BY pv.id
    HAVING days_since_last_sale >= ? OR last_sale_at IS NULL
    ORDER BY (pv.stock_quantity * pv.purchase_price) DESC
  `).all(daysThreshold);
}

// Sales total and invoice count per active branch since startDate.
function getBranchSalesSince(startDate) {
  return db.prepare(`
    SELECT b.id, b.name as branch_name, COALESCE(SUM(s.total_amount), 0) as total_sales, COUNT(s.id) as invoice_count
    FROM branches b
    LEFT JOIN sales s ON s.branch_id = b.id AND date(s.created_at, 'localtime') >= date(?)
    WHERE b.is_active = 1
    GROUP BY b.id
    ORDER BY total_sales DESC
  `).all(startDate);
}

// Invoice count and sales total for one day.
function getSalesTotalsForDate(date) {
  return db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as sales
    FROM sales
    WHERE date(created_at, 'localtime') = date(?)
  `).get(date);
}

// Invoice count and sales total for yesterday.
function getYesterdaySalesTotals() {
  return db.prepare(`
    SELECT COUNT(*) as count, COALESCE(SUM(total_amount), 0) as sales
    FROM sales
    WHERE date(created_at, 'localtime') = date('now', '-1 day')
  `).get();
}

// Top 5 products by units sold since startDate.
function getTopProductsSince(startDate) {
  return db.prepare(`
    SELECT p.name as product_name, SUM(si.quantity) as qty_sold, SUM(si.quantity * si.unit_price) as revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id AND date(s.created_at, 'localtime') >= date(?)
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN products p ON p.id = pv.product_id
    GROUP BY p.id
    ORDER BY qty_sold DESC
    LIMIT 5
  `).all(startDate);
}

// Invoice count, sales and discounts between two dates.
function getSalesKpis(startDate, endDate) {
  return db.prepare(`
    SELECT
      COUNT(*) as total_invoices,
      COALESCE(SUM(total_amount), 0) as total_sales,
      COALESCE(SUM(discount), 0) as total_discounts
    FROM sales
    WHERE date(created_at, 'localtime') >= date(?) AND date(created_at, 'localtime') <= date(?)
  `).get(startDate, endDate);
}

// Gross profit (sale price minus purchase price) between two dates.
function getGrossProfit(startDate, endDate) {
  return db.prepare(`
    SELECT COALESCE(SUM(si.quantity * (si.unit_price - pv.purchase_price)), 0) as profit
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants pv ON pv.id = si.variant_id
    WHERE date(s.created_at, 'localtime') >= date(?) AND date(s.created_at, 'localtime') <= date(?)
  `).get(startDate, endDate);
}

// Sales and invoice count per active branch between two dates.
function getBranchSalesBetween(startDate, endDate) {
  return db.prepare(`
    SELECT b.name as branch_name, COALESCE(SUM(s.total_amount), 0) as sales, COUNT(s.id) as invoices
    FROM branches b
    LEFT JOIN sales s ON s.branch_id = b.id AND date(s.created_at, 'localtime') >= date(?) AND date(s.created_at, 'localtime') <= date(?)
    WHERE b.is_active = 1
    GROUP BY b.id
    ORDER BY sales DESC
  `).all(startDate, endDate);
}

// Any supplier, used as the default for AI purchase drafts.
function getFirstSupplier() {
  return db.prepare('SELECT id FROM suppliers LIMIT 1').get();
}

// Creates an unpaid purchase invoice.
function insertPurchaseDraft(supplierId, invoiceNumber, totalAmount, notes) {
  return db.prepare(`
    INSERT INTO purchases (supplier_id, invoice_number, total_amount, paid_amount, remaining_amount, payment_status, notes)
    VALUES (?, ?, ?, 0, ?, 'unpaid', ?)
  `).run(supplierId, invoiceNumber, totalAmount, totalAmount, notes);
}

// Returns a function that adds one line to a purchase draft (prepared once, run per item).
function preparePurchaseDraftItemInsert() {
  const stmt = db.prepare(`
    INSERT INTO purchase_items (purchase_id, variant_id, product_name, size, color, quantity, purchase_price, selling_price)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  return (purchaseId, variantId, productName, size, color, quantity, purchasePrice, sellingPrice) =>
    stmt.run(purchaseId, variantId, productName, size, color, quantity, purchasePrice, sellingPrice);
}

module.exports = {
  getVariantSalesVelocity,
  getLastSupplierForVariant,
  getSalesAmountStats,
  getSalesAmountVariance,
  getSalesAboveAmount,
  getHighDiscountSales,
  getFrequentReturnsByCashier,
  getOffHourSales,
  getClearanceCandidates,
  getHighDemandVariantsLast30Days,
  getDeadStockVariants,
  getBranchSalesSince,
  getSalesTotalsForDate,
  getYesterdaySalesTotals,
  getTopProductsSince,
  getSalesKpis,
  getGrossProfit,
  getBranchSalesBetween,
  getFirstSupplier,
  insertPurchaseDraft,
  preparePurchaseDraftItemInsert,
};

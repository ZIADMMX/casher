const { db } = require('../database/db');

function getSummary(startDate, endDate) {
  return db.prepare(`
    SELECT COUNT(*) as invoiceCount, COALESCE(SUM(total_amount), 0) as totalSales
    FROM sales
    WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
  `).get(startDate, endDate);
}

function getProfitEstimate(startDate, endDate) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(si.quantity * (si.unit_price - pv.purchase_price)), 0) as profit
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants pv ON pv.id = si.variant_id
    WHERE date(s.created_at) >= date(?) AND date(s.created_at) <= date(?)
  `).get(startDate, endDate);
  return row ? row.profit : 0;
}

function getTopSelling(startDate, endDate, limit = 5) {
  return db.prepare(`
    SELECT p.name as productName, SUM(si.quantity) as qtySold, SUM(si.quantity * si.unit_price) as revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN products p ON p.id = pv.product_id
    WHERE date(s.created_at) >= date(?) AND date(s.created_at) <= date(?)
    GROUP BY p.id
    ORDER BY qtySold DESC
    LIMIT ?
  `).all(startDate, endDate, limit);
}

function getDailyTrend(startDate, endDate) {
  return db.prepare(`
    SELECT date(created_at) as day, SUM(total_amount) as total, COUNT(*) as invoiceCount
    FROM sales
    WHERE date(created_at) >= date(?) AND date(created_at) <= date(?)
    GROUP BY day
    ORDER BY day ASC
  `).all(startDate, endDate);
}

function getRecentInvoices(startDate, endDate, limit = 50) {
  return db.prepare(`
    SELECT s.id, s.total_amount, s.payment_method, s.created_at,
           COALESCE(s.customer_name, 'عميل نقدي سريع') as customerName,
           (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) as itemCount
    FROM sales s
    WHERE date(s.created_at) >= date(?) AND date(s.created_at) <= date(?)
    ORDER BY s.created_at DESC
    LIMIT ?
  `).all(startDate, endDate, limit);
}

module.exports = { getSummary, getProfitEstimate, getTopSelling, getDailyTrend, getRecentInvoices };
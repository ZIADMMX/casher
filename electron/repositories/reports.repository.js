const { db } = require('../database/db');

// Every query takes the same filter: { startDate, endDate, userId }.
// Dates are local calendar days (YYYY-MM-DD); userId narrows to one staff member.
// Reports only read; nothing here writes.

const SALE_IN_RANGE = `date(s.created_at, 'localtime') >= date(@startDate)
  AND date(s.created_at, 'localtime') <= date(@endDate)
  AND (@userId IS NULL OR s.user_id = @userId)`;

const RETURN_IN_RANGE = `date(r.created_at, 'localtime') >= date(@startDate)
  AND date(r.created_at, 'localtime') <= date(@endDate)
  AND (@userId IS NULL OR r.user_id = @userId)`;

// Cost of one sold unit: the cost frozen on the sale line, or the current
// purchase price for old lines that never had one.
const LINE_UNIT_COST = 'COALESCE(si.unit_cost, pv.purchase_price, 0)';

const STAFF_NAME = `COALESCE(
  NULLIF(TRIM(u.full_name), ''),
  NULLIF(TRIM(COALESCE(u.first_name, '') || ' ' || COALESCE(u.last_name, '')), ''),
  u.username
)`;

function params(filter) {
  return {
    startDate: filter.startDate,
    endDate: filter.endDate,
    userId: filter.userId ?? null,
  };
}

function getSalesSummary(filter) {
  return db.prepare(`
    SELECT COUNT(*) AS invoiceCount,
           COALESCE(SUM(s.total_amount), 0) AS grossSales,
           COALESCE(SUM(s.discount), 0) AS discounts
    FROM sales s
    WHERE ${SALE_IN_RANGE}
  `).get(params(filter));
}

function getCostOfSales(filter) {
  const row = db.prepare(`
    SELECT COALESCE(SUM(si.quantity * ${LINE_UNIT_COST}), 0) AS cost
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    WHERE ${SALE_IN_RANGE}
  `).get(params(filter));
  return row ? row.cost : 0;
}

// Returns are counted on the day they happened. returnedCost is the cost of the
// goods that came back, taken from the original sale line.
function getReturnsSummary(filter) {
  return db.prepare(`
    SELECT COUNT(*) AS returnCount,
           COALESCE(SUM(r.refund_amount), 0) AS refundTotal,
           COALESCE(SUM(r.quantity * COALESCE((
             SELECT ${LINE_UNIT_COST}
             FROM sale_items si
             LEFT JOIN product_variants pv ON pv.id = si.variant_id
             WHERE si.sale_id = r.sale_id AND si.variant_id = r.variant_id
             ORDER BY si.id
             LIMIT 1
           ), 0)), 0) AS returnedCost
    FROM returns r
    WHERE ${RETURN_IN_RANGE}
  `).get(params(filter));
}

function getPaymentBreakdown(filter) {
  return db.prepare(`
    SELECT s.payment_method AS method,
           COUNT(*) AS invoiceCount,
           COALESCE(SUM(s.total_amount), 0) AS total
    FROM sales s
    WHERE ${SALE_IN_RANGE}
    GROUP BY s.payment_method
  `).all(params(filter));
}

function getCreditCustomerCount(filter) {
  const row = db.prepare(`
    SELECT COUNT(DISTINCT COALESCE(CAST(s.customer_id AS TEXT), 'name:' || s.customer_name)) AS customers
    FROM sales s
    WHERE ${SALE_IN_RANGE} AND s.payment_method = 'credit'
  `).get(params(filter));
  return row ? row.customers : 0;
}

function getDailyTrend(filter) {
  return db.prepare(`
    SELECT date(s.created_at, 'localtime') AS day,
           SUM(s.total_amount) AS total,
           COUNT(*) AS invoiceCount
    FROM sales s
    WHERE ${SALE_IN_RANGE}
    GROUP BY day
    ORDER BY day ASC
  `).all(params(filter));
}

function getTopProducts(filter, sortBy = 'revenue', limit = 5) {
  const orderBy = sortBy === 'quantity' ? 'qtySold DESC, revenue DESC' : 'revenue DESC, qtySold DESC';
  return db.prepare(`
    SELECT p.id AS productId,
           p.name AS productName,
           c.name AS categoryName,
           SUM(si.quantity) AS qtySold,
           SUM(si.quantity * si.unit_price) AS revenue
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    JOIN product_variants pv ON pv.id = si.variant_id
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN categories c ON c.id = p.category_id
    WHERE ${SALE_IN_RANGE}
    GROUP BY p.id
    ORDER BY ${orderBy}
    LIMIT @limit
  `).all({ ...params(filter), limit });
}

function getStaffPerformance(filter, limit = 8) {
  return db.prepare(`
    SELECT s.user_id AS userId,
           COALESCE(${STAFF_NAME}, 'غير محدد') AS name,
           COUNT(*) AS invoiceCount,
           COALESCE(SUM(s.total_amount), 0) AS total
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE ${SALE_IN_RANGE}
    GROUP BY s.user_id
    ORDER BY total DESC
    LIMIT @limit
  `).all({ ...params(filter), limit });
}

// Everyone who ever recorded a sale, for the staff filter.
function listSellingStaff() {
  return db.prepare(`
    SELECT u.id, ${STAFF_NAME} AS name
    FROM users u
    WHERE EXISTS (SELECT 1 FROM sales s WHERE s.user_id = u.id)
    ORDER BY name
  `).all();
}

function staffExists(userId) {
  return Boolean(db.prepare('SELECT 1 FROM users WHERE id = ?').get(userId));
}

// Sales and returns in one list, newest first. Returns carry a negative amount.
const LEDGER_ROWS = `
  SELECT 'sale' AS kind,
         s.id AS id,
         s.id AS saleId,
         'INV-' || printf('%04d', s.id) AS code,
         COALESCE(s.customer_name, 'عميل نقدي') AS customerName,
         COALESCE(${STAFF_NAME}, 'غير محدد') AS staffName,
         (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) AS itemCount,
         s.payment_method AS method,
         s.total_amount AS amount,
         datetime(s.created_at, 'localtime') AS created_at,
         s.created_at AS sort_at
  FROM sales s
  LEFT JOIN users u ON u.id = s.user_id
  WHERE ${SALE_IN_RANGE}
  UNION ALL
  SELECT 'return' AS kind,
         r.id AS id,
         r.sale_id AS saleId,
         'RET-' || printf('%04d', r.id) AS code,
         COALESCE(s.customer_name, 'عميل نقدي') AS customerName,
         COALESCE(${STAFF_NAME}, 'غير محدد') AS staffName,
         r.quantity AS itemCount,
         'return' AS method,
         -COALESCE(r.refund_amount, 0) AS amount,
         datetime(r.created_at, 'localtime') AS created_at,
         r.created_at AS sort_at
  FROM returns r
  LEFT JOIN sales s ON s.id = r.sale_id
  LEFT JOIN users u ON u.id = r.user_id
  WHERE ${RETURN_IN_RANGE}
`;

const LEDGER_FILTER = `
  WHERE (@method = 'all' OR method = @method)
    AND (@search = ''
      OR code LIKE @like ESCAPE '\\'
      OR customerName LIKE @like ESCAPE '\\'
      OR staffName LIKE @like ESCAPE '\\'
      OR CAST(id AS TEXT) = @search
      OR CAST(amount AS TEXT) LIKE @like ESCAPE '\\')
`;

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

function getLedgerPage(filter, { method = 'all', search = '', limit = 6, offset = 0 } = {}) {
  const query = {
    ...params(filter),
    method,
    search,
    like: `%${escapeLike(search)}%`,
    limit,
    offset,
  };
  const totals = db.prepare(`
    SELECT COUNT(*) AS total, COALESCE(SUM(amount), 0) AS amountTotal
    FROM (${LEDGER_ROWS}) ${LEDGER_FILTER}
  `).get(query);
  const rows = db.prepare(`
    SELECT kind, id, saleId, code, customerName, staffName, itemCount, method, amount, created_at
    FROM (${LEDGER_ROWS}) ${LEDGER_FILTER}
    ORDER BY sort_at DESC, id DESC
    LIMIT @limit OFFSET @offset
  `).all(query);
  return { rows, total: totals.total, amountTotal: totals.amountTotal };
}

// Kept for the Today screen and the Excel export.
function getRecentInvoices(startDate, endDate, limit = 50, userId = null) {
  return db.prepare(`
    SELECT s.id, s.total_amount, s.payment_method, datetime(s.created_at, 'localtime') AS created_at,
           COALESCE(s.customer_name, 'عميل نقدي سريع') AS customerName,
           COALESCE(${STAFF_NAME}, '') AS staffName,
           (SELECT COUNT(*) FROM sale_items WHERE sale_id = s.id) AS itemCount
    FROM sales s
    LEFT JOIN users u ON u.id = s.user_id
    WHERE ${SALE_IN_RANGE}
    ORDER BY s.created_at DESC, s.id DESC
    LIMIT @limit
  `).all({ startDate, endDate, userId, limit });
}

module.exports = {
  getSalesSummary,
  getCostOfSales,
  getReturnsSummary,
  getPaymentBreakdown,
  getCreditCustomerCount,
  getDailyTrend,
  getTopProducts,
  getStaffPerformance,
  listSellingStaff,
  staffExists,
  getLedgerPage,
  getRecentInvoices,
};

// Read-only reports for the mobile admin app, computed from the rows shop
// desktops push into sync_records (see syncIngest.service.js). Local ids are
// only unique per device, so every join also matches device_id.
// Formulas follow the desktop reports (reports.service.js):
//   net sales = gross sales - refunds; profit = net sales - (cost of sales - cost of returned goods).

const MAX_RANGE_MS = 366 * 24 * 60 * 60 * 1000;
const MAX_PAGE = 100;

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

// Desktops send datetimes as ISO UTC; anything else is treated as missing, never cast blindly.
const ts = (alias, field) => `(CASE WHEN ${alias}.data->>'${field}' ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T'
  THEN (${alias}.data->>'${field}')::timestamptz END)`;
const num = (alias, field) => `COALESCE((${alias}.data->>'${field}')::numeric, 0)`;
const BRANCH = (alias, param) => `(${param}::int IS NULL OR ${alias}.branch_id = ${param}::int)`;

function optionalBranch(value) {
  if (value === undefined || value === null || value === '') return null;
  const id = Number(value);
  if (!Number.isSafeInteger(id) || id <= 0) throw badRequest('branch_id غير صالح');
  return id;
}

/** from/to (ISO, to exclusive) and optional branch_id from the query string. */
function parseRange(query) {
  const from = Date.parse(query.from);
  const to = Date.parse(query.to);
  if (Number.isNaN(from) || Number.isNaN(to)) throw badRequest('from و to مطلوبان بصيغة ISO');
  if (to <= from) throw badRequest('to يجب أن يكون بعد from');
  if (to - from > MAX_RANGE_MS) throw badRequest('أقصى مدة للتقرير سنة واحدة');
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), branchId: optionalBranch(query.branch_id) };
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

async function getSummary(query, filter) {
  const params = [filter.from, filter.to, filter.branchId];
  const sales = `
    SELECT s.device_id, s.branch_id, s.data FROM sync_records s
    WHERE s.table_name = 'sales' AND ${BRANCH('s', '$3')}
      AND ${ts('s', 'created_at')} >= $1 AND ${ts('s', 'created_at')} < $2`;
  // Cost of one sold unit: frozen on the sale line, else the current purchase price.
  const lineCost = `COALESCE((si.data->>'unit_cost')::numeric, (pv.data->>'purchase_price')::numeric, 0)`;
  const variantJoin = `LEFT JOIN sync_records pv ON pv.table_name = 'product_variants'
    AND pv.device_id = si.device_id AND pv.data->>'id' = si.data->>'variant_id'`;

  const [totals, payments, branches] = await Promise.all([
    query(`
      WITH s AS (${sales}),
      r AS (
        SELECT r.device_id, r.data FROM sync_records r
        WHERE r.table_name = 'returns' AND ${BRANCH('r', '$3')}
          AND ${ts('r', 'created_at')} >= $1 AND ${ts('r', 'created_at')} < $2
      )
      SELECT
        (SELECT COUNT(*) FROM s) AS invoice_count,
        (SELECT COALESCE(SUM(${num('s', 'total_amount')}), 0) FROM s) AS gross_sales,
        (SELECT COALESCE(SUM(${num('s', 'discount')}), 0) FROM s) AS discounts,
        (SELECT COALESCE(SUM(${num('si', 'quantity')} * ${lineCost}), 0)
           FROM s
           JOIN sync_records si ON si.table_name = 'sale_items'
             AND si.device_id = s.device_id AND si.data->>'sale_id' = s.data->>'id'
           ${variantJoin}) AS cost_of_sales,
        (SELECT COUNT(*) FROM r) AS return_count,
        (SELECT COALESCE(SUM(${num('r', 'refund_amount')}), 0) FROM r) AS refunds,
        (SELECT COALESCE(SUM(${num('r', 'quantity')} * COALESCE(line.cost, 0)), 0)
           FROM r
           LEFT JOIN LATERAL (
             SELECT ${lineCost} AS cost
             FROM sync_records si ${variantJoin}
             WHERE si.table_name = 'sale_items' AND si.device_id = r.device_id
               AND si.data->>'sale_id' = r.data->>'sale_id'
               AND si.data->>'variant_id' = r.data->>'variant_id'
             ORDER BY (si.data->>'id')::bigint
             LIMIT 1
           ) line ON TRUE) AS returned_cost
    `, params),
    query(`
      WITH s AS (${sales})
      SELECT s.data->>'payment_method' AS method, COUNT(*) AS invoice_count,
             COALESCE(SUM(${num('s', 'total_amount')}), 0) AS total
      FROM s GROUP BY 1 ORDER BY total DESC
    `, params),
    query(`
      WITH s AS (${sales})
      SELECT s.branch_id, COUNT(*) AS invoice_count, COALESCE(SUM(${num('s', 'total_amount')}), 0) AS total
      FROM s GROUP BY 1 ORDER BY total DESC
    `, params),
  ]);

  const t = totals.rows[0];
  const grossSales = Number(t.gross_sales);
  const refunds = Number(t.refunds);
  const netSales = grossSales - refunds;
  const invoiceCount = Number(t.invoice_count);
  return {
    from: filter.from,
    to: filter.to,
    branchId: filter.branchId,
    invoiceCount,
    grossSales: round2(grossSales),
    discounts: round2(t.discounts),
    returnCount: Number(t.return_count),
    refunds: round2(refunds),
    netSales: round2(netSales),
    costOfSales: round2(t.cost_of_sales),
    profit: round2(netSales - (Number(t.cost_of_sales) - Number(t.returned_cost))),
    avgInvoice: invoiceCount > 0 ? round2(grossSales / invoiceCount) : 0,
    byPayment: payments.rows.map((row) => ({ method: row.method, invoiceCount: Number(row.invoice_count), total: round2(row.total) })),
    byBranch: branches.rows.map((row) => ({ branchId: row.branch_id, invoiceCount: Number(row.invoice_count), total: round2(row.total) })),
  };
}

async function listSales(query, rawQuery) {
  const filter = parseRange(rawQuery);
  const limit = Math.min(Math.max(Number.parseInt(rawQuery.limit, 10) || 50, 1), MAX_PAGE);
  const offset = Math.max(Number.parseInt(rawQuery.offset, 10) || 0, 0);
  const result = await query(`
    SELECT s.uuid, s.device_id, s.branch_id, ${ts('s', 'created_at')} AS created_at,
           s.data->>'invoice_number' AS invoice_number,
           ${num('s', 'total_amount')} AS total_amount,
           ${num('s', 'discount')} AS discount,
           s.data->>'payment_method' AS payment_method,
           s.data->>'customer_name' AS customer_name
    FROM sync_records s
    WHERE s.table_name = 'sales' AND ${BRANCH('s', '$3')}
      AND ${ts('s', 'created_at')} >= $1 AND ${ts('s', 'created_at')} < $2
    ORDER BY ${ts('s', 'created_at')} DESC, s.uuid
    LIMIT $4 OFFSET $5
  `, [filter.from, filter.to, filter.branchId, limit, offset]);
  return {
    limit,
    offset,
    rows: result.rows.map((row) => ({ ...row, total_amount: round2(row.total_amount), discount: round2(row.discount) })),
  };
}

/** Active variants at or below their own low-stock threshold. */
async function listLowStock(query, rawQuery) {
  const branchId = optionalBranch(rawQuery.branch_id);
  const result = await query(`
    SELECT pv.uuid, pv.device_id, pv.branch_id,
           p.data->>'name' AS product_name,
           pv.data->>'size' AS size, pv.data->>'color' AS color, pv.data->>'sku' AS sku,
           ${num('pv', 'stock_quantity')} AS stock_quantity,
           COALESCE((pv.data->>'low_stock_threshold')::numeric, 5) AS low_stock_threshold
    FROM sync_records pv
    JOIN sync_records p ON p.table_name = 'products'
      AND p.device_id = pv.device_id AND p.data->>'id' = pv.data->>'product_id'
    WHERE pv.table_name = 'product_variants' AND ${BRANCH('pv', '$1')}
      AND COALESCE((p.data->>'is_active')::int, 1) = 1
      AND COALESCE((p.data->>'is_service')::int, 0) = 0
      AND ${num('pv', 'stock_quantity')} <= COALESCE((pv.data->>'low_stock_threshold')::numeric, 5)
    ORDER BY ${num('pv', 'stock_quantity')} ASC, product_name
    LIMIT 200
  `, [branchId]);
  return result.rows.map((row) => ({
    ...row,
    stock_quantity: Number(row.stock_quantity),
    low_stock_threshold: Number(row.low_stock_threshold),
  }));
}

async function listOpenShifts(query, rawQuery) {
  const branchId = optionalBranch(rawQuery.branch_id);
  const result = await query(`
    SELECT s.uuid, s.device_id, s.branch_id,
           s.data->>'opened_by_name' AS opened_by_name,
           s.data->>'pos_station' AS pos_station,
           ${ts('s', 'start_time')} AS start_time,
           ${num('s', 'opening_cash')} AS opening_cash,
           ${num('s', 'total_cash_sales')} AS total_cash_sales,
           ${num('s', 'total_card_sales')} AS total_card_sales,
           ${num('s', 'total_credit_sales')} AS total_credit_sales,
           ${num('s', 'total_refunds')} AS total_refunds,
           ${num('s', 'total_expenses')} AS total_expenses
    FROM sync_records s
    WHERE s.table_name = 'shifts' AND ${BRANCH('s', '$1')} AND s.data->>'status' = 'open'
    ORDER BY ${ts('s', 'start_time')} DESC
  `, [branchId]);
  return result.rows.map((row) => {
    const out = { ...row };
    for (const key of ['opening_cash', 'total_cash_sales', 'total_card_sales', 'total_credit_sales', 'total_refunds', 'total_expenses']) {
      out[key] = round2(row[key]);
    }
    return out;
  });
}

module.exports = { parseRange, getSummary, listSales, listLowStock, listOpenShifts };

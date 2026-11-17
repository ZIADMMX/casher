const { db } = require('../database/db');

// A "closed" order is a delivered one; its day is the local day it was handed over.
// Revenue is the order's lines (parts + labor) before tax and before any till discount.
const CLOSED = `
  o.status = 'delivered' AND o.closed_at IS NOT NULL
  AND date(o.closed_at, 'localtime') BETWEEN @start AND @end
  AND (@branch IS NULL OR s.branch_id = @branch)`;
const FROM_ORDERS = 'work_orders o LEFT JOIN sales s ON s.id = o.sale_id';

const lineSum = (kind) => `COALESCE((SELECT SUM(l.quantity * l.unit_price) FROM work_order_lines l WHERE l.work_order_id = o.id AND l.kind = '${kind}'), 0)`;

const closedOrders = (start, end, branch) => db.prepare(`
  SELECT o.id, o.order_number, o.mechanic, date(o.closed_at, 'localtime') AS closed_day,
    v.plate, v.plate_city, v.plate_kind, v.make, v.model, c.name AS customer_name,
    ${lineSum('part')} AS parts, ${lineSum('labor')} AS labor
  FROM ${FROM_ORDERS} JOIN vehicles v ON v.id = o.vehicle_id JOIN customers c ON c.id = o.customer_id
  WHERE ${CLOSED}
  ORDER BY o.closed_at DESC, o.id DESC`).all({ start, end, branch });

const topServices = (start, end, branch, limit = 5) => db.prepare(`
  SELECT TRIM(l.description) AS name, COUNT(DISTINCT o.id) AS orders, SUM(l.quantity * l.unit_price) AS revenue
  FROM ${FROM_ORDERS} JOIN work_order_lines l ON l.work_order_id = o.id AND l.kind = 'labor'
  WHERE ${CLOSED}
  GROUP BY TRIM(l.description) ORDER BY revenue DESC, orders DESC LIMIT @limit`).all({ start, end, branch, limit });

module.exports = { closedOrders, topServices };

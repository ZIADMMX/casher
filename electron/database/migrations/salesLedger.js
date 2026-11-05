// Reports are read straight from sales, sale_items and returns, so those rows
// must not change once written. Corrections go through a return, never an edit.
//
// - sale_items.unit_cost freezes the cost of each sold unit at sale time, so
//   changing a product's purchase price later does not rewrite past profit.
// - Triggers block deleting or editing the money columns of a sale, any change
//   to a sale line, and any change to a return.
//   Still allowed on sales: customer anonymization (customer_name/phone/notes)
//   and kitchen_status. Still allowed on sale_items: variant_id going to NULL
//   (ON DELETE SET NULL) and filling unit_cost once when it is empty.
// - Same guard as the inventory ledger: triggers only fire while foreign_keys
//   is ON, so table-rebuild migrations (which turn it off) keep working.

const GUARD = '(SELECT foreign_keys FROM pragma_foreign_keys) = 1';

const TRIGGERS = `
CREATE TRIGGER IF NOT EXISTS trg_sales_no_delete
BEFORE DELETE ON sales
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Sales are append-only; record a return instead');
END;

CREATE TRIGGER IF NOT EXISTS trg_sales_no_money_update
BEFORE UPDATE OF total_amount, discount, payment_method, created_at, user_id, shift_id,
  branch_id, warehouse_id, invoice_number, customer_id, due_date ON sales
WHEN ${GUARD}
  AND (NEW.total_amount IS NOT OLD.total_amount
    OR NEW.discount IS NOT OLD.discount
    OR NEW.payment_method IS NOT OLD.payment_method
    OR NEW.created_at IS NOT OLD.created_at
    OR NEW.user_id IS NOT OLD.user_id
    OR NEW.shift_id IS NOT OLD.shift_id
    OR NEW.branch_id IS NOT OLD.branch_id
    OR NEW.warehouse_id IS NOT OLD.warehouse_id
    OR NEW.invoice_number IS NOT OLD.invoice_number
    OR NEW.customer_id IS NOT OLD.customer_id
    OR NEW.due_date IS NOT OLD.due_date)
BEGIN
    SELECT RAISE(ABORT, 'Sales are append-only; record a return instead');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_no_delete
BEFORE DELETE ON sale_items
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Sale lines are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_sale_items_no_update
BEFORE UPDATE ON sale_items
WHEN ${GUARD}
  AND (NEW.sale_id IS NOT OLD.sale_id
    OR NEW.quantity IS NOT OLD.quantity
    OR NEW.unit_price IS NOT OLD.unit_price
    OR (NEW.variant_id IS NOT OLD.variant_id AND NEW.variant_id IS NOT NULL)
    OR (OLD.unit_cost IS NOT NULL AND NEW.unit_cost IS NOT OLD.unit_cost))
BEGIN
    SELECT RAISE(ABORT, 'Sale lines are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_returns_no_delete
BEFORE DELETE ON returns
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Returns are append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_returns_no_update
BEFORE UPDATE ON returns
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Returns are append-only');
END;
`;

function hasTable(database, name) {
  return Boolean(database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?"
  ).get(name));
}

function ensureSalesLedgerGuards(database) {
  if (!hasTable(database, 'sales') || !hasTable(database, 'sale_items') || !hasTable(database, 'returns')) {
    return;
  }
  const itemColumns = database.prepare('PRAGMA table_info(sale_items)').all().map((c) => c.name);
  if (!itemColumns.includes('unit_cost')) {
    database.exec('ALTER TABLE sale_items ADD COLUMN unit_cost REAL CHECK(unit_cost IS NULL OR unit_cost >= 0)');
  }
  database.exec(TRIGGERS);
}

// One-time fill for sales made before unit_cost existed: the best record left
// is the current purchase price. New sales store their own cost.
function backfillSaleItemCosts(database) {
  database.prepare(`
    UPDATE sale_items
    SET unit_cost = (SELECT pv.purchase_price FROM product_variants pv WHERE pv.id = sale_items.variant_id)
    WHERE unit_cost IS NULL AND variant_id IS NOT NULL
  `).run();
}

module.exports = { ensureSalesLedgerGuards, backfillSaleItemCosts };

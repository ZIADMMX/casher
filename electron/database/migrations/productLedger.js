// Product changes are recorded (who, what, old → new, why, approved by whom) and
// the record can't be edited or deleted. The database also refuses prices that
// aren't numbers (or are negative), so a crafted request can't store text.
const GUARD = '(SELECT foreign_keys FROM pragma_foreign_keys) = 1';

const SQL = `
CREATE TABLE IF NOT EXISTS product_change_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER,
    variant_id INTEGER,
    action TEXT NOT NULL CHECK(action IN (
        'create', 'update', 'price', 'archive', 'variant_add', 'variant_update',
        'variant_delete', 'unlock', 'unlock_denied', 'denied'
    )),
    field TEXT,
    old_value TEXT,
    new_value TEXT,
    reason TEXT,
    user_id INTEGER,
    username TEXT NOT NULL,
    approved_by_id INTEGER,
    approved_by_name TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_product_change_log_created ON product_change_log(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_product_change_log_product ON product_change_log(product_id, id DESC);

CREATE TRIGGER IF NOT EXISTS trg_product_change_log_no_delete
BEFORE DELETE ON product_change_log
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Product history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_product_change_log_no_update
BEFORE UPDATE ON product_change_log
WHEN ${GUARD}
BEGIN
    SELECT RAISE(ABORT, 'Product history is append-only');
END;

CREATE TRIGGER IF NOT EXISTS trg_variant_price_valid_insert
BEFORE INSERT ON product_variants
WHEN typeof(NEW.selling_price) NOT IN ('integer', 'real') OR NEW.selling_price < 0
  OR typeof(NEW.purchase_price) NOT IN ('integer', 'real') OR NEW.purchase_price < 0
BEGIN
    SELECT RAISE(ABORT, 'Invalid product price');
END;

CREATE TRIGGER IF NOT EXISTS trg_variant_price_valid_update
BEFORE UPDATE OF selling_price, purchase_price ON product_variants
WHEN typeof(NEW.selling_price) NOT IN ('integer', 'real') OR NEW.selling_price < 0
  OR typeof(NEW.purchase_price) NOT IN ('integer', 'real') OR NEW.purchase_price < 0
BEGIN
    SELECT RAISE(ABORT, 'Invalid product price');
END;
`;

function ensureProductLedger(database) {
  const hasVariants = database.prepare(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'product_variants'"
  ).get();
  if (!hasVariants) return;
  database.exec(SQL);
}

module.exports = { ensureProductLedger };

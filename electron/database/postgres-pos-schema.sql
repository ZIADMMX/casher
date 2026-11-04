CREATE TABLE IF NOT EXISTS branches (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  address TEXT,
  phone TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'cashier', 'manager')),
  branch_id INTEGER REFERENCES branches(id) ON DELETE SET NULL,
  full_name TEXT,
  first_name TEXT,
  last_name TEXT,
  phone TEXT,
  email TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  force_password_change BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users
  ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'cashier', 'manager'));

INSERT INTO branches (name, address)
VALUES ('الفرع الرئيسي', 'المقر الرئيسي')
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS product_variants (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  size TEXT,
  color TEXT,
  sku TEXT UNIQUE,
  barcode TEXT UNIQUE,
  purchase_price NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (purchase_price >= 0),
  selling_price NUMERIC(12, 2) NOT NULL CHECK (selling_price >= 0),
  stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouses (
  id SERIAL PRIMARY KEY,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS warehouse_stock (
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  reorder_level INTEGER NOT NULL DEFAULT 5 CHECK (reorder_level >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (warehouse_id, variant_id)
);

CREATE TABLE IF NOT EXISTS shifts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  opened_by_name TEXT,
  shift_type TEXT NOT NULL DEFAULT 'morning' CHECK (shift_type IN ('morning', 'evening')),
  pos_station TEXT NOT NULL DEFAULT 'الدرج الرئيسي - POS 1',
  start_time TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  end_time TIMESTAMPTZ,
  opening_cash NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (opening_cash >= 0),
  opening_notes TEXT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  total_cash_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_card_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  total_credit_sales NUMERIC(12, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS attendance_records (
  id BIGSERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  attendance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  check_in TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_out TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, attendance_date)
);

ALTER TABLE shifts
  ADD COLUMN IF NOT EXISTS attendance_record_id BIGINT REFERENCES attendance_records(id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_pg_one_open_shift_per_user_warehouse
  ON shifts (user_id, warehouse_id) WHERE status = 'open';

CREATE TABLE IF NOT EXISTS sales (
  id BIGSERIAL PRIMARY KEY,
  shift_id INTEGER NOT NULL REFERENCES shifts(id) ON DELETE RESTRICT,
  branch_id INTEGER NOT NULL REFERENCES branches(id) ON DELETE RESTRICT,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  customer_name TEXT,
  customer_phone TEXT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  total_amount NUMERIC(12, 2) NOT NULL CHECK (total_amount >= 0),
  discount NUMERIC(12, 2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('cash', 'card', 'credit')),
  order_mode TEXT CHECK (order_mode IS NULL OR order_mode IN ('dine_in', 'takeaway', 'delivery')),
  kitchen_status TEXT CHECK (kitchen_status IS NULL OR kitchen_status IN ('new', 'preparing', 'ready', 'served')),
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE sales
  ADD COLUMN IF NOT EXISTS order_mode TEXT
    CHECK (order_mode IS NULL OR order_mode IN ('dine_in', 'takeaway', 'delivery')),
  ADD COLUMN IF NOT EXISTS kitchen_status TEXT
    CHECK (kitchen_status IS NULL OR kitchen_status IN ('new', 'preparing', 'ready', 'served'));

CREATE TABLE IF NOT EXISTS sale_items (
  id BIGSERIAL PRIMARY KEY,
  sale_id BIGINT NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id BIGSERIAL PRIMARY KEY,
  warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE RESTRICT,
  variant_id INTEGER NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
  movement_type TEXT NOT NULL,
  quantity_change INTEGER NOT NULL,
  quantity_after INTEGER NOT NULL CHECK (quantity_after >= 0),
  reference_type TEXT,
  reference_id BIGINT,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_pg_warehouse_stock_variant ON warehouse_stock (variant_id);
CREATE INDEX IF NOT EXISTS idx_pg_sales_shift ON sales (shift_id, created_at);

INSERT INTO warehouses (branch_id, name, is_default)
SELECT b.id, 'المخزن الرئيسي', TRUE
FROM branches b
WHERE NOT EXISTS (
  SELECT 1 FROM warehouses w WHERE w.branch_id = b.id
)
ON CONFLICT (branch_id, name) DO NOTHING;
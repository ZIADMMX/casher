-- One row per machine: the first time it ever asked for the time. That is its trial start.
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);

-- One row per published work order (customer car tracking). key_hash = sha256 of the desktop's write key.
CREATE TABLE IF NOT EXISTS tracking (
  token TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  data TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Hashed address of each machine that started a trial, with when. A new machine from the same address within
-- 30 days inherits that start (reinstall / new device id does not give a fresh trial).
CREATE TABLE IF NOT EXISTS trial_ips (
  ip_hash TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);

-- Delivery-app orders waiting for the desktop to collect them. inbox_owners.key_hash = sha256 of the desktop's key.
CREATE TABLE IF NOT EXISTS inbox_owners (
  token TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS inbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_inbox_token ON inbox(token, id);

-- The customer's answer to a quote on the tracking page (approve / decline), until the desktop confirms it.
CREATE TABLE IF NOT EXISTS tracking_decisions (
  token TEXT PRIMARY KEY,
  decision TEXT NOT NULL CHECK (decision IN ('approve', 'decline')),
  decided_at INTEGER NOT NULL
);

-- Cloud customers sync storage (per device/shop)
CREATE TABLE IF NOT EXISTS cloud_customers (
  uuid TEXT NOT NULL,
  device_id TEXT NOT NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  loyalty_points INTEGER DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  tier TEXT,
  rating INTEGER,
  extra_json TEXT,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (device_id, uuid)
);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_device ON cloud_customers(device_id);
CREATE INDEX IF NOT EXISTS idx_cloud_customers_phone ON cloud_customers(device_id, phone);

-- Cloud subscriptions & license certificates storage
CREATE TABLE IF NOT EXISTS cloud_subscriptions (
  device_id TEXT PRIMARY KEY,
  hwid TEXT NOT NULL,
  store_name TEXT NOT NULL,
  owner_name TEXT,
  phone TEXT,
  business_type TEXT,
  plan_type TEXT NOT NULL,
  license_key TEXT,
  activated_at INTEGER NOT NULL,
  expires_at INTEGER,
  certificate_number TEXT UNIQUE,
  certificate_data TEXT,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_hwid ON cloud_subscriptions(hwid);
CREATE INDEX IF NOT EXISTS idx_cloud_subscriptions_phone ON cloud_subscriptions(phone);


-- Who may sync a device's customers. A trial copy claims its device here on first sync;
-- an activated copy's licence overrides the claim (see customerSyncOwner in src/index.js).
CREATE TABLE IF NOT EXISTS customer_sync_owners (
  device_id TEXT PRIMARY KEY,
  key_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

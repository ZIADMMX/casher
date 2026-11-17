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

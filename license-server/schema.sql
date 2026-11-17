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

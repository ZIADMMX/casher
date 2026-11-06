-- One row per machine: the first time it ever asked for the time. That is its trial start.
CREATE TABLE IF NOT EXISTS devices (
  device_id TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL
);

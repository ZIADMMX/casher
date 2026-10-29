/**
 * Kashiear / FOX.CLOUD POS - Enterprise Database Pool Manager
 * Master/Slave (Primary & Replica) Architecture with Read/Write Splitting
 */

const path = require('node:path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { Pool } = require('pg');

// 1. Primary DB Pool Configuration (Master - Writes, Updates, Transactions)
const masterConfig = {
  user: process.env.PGUSER || 'postgres',
  host: process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'kashiear_pos',
  password: process.env.PGPASSWORD || '',
  port: Number(process.env.PGPORT) || 5432,
  max: 20, // Max concurrent connections
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// 2. Read Replica DB Pool Configuration (Slave - Heavy Reads, Analytics, Reports)
const replicaConfig = {
  user: process.env.PGUSER || 'postgres',
  host: process.env.PG_REPLICA_HOST || process.env.PGHOST || 'localhost',
  database: process.env.PGDATABASE || 'kashiear_pos',
  password: process.env.PGPASSWORD || '',
  port: Number(process.env.PG_REPLICA_PORT) || Number(process.env.PGPORT) || 5432,
  max: 30, // Higher pool size for concurrent read operations
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

const writePool = new Pool(masterConfig);
const readPool = new Pool(replicaConfig);

// Pool Error Listeners
writePool.on('error', (err) => {
  console.error('❌ [DB Master Pool Error]:', err.message);
});

readPool.on('error', (err) => {
  console.error('❌ [DB Read Replica Pool Error]:', err.message);
});

/**
 * Execute Write Query (Primary Database)
 * Used for INSERT, UPDATE, DELETE, CREATE, ALTER
 */
async function queryWrite(text, params = []) {
  const start = Date.now();
  try {
    const res = await writePool.query(text, params);
    const duration = Date.now() - start;
    return { ...res, duration };
  } catch (err) {
    console.error('❌ [Write Query Failed]:', { text, error: err.message });
    throw err;
  }
}

/**
 * Execute Read Query (Replica Database with auto-fallback to Primary)
 * Used for SELECT, Reports, Dashboard Stats
 */
async function queryRead(text, params = []) {
  const start = Date.now();
  try {
    const res = await readPool.query(text, params);
    const duration = Date.now() - start;
    return { ...res, duration };
  } catch (err) {
    console.warn('⚠️ [Replica Read Failed, falling back to Primary]:', err.message);
    const res = await writePool.query(text, params);
    const duration = Date.now() - start;
    return { ...res, duration, fallback: true };
  }
}

/**
 * Health check & Latency test for Master and Replica
 */
async function checkHealth() {
  const health = {
    primary: { status: 'DOWN', latencyMs: null, error: null },
    replica: { status: 'DOWN', latencyMs: null, error: null },
  };

  // Check Primary
  try {
    const t0 = Date.now();
    await writePool.query('SELECT 1');
    health.primary = { status: 'OK', latencyMs: Date.now() - t0, error: null };
  } catch (err) {
    health.primary.error = err.message;
  }

  // Check Replica
  try {
    const t0 = Date.now();
    await readPool.query('SELECT 1');
    health.replica = { status: 'OK', latencyMs: Date.now() - t0, error: null };
  } catch (err) {
    health.replica.error = err.message;
  }

  return health;
}

async function ensureDatabaseReady({ timeoutMs = 15000 } = {}) {
  const health = await checkHealth();
  const primaryError = health.primary.error;
  const replicaError = health.replica.error;

  if (primaryError) {
    const configSummary = {
      user: process.env.PGUSER || 'postgres',
      host: process.env.PGHOST || 'localhost',
      database: process.env.PGDATABASE || 'kashiear_pos',
      port: Number(process.env.PGPORT) || 5432,
      replicaHost: process.env.PG_REPLICA_HOST || process.env.PGHOST || 'localhost',
      replicaPort: Number(process.env.PG_REPLICA_PORT) || Number(process.env.PGPORT) || 5432,
    };

    const err = new Error(
      `فشل الاتصال بقاعدة PostgreSQL المركزية. تحقق من PGHOST / PGDATABASE / PGUSER / PGPASSWORD ثم تأكد أن PostgreSQL يعمل على الـ host المحدد. ` +
      `الإعداد الحالي: ${JSON.stringify(configSummary)}. خطأ Master: ${primaryError}. ` +
      `${replicaError ? `خطأ Replica: ${replicaError}` : ''}`
    );
    err.code = 'PG_CONNECT_FAILED';
    err.health = health;
    err.timeoutMs = timeoutMs;
    throw err;
  }

  return health;
}

module.exports = {
  writePool,
  readPool,
  queryWrite,
  queryRead,
  checkHealth,
  ensureDatabaseReady,
};

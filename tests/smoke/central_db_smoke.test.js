describe('central PostgreSQL database smoke tests', () => {
  const originalEnv = { ...process.env };

  function loadDbPool({ primaryOk = true, replicaOk = true } = {}) {
    jest.resetModules();
    process.env.PGUSER = 'postgres';
    process.env.PGHOST = 'localhost';
    process.env.PGDATABASE = 'kashiear_pos';
    process.env.PGPASSWORD = 'postgres';
    process.env.PGPORT = '5432';
    process.env.PG_REPLICA_HOST = 'localhost';
    process.env.PG_REPLICA_PORT = '5432';

    const poolInstances = [];
    jest.doMock('pg', () => ({
      Pool: jest.fn().mockImplementation(() => {
        const instance = {
          query: jest.fn(),
          on: jest.fn(),
        };
        poolInstances.push(instance);
        return instance;
      }),
    }));

    const dbPool = require('../../electron/database/dbPool');
    const [writePool, readPool] = poolInstances;

    writePool.query.mockImplementation(() => (
      primaryOk ? Promise.resolve({ rows: [{ ok: 1 }] }) : Promise.reject(new Error('connection refused'))
    ));
    readPool.query.mockImplementation(() => (
      replicaOk ? Promise.resolve({ rows: [{ ok: 1 }] }) : Promise.reject(new Error('replica unavailable'))
    ));

    return dbPool;
  }

  afterEach(() => {
    jest.clearAllMocks();
    jest.dontMock('pg');
    process.env = { ...originalEnv };
  });

  test('checkHealth returns OK for primary and replica when PostgreSQL is reachable', async () => {
    const dbPool = loadDbPool({ primaryOk: true, replicaOk: true });

    const health = await dbPool.checkHealth();

    expect(health.primary.status).toBe('OK');
    expect(health.replica.status).toBe('OK');
    expect(health.primary.latencyMs).toEqual(expect.any(Number));
    expect(health.replica.latencyMs).toEqual(expect.any(Number));
  });

  test('ensureDatabaseReady resolves when the master database is healthy', async () => {
    const dbPool = loadDbPool({ primaryOk: true, replicaOk: true });

    await expect(dbPool.ensureDatabaseReady()).resolves.toMatchObject({
      primary: { status: 'OK' },
      replica: { status: 'OK' },
    });
  });

  test('ensureDatabaseReady throws with actionable PostgreSQL config details when master is down', async () => {
    const dbPool = loadDbPool({ primaryOk: false, replicaOk: true });

    await expect(dbPool.ensureDatabaseReady()).rejects.toMatchObject({
      code: 'PG_CONNECT_FAILED',
    });

    await expect(dbPool.ensureDatabaseReady()).rejects.toThrow(/PGHOST|PGDATABASE|PGUSER|PGPASSWORD/i);
  });
});

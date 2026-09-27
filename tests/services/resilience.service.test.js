const {
  CircuitBreaker,
  BackboneWorkerPool,
  executeResilientOperation,
  getSystemBackboneHealth,
  shutdownSystemBackbone,
} = require('../../electron/services/resilience.service');

describe('Resilience & Central Nervous Backbone Engine Unit Tests', () => {
  afterAll(async () => {
    await shutdownSystemBackbone();
  });

  test('CircuitBreaker transitions to OPEN state when failure threshold reached', async () => {
    const cb = new CircuitBreaker('TestBreaker', { failureThreshold: 2, resetTimeoutMs: 1000 });
    
    expect(cb.state).toBe('CLOSED');

    const failingTask = jest.fn().mockRejectedValue(new Error('Sub-server crash simulation'));

    // Call 1 -> Fail
    await expect(cb.execute(failingTask)).rejects.toThrow('Sub-server crash simulation');
    expect(cb.state).toBe('CLOSED');

    // Call 2 -> Trip Breaker to OPEN
    await expect(cb.execute(failingTask)).rejects.toThrow('Sub-server crash simulation');
    expect(cb.state).toBe('OPEN');

    // Call 3 -> Fast failover execution
    const fallbackFn = jest.fn().mockResolvedValue('Backup system handled safely');
    const result = await cb.execute(failingTask, fallbackFn);
    expect(result).toBe('Backup system handled safely');
  });

  test('real child-process crash fails over and the worker is restarted', async () => {
    const pool = new BackboneWorkerPool(2, { restartDelayMs: 25, taskTimeoutMs: 3000 });
    try {
      await pool.start();
      const firstWorker = pool.workers[0];
      const failedPid = firstWorker.pid;
      const operation = pool.executeTask(
        'delay',
        { milliseconds: 150 },
        { idempotent: true, timeoutMs: 3000 }
      );

      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 1000;
        const poll = () => {
          if (firstWorker.pending_count > 0) {
            resolve();
          } else if (Date.now() > deadline) {
            reject(new Error('Expected first child worker to receive the task'));
          } else {
            setTimeout(poll, 5);
          }
        };
        poll();
      });

      firstWorker.process.kill('SIGKILL');
      const result = await operation;

      expect(result.pid).not.toBe(failedPid);
      expect(pool.getTelemetry().total_failovers).toBe(1);
      expect(pool.getTelemetry().total_worker_crashes).toBe(1);

      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const poll = () => {
          if (firstWorker.status === 'healthy' && firstWorker.pid !== failedPid) {
            resolve();
          } else if (Date.now() > deadline) {
            reject(new Error('Crashed child worker was not restarted'));
          } else {
            setTimeout(poll, 10);
          }
        };
        poll();
      });
      expect(firstWorker.rebound_count).toBe(1);
    } finally {
      await pool.shutdown();
    }
  });

  test('task timeout kills the child process and does not retry non-idempotent work', async () => {
    const pool = new BackboneWorkerPool(1, { restartDelayMs: 25, taskTimeoutMs: 1000 });
    try {
      await pool.start();
      const worker = pool.workers[0];
      const originalPid = worker.pid;

      await expect(
        pool.executeTask(
          'delay',
          { milliseconds: 1000 },
          { idempotent: false, timeoutMs: 30 }
        )
      ).rejects.toMatchObject({ code: 'WORKER_TASK_TIMEOUT' });

      expect(pool.getTelemetry().total_failovers).toBe(0);

      await new Promise((resolve, reject) => {
        const deadline = Date.now() + 2000;
        const poll = () => {
          if (worker.status === 'healthy' && worker.pid !== originalPid) {
            resolve();
          } else if (Date.now() > deadline) {
            reject(new Error('Timed-out child worker was not restarted'));
          } else {
            setTimeout(poll, 10);
          }
        };
        poll();
      });
      expect(pool.getTelemetry().total_worker_restarts).toBe(1);
    } finally {
      await pool.shutdown();
    }
  });

  test('executeResilientOperation executes action successfully', async () => {
    const res = await executeResilientOperation('echo', { result: 'ResilientSuccess' });
    expect(res).toEqual({ result: 'ResilientSuccess' });
  });

  test('getSystemBackboneHealth reports actual child-process telemetry', async () => {
    await executeResilientOperation('health-check');
    const health = getSystemBackboneHealth();
    expect(health).toHaveProperty('status');
    expect(health).toHaveProperty('circuit_breaker');
    expect(health).toHaveProperty('worker_pool');
    expect(health.worker_pool.pool_size).toBeGreaterThan(0);
    expect(health.worker_pool.active_workers).toBe(health.worker_pool.pool_size);
    expect(health.worker_pool.total_handled_requests).toBeGreaterThan(0);
    expect(health.worker_pool.workers.every((worker) => worker.pid > 0)).toBe(true);
  });
});

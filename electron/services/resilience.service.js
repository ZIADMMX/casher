const EventEmitter = require('node:events');
const { fork } = require('node:child_process');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

class CircuitBreaker extends EventEmitter {
  constructor(name = 'PrimaryBackbone', options = {}) {
    super();
    this.name = name;
    this.failureThreshold = options.failureThreshold || 3;
    this.resetTimeoutMs = options.resetTimeoutMs || 5000;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.lastStateChange = Date.now();
  }

  async execute(actionFn, fallbackFn = null) {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastStateChange > this.resetTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else if (fallbackFn) {
        return fallbackFn(new Error('CircuitBreaker open: failover active'));
      } else {
        throw new Error(`[${this.name}] Circuit breaker is open`);
      }
    }

    try {
      const result = await actionFn();
      this.onSuccess();
      return result;
    } catch (err) {
      if (err.code !== 'WORKER_TASK_ERROR') this.onFailure(err);
      if (fallbackFn) return fallbackFn(err);
      throw err;
    }
  }

  onSuccess() {
    if (this.state === 'HALF_OPEN') {
      this.successCount++;
      if (this.successCount >= 2) this.transitionTo('CLOSED');
      return;
    }
    this.failureCount = 0;
  }

  onFailure(err) {
    this.failureCount++;
    this.successCount = 0;
    this.emit('failure', err);
    if (this.failureCount >= this.failureThreshold) this.transitionTo('OPEN');
  }

  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();
    if (newState === 'CLOSED') {
      this.failureCount = 0;
      this.successCount = 0;
    }
    this.emit('stateChange', { oldState, newState, name: this.name });
  }
}

class WorkerExecutionError extends Error {
  constructor(message, code = 'WORKER_UNAVAILABLE') {
    super(message);
    this.name = 'WorkerExecutionError';
    this.code = code;
  }
}

class BackboneWorkerPool extends EventEmitter {
  constructor(poolSize = 4, options = {}) {
    super();
    if (!Number.isInteger(poolSize) || poolSize < 1) {
      throw new TypeError('Worker pool size must be a positive integer');
    }

    this.poolSize = poolSize;
    this.workerPath = options.workerPath || path.join(__dirname, 'resilience.worker.js');
    this.startupTimeoutMs = options.startupTimeoutMs || 5000;
    this.defaultTaskTimeoutMs = options.taskTimeoutMs || 10000;
    this.restartDelayMs = options.restartDelayMs ?? 250;
    this.workers = Array.from({ length: poolSize }, (_, index) => ({
      id: `worker-node-${index + 1}`,
      status: 'stopped',
      pid: null,
      created_at: null,
      handled_count: 0,
      error_count: 0,
      rebound_count: 0,
      last_health_check: null,
      last_task: null,
      pending_count: 0,
      process: null,
      pending: new Map(),
      restartTimer: null,
      generation: 0,
    }));
    this.activeWorkerIndex = 0;
    this.totalFailovers = 0;
    this.totalHandledRequests = 0;
    this.totalWorkerRestarts = 0;
    this.totalWorkerCrashes = 0;
    this.shuttingDown = false;
    this.startPromise = null;
    this.shutdownPromise = null;
  }

  start() {
    if (this.shuttingDown) {
      return Promise.reject(new Error('Worker pool has been shut down'));
    }
    if (this.startPromise) return this.startPromise;

    this.startPromise = Promise.all(this.workers.map((worker) => this.spawnWorker(worker)));
    return this.startPromise;
  }

  spawnWorker(worker) {
    if (this.shuttingDown) return Promise.reject(new Error('Worker pool is shutting down'));

    clearTimeout(worker.restartTimer);
    worker.status = 'starting';
    worker.generation++;
    const generation = worker.generation;
    const safeWorkerEnv = Object.assign(Object.create(null), process.env);
    delete safeWorkerEnv.NODE_OPTIONS;
    delete safeWorkerEnv.NODE_PATH;
    safeWorkerEnv.ELECTRON_RUN_AS_NODE = '1';

    const child = fork(this.workerPath, [], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      serialization: 'json',
      env: safeWorkerEnv,
    });
    worker.process = child;
    worker.pid = child.pid || null;
    worker.created_at = new Date().toISOString();

    return new Promise((resolve, reject) => {
      let settled = false;
      const startupTimer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(new WorkerExecutionError(`${worker.id} startup timed out`, 'WORKER_STARTUP_TIMEOUT'));
      }, this.startupTimeoutMs);

      const onMessage = (message) => {
        if (generation !== worker.generation) return;
        if (message?.type === 'ready') {
          if (!settled) {
            settled = true;
            clearTimeout(startupTimer);
            worker.status = 'healthy';
            worker.last_health_check = Date.now();
            this.emit('workerReady', this.getWorkerTelemetry(worker));
            resolve(worker);
          }
          return;
        }

        if (message?.type !== 'result' || !message.requestId) return;
        const pending = worker.pending.get(message.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        worker.pending.delete(message.requestId);
        worker.pending_count = worker.pending.size;
        worker.status = worker.pending.size > 0 ? 'busy' : 'healthy';
        worker.last_health_check = Date.now();

        if (message.ok) {
          pending.resolve({ workerId: worker.id, value: message.value });
        } else {
          const error = new Error(message.error?.message || 'Worker task failed');
          error.name = message.error?.name || 'WorkerTaskError';
          error.code = message.error?.code || 'WORKER_TASK_ERROR';
          pending.reject(error);
        }
      };

      child.on('message', onMessage);
      child.once('error', (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(startupTimer);
          reject(new WorkerExecutionError(`${worker.id} failed to start: ${err.message}`));
        }
      });
      child.once('exit', (code, signal) => {
        if (generation !== worker.generation) return;
        if (!settled) {
          settled = true;
          clearTimeout(startupTimer);
          reject(new WorkerExecutionError(`${worker.id} exited before becoming ready`, 'WORKER_EXIT'));
        }
        this.handleWorkerExit(worker, code, signal);
      });
    });
  }

  handleWorkerExit(worker, code, signal) {
    worker.process = null;
    worker.pid = null;
    worker.status = this.shuttingDown ? 'stopped' : 'recovering';
    worker.error_count++;
    this.totalWorkerCrashes++;
    const exitError = new WorkerExecutionError(
      `${worker.id} exited (code=${code}, signal=${signal || 'none'})`,
      'WORKER_EXIT'
    );

    for (const pending of worker.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(exitError);
    }
    worker.pending.clear();
    worker.pending_count = 0;
    this.emit('workerExit', { id: worker.id, code, signal });

    if (!this.shuttingDown) {
      worker.restartTimer = setTimeout(() => {
        this.totalWorkerRestarts++;
        worker.rebound_count++;
        this.spawnWorker(worker).catch((err) => {
          this.emit('workerRestartError', { id: worker.id, message: err.message });
        });
      }, this.restartDelayMs);
    }
  }

  selectWorker(excluded = new Set()) {
    const ready = this.workers.filter(
      (worker) =>
        !excluded.has(worker.id) &&
        worker.process?.connected &&
        ['healthy', 'busy'].includes(worker.status)
    );
    if (ready.length === 0) return null;

    ready.sort((a, b) => a.pending_count - b.pending_count);
    const leastLoaded = ready.filter((worker) => worker.pending_count === ready[0].pending_count);
    const selected = leastLoaded[this.activeWorkerIndex % leastLoaded.length];
    this.activeWorkerIndex++;
    return selected;
  }

  async waitForWorker(timeoutMs) {
    const available = this.selectWorker();
    if (available) return available;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.removeListener('workerReady', onReady);
        reject(new WorkerExecutionError('No worker became available before timeout', 'NO_WORKER_AVAILABLE'));
      }, timeoutMs);
      const onReady = () => {
        const worker = this.selectWorker();
        if (!worker) return;
        clearTimeout(timer);
        this.removeListener('workerReady', onReady);
        resolve(worker);
      };
      this.on('workerReady', onReady);
    });
  }

  async executeTask(taskName, payload = {}, options = {}) {
    if (typeof taskName !== 'string' || !taskName.trim()) {
      throw new TypeError('A worker task name is required');
    }
    if (this.shuttingDown) throw new Error('Worker pool has been shut down');

    await this.start();
    this.totalHandledRequests++;
    const idempotent = options.idempotent === true;
    const maxAttempts = idempotent ? Math.min(2, this.poolSize) : 1;
    const excludedWorkers = new Set();
    let lastError;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const worker = this.selectWorker(excludedWorkers) || await this.waitForWorker(options.timeoutMs || this.defaultTaskTimeoutMs);
      const requestId = randomUUID();
      worker.handled_count++;
      worker.last_task = taskName;
      worker.status = 'busy';

      try {
        const response = await this.dispatch(worker, requestId, taskName, payload, options.timeoutMs);
        return response.value;
      } catch (err) {
        lastError = err;
        if (!(err instanceof WorkerExecutionError) || !idempotent || attempt + 1 >= maxAttempts) {
          throw err;
        }
        excludedWorkers.add(worker.id);
        this.totalFailovers++;
        this.emit('failover', { from: worker.id, taskName, reason: err.message });
      }
    }

    throw lastError || new Error('Worker task failed');
  }

  dispatch(worker, requestId, taskName, payload, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        worker.pending.delete(requestId);
        worker.pending_count = worker.pending.size;
        const error = new WorkerExecutionError(
          `${worker.id} timed out while executing ${taskName}`,
          'WORKER_TASK_TIMEOUT'
        );
        reject(error);
        worker.process?.kill();
      }, timeoutMs || this.defaultTaskTimeoutMs);

      worker.pending.set(requestId, { resolve, reject, timer });
      worker.pending_count = worker.pending.size;
      worker.process.send(
        { type: 'run', requestId, taskName, payload },
        (err) => {
          if (!err) return;
          clearTimeout(timer);
          worker.pending.delete(requestId);
          worker.pending_count = worker.pending.size;
          reject(new WorkerExecutionError(`${worker.id} IPC send failed: ${err.message}`));
          worker.process?.kill();
        }
      );
    });
  }

  async shutdown() {
    if (this.shutdownPromise) return this.shutdownPromise;
    this.shuttingDown = true;
    this.shutdownPromise = Promise.all(
      this.workers.map((worker) => {
        clearTimeout(worker.restartTimer);
        const child = worker.process;
        worker.status = 'stopped';
        if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();

        return new Promise((resolve) => {
          const timer = setTimeout(() => {
            child.kill('SIGKILL');
            resolve();
          }, 1000);
          child.once('exit', () => {
            clearTimeout(timer);
            resolve();
          });
          if (!child.killed) child.kill();
        });
      })
    ).then(() => undefined);
    return this.shutdownPromise;
  }

  getWorkerTelemetry(worker) {
    return {
      id: worker.id,
      status: worker.status,
      pid: worker.pid,
      created_at: worker.created_at,
      handled_count: worker.handled_count,
      error_count: worker.error_count,
      rebound_count: worker.rebound_count,
      last_health_check: worker.last_health_check,
      last_task: worker.last_task,
      pending_count: worker.pending.size,
    };
  }

  getTelemetry() {
    return {
      pool_size: this.poolSize,
      active_workers: this.workers.filter((worker) => ['healthy', 'busy'].includes(worker.status)).length,
      total_failovers: this.totalFailovers,
      total_handled_requests: this.totalHandledRequests,
      total_worker_restarts: this.totalWorkerRestarts,
      total_worker_crashes: this.totalWorkerCrashes,
      workers: this.workers.map((worker) => this.getWorkerTelemetry(worker)),
    };
  }
}

const primaryCircuit = new CircuitBreaker('BackboneGateway', {
  failureThreshold: 3,
  resetTimeoutMs: 3000,
});
const workerPool = new BackboneWorkerPool(4);

function startSystemBackbone() {
  return workerPool.start();
}

async function executeResilientOperation(taskName, payload = {}, options = {}) {
  return primaryCircuit.execute(
    () => workerPool.executeTask(taskName, payload, options),
    options.fallbackFn || null
  );
}

function getSystemBackboneHealth() {
  const workerTelemetry = workerPool.getTelemetry();
  const workersReady = workerTelemetry.active_workers === workerTelemetry.pool_size;
  const circuitOpen = primaryCircuit.state === 'OPEN';
  const circuitRecovering = primaryCircuit.state === 'HALF_OPEN';

  return {
    status: circuitOpen
      ? 'DEGRADED_FAILOVER_ACTIVE'
      : circuitRecovering
        ? 'RECOVERING'
        : workersReady
          ? 'OPTIMAL_HEALTH'
          : 'DEGRADED_WORKER_POOL',
    circuit_breaker: {
      name: primaryCircuit.name,
      state: primaryCircuit.state,
      failures: primaryCircuit.failureCount,
      reset_timeout_ms: primaryCircuit.resetTimeoutMs,
    },
    worker_pool: workerTelemetry,
    timestamp: new Date().toISOString(),
  };
}

module.exports = {
  CircuitBreaker,
  BackboneWorkerPool,
  executeResilientOperation,
  getSystemBackboneHealth,
  startSystemBackbone,
  shutdownSystemBackbone: () => workerPool.shutdown(),
};

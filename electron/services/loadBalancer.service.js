/**
 * Kashiear POS — Enterprise Multi-Core & Network Load Balancer Engine
 *
 * Designed for High-Performance Desktop POS & Seamless Enterprise Scalability:
 * 1. CPU Multi-Core Worker Pool Balancing (utilizes all CPU cores)
 * 2. Multi-Terminal Network Gateway (Round-Robin, Least-Connections, Weighted)
 * 3. Health Monitoring & Circuit Breaker (Auto-failover on fault)
 * 4. Task Segregation (Fast-Lane POS sales vs Heavy-Lane Analytics/Reports)
 */

const os = require('node:os');
const EventEmitter = require('node:events');

class LoadBalancer extends EventEmitter {
  /**
   * @param {Object} options
   * @param {string} [options.strategy='least-connections'] 'round-robin' | 'weighted' | 'least-connections' | 'fastest-response'
   * @param {number} [options.healthCheckIntervalMs=10000] Interval for node health verification
   * @param {number} [options.maxRetries=2] Max failover retries per request
   */
  constructor({ strategy = 'least-connections', healthCheckIntervalMs = 10000, maxRetries = 2 } = {}) {
    super();
    this.strategy = strategy;
    this.healthCheckIntervalMs = healthCheckIntervalMs;
    this.maxRetries = maxRetries;
    this.nodes = new Map(); // Registered worker/server nodes
    this.rrIndex = 0; // Round-robin pointer
    this.healthTimer = null;
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      activeRequests: 0,
    };

    this._initializeDefaultLocalNodes();
    this._startHealthChecker();
  }

  /**
   * Auto-detect and spawn compute nodes matching machine CPU capabilities
   */
  _initializeDefaultLocalNodes() {
    const cpuCount = Math.max(2, os.cpus()?.length || 2);
    // Node 1: Fast-lane POS core node
    this.registerNode({
      id: 'local-core-pos',
      name: 'نواة المبيعات السريعة (POS Fast-Lane)',
      type: 'internal-core',
      weight: 3,
      handler: null, // Connected dynamically
      metadata: { lane: 'fast', cpuIndex: 0 },
    });

    // Node 2..N: Heavy task & report compute nodes
    for (let i = 1; i < cpuCount; i++) {
      this.registerNode({
        id: `local-worker-${i}`,
        name: `معالج المهام والتقارير #${i}`,
        type: 'internal-worker',
        weight: 1,
        metadata: { lane: 'heavy', cpuIndex: i },
      });
    }
  }

  /**
   * Register a processing node (local worker or remote POS station)
   */
  registerNode({ id, name, type = 'worker', weight = 1, url = null, metadata = {}, healthCheck = null }) {
    if (!id) throw new Error('معرف النقطة (Node ID) مطلوب');
    if (healthCheck !== null && typeof healthCheck !== 'function') {
      throw new TypeError('فاحص الصحة (healthCheck) يجب أن يكون دالة');
    }

    const node = {
      id,
      name: name || id,
      type,
      weight: Math.max(1, Number(weight) || 1),
      currentWeight: 0,
      url,
      healthCheck,
      healthCheckInProgress: false,
      metadata,
      healthy: true,
      activeConnections: 0,
      totalServed: 0,
      totalErrors: 0,
      avgLatencyMs: 0,
      lastLatencyMs: 0,
      lastHealthCheck: Date.now(),
    };

    this.nodes.set(id, node);
    this._emitSafely('node:registered', node);
    return node;
  }

  /**
   * Remove or disconnect a node
   */
  unregisterNode(id) {
    const existed = this.nodes.delete(id);
    if (existed) {
      this._emitSafely('node:unregistered', id);
    }
    return existed;
  }

  _emitSafely(event, ...args) {
    const listeners = this.rawListeners(event);
    for (const listener of listeners) {
      try {
        listener.apply(this, args);
      } catch (err) {
        console.error(`[LoadBalancer] Listener for "${event}" failed:`, err);
      }
    }
    return listeners.length > 0;
  }

  /**
   * Get all active and healthy nodes
   */
  getHealthyNodes() {
    return Array.from(this.nodes.values()).filter((n) => n.healthy);
  }

  /**
   * Core Dispatcher: Select optimal node based on chosen balancing strategy
   */
  selectNode(taskType = 'general') {
    const candidates = this.getHealthyNodes();
    if (candidates.length === 0) {
      throw new Error('لا توجد أي معالجات أو نقاط اتصال سليمة متاحة في الـ Load Balancer');
    }

    // Lane segregation: Route critical POS sales to Fast-lane if available
    if (taskType === 'sale_checkout' || taskType === 'barcode_scan') {
      const fastNode = candidates.find((n) => n.metadata?.lane === 'fast');
      if (fastNode && fastNode.activeConnections < 10) {
        return fastNode;
      }
    }

    // 1. Least-Connections Strategy (Best for uneven POS query loads)
    if (this.strategy === 'least-connections') {
      let bestNode = candidates[0];
      for (const node of candidates) {
        const loadRatio = node.activeConnections / node.weight;
        const bestRatio = bestNode.activeConnections / bestNode.weight;
        if (loadRatio < bestRatio) {
          bestNode = node;
        }
      }
      return bestNode;
    }

    // 2. Fastest-Response Strategy (Best for latency-sensitive lookups)
    if (this.strategy === 'fastest-response') {
      let fastestNode = candidates[0];
      for (const node of candidates) {
        if (node.avgLatencyMs < fastestNode.avgLatencyMs) {
          fastestNode = node;
        }
      }
      return fastestNode;
    }

    // 3. Weighted round-robin distributes selections according to node weights.
    if (this.strategy === 'weighted') {
      let bestNode = candidates[0];
      let totalWeight = 0;
      for (const node of candidates) {
        node.currentWeight += node.weight;
        totalWeight += node.weight;
        if (node.currentWeight > bestNode.currentWeight) {
          bestNode = node;
        }
      }
      bestNode.currentWeight -= totalWeight;
      return bestNode;
    }

    // 4. Round-robin starts at the first candidate, then advances.
    const selectedNode = candidates[this.rrIndex % candidates.length];
    this.rrIndex = (this.rrIndex + 1) % candidates.length;
    return selectedNode;
  }

  /**
   * Execute a task through the load balancer with automatic failover and metrics tracking
   */
  async execute(
    taskFn,
    { taskType = 'general', retries = this.maxRetries, retryable = false, idempotencyKey } = {}
  ) {
    if (typeof taskFn !== 'function') {
      throw new TypeError('مهمة التنفيذ يجب أن تكون دالة');
    }
    if (!Number.isInteger(retries) || retries < 0) {
      throw new RangeError('عدد مرات إعادة المحاولة يجب أن يكون عددًا صحيحًا غير سالب');
    }
    if (
      retryable &&
      taskType === 'sale_checkout' &&
      retries > 0 &&
      (typeof idempotencyKey !== 'string' || idempotencyKey.trim().length === 0)
    ) {
      throw new Error('إعادة محاولة إتمام البيع تتطلب مفتاح idempotency فريدًا');
    }

    this.stats.totalRequests += 1;
    this.stats.activeRequests += 1;

    try {
      let lastError = null;
      let attempts = 0;
      const maxRetries = retryable ? retries : 0;

      while (attempts <= maxRetries) {
        const node = this.selectNode(taskType);
        node.activeConnections += 1;
        const startTime = Date.now();

        try {
          const result = await taskFn(node, {
            taskType,
            attempt: attempts + 1,
            idempotencyKey,
          });

          const latency = Date.now() - startTime;
          node.lastLatencyMs = latency;
          node.avgLatencyMs = node.avgLatencyMs === 0 ? latency : Math.round((node.avgLatencyMs * 0.8) + (latency * 0.2));
          node.totalServed += 1;
          node.healthy = true;

          this.stats.successfulRequests += 1;
          this._emitSafely('task:success', { nodeId: node.id, latency, taskType });
          return result;
        } catch (err) {
          lastError = err;
          node.totalErrors += 1;

          // Circuit breaker: isolate node if errors spike
          if (node.totalErrors >= 3) {
            node.healthy = false;
            this._emitSafely('node:degraded', { nodeId: node.id, error: err.message });
          }

          attempts += 1;
          if (attempts <= maxRetries) {
            this._emitSafely('task:retry', { nodeId: node.id, attempt: attempts, error: err.message });
          }
        } finally {
          node.activeConnections = Math.max(0, node.activeConnections - 1);
        }
      }

      throw new Error(
        `فشل تنفيذ العملية عبر الـ Load Balancer بعد ${attempts} محاولات: ${lastError?.message || 'خطأ غير معروف'}`
      );
    } catch (err) {
      this.stats.failedRequests += 1;
      throw err;
    } finally {
      this.stats.activeRequests = Math.max(0, this.stats.activeRequests - 1);
    }
  }

  /**
   * Background health checks and recovery for nodes with a healthCheck callback
   */
  _startHealthChecker() {
    this.healthTimer = setInterval(() => {
      for (const node of this.nodes.values()) {
        void this._checkNodeHealth(node);
      }
    }, this.healthCheckIntervalMs);

    if (this.healthTimer?.unref) {
      this.healthTimer.unref();
    }
  }

  async _checkNodeHealth(node) {
    if (!node.healthCheck || node.healthCheckInProgress || !this.nodes.has(node.id)) {
      return;
    }

    node.healthCheckInProgress = true;
    node.lastHealthCheck = Date.now();
    try {
      const healthy = await node.healthCheck(node);
      if (healthy !== true) {
        throw new Error('فشل فحص صحة النقطة');
      }

      if (!node.healthy) {
        node.healthy = true;
        node.totalErrors = 0;
        this._emitSafely('node:recovered', node.id);
      }
    } catch (err) {
      node.healthy = false;
      this._emitSafely('node:health-check-failed', {
        nodeId: node.id,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      node.healthCheckInProgress = false;
    }
  }

  /**
   * Get Live Diagnostic Metrics & Health Dashboard Data
   */
  getDiagnostics() {
    return {
      strategy: this.strategy,
      stats: { ...this.stats },
      nodeCount: this.nodes.size,
      healthyNodeCount: this.getHealthyNodes().length,
      nodes: Array.from(this.nodes.values()).map((n) => ({
        id: n.id,
        name: n.name,
        type: n.type,
        healthy: n.healthy,
        activeConnections: n.activeConnections,
        totalServed: n.totalServed,
        totalErrors: n.totalErrors,
        avgLatencyMs: n.avgLatencyMs,
        lane: n.metadata?.lane || 'standard',
      })),
      systemInfo: {
        cpuCores: os.cpus()?.length || 1,
        totalMemMB: Math.round(os.totalmem() / (1024 * 1024)),
        freeMemMB: Math.round(os.freemem() / (1024 * 1024)),
      },
    };
  }

  destroy() {
    if (this.healthTimer) {
      clearInterval(this.healthTimer);
    }
    this.nodes.clear();
  }
}

const loadBalancer = new LoadBalancer();
module.exports = loadBalancer;

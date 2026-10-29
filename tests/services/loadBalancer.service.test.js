const loadBalancer = require('../../electron/services/loadBalancer.service');

describe('Load Balancer Engine (Multi-Core Processing & Enterprise Node Balancing)', () => {
  afterAll(() => {
    loadBalancer.destroy();
  });

  test('auto-initializes local multi-core compute nodes', () => {
    const diagnostics = loadBalancer.getDiagnostics();
    expect(diagnostics.nodeCount).toBeGreaterThanOrEqual(2);
    expect(diagnostics.healthyNodeCount).toBeGreaterThanOrEqual(2);
    expect(diagnostics.nodes.some((n) => n.id === 'local-core-pos')).toBe(true);
  });

  test('registerNode and unregisterNode manage node pool dynamically', () => {
    const customNode = loadBalancer.registerNode({
      id: 'worker-remote-terminal-2',
      name: 'Cashier 2 Lane',
      type: 'remote-terminal',
      weight: 2,
    });

    expect(customNode.id).toBe('worker-remote-terminal-2');
    expect(loadBalancer.nodes.has('worker-remote-terminal-2')).toBe(true);

    const deleted = loadBalancer.unregisterNode('worker-remote-terminal-2');
    expect(deleted).toBe(true);
    expect(loadBalancer.nodes.has('worker-remote-terminal-2')).toBe(false);
  });

  test('selectNode routes critical POS sales tasks to Fast-lane worker', () => {
    const fastLaneNode = loadBalancer.selectNode('sale_checkout');
    expect(fastLaneNode.metadata?.lane).toBe('fast');
  });

  test('does not select a node when every registered node is unhealthy', () => {
    const previousHealth = Array.from(loadBalancer.nodes.values(), (node) => [node, node.healthy]);
    try {
      for (const [node] of previousHealth) node.healthy = false;

      expect(() => loadBalancer.selectNode()).toThrow('لا توجد أي معالجات أو نقاط اتصال سليمة');
    } finally {
      for (const [node, healthy] of previousHealth) node.healthy = healthy;
    }
  });

  test('round-robin selects the first candidate before advancing', () => {
    const previousStrategy = loadBalancer.strategy;
    const previousIndex = loadBalancer.rrIndex;
    const previousHealth = Array.from(loadBalancer.nodes.values(), (node) => [node, node.healthy]);
    for (const [node] of previousHealth) node.healthy = false;

    const first = loadBalancer.registerNode({ id: 'round-robin-first' });
    const second = loadBalancer.registerNode({ id: 'round-robin-second' });
    try {
      loadBalancer.strategy = 'round-robin';
      loadBalancer.rrIndex = 0;

      expect(loadBalancer.selectNode()).toBe(first);
      expect(loadBalancer.selectNode()).toBe(second);
      expect(loadBalancer.selectNode()).toBe(first);
    } finally {
      loadBalancer.unregisterNode(first.id);
      loadBalancer.unregisterNode(second.id);
      for (const [node, healthy] of previousHealth) node.healthy = healthy;
      loadBalancer.strategy = previousStrategy;
      loadBalancer.rrIndex = previousIndex;
    }
  });

  test('weighted strategy distributes selections proportionally to node weights', () => {
    const previousStrategy = loadBalancer.strategy;
    const previousHealth = Array.from(loadBalancer.nodes.values(), (node) => [node, node.healthy]);
    for (const [node] of previousHealth) node.healthy = false;

    const heavier = loadBalancer.registerNode({ id: 'weighted-heavy', weight: 3 });
    const lighter = loadBalancer.registerNode({ id: 'weighted-light', weight: 1 });
    try {
      loadBalancer.strategy = 'weighted';

      const selected = Array.from({ length: 4 }, () => loadBalancer.selectNode());
      expect(selected.filter((node) => node === heavier)).toHaveLength(3);
      expect(selected.filter((node) => node === lighter)).toHaveLength(1);
    } finally {
      loadBalancer.unregisterNode(heavier.id);
      loadBalancer.unregisterNode(lighter.id);
      for (const [node, healthy] of previousHealth) node.healthy = healthy;
      loadBalancer.strategy = previousStrategy;
    }
  });

  test('execute successfully runs tasks, tracks latency metrics, and increments stats', async () => {
    const result = await loadBalancer.execute(async (node) => {
      expect(node).toBeDefined();
      return { success: true, processedBy: node.id };
    }, { taskType: 'general' });

    expect(result.success).toBe(true);
    const diag = loadBalancer.getDiagnostics();
    expect(diag.stats.totalRequests).toBeGreaterThan(0);
    expect(diag.stats.successfulRequests).toBeGreaterThan(0);
    expect(diag.stats.activeRequests).toBe(0);
  });

  test('execute handles retries and failover on worker errors', async () => {
    let callCount = 0;

    const result = await loadBalancer.execute(async () => {
      callCount++;
      if (callCount === 1) {
        throw new Error('Temporary Core Failure');
      }
      return 'Recovered';
    }, { retries: 2, retryable: true });

    expect(result).toBe('Recovered');
    expect(callCount).toBe(2);
  });

  test('does not retry tasks unless they are explicitly marked retryable', async () => {
    let callCount = 0;

    await expect(loadBalancer.execute(async () => {
      callCount++;
      throw new Error('Uncertain task outcome');
    }, { retries: 2 })).rejects.toThrow('فشل تنفيذ العملية عبر الـ Load Balancer بعد 1 محاولات');

    expect(callCount).toBe(1);
  });

  test('listener errors do not turn successful tasks into failures or retries', async () => {
    const listenerError = new Error('Listener failed');
    const throwingListener = () => {
      throw listenerError;
    };
    const succeedingListener = jest.fn();
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    let callCount = 0;
    loadBalancer.on('task:success', throwingListener);
    loadBalancer.on('task:success', succeedingListener);

    try {
      const result = await loadBalancer.execute(async () => {
        callCount++;
        return 'completed';
      }, { retryable: true, retries: 2 });

      expect(result).toBe('completed');
      expect(callCount).toBe(1);
      expect(succeedingListener).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        '[LoadBalancer] Listener for "task:success" failed:',
        listenerError
      );
    } finally {
      loadBalancer.off('task:success', throwingListener);
      loadBalancer.off('task:success', succeedingListener);
      consoleError.mockRestore();
    }
  });

  test('sale retries require and pass through an idempotency key', async () => {
    await expect(
      loadBalancer.execute(async () => 'unused', {
        taskType: 'sale_checkout',
        retries: 1,
        retryable: true,
      })
    ).rejects.toThrow('تتطلب مفتاح idempotency فريدًا');

    const receivedKeys = [];
    let callCount = 0;
    const result = await loadBalancer.execute(async (node, context) => {
      receivedKeys.push(context.idempotencyKey);
      callCount++;
      if (callCount === 1) throw new Error('Transient failure');
      return node.id;
    }, {
      taskType: 'sale_checkout',
      retries: 1,
      retryable: true,
      idempotencyKey: 'sale-request-unique-123',
    });

    expect(result).toBeDefined();
    expect(receivedKeys).toEqual(['sale-request-unique-123', 'sale-request-unique-123']);
  });

  test('execute throws clean user error when all retries are exhausted', async () => {
    await expect(
      loadBalancer.execute(async () => {
        throw new Error('Persistent DB Timeout');
      }, { retries: 1, retryable: true })
    ).rejects.toThrow('فشل تنفيذ العملية عبر الـ Load Balancer');
    expect(loadBalancer.getDiagnostics().stats.activeRequests).toBe(0);
  });

  test('health checker only recovers nodes after a successful health check', async () => {
    let isHealthy = false;
    const node = loadBalancer.registerNode({
      id: 'health-check-test-node',
      healthCheck: async () => isHealthy,
    });
    node.healthy = false;
    node.totalErrors = 3;

    await loadBalancer._checkNodeHealth(node);
    expect(node.healthy).toBe(false);

    isHealthy = true;
    await loadBalancer._checkNodeHealth(node);
    expect(node.healthy).toBe(true);
    expect(node.totalErrors).toBe(0);

    loadBalancer.unregisterNode(node.id);
  });

  test('nodes without a health check are not automatically recovered', async () => {
    const node = loadBalancer.registerNode({ id: 'no-health-check-test-node' });
    node.healthy = false;

    await loadBalancer._checkNodeHealth(node);
    expect(node.healthy).toBe(false);

    loadBalancer.unregisterNode(node.id);
  });
});

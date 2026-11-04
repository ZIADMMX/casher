/**
 * FOX.CLOUD POS - High-Availability Reverse Proxy & Load Balancer
 * Built with native Node.js HTTP proxying (Zero external dependencies)
 * Supports Round-Robin, Automatic Health-Checking, and Instant Failover
 */

const http = require('node:http');
const url = require('node:url');
require('dotenv').config();
const { applyCorsPolicy } = require('./electron/security/corsPolicy');

const LB_PORT = Number(process.env.LB_PORT) || 8080;

// Upstream Backend Nodes
const UPSTREAM_NODES = [
  { id: 'api-node-1', host: '127.0.0.1', port: 5000, isHealthy: true, latencyMs: 0, failuresCount: 0, activeRequests: 0 },
  { id: 'api-node-2', host: '127.0.0.1', port: 5001, isHealthy: true, latencyMs: 0, failuresCount: 0, activeRequests: 0 },
];

let roundRobinIndex = 0;
let totalRequestsRouted = 0;

// Health Check Runner
async function checkNodeHealth(node) {
  const start = Date.now();
  return new Promise((resolve) => {
    const req = http.get(`http://${node.host}:${node.port}/api/health`, { timeout: 2000 }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        if (res.statusCode === 200) {
          node.isHealthy = true;
          node.failuresCount = 0;
          node.latencyMs = Date.now() - start;
          resolve(true);
        } else {
          node.isHealthy = false;
          node.failuresCount++;
          resolve(false);
        }
      });
    });

    req.on('error', () => {
      node.isHealthy = false;
      node.failuresCount++;
      node.latencyMs = null;
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
      node.isHealthy = false;
      node.failuresCount++;
      node.latencyMs = null;
      resolve(false);
    });
  });
}

// Periodic Health Checks every 4 seconds
setInterval(async () => {
  for (const node of UPSTREAM_NODES) {
    await checkNodeHealth(node);
  }
}, 4000);

// Select next healthy node using Round-Robin
function getNextHealthyNode() {
  const healthyNodes = UPSTREAM_NODES.filter((n) => n.isHealthy);
  if (healthyNodes.length === 0) return null;
  const node = healthyNodes[roundRobinIndex % healthyNodes.length];
  roundRobinIndex++;
  return node;
}

// Proxy Request to Target Node
function proxyRequest(req, res, targetNode, retryCount = 0) {
  targetNode.activeRequests++;
  totalRequestsRouted++;

  const options = {
    hostname: targetNode.host,
    port: targetNode.port,
    path: req.url,
    method: req.method,
    headers: {
      ...req.headers,
      'x-forwarded-for': req.socket.remoteAddress,
      'x-forwarded-proto': 'http',
      'x-load-balancer': 'FOX.CLOUD-Native-LB',
    },
    timeout: 10000,
  };

  const proxy = http.request(options, (upstreamRes) => {
    targetNode.activeRequests--;
    res.writeHead(upstreamRes.statusCode, {
      ...upstreamRes.headers,
      'X-Routed-To-Node': targetNode.id,
      'X-Routed-To-Port': String(targetNode.port),
    });
    upstreamRes.pipe(res);
  });

  proxy.on('error', (err) => {
    targetNode.activeRequests--;
    targetNode.isHealthy = false;
    console.warn(`⚠️ [LB Warning]: Node ${targetNode.id} failed (${err.message})`);

    // Instant Failover — ONLY for idempotent requests (GET/HEAD/OPTIONS).
    // Writes (POST/PUT/PATCH/DELETE) are never re-sent: the first node may have
    // already committed them (duplicate sale/payment), and the body stream is consumed.
    const isIdempotent = ['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    if (isIdempotent && retryCount < UPSTREAM_NODES.length) {
      const nextNode = getNextHealthyNode();
      if (nextNode && nextNode.id !== targetNode.id) {
        console.log(`🔄 [LB Failover]: Retrying ${req.method} via ${nextNode.id}...`);
        return proxyRequest(req, res, nextNode, retryCount + 1);
      }
    }

    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({
        error: isIdempotent
          ? 'تعذر الاتصال بأي من خوادم الـ API المركزية'
          : 'انقطع الاتصال أثناء عملية كتابة — لم تتم إعادة المحاولة تلقائياً لتجنب التكرار. تحقق من نتيجة العملية قبل إعادتها.',
        retried: false,
        details: err.message,
      }));
    }
  });

  req.pipe(proxy);
}

// Load Balancer Server
const {
  checkRateLimit,
  getClientIp,
  tryAcquireRequestSlot,
} = require('./electron/services/rateLimiter');

const lbServer = http.createServer(async (req, res) => {
  if (!applyCorsPolicy(req, res)) {
    res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({ error: 'هذا المصدر غير مسموح له بالاتصال بالخادم' }));
  }
  if (req.method === 'OPTIONS') {
    return;
  }

  const clientIp = getClientIp(req);
  if (!await checkRateLimit(`load-balancer:${clientIp}`)) {
    res.writeHead(429, {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': '60'
    });
    return res.end(JSON.stringify({
      error: 'تم تجاوز الحد الأقصى للطلبات (Rate Limit Exceeded). يرجى المحاولة بعد قليل.',
      retryAfterMs: 60000,
    }));
  }

  const releaseSlot = tryAcquireRequestSlot();
  if (!releaseSlot) {
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
      'Retry-After': '1',
    });
    return res.end(JSON.stringify({ error: 'الخادم مشغول حاليًا، يرجى المحاولة بعد لحظات' }));
  }
  res.once('finish', releaseSlot);
  res.once('close', releaseSlot);

  const parsed = url.parse(req.url, true);

  // Status & Telemetry Endpoint
  if (parsed.pathname === '/lb/status' || parsed.pathname === '/lb') {
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    return res.end(JSON.stringify({
      status: 'ONLINE',
      service: 'FOX.CLOUD Master Load Balancer',
      port: LB_PORT,
      totalRequestsRouted,
      nodes: UPSTREAM_NODES.map((n) => ({
        id: n.id,
        target: `http://${n.host}:${n.port}`,
        status: n.isHealthy ? 'HEALTHY' : 'DOWN',
        latencyMs: n.latencyMs,
        activeRequests: n.activeRequests,
        failuresCount: n.failuresCount,
      })),
    }, null, 2));
  }

  // Route API Requests
  const targetNode = getNextHealthyNode();
  if (!targetNode) {
    res.writeHead(503, {
      'Content-Type': 'application/json; charset=utf-8',
    });
    return res.end(JSON.stringify({
      error: 'جميع خوادم الـ API المركزية غير متاحة حالياً',
      allNodesDown: true,
    }));
  }

  proxyRequest(req, res, targetNode);
});

lbServer.listen(LB_PORT, async () => {
  console.log(`⚖️ [FOX.CLOUD Load Balancer]: Listening on http://localhost:${LB_PORT}`);
  console.log(`🎯 [Cluster Upstream]: Balancing between http://127.0.0.1:5000 & http://127.0.0.1:5001`);
  for (const node of UPSTREAM_NODES) {
    await checkNodeHealth(node);
  }
});

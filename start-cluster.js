/**
 * FOX.CLOUD POS - Cluster & High-Availability Orchestrator
 * Spawns multiple API instances + Load Balancer simultaneously
 */

const { fork } = require('child_process');
const path = require('path');

console.log('====================================================');
console.log('🚀 Starting FOX.CLOUD High-Availability Central Cluster');
console.log('====================================================');

const processes = [];

function startWorker(scriptName, args = [], name = 'Worker') {
  const child = fork(path.join(__dirname, scriptName), args, {
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    console.warn(`⚠️ [${name}] Process exited with code ${code} (${signal})`);
  });

  processes.push(child);
  return child;
}

// 1. Start API Instance 1 (Primary Central Node - Port 5000)
console.log('📡 Spawning Central API Node 1 on Port 5000...');
startWorker('central-server.js', ['--port=5000', '--instance=api-node-1'], 'API-Node-1');

// 2. Start API Instance 2 (Secondary Central Node - Port 5001)
console.log('📡 Spawning Central API Node 2 on Port 5001...');
startWorker('central-server.js', ['--port=5001', '--instance=api-node-2'], 'API-Node-2');

// 3. Start Load Balancer Gateway on Port 8080
setTimeout(() => {
  console.log('⚖️ Spawning Load Balancer Gateway on Port 8080...');
  startWorker('load-balancer.js', [], 'Load-Balancer');
}, 1000);

// Graceful Shutdown
function shutdown() {
  console.log('\n🛑 Shutting down FOX.CLOUD cluster...');
  for (const proc of processes) {
    try { proc.kill(); } catch {}
  }
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

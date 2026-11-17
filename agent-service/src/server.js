// Loopback HTTP wrapper around runTurn. POST /v1/turn, GET /health.
const http = require('node:http');
const policy = require('./policy');
const { runTurn } = require('./turn');

function createServer({ token = process.env.AGENT_TOKEN, turn = runTurn } = {}) {
  return http.createServer(async (req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method === 'GET' && req.url === '/health') return send(200, { ok: true });
      if (req.method !== 'POST' || req.url !== '/v1/turn') return send(404, { error: 'not found' });
      if (token && req.headers['x-agent-token'] !== token) return send(401, { error: 'unauthorized' });

      const chunks = [];
      let size = 0;
      for await (const chunk of req) {
        size += chunk.length;
        if (size > policy.MAX_BODY_BYTES) return send(413, { error: 'الطلب كبير جداً' });
        chunks.push(chunk);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      } catch {
        return send(400, { error: 'JSON غير صالح' });
      }
      return send(200, await turn(body));
    } catch (e) {
      return send(e.status || 500, { error: e.status ? e.message : 'خطأ داخلي في خدمة المساعد' });
    }
  });
}

if (require.main === module) {
  const port = Number(process.env.AGENT_PORT) || 4410;
  // Loopback only: the desktop app is the sole client.
  createServer().listen(port, '127.0.0.1', () => console.log(`agent-service on 127.0.0.1:${port}`));
}

module.exports = { createServer };

/**
 * Virtual network thermal printer: listens like a printer on port 9100 and shows what the POS sent.
 * Lets you test receipts, the cash drawer pulse and the cut command without owning a printer.
 *
 *   node scripts/virtual-printer.js [port]
 *   npx electron scripts/printer-test.js --ip 127.0.0.1 --port 9100
 *
 * Shows the bytes sent, not how a real printer renders them: the paper width and the
 * Arabic code page still need one test on a real printer.
 */
const net = require('node:net');

const port = Number(process.argv[2]) || 9100;
const IDLE_MS = 500;

// ESC/POS commands that carry one parameter byte (3 bytes total): align, bold, size, feed.
const THREE_BYTE = new Set([0x61, 0x45, 0x64, 0x21, 0x4d, 0x74]);

function decode(buffer) {
  let out = '';
  const text = [];
  const flush = () => { if (text.length) { out += Buffer.from(text).toString('utf8'); text.length = 0; } };
  for (let i = 0; i < buffer.length; i += 1) {
    const b = buffer[i];
    const next = buffer[i + 1];
    if (b === 0x1b && next === 0x40) { flush(); i += 1; } // init
    else if (b === 0x1b && next === 0x70) { flush(); out += `\n[فتح الدرج - pin ${buffer[i + 2] === 1 ? 5 : 2}]\n`; i += 4; }
    else if (b === 0x1d && next === 0x56) { flush(); out += '\n[قص الورقة]\n'; i += next === 0x56 && buffer[i + 2] >= 0x41 ? 3 : 2; }
    else if (b === 0x1b && THREE_BYTE.has(next)) { flush(); i += 2; }
    else if (b === 0x1d && THREE_BYTE.has(next)) { flush(); i += 2; }
    else text.push(b);
  }
  flush();
  return out;
}

net.createServer((socket) => {
  const chunks = [];
  let timer;
  const finish = () => {
    if (!chunks.length) return;
    const data = Buffer.concat(chunks.splice(0));
    console.log(`\n===== طباعة جديدة (${data.length} بايت) =====\n${decode(data)}\n=====================================`);
  };
  socket.on('data', (chunk) => { chunks.push(chunk); clearTimeout(timer); timer = setTimeout(finish, IDLE_MS); });
  socket.on('end', () => { clearTimeout(timer); finish(); });
  socket.on('error', () => {});
}).listen(port, '127.0.0.1', () => console.log(`الطابعة الافتراضية شغّالة على 127.0.0.1:${port}`));

import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
const R = process.cwd() + '/'; // run from the repo root
const { chromium } = await import(R + 'node_modules/playwright/index.mjs');
const lb = await import(R + 'liveness-browser.mjs');
const hits = [];
const priv = createServer((q, s) => s.end('x'));
priv.on('upgrade', (req, socket) => {
  hits.push(req.url);
  const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
  socket.on('error', () => {});
  socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
  const p = Buffer.from('INTERNAL-WS'); socket.write(Buffer.concat([Buffer.from([0x81, p.length]), p]));
});
await new Promise(r => priv.listen(0, '127.0.0.1', r));
const MODE = process.argv[2] || 'worker';
const pub = createServer((req, res) => {
  if (req.url === '/w.js') return res.writeHead(200, {'content-type':'text/javascript'}).end(`const s = new WebSocket('ws://private.example.test:${priv.address().port}/ws'); s.onmessage = (e) => postMessage(e.data);`);
  const body = MODE === 'worker'
    ? `<script>new Worker('/w.js').onmessage = (e) => { document.body.append(e.data); document.title = 'done'; }</script>`
    : `<script>const s = new WebSocket('ws://private.example.test:${priv.address().port}/ws'); s.onmessage = (e) => { document.body.append(e.data); document.title = 'done'; }</script>`;
  res.writeHead(200, {'content-type':'text/html'}).end(`<title>Job</title><body><p>posting</p>${body}</body>`);
});
await new Promise(r => pub.listen(0, '127.0.0.1', r));
const restore = lb.setHostResolver(async (h) => (h === 'private.example.test' ? ['10.0.0.5'] : ['93.184.216.34']));
lb.setDialledAddressJudge(({ port }) => port === priv.address().port);
const browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.example.test 127.0.0.1'] });
const ctx = await browser.newContext(lb.LIVENESS_CONTEXT_OPTIONS);
await lb.installEgressGuard(ctx);
const page = await ctx.newPage();
const check = lb.recordLandedUrls(page);
await page.goto(`http://jobs.example.test:${pub.address().port}/`);
await page.waitForFunction(() => document.title === 'done', null, { timeout: 8000 }).catch(() => {});
const text = await page.innerText('body');
console.log(MODE, '| body read:', JSON.stringify(text), '| private ws hits:', hits.length, '| recorder verdict:', JSON.stringify(await check()));
await browser.close(); restore(); priv.close(); pub.close();

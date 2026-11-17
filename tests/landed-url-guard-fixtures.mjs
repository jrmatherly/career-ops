// Shared by the tests/landed-url-guard*.test.mjs suites: a stub resolver, a
// temp data root that archiveUrl writes into, and the local servers a real
// Chromium is pointed at.
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setDialledAddressJudge, setHostResolver } from '../liveness-browser.mjs';

const dataRoot = mkdtempSync(join(tmpdir(), 'career-ops-landed-'));
process.env.CAREER_OPS_ROOT = dataRoot;
export const { archiveUrl } = await import('../archive-posting.mjs');
test.after(() => rmSync(dataRoot, { recursive: true, force: true }));
export const archived = () => (existsSync(join(dataRoot, 'jds')) ? readdirSync(join(dataRoot, 'jds')) : []);

export const ANSWERS = {
  'private.example.test': ['10.0.0.5'],
  'metadata.example.test': ['169.254.169.254'],
  'mixed.example.test': ['93.184.216.34', '10.0.0.5'],
  'jobs.example.test': ['93.184.216.34'],
  'tracker.example.test': ['0.0.0.0'],
};
export const stubResolver = async (host) => {
  if (host === 'down.example.test') throw new Error('SERVFAIL');
  return ANSWERS[host] ?? [];
};

// Chromium resolves names itself, so the two test names are mapped to the local
// server with --host-resolver-rules while the guard's resolver calls one public
// and the other private. No request leaves the machine. Every address Chromium
// dials is therefore loopback, so the server has a second listener and the
// address rule is told that this one is the private host.
export const HOST_RESOLVER_RULES = '--host-resolver-rules=MAP *.example.test 127.0.0.1';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
export const INTERNAL = 'ZX81';
const POSTING = `<h1>Engineer</h1><p>${'Platform engineer role with responsibilities and requirements. '.repeat(30)}</p>`;
export async function serversFor(t, browser, { realAddressRule = false } = {}) {
  let releaseSignal;
  const signal = new Promise((resolve) => { releaseSignal = resolve; });
  const privateHits = [];
  const nodeHits = [];
  const sharedWorkerActions = new Map([
    ['fetch', () => `fetch('http://${privateOrigin()}/cors').then((r) => r.text())`],
    ['socket', () => `new Promise((resolve, reject) => { const socket = new WebSocket('ws://${privateOrigin()}/ws'); socket.onmessage = (e) => resolve(e.data); socket.onerror = reject; })`],
  ]);
  const html = (res, body, title = 'Engineer | Acme') => res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>${title}</title><body>${body}</body>`);
  const send = (res, type, body) => res.writeHead(200, { 'content-type': type, 'access-control-allow-origin': '*' }).end(body);
  const privateOrigin = () => `private.example.test:${privateServer.address().port}`;
  const answer = (req, res) => {
    const toPrivate = () => res.writeHead(302, { location: `http://private.example.test:${server.address().port}/landed` }).end();
    if (req.url === '/start' || req.url === '/redir') toPrivate();
    else if (req.url.startsWith('/to-private/')) res.writeHead(302, { location: `http://${privateOrigin()}/${req.url.slice('/to-private/'.length)}` }).end();
    else if (req.url === '/img.png') send(res, 'image/png', PNG);
    else if (req.url === '/style.css') send(res, 'text/css', `body::after { content: "${INTERNAL} css"; }`);
    else if (req.url === '/script.js') send(res, 'text/javascript', `document.body.append("${INTERNAL} js");`);
    else if (req.url === '/cors') send(res, 'text/plain', `${INTERNAL} cors`);
    else if (req.url === '/payroll') html(res, `<h1>${INTERNAL}-H1 salary table</h1>${POSTING}`, `Payroll export ${INTERNAL}-TITLE | IntraCorp Admin`);
    else if (req.url === '/with-img') html(res, `<img src="/to-private/img.png">${POSTING}`);
    else if (req.url === '/with-stylesheet') html(res, `<link rel="stylesheet" href="/to-private/style.css">${POSTING}`);
    else if (req.url === '/with-script') html(res, `${POSTING}<script src="/to-private/script.js"></script>`);
    else if (req.url === '/with-fetch') html(res, `${POSTING}<script>fetch('/to-private/cors').then((r) => r.text()).then((text) => document.body.append(text))</script>`);
    else if (req.url === '/with-websocket') html(res, `${POSTING}<script>new WebSocket('ws://${privateOrigin()}/ws').onmessage = (e) => document.body.append(e.data)</script>`);
    else if (req.url === '/armed') send(res, 'text/plain', 'ok');
    else if (req.url === '/fetch-then-armed') html(res, `${POSTING}<script>fetch('/to-private/cors').then((r) => r.text()).then((text) => { document.body.append(text); return fetch('/armed'); })</script>`);
    else if (req.url === '/armed-posting') html(res, `${POSTING}<script>fetch('/armed')</script>`);
    else if (req.url.startsWith('/shared.js?')) send(res, 'text/javascript', `onconnect = (e) => { ${(sharedWorkerActions.get(req.url.split('?')[1]) ?? (() => 'Promise.reject()'))()}.then((text) => e.ports[0].postMessage(text), () => e.ports[0].postMessage('failed')); };`);
    else if (req.url.startsWith('/with-shared-worker?')) {
      const [action, from] = req.url.split('?')[1].split('&');
      const constructor = from === 'iframe' ? "document.body.appendChild(document.createElement('iframe')).contentWindow.SharedWorker" : 'globalThis.SharedWorker';
      html(res, `${POSTING}<script>const Shared = ${constructor}; const done = () => fetch('/armed'); if (!Shared) done(); else new Shared('/shared.js?${action}').port.onmessage = (e) => { document.body.append(e.data); done(); };</script>`);
    } else if (req.url === '/with-closing-socket') html(res, `${POSTING}<script>new WebSocket('ws://${privateOrigin()}/close').onclose = (e) => document.body.append(e.reason)</script>`);
    else if (req.url === '/throws') html(res, `${POSTING}<script>fetch('/to-private/cors').then((r) => r.text()).then((text) => { const boom = () => { throw new Error('THROWN ' + text); }; for (const key of ['body', 'title', 'documentElement']) Object.defineProperty(document, key, { get: boom }); document.querySelectorAll = boom; document.querySelector = boom; Element.prototype.querySelectorAll = boom; return fetch('/armed'); })</script>`);
    else if (req.url === '/public-assets') html(res, `<img src="/img.png"><img src="http://${privateOrigin()}/img.png">${POSTING}<script src="/script.js"></script><script>fetch('/cors')</script>`);
    else if (req.url === '/self-redirect-to-payroll') html(res, `${POSTING}<script>fetch('/signal').then(() => { location = '/to-private/payroll'; })</script>`);
    else if (req.url === '/signal') signal.then(() => res.end('go'));
    else if (req.url === '/self-redirect') html(res, `${POSTING}<script>fetch('/signal').then(() => { location = '/redir'; })</script>`);
    else if (req.url === '/framed') html(res, `<iframe src="/redir"></iframe>${POSTING}`);
    else if (req.url === '/flip') html(res, `<iframe id="f" src="/embed"></iframe>${POSTING}<script>fetch('/signal').then(() => { const f = document.getElementById('f'); f.onload = () => { f.onload = null; f.src = '/embed'; }; f.src = '/redir'; })</script>`);
    else if (req.url === '/visit-once') html(res, `<iframe src="/redir" onload="this.remove()"></iframe>${POSTING}`);
    else if (req.url === '/popup') html(res, `${POSTING}<script>window.open('/redir')</script>`);
    else if (req.url === '/embed') html(res, '<p>widget</p>');
    else if (req.url === '/posting') html(res, `<iframe></iframe><iframe srcdoc="<p>widget</p>"></iframe><iframe src="/embed"></iframe>${POSTING}`);
    else html(res, '<h1>Internal</h1><p>internal secret</p>');
  };
  const server = createServer(answer);
  const privateServer = createServer(answer);
  privateServer.on('request', (req) => privateHits.push(req.url));
  server.on('request', (req) => { if (req.headers['user-agent'] === 'node') nodeHits.push(req.url); });
  privateServer.on('upgrade', (req, socket) => {
    privateHits.push(req.url);
    const accept = createHash('sha1').update(`${req.headers['sec-websocket-key']}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`).digest('base64');
    const payload = Buffer.from(`${INTERNAL} ws`);
    socket.on('error', () => {});
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    if (req.url === '/close') {
      const reason = Buffer.from(`${INTERNAL} close`);
      const code = Buffer.alloc(2);
      code.writeUInt16BE(4000);
      socket.write(Buffer.concat([Buffer.from([0x88, 2 + reason.length]), code, reason]));
      return;
    }
    socket.write(Buffer.concat([Buffer.from([0x81, payload.length]), payload]));
  });
  for (const listener of [server, privateServer]) await new Promise((resolve) => listener.listen(0, '127.0.0.1', resolve));
  const privatePort = privateServer.address().port;
  t.after(async () => {
    releaseSignal();
    await browser.close().catch(() => {});
    server.close();
    privateServer.close();
  });
  t.after(setHostResolver(stubResolver));
  if (!realAddressRule) t.after(setDialledAddressJudge(({ port }) => port === privatePort));
  const warned = t.mock.method(console, 'warn', () => {});
  const logged = t.mock.method(console, 'log', () => {});
  return { browser, warned, logged, releaseSignal, privatePort, privateHits, nodeHits, publicUrl: (path) => `http://jobs.example.test:${server.address().port}${path}` };
}

export const REFUSED = /refusing to archive restricted destination after redirect: .*private target IP 10\.0\.0\.5/;
export const REFUSED_BY_ADDRESS = /refusing to archive restricted destination after redirect: .*a response came from private target IP 127\.0\.0\.1/;

// The page's first read waits for `ready`, a signal from the page or its
// socket, so no case depends on the 2 s hydration wait being long enough.
export const readsWhen = (env, ready) => ({ newContext: async (options) => {
  const context = await env.browser.newContext(options);
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    const waited = ready(context, page);
    const title = page.title.bind(page);
    page.title = async () => {
      await waited;
      return title();
    };
    return page;
  };
  return context;
} });

export const pageArmed = (context) => new Promise((resolve) => {
  context.on('response', (response) => { if (new URL(response.url()).pathname === '/armed') resolve(); });
});

// tests/landed-url-guard.test.mjs. A redirect never reaches the route guard, so
// the landed URL is judged by DNS before any script reads the page, and what
// the page received (the address behind every response, every URL a frame
// committed to, every WebSocket it opened) is judged after its last
// read. Shared and service workers, which Playwright reports nothing for, are
// denied, and a read that throws is judged before its error is reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers.mjs';
import { toolRequired } from './required-tools.mjs';
import { LIVENESS_CONTEXT_OPTIONS, installEgressGuard, readLanded, recordLandedUrls, rejectLandedPage, rejectLandedUrl, setDialledAddressJudge, setHostResolver } from '../liveness-browser.mjs';

const dataRoot = mkdtempSync(join(tmpdir(), 'career-ops-landed-'));
process.env.CAREER_OPS_ROOT = dataRoot;
const { archiveUrl } = await import('../archive-posting.mjs');
test.after(() => rmSync(dataRoot, { recursive: true, force: true }));
const archived = () => (existsSync(join(dataRoot, 'jds')) ? readdirSync(join(dataRoot, 'jds')) : []);

const ANSWERS = {
  'private.example.test': ['10.0.0.5'],
  'metadata.example.test': ['169.254.169.254'],
  'mixed.example.test': ['93.184.216.34', '10.0.0.5'],
  'jobs.example.test': ['93.184.216.34'],
  'tracker.example.test': ['0.0.0.0'],
};
const stubResolver = async (host) => {
  if (host === 'down.example.test') throw new Error('SERVFAIL');
  return ANSWERS[host] ?? [];
};

test('rejectLandedUrl refuses a landed name that resolves to a private address', async (t) => {
  t.after(setHostResolver(stubResolver));
  for (const host of ['private', 'metadata', 'mixed']) {
    const verdict = await rejectLandedUrl(`https://${host}.example.test/admin`);
    assert.equal(verdict?.code, 'blocked_host', host);
    assert.match(verdict.reason, /private target IP/, host);
  }
});

test('rejectLandedUrl refuses when the resolver fails or answers nothing', async (t) => {
  t.after(setHostResolver(stubResolver));
  assert.equal((await rejectLandedUrl('https://down.example.test/'))?.code, 'blocked_host');
  assert.equal((await rejectLandedUrl('https://nowhere.example.test/'))?.code, 'blocked_host');
});

test('rejectLandedUrl refuses a literal private host and a non-http page without resolving', async (t) => {
  t.after(setHostResolver(async () => { throw new Error('resolver must not run'); }));
  assert.deepEqual(await rejectLandedUrl('http://127.0.0.1:8080/'), { code: 'blocked_host', reason: 'blocked host 127.0.0.1' });
  assert.equal((await rejectLandedUrl('chrome-error://chromewebdata/'))?.code, 'unsupported_protocol');
});

test('rejectLandedUrl allows a name that resolves to public addresses only', async (t) => {
  t.after(setHostResolver(stubResolver));
  assert.equal(await rejectLandedUrl('https://jobs.example.test/1'), null);
});

test('rejectLandedPage judges every frame that a host answered, and only those', async (t) => {
  t.after(setHostResolver(stubResolver));
  const pageWith = (url, ...frameUrls) => ({ url: () => url, frames: () => [url, ...frameUrls].map((u) => ({ url: () => u })) });
  assert.equal(await rejectLandedPage(pageWith('https://jobs.example.test/1', ...HOSTLESS, 'https://jobs.example.test/embed')), null);
  for (const frameUrl of ['https://private.example.test/admin', 'http://127.0.0.1/', 'https://nowhere.example.test/', 'file:///etc/hosts']) {
    assert.ok(await rejectLandedPage(pageWith('https://jobs.example.test/1', 'about:blank', frameUrl)), frameUrl);
  }
  assert.equal((await rejectLandedPage(pageWith('about:blank')))?.code, 'unsupported_protocol', 'the allowance is for frames, not the page');
});

const HOSTLESS = ['', 'about:blank', 'about:srcdoc', 'data:text/html,hi', 'blob:https://jobs.example.test/0b1c', 'chrome-error://chromewebdata/'];
const fakePage = (url) => {
  const context = new EventEmitter();
  return Object.assign(new EventEmitter(), { url: () => url, context: () => context });
};
const respond = (page, url, serverAddr) => page.context().emit('response', { url: () => url, serverAddr });
const from = (ipAddress, port = 443) => async () => ({ ipAddress, port });
const commit = (page, url) => page.emit('framenavigated', { url: () => url });

test('recordLandedUrls resolves each host a frame committed to once, and skips frames no host answered', async (t) => {
  const lookups = [];
  t.after(setHostResolver(async (host) => { lookups.push(host); return stubResolver(host); }));
  const page = fakePage('https://jobs.example.test/1');
  const rejectVisited = recordLandedUrls(page);
  for (const url of ['https://jobs.example.test/1', ...HOSTLESS, 'https://embed.example.test/a', 'https://embed.example.test/a']) commit(page, url);
  ANSWERS['embed.example.test'] = ['93.184.216.34'];
  t.after(() => { delete ANSWERS['embed.example.test']; });
  assert.equal(await rejectVisited(), null);
  assert.deepEqual(lookups, ['jobs.example.test', 'embed.example.test']);
});

test('recordLandedUrls refuses when any frame was ever at a refused address, wherever it is now', async (t) => {
  t.after(setHostResolver(stubResolver));
  for (const visited of ['https://private.example.test/admin', 'http://127.0.0.1/', 'https://nowhere.example.test/', 'file:///etc/hosts']) {
    const page = fakePage('https://jobs.example.test/1');
    const rejectVisited = recordLandedUrls(page);
    assert.equal(await rejectVisited(), null, 'nothing recorded yet');
    for (const url of ['https://jobs.example.test/1', visited, 'about:blank']) commit(page, url);
    assert.ok(await rejectVisited(), visited);
  }
});

test('recordLandedUrls records a popup, and judges the page itself strictly', async (t) => {
  t.after(setHostResolver(stubResolver));
  const page = fakePage('https://jobs.example.test/1');
  const rejectVisited = recordLandedUrls(page);
  const popup = fakePage('about:blank');
  page.emit('popup', popup);
  assert.equal(await rejectVisited(), null, 'a blank popup is not a refusal');
  commit(popup, 'https://private.example.test/admin');
  assert.match((await rejectVisited())?.reason, /private target IP 10\.0\.0\.5/);

  const opened = fakePage('https://jobs.example.test/1');
  const rejectOpened = recordLandedUrls(opened);
  opened.emit('popup', fakePage('https://metadata.example.test/latest'));
  assert.ok(await rejectOpened(), 'a popup that had already landed when it was announced');

  const blank = fakePage('about:blank');
  assert.equal((await recordLandedUrls(blank)())?.code, 'unsupported_protocol', 'the allowance is for recorded frames, not the page');
});

test('recordLandedUrls judges a response by the address it came from, whatever its URL says', async (t) => {
  t.after(setHostResolver(async (host) => { throw new Error(`no lookup expected for ${host}`); }));
  for (const address of ['10.0.0.5', '127.0.0.1', '169.254.169.254', '::1', '[fd00::1]', '::ffff:10.0.0.5']) {
    const page = fakePage('about:blank');
    const rejectVisited = recordLandedUrls(page);
    respond(page, 'https://jobs.example.test/logo.png', from(address));
    assert.deepEqual(await rejectVisited(), { code: 'blocked_host', reason: `Access denied: a response came from private target IP ${address}` });
  }
});

test('recordLandedUrls passes a response from a public address without resolving its name', async (t) => {
  const lookups = [];
  t.after(setHostResolver(async (host) => { lookups.push(host); return stubResolver(host); }));
  const page = fakePage('https://jobs.example.test/1');
  const rejectVisited = recordLandedUrls(page);
  respond(page, 'https://private.example.test/admin', from('93.184.216.34'));
  respond(page, 'https://nowhere.example.test/x.js', from('[2606:2800:220:1::1]'));
  assert.equal(await rejectVisited(), null);
  assert.deepEqual(lookups, ['jobs.example.test'], 'only the page URL was resolved');
});

test('recordLandedUrls judges a response with no address by its URL', async (t) => {
  t.after(setHostResolver(stubResolver));
  const noAddress = async () => null;
  const lookupFailed = async () => { throw new Error('Target page, context or browser has been closed'); };
  for (const serverAddr of [noAddress, lookupFailed]) {
    const page = fakePage('https://jobs.example.test/1');
    const rejectVisited = recordLandedUrls(page);
    for (const url of ['https://jobs.example.test/cached.js', 'data:text/plain,hi', 'blob:https://jobs.example.test/0b1c']) respond(page, url, serverAddr);
    assert.equal(await rejectVisited(), null);
    respond(page, 'https://private.example.test/cached.js', serverAddr);
    assert.match((await rejectVisited())?.reason, /private target IP 10\.0\.0\.5/);
  }
});

const openSocket = (page, url) => {
  const socket = Object.assign(new EventEmitter(), { url: () => url });
  page.emit('websocket', socket);
  return socket;
};

test('recordLandedUrls judges a WebSocket by its URL, on the page and on a popup', async (t) => {
  t.after(setHostResolver(stubResolver));
  const open = openSocket;
  for (const [url, refused] of [['wss://jobs.example.test/live', false], ['ws://private.example.test:8080/ws', true], ['wss://private.example.test/ws', true], ['ws://127.0.0.1:9229/', true]]) {
    const page = fakePage('https://jobs.example.test/1');
    const rejectVisited = recordLandedUrls(page);
    open(page, url);
    assert.equal(Boolean(await rejectVisited()), refused, url);

    const opener = fakePage('https://jobs.example.test/1');
    const rejectOpener = recordLandedUrls(opener);
    const popup = fakePage('about:blank');
    opener.emit('popup', popup);
    open(popup, url);
    assert.equal(Boolean(await rejectOpener()), refused, `popup ${url}`);
  }
});

test('readLanded returns what the read returned and asks for no verdict', async () => {
  assert.equal(await readLanded(async () => { throw new Error('verdict must not be asked'); }, Promise.resolve('body text')), 'body text');
});

test('readLanded asks the recorder before it reports a failed read, and never repeats what was thrown', async () => {
  const thrown = Object.assign(new Error(`THROWN ${INTERNAL} message`), { name: `${INTERNAL} name` });
  const verdict = { code: 'blocked_host', reason: 'Access denied: a response came from private target IP 10.0.0.5' };
  for (const refused of [verdict, null]) {
    const failure = await readLanded(async () => refused, Promise.reject(thrown)).then(() => null, (err) => err);
    assert.equal(failure.refused, refused);
    assert.equal(failure.message, refused ? verdict.reason : 'a read of the page failed');
    assert.doesNotMatch(`${failure.name} ${failure.message} ${failure.stack} ${String(failure.cause)}`, new RegExp(INTERNAL));
  }
});

test('LIVENESS_CONTEXT_OPTIONS blocks service workers', () => {
  assert.equal(LIVENESS_CONTEXT_OPTIONS.serviceWorkers, 'block');
});

test('recordLandedUrls judges each distinct dialled address once', async (t) => {
  t.after(setHostResolver(stubResolver));
  const judged = [];
  t.after(setDialledAddressJudge(({ ipAddress, port }) => { judged.push(`${ipAddress}:${port}`); return false; }));
  const page = fakePage('https://jobs.example.test/1');
  const rejectVisited = recordLandedUrls(page);
  for (const path of ['a.png', 'b.png', 'c.js']) respond(page, `https://jobs.example.test/${path}`, from('93.184.216.34'));
  respond(page, 'https://cdn.example.test/d.js', from('93.184.216.35'));
  assert.equal(await rejectVisited(), null);
  assert.deepEqual(judged, ['93.184.216.34:443', '93.184.216.35:443']);
});

// Each script, inside the function that drives the page: the context-bound
// guard, the recorder, the navigation, the landed check, every read, then the
// check of everything recorded.
const URL_CHECK = 'rejectLandedUrl(page.url())';
const RECORD = 'const rejectVisited = recordLandedUrls(page);';
const NO_SERVICE_WORKERS = "{ serviceWorkers: 'block' }";
const CONTEXT_CREATED = /browser\.new(?:Context|Page)\(([^)]*)\)/g;
const SITES = {
  'browser-extract.mjs': { created: 'LIVENESS_CONTEXT_OPTIONS', guard: 'await installEgressGuard(context);', check: URL_CHECK, first: 'readDom(page)', last: 'readDom(page)' },
  'batch-evaluate-gemini.mjs': { created: NO_SERVICE_WORKERS, guard: 'await installEgressGuard(page.context());', check: URL_CHECK, first: 'page.evaluate(', last: 'page.evaluate(' },
  'archive-posting.mjs': { created: NO_SERVICE_WORKERS, guard: 'await installEgressGuard(context);', check: 'rejectLandedPage(page)', first: 'page.title(', last: 'page.pdf(' },
  'upskill.mjs': { created: NO_SERVICE_WORKERS, guard: 'await installEgressGuard(page.context());', check: URL_CHECK, first: 'page.innerText(', last: 'page.innerText(' },
};
const PAGE_READ = /\bpage\.(?:evaluate|title|innerText|innerHTML|content|textContent|\$\$?(?:eval)?|locator|getBy\w+|frames|waitForSelector|pdf|screenshot)\(|\breadDom\(page\)/g;
const ACTED_ON_CHECK = /const (\w+) = await (reject(?:Landed\w+|Visited)\([^;]*\));\s*if \(\1\)/g;

for (const [file, { created, guard, check, first, last }] of Object.entries(SITES)) {
  test(`${file} blocks service workers, guards the context, records every frame navigation and checks before its first read and after its last`, () => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /installEgressGuard\(page\)/, 'the guard must be on the context, not the page');
    const guardAt = source.indexOf(guard);
    assert.notEqual(guardAt, -1, `expected ${guard}`);
    assert.equal([...source.slice(0, guardAt).matchAll(CONTEXT_CREATED)].at(-1)?.[1], created, 'the guarded context is created with service workers blocked');
    const body = source.slice(guardAt).split(/\n}\n/)[0];
    const gotoAt = body.indexOf('page.goto(');
    const recordAt = body.indexOf(RECORD);
    const checks = [...body.matchAll(ACTED_ON_CHECK)];
    const reads = [...body.matchAll(PAGE_READ)];
    assert.ok(gotoAt > 0, 'navigation follows the guard');
    assert.ok(recordAt > 0 && recordAt < gotoAt, `expected ${RECORD} before the navigation`);
    assert.equal(body.match(/reject(?:Landed\w+|Visited)\(/g).length, checks.length, 'every check is assigned and branched on');
    assert.deepEqual(checks.map((m) => m[2]), [check, 'rejectVisited()'], 'the page as it is now before the first read, everything recorded after the last');
    assert.deepEqual([reads[0]?.[0], reads.at(-1)?.[0]], [first, last], 'first and last read of page content');
    assert.ok(checks[0].index > gotoAt, 'the first landed check follows the navigation');
    assert.ok(reads[0].index > checks[0].index, 'a landed check precedes the first read');
    assert.ok(reads.at(-1).index < checks.at(-1).index, 'the check of everything recorded follows the last read');
  });
}

// Chromium resolves names itself, so the two test names are mapped to the local
// server with --host-resolver-rules while the guard's resolver calls one public
// and the other private. No request leaves the machine. Every address Chromium
// dials is therefore loopback, so the server has a second listener and the
// address rule is told that this one is the private host.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==', 'base64');
const INTERNAL = 'ZX81';
const POSTING = `<h1>Engineer</h1><p>${'Platform engineer role with responsibilities and requirements. '.repeat(30)}</p>`;
async function chromiumAndServer(t, { realAddressRule = false } = {}) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.example.test 127.0.0.1'] });
  } catch (err) {
    if (toolRequired('browser')) throw err;
    t.skip('no Chromium');
    return null;
  }
  let releaseSignal;
  const signal = new Promise((resolve) => { releaseSignal = resolve; });
  const privateHits = [];
  const sharedWorkerActions = {
    fetch: () => `fetch('http://${privateOrigin()}/cors').then((r) => r.text())`,
    socket: () => `new Promise((resolve, reject) => { const socket = new WebSocket('ws://${privateOrigin()}/ws'); socket.onmessage = (e) => resolve(e.data); socket.onerror = reject; })`,
  };
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
    else if (req.url === '/armed-posting') html(res, `${POSTING}<script>fetch('/armed')</script>`);
    else if (req.url.startsWith('/shared.js?')) send(res, 'text/javascript', `onconnect = (e) => { ${sharedWorkerActions[req.url.split('?')[1]]()}.then((text) => e.ports[0].postMessage(text), () => e.ports[0].postMessage('failed')); };`);
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
  return { browser, warned, logged, releaseSignal, privatePort, privateHits, publicUrl: (path) => `http://jobs.example.test:${server.address().port}${path}` };
}

test('real Chromium: a 302 to a private-resolving name is not routed, and its landed URL is refused', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const context = await env.browser.newContext();
  await installEgressGuard(context);
  const page = await context.newPage();
  await page.goto(env.publicUrl('/start'));

  assert.equal(new URL(page.url()).hostname, 'private.example.test', 'the redirect was followed');
  assert.equal(env.warned.mock.callCount(), 0, 'the route guard never saw the hop, or it would have aborted it');
  const verdict = await rejectLandedUrl(page.url());
  assert.equal(verdict?.code, 'blocked_host');
  assert.match(verdict.reason, /private target IP 10\.0\.0\.5/);
});

const REFUSED = /refusing to archive restricted destination after redirect: .*private target IP 10\.0\.0\.5/;

// archiveUrl's first read is the title, which follows its first landed check,
// and its last is the PDF render. `moveThePage` runs between the two and
// returns once the page has finished moving; `atRender` sees the page as the
// render starts.
const hooked = (env, moveThePage, atRender) => ({ newContext: async () => {
  const context = await env.browser.newContext();
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    const title = page.title.bind(page);
    const pdf = page.pdf.bind(page);
    page.title = async () => {
      await moveThePage(page);
      return title();
    };
    page.pdf = (options) => { atRender(page); return pdf(options); };
    return page;
  };
  return context;
} });

test('real Chromium: archiveUrl writes nothing when the page redirects itself to a private name after the first check', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  let urlAtRender = null;
  const browser = hooked(env, async (page) => {
    env.releaseSignal();
    await page.waitForURL('**/landed');
  }, (page) => { urlAtRender = page.url(); });
  const before = archived();
  await assert.rejects(archiveUrl(browser, env.publicUrl('/self-redirect')), REFUSED);
  assert.equal(new URL(urlAtRender).hostname, 'private.example.test', 'the first check passed and the internal page was rendered');
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl writes nothing when an iframe visits a private name and is pointed back before the render', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  let framesAtRender = null;
  const browser = hooked(env, async (page) => {
    const backFromPrivate = new Promise((resolve) => {
      let wasPrivate = false;
      page.on('framenavigated', (frame) => {
        if (frame.url().endsWith('/landed')) wasPrivate = true;
        else if (wasPrivate && frame.url().endsWith('/embed')) resolve();
      });
    });
    env.releaseSignal();
    await backFromPrivate;
  }, (page) => { framesAtRender = page.frames().map((frame) => new URL(frame.url()).hostname); });
  const before = archived();
  await assert.rejects(archiveUrl(browser, env.publicUrl('/flip')), REFUSED);
  assert.deepEqual(framesAtRender, ['jobs.example.test', 'jobs.example.test'], 'every frame was back on the public name when the render started');
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl refuses a page whose iframe visited a private name once and is gone', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  let framesAtRender = null;
  const browser = hooked(env, async () => {}, (page) => { framesAtRender = page.frames().length; });
  const before = archived();
  await assert.rejects(archiveUrl(browser, env.publicUrl('/visit-once')), REFUSED);
  assert.equal(framesAtRender, 1, 'only the main frame was left, on the public name, when the render started');
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl refuses a page that opened a popup onto a private name', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived();
  await assert.rejects(archiveUrl(env.browser, env.publicUrl('/popup')), REFUSED);
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl refuses a page whose iframe was redirected to a private name', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived();
  await assert.rejects(archiveUrl(env.browser, env.publicUrl('/framed')), REFUSED);
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl still archives a posting with a public iframe and hostless ones', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived().length;
  await archiveUrl(env.browser, env.publicUrl('/posting'));
  assert.equal(archived().length, before + 1);
});

// The page's first read waits until the private listener has answered, as a
// response or as a WebSocket frame, so the refusal never depends on the 2 s
// hydration wait being long enough.
const readsAfterPrivateAnswer = (env) => ({ newContext: async () => {
  const context = await env.browser.newContext();
  const newPage = context.newPage.bind(context);
  context.newPage = async () => {
    const page = await newPage();
    const answered = new Promise((resolve) => {
      context.on('response', (response) => { if (new URL(response.url()).port === String(env.privatePort)) resolve(); });
      page.on('websocket', (socket) => socket.on('framereceived', resolve));
    });
    const title = page.title.bind(page);
    page.title = async () => {
      await answered;
      return title();
    };
    return page;
  };
  return context;
} });

const REFUSED_BY_ADDRESS = /refusing to archive restricted destination after redirect: .*a response came from private target IP 127\.0\.0\.1/;
for (const [what, path, refused] of [
  ['an image', '/with-img', REFUSED_BY_ADDRESS],
  ['a stylesheet', '/with-stylesheet', REFUSED_BY_ADDRESS],
  ['a script', '/with-script', REFUSED_BY_ADDRESS],
  ['a fetch', '/with-fetch', REFUSED_BY_ADDRESS],
  ['a WebSocket', '/with-websocket', REFUSED],
]) {
  test(`real Chromium: archiveUrl refuses a page that received ${what} from a private host`, { timeout: 60_000 }, async (t) => {
    const env = await chromiumAndServer(t);
    if (!env) return;
    const before = archived();
    await assert.rejects(archiveUrl(readsAfterPrivateAnswer(env), env.publicUrl(path)), refused);
    assert.deepEqual(archived(), before);
  });
}

test('real Chromium: archiveUrl archives a posting with public subresources and one the route guard aborted', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived().length;
  await archiveUrl(env.browser, env.publicUrl('/public-assets'));
  assert.equal(archived().length, before + 1);
  assert.equal(env.warned.mock.callCount(), 1, 'the image on the private name was aborted by the route guard');
});

test('real Chromium: nothing from an internal page is printed or quoted when the run is refused', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const browser = hooked(env, async (page) => {
    env.releaseSignal();
    await page.waitForURL('**/payroll');
  }, () => {});
  const before = archived();
  const refusal = await archiveUrl(browser, env.publicUrl('/self-redirect-to-payroll')).then(() => null, (err) => err);
  assert.match(refusal?.message ?? '', /refusing to archive restricted destination after redirect/);
  const output = [refusal.message, ...env.logged.mock.calls.map((call) => call.arguments.join(' '))].join('\n');
  assert.doesNotMatch(output, new RegExp(INTERNAL), 'the internal title and heading stay out of stdout and the error');
  assert.deepEqual(archived(), before);
});

test('real Chromium: a name the lookup calls public is refused when Chromium dialled a private address for it', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t, { realAddressRule: true });
  if (!env) return;
  const before = archived();
  await assert.rejects(archiveUrl(env.browser, env.publicUrl('/posting')), REFUSED_BY_ADDRESS);
  assert.deepEqual(archived(), before);
});

// The page's first read waits for `ready`, a signal from the page or its
// socket, so no case depends on the 2 s hydration wait being long enough.
const readsWhen = (env, ready) => ({ newContext: async (options) => {
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
const pageArmed = (context) => new Promise((resolve) => {
  context.on('response', (response) => { if (new URL(response.url()).pathname === '/armed') resolve(); });
});
const socketGaveUp = (context, page) => new Promise((resolve) => {
  page.on('websocket', (socket) => { socket.on('socketerror', resolve); socket.on('close', resolve); });
});

test('real Chromium: archiveUrl refuses a page whose WebSocket to a private host sent only a close frame with a reason', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const errors = t.mock.method(console, 'error', () => {});
  const before = archived();
  const refusal = await archiveUrl(readsWhen(env, socketGaveUp), env.publicUrl('/with-closing-socket')).then(() => null, (err) => err);
  assert.match(refusal?.message ?? '', REFUSED);
  assert.deepEqual(env.privateHits, ['/close'], 'the private host answered the handshake');
  const printed = [env.logged, env.warned, errors].flatMap((mock) => mock.mock.calls.map((call) => call.arguments.join(' ')));
  assert.doesNotMatch([refusal.message, refusal.stack, ...printed].join('\n'), new RegExp(INTERNAL));
  assert.deepEqual(archived(), before);
});

for (const [what, query] of [
  ['a fetch', 'fetch'],
  ['a WebSocket', 'socket'],
  ['a fetch, with the constructor taken from a new iframe', 'fetch&iframe'],
]) {
  test(`real Chromium: a page has no SharedWorker to reach a private host with ${what}, and is archived without it`, { timeout: 60_000 }, async (t) => {
    const env = await chromiumAndServer(t);
    if (!env) return;
    const before = archived().length;
    await archiveUrl(readsWhen(env, pageArmed), env.publicUrl(`/with-shared-worker?${query}`));
    assert.deepEqual(env.privateHits, [], 'nothing reached the private host, so none of its text is in any output');
    assert.equal(archived().length, before + 1, 'the page found no constructor, carried on and was kept');
  });
}

test('real Chromium: archiveUrl refuses, and repeats nothing, when a read throws text the page took from a private host', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const errors = t.mock.method(console, 'error', () => {});
  const before = archived();
  const refusal = await archiveUrl(readsWhen(env, pageArmed), env.publicUrl('/throws')).then(() => null, (err) => err);
  assert.match(refusal?.message ?? '', REFUSED_BY_ADDRESS);
  const printed = [env.logged, env.warned, errors].flatMap((mock) => mock.mock.calls.map((call) => call.arguments.join(' ')));
  assert.doesNotMatch([refusal.message, refusal.stack, ...printed].join('\n'), new RegExp(INTERNAL));
  assert.deepEqual(archived(), before);
});

// browser-extract.mjs reports a failed read from its main, so the CLI runs as a
// child with `playwright` swapped (a module hook) for the real one plus this
// file's seams: the resolver, the address rule, the name mapping, and a first
// read that waits for the page's signal.
function extractCli(t, env, path) {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-landed-cli-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  const href = (...parts) => pathToFileURL(join(...parts)).href;
  writeFileSync(join(dir, 'playwright.mjs'), `
import { chromium as real } from ${JSON.stringify(href(ROOT, 'node_modules', 'playwright', 'index.mjs'))};
import { setDialledAddressJudge, setHostResolver } from ${JSON.stringify(href(ROOT, 'liveness-browser.mjs'))};
const { answers, privatePort } = JSON.parse(process.env.LANDED_TEST);
setHostResolver(async (host) => answers[host] ?? []);
setDialledAddressJudge(({ port }) => port === privatePort);
export const chromium = { launch: async (options) => {
  const browser = await real.launch({ ...options, args: ['--host-resolver-rules=MAP *.example.test 127.0.0.1'] });
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (contextOptions) => {
    const context = await newContext(contextOptions);
    const armed = new Promise((resolve) => {
      context.on('response', (response) => { if (new URL(response.url()).pathname === '/armed') resolve(); });
    });
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      const evaluate = page.evaluate.bind(page);
      page.evaluate = async (...args) => {
        await armed;
        return evaluate(...args);
      };
      return page;
    };
    return context;
  };
  return browser;
} };
`);
  writeFileSync(join(dir, 'hooks.mjs'), `
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'playwright') return { url: ${JSON.stringify(href(dir, 'playwright.mjs'))}, shortCircuit: true };
  return nextResolve(specifier, context);
}
`);
  writeFileSync(join(dir, 'register.mjs'), `import { register } from 'node:module';\nregister(${JSON.stringify(href(dir, 'hooks.mjs'))});\n`);
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', href(dir, 'register.mjs'), join(ROOT, 'browser-extract.mjs'), env.publicUrl(path)], {
      cwd: dir, timeout: 50_000,
      env: { ...process.env, LANDED_TEST: JSON.stringify({ answers: ANSWERS, privatePort: env.privatePort }) },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

test('real Chromium: browser-extract.mjs reports the refusal, and nothing else, when its read throws text the page took from a private host', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const { code, stdout, stderr } = await extractCli(t, env, '/throws');
  const reported = JSON.parse(stderr.split('\n').find((line) => line.startsWith('{')) ?? 'null');
  assert.equal(code, 1);
  assert.equal(stdout, '');
  assert.equal(reported?.code, 'blocked_host', stderr);
  assert.match(reported.error, /^blocked final URL: .*a response came from private target IP 127\.0\.0\.1$/);
  assert.doesNotMatch(stderr, new RegExp(INTERNAL));
});

test('real Chromium: browser-extract.mjs still extracts a posting through the same child', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const { code, stdout, stderr } = await extractCli(t, env, '/armed-posting');
  assert.equal(code, 0, stderr);
  assert.match(JSON.parse(stdout).text, /Platform engineer role/);
});

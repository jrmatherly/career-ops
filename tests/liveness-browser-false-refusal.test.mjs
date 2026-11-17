// tests/liveness-browser-false-refusal.test.mjs. `scan --verify` keeps
// blocked_host and unsupported_protocol for good, so checkUrlLiveness must not
// give either to a healthy public posting: not for what the previous posting
// on the reused page left behind, not for a name with no usable address, not
// for a page that ended on about:blank. The refusals themselves are in
// tests/liveness-browser-landed-guard.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { toolRequired } from './required-tools.mjs';
import { HOST_RESOLVER_RULES } from './landed-url-guard-fixtures.mjs';
import { checkUrlLiveness, newLivenessPage, setDialledAddressJudge, setHostResolver } from '../liveness-browser.mjs';

const POSTING = `<h1>Engineer</h1><p>${'Platform engineer role with responsibilities and requirements. '.repeat(30)}</p><button>Apply now</button>`;
const CLOSED = '<h1>Engineer</h1><p>This job is no longer available.</p>';
const html = (res, body) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>Engineer | Acme</title><body>${body}</body>`);
const ANSWERS = { 'private.example.test': ['10.0.0.5'], 'dead.example.test': [], 'sink.example.test': ['0.0.0.0'] };
const ACTIVE = ['active', 'apply_control_visible'];
const shape = ({ result, code }) => [result, code];

async function setup(t) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: [HOST_RESOLVER_RULES] });
  } catch (err) {
    if (toolRequired('browser')) throw err;
    t.skip('no Chromium');
    return null;
  }
  const internal = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/html', 'access-control-allow-origin': '*' }).end(CLOSED);
  });
  const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await listen(internal);
  const internalPort = internal.address().port;
  const privateUrl = (path) => `http://private.example.test:${internalPort}${path}`;
  const hits = [];
  const start = createServer(async (req, res) => {
    const { pathname, searchParams } = new URL(req.url, 'http://jobs.example.test');
    hits.push(pathname);
    const port = start.address().port;
    const page = searchParams.get('page');
    if (pathname === '/to') res.writeHead(302, { location: `http://${searchParams.get('host')}.example.test:${port}/jobs/3141592653` }).end();
    else if (pathname === '/late') {
      await delay(Number(searchParams.get('ms')));
      res.writeHead(302, { location: privateUrl('/late') }).end();
    } else if (pathname === '/slow') {
      await delay(Number(searchParams.get('ms')));
      html(res, POSTING);
    } else if (pathname === '/poploop') html(res, `<script>setInterval(() => fetch(${JSON.stringify(privateUrl('/poploop'))}, { mode: 'no-cors' }).catch(() => {}), 100)</script>`);
    else if (page === 'inflight') html(res, `${POSTING}<script>fetch('/late?ms=500', { mode: 'no-cors' }).catch(() => {})</script>`);
    // The private answer replaces the posting, so a check that read it would call the posting closed.
    else if (page === 'swap') html(res, `${POSTING}<script>fetch('/late?ms=500').then((r) => r.text()).then((text) => { document.body.innerHTML = text; })</script>`);
    else if (page === 'popup') html(res, `${POSTING}<script>window.open('/poploop')</script>`);
    else if (page === 'latepopup') html(res, `${POSTING}<script>setTimeout(() => window.open('/poploop'), 500)</script>`);
    else if (page === 'socket') html(res, `${POSTING}<script>new WebSocket('ws://${searchParams.get('host')}.example.test:${port}/ws')</script>`);
    else if (page === 'blank') html(res, `Loading<script>setTimeout(() => location.replace('about:blank'), 300)</script>`);
    else html(res, POSTING);
  });
  await listen(start);
  t.after(setHostResolver(async (host) => ANSWERS[host] ?? ['93.184.216.34']));
  // Every name is mapped to loopback, so the private listener is named by its port.
  t.after(setDialledAddressJudge(({ port }) => port === internalPort));
  t.mock.method(console, 'warn', () => {});
  t.after(async () => {
    await browser.close();
    for (const server of [internal, start]) {
      server.close();
      server.closeAllConnections();
    }
  });
  return { browser, hits, url: (path) => `http://jobs.example.test:${start.address().port}${path}` };
}

test('real Chromium: a private response to a request the previous posting left in flight does not refuse the next posting', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  assert.deepEqual(shape(await checkUrlLiveness(page, env.url('/jobs/1618033988?page=inflight'))), ACTIVE);
  const next = await checkUrlLiveness(page, env.url('/slow?ms=1500&job=2236067977'));
  assert.deepEqual(shape(next), ACTIVE, next.reason);
});

test('real Chromium: a popup one posting opened is closed with its check, and does not refuse the next posting', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  assert.deepEqual(shape(await checkUrlLiveness(page, env.url('/jobs/1618033988?page=popup'))), ACTIVE);
  assert.equal(page.context().pages().length, 1, 'the popup was closed');
  const next = await checkUrlLiveness(page, env.url('/slow?ms=400&job=2236067977'));
  assert.deepEqual(shape(next), ACTIVE, next.reason);
});

test('real Chromium: a posting cannot open a popup after its check has ended', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  assert.deepEqual(shape(await checkUrlLiveness(page, env.url('/jobs/1618033988?page=latepopup'))), ACTIVE);
  await delay(900);
  assert.equal(page.context().pages().length, 1);
  const next = await checkUrlLiveness(page, env.url('/slow?ms=400&job=2236067977'));
  assert.deepEqual(shape(next), ACTIVE, next.reason);
});

test('real Chromium: what a document already on the page has in flight does not refuse the first posting checked on it', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  await page.goto(env.url('/jobs/1618033988?page=inflight'));
  const first = await checkUrlLiveness(page, env.url('/slow?ms=1500&job=2236067977'));
  assert.deepEqual(shape(first), ACTIVE, first.reason);
});

test('real Chromium: a second check that differs only in its fragment reads a document of its own, not the one the first check left', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  const url = env.url('/jobs/1618033988?page=swap');
  assert.deepEqual(shape(await checkUrlLiveness(page, url)), ACTIVE);
  // Long enough for the first document's private answer to arrive and be written into it.
  const again = await checkUrlLiveness(page, `${url}#again`, { extraSettleMs: 1200 });
  assert.deepEqual(shape(again), ['uncertain', 'blocked_host'], again.reason);
  assert.equal(env.hits.filter((path) => path === '/jobs/1618033988').length, 2, 'the second check loaded the page itself');
});

test('real Chromium: a name with no usable address is a transient DNS verdict for the landed page and nothing for a socket', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const check = async (path) => {
    const page = await newLivenessPage(env.browser);
    try {
      return await checkUrlLiveness(page, env.url(path));
    } finally {
      await page.context().close();
    }
  };
  assert.deepEqual(shape(await check('/to?host=dead')), ['uncertain', 'dns_no_addresses']);
  assert.deepEqual(shape(await check('/to?host=sink')), ['uncertain', 'dns_sinkhole']);
  assert.deepEqual(shape(await check('/jobs/1618033988?page=socket&host=dead')), ACTIVE);
  assert.deepEqual(shape(await check('/jobs/1618033988?page=socket&host=sink')), ACTIVE);
  assert.deepEqual(shape(await check('/to?host=private')), ['uncertain', 'blocked_host']);
  assert.deepEqual(shape(await check('/jobs/1618033988?page=socket&host=private')), ['uncertain', 'blocked_host']);
});

test('real Chromium: a page that replaces itself with about:blank is judged by the classifier, not refused', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  const verdict = await checkUrlLiveness(page, env.url('/jobs/1618033988?page=blank'));
  assert.deepEqual(shape(verdict), ['uncertain', 'redirected_off_posting'], verdict.reason);
});

// tests/landed-url-guard.test.mjs. A redirect never reaches the route guard, so
// the landed URL is judged by DNS before any script reads the page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { toolRequired } from './required-tools.mjs';
import { installEgressGuard, rejectLandedUrl, setHostResolver } from '../liveness-browser.mjs';

const ANSWERS = {
  'private.example.test': ['10.0.0.5'],
  'metadata.example.test': ['169.254.169.254'],
  'mixed.example.test': ['93.184.216.34', '10.0.0.5'],
  'jobs.example.test': ['93.184.216.34'],
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

// Each script, from its guard call on: the context-bound guard, then the
// navigation, then the landed check, then the first read of page content.
const SITES = {
  'browser-extract.mjs': { guard: 'await installEgressGuard(context);', read: 'readDom(page)' },
  'batch-evaluate-gemini.mjs': { guard: 'await installEgressGuard(page.context());', read: 'page.evaluate(' },
  'archive-posting.mjs': { guard: 'await installEgressGuard(context);', read: 'page.title(' },
  'upskill.mjs': { guard: 'await installEgressGuard(page.context());', read: 'page.innerText(' },
};

for (const [file, { guard, read }] of Object.entries(SITES)) {
  test(`${file} guards the context and checks the landed URL before reading the page`, () => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /installEgressGuard\(page\)/, 'the guard must be on the context, not the page');
    const guardAt = source.indexOf(guard);
    assert.notEqual(guardAt, -1, `expected ${guard}`);
    const rest = source.slice(guardAt);
    const gotoAt = rest.indexOf('page.goto(');
    const landedAt = rest.indexOf('await rejectLandedUrl(');
    const reads = [...rest.matchAll(/\bpage\.(?:evaluate|title|innerText|content|\$eval|\$\$eval|textContent|locator|pdf|screenshot)\(|\breadDom\(page\)/g)];
    assert.ok(gotoAt > 0, 'navigation follows the guard');
    assert.ok(landedAt > gotoAt, 'the landed check follows the navigation');
    assert.equal(reads[0]?.[0], read, 'first read of page content');
    assert.ok(reads[0].index > landedAt, 'the landed check precedes the first read');
  });
}

// Chromium resolves names itself, so the two test names are mapped to the local
// server with --host-resolver-rules while the guard's resolver calls one public
// and the other private. No request leaves the machine.
test('real Chromium: a 302 to a private-resolving name is not routed, and its landed URL is refused', { timeout: 60_000 }, async (t) => {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: ['--host-resolver-rules=MAP *.example.test 127.0.0.1'] });
  } catch (err) {
    if (toolRequired('browser')) throw err;
    t.skip('no Chromium');
    return;
  }
  const server = createServer((req, res) => {
    if (req.url === '/start') {
      res.writeHead(302, { location: `http://private.example.test:${server.address().port}/landed` }).end();
    } else {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<body>internal secret</body>');
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    await browser.close().catch(() => {});
    server.close();
  });
  t.after(setHostResolver(stubResolver));
  const blocked = t.mock.method(console, 'warn', () => {});

  const context = await browser.newContext();
  await installEgressGuard(context);
  const page = await context.newPage();
  await page.goto(`http://jobs.example.test:${server.address().port}/start`);

  assert.equal(new URL(page.url()).hostname, 'private.example.test', 'the redirect was followed');
  assert.equal(blocked.mock.callCount(), 0, 'the route guard never saw the hop, or it would have aborted it');
  const verdict = await rejectLandedUrl(page.url());
  assert.equal(verdict?.code, 'blocked_host');
  assert.match(verdict.reason, /private target IP 10\.0\.0\.5/);
});

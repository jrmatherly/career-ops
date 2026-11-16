// tests/landed-url-guard.test.mjs. A redirect never reaches the route guard, so
// the landed URL is judged by DNS before any script reads the page and again
// after its last read.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { toolRequired } from './required-tools.mjs';
import { installEgressGuard, rejectLandedPage, rejectLandedUrl, setHostResolver } from '../liveness-browser.mjs';

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
  const hostless = ['', 'about:blank', 'about:srcdoc', 'data:text/html,hi', 'blob:https://jobs.example.test/0b1c', 'chrome-error://chromewebdata/'];
  assert.equal(await rejectLandedPage(pageWith('https://jobs.example.test/1', ...hostless, 'https://jobs.example.test/embed')), null);
  for (const frameUrl of ['https://private.example.test/admin', 'http://127.0.0.1/', 'https://nowhere.example.test/', 'file:///etc/hosts']) {
    assert.ok(await rejectLandedPage(pageWith('https://jobs.example.test/1', 'about:blank', frameUrl)), frameUrl);
  }
  assert.equal((await rejectLandedPage(pageWith('about:blank')))?.code, 'unsupported_protocol', 'the allowance is for frames, not the page');
});

// Each script, inside the function that drives the page: the context-bound
// guard, the navigation, the landed check, every read, the landed check again.
const URL_CHECK = 'rejectLandedUrl(page.url())';
const SITES = {
  'browser-extract.mjs': { guard: 'await installEgressGuard(context);', check: URL_CHECK, first: 'readDom(page)', last: 'readDom(page)' },
  'batch-evaluate-gemini.mjs': { guard: 'await installEgressGuard(page.context());', check: URL_CHECK, first: 'page.evaluate(', last: 'page.evaluate(' },
  'archive-posting.mjs': { guard: 'await installEgressGuard(context);', check: 'rejectLandedPage(page)', first: 'page.title(', last: 'page.pdf(' },
  'upskill.mjs': { guard: 'await installEgressGuard(page.context());', check: URL_CHECK, first: 'page.innerText(', last: 'page.innerText(' },
};
const PAGE_READ = /\bpage\.(?:evaluate|title|innerText|innerHTML|content|textContent|\$\$?(?:eval)?|locator|getBy\w+|frames|waitForSelector|pdf|screenshot)\(|\breadDom\(page\)/g;
const ACTED_ON_CHECK = /const (\w+) = await (rejectLanded\w+\([^;]*\));\s*if \(\1\)/g;

for (const [file, { guard, check, first, last }] of Object.entries(SITES)) {
  test(`${file} guards the context and checks the landed page before its first read and after its last`, () => {
    const source = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(source, /installEgressGuard\(page\)/, 'the guard must be on the context, not the page');
    const guardAt = source.indexOf(guard);
    assert.notEqual(guardAt, -1, `expected ${guard}`);
    const body = source.slice(guardAt).split(/\n}\n/)[0];
    const gotoAt = body.indexOf('page.goto(');
    const checks = [...body.matchAll(ACTED_ON_CHECK)];
    const reads = [...body.matchAll(PAGE_READ)];
    assert.ok(gotoAt > 0, 'navigation follows the guard');
    assert.equal(body.split('rejectLanded').length - 1, checks.length, 'every landed check is assigned and branched on');
    assert.ok(checks.length >= 2, 'a check before the first read and one after the last');
    assert.deepEqual([...new Set(checks.map((m) => m[2]))], [check], 'the check takes the page as it is now');
    assert.deepEqual([reads[0]?.[0], reads.at(-1)?.[0]], [first, last], 'first and last read of page content');
    assert.ok(checks[0].index > gotoAt, 'the first landed check follows the navigation');
    assert.ok(reads[0].index > checks[0].index, 'a landed check precedes the first read');
    assert.ok(reads.at(-1).index < checks.at(-1).index, 'a landed check follows the last read');
  });
}

// Chromium resolves names itself, so the two test names are mapped to the local
// server with --host-resolver-rules while the guard's resolver calls one public
// and the other private. No request leaves the machine.
const POSTING = `<h1>Engineer</h1><p>${'Platform engineer role with responsibilities and requirements. '.repeat(30)}</p>`;
async function chromiumAndServer(t) {
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
  const html = (res, body) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>Engineer | Acme</title><body>${body}</body>`);
  const server = createServer((req, res) => {
    const toPrivate = () => res.writeHead(302, { location: `http://private.example.test:${server.address().port}/landed` }).end();
    if (req.url === '/start' || req.url === '/redir') toPrivate();
    else if (req.url === '/signal') signal.then(() => res.end('go'));
    else if (req.url === '/self-redirect') html(res, `${POSTING}<script>fetch('/signal').then(() => { location = '/redir'; })</script>`);
    else if (req.url === '/framed') html(res, `<iframe src="/redir"></iframe>${POSTING}`);
    else if (req.url === '/posting') html(res, `<iframe></iframe><iframe srcdoc="<p>widget</p>"></iframe>${POSTING}`);
    else html(res, '<h1>Internal</h1><p>internal secret</p>');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    releaseSignal();
    await browser.close().catch(() => {});
    server.close();
  });
  t.after(setHostResolver(stubResolver));
  const warned = t.mock.method(console, 'warn', () => {});
  t.mock.method(console, 'log', () => {});
  return { browser, warned, releaseSignal, publicUrl: (path) => `http://jobs.example.test:${server.address().port}${path}` };
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

test('real Chromium: archiveUrl writes nothing when the page redirects itself to a private name after the first check', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  // archiveUrl's first read is the title, which follows its first landed check.
  // The page is released to redirect there, so the move lands between the two.
  let urlAtRender = null;
  const browser = { newContext: async () => {
    const context = await env.browser.newContext();
    const newPage = context.newPage.bind(context);
    context.newPage = async () => {
      const page = await newPage();
      const title = page.title.bind(page);
      const pdf = page.pdf.bind(page);
      page.title = async () => {
        env.releaseSignal();
        await page.waitForURL('**/landed');
        return title();
      };
      page.pdf = (options) => { urlAtRender = page.url(); return pdf(options); };
      return page;
    };
    return context;
  } };
  const before = archived();
  await assert.rejects(archiveUrl(browser, env.publicUrl('/self-redirect')), REFUSED);
  assert.equal(new URL(urlAtRender).hostname, 'private.example.test', 'the first check passed and the internal page was rendered');
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl refuses a page whose iframe was redirected to a private name', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived();
  await assert.rejects(archiveUrl(env.browser, env.publicUrl('/framed')), REFUSED);
  assert.deepEqual(archived(), before);
});

test('real Chromium: archiveUrl still archives a posting with hostless iframes', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const before = archived().length;
  await archiveUrl(env.browser, env.publicUrl('/posting'));
  assert.equal(archived().length, before + 1);
});

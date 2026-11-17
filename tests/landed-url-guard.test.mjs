// tests/landed-url-guard.test.mjs. A redirect never reaches the route guard, so
// the landed URL is judged by DNS before any script reads the page, and every
// URL a frame or popup committed to is judged after its last read. A service
// worker is blocked where each context is created, and a read that throws is
// judged before its error is reported, without repeating what was thrown. The
// responses and sockets a page received are in
// tests/landed-url-guard-received.test.mjs, and the shared worker and the CLI
// and batch callers in tests/landed-url-guard-armed.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { toolRequired } from './required-tools.mjs';
import { LIVENESS_CONTEXT_OPTIONS, installEgressGuard, readLanded, recordLandedUrls, rejectLandedPage, rejectLandedUrl, setDialledAddressJudge, setHostResolver } from '../liveness-browser.mjs';
import { ANSWERS, HOST_RESOLVER_RULES, INTERNAL, REFUSED, REFUSED_BY_ADDRESS, archiveUrl, archived, pageArmed, readsWhen, serversFor, stubResolver } from './landed-url-guard-fixtures.mjs';

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
  assert.equal(await readLanded(async () => { throw new Error('verdict must not be asked'); }, Promise.resolve('body text'), 'dom read'), 'body text');
});

test('readLanded asks the recorder before it reports a failed read, and never repeats what was thrown', async () => {
  const thrown = Object.assign(new Error(`THROWN ${INTERNAL} message`), { name: `${INTERNAL} name` });
  const verdict = { code: 'blocked_host', reason: 'Access denied: a response came from private target IP 10.0.0.5' };
  for (const refused of [verdict, null]) {
    const failure = await readLanded(async () => refused, Promise.reject(thrown), 'pdf render').then(() => null, (err) => err);
    assert.equal(failure.refused, refused);
    assert.equal(failure.message, refused ? verdict.reason : 'a read of the page failed: pdf render');
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

async function chromiumAndServer(t, options) {
  let browser;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true, args: [HOST_RESOLVER_RULES] });
  } catch (err) {
    if (toolRequired('browser')) throw err;
    t.skip('no Chromium');
    return null;
  }
  return serversFor(t, browser, options);
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

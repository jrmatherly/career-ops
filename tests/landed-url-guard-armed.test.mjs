// tests/landed-url-guard-armed.test.mjs. Each page here fetches /armed when it
// is ready to be read, and each read waits for it. A shared worker, which
// Playwright reports nothing for, is denied. The browser-extract.mjs and
// upskill.mjs CLIs and the batch path refuse a page that received a private
// response or whose read threw text taken from a private host, and repeat
// nothing of it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { ROOT } from './helpers.mjs';
import { toolRequired } from './required-tools.mjs';
import { ANSWERS, HOST_RESOLVER_RULES, INTERNAL, archiveUrl, archived, pageArmed, readsWhen, serversFor } from './landed-url-guard-fixtures.mjs';

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

// browser-extract.mjs and upskill.mjs act on a failed read from their main, so
// each CLI runs as a child with `playwright` swapped (a module hook) for the real
// one plus this file's seams: the resolver, the address rule, the name mapping
// (for Chromium and for Node's own lookup), and a first read that waits for the
// page's signal.
function cliWithSeams(t, env, script, args) {
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
      for (const read of ['evaluate', 'innerText']) {
        const real = page[read].bind(page);
        page[read] = async (...args) => {
          await armed;
          return real(...args);
        };
      }
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
  writeFileSync(join(dir, 'register.mjs'), `
import dns from 'node:dns';
import { register } from 'node:module';
const lookup = dns.lookup;
dns.lookup = (host, options, callback) => lookup(host.endsWith('.example.test') ? '127.0.0.1' : host, options, callback);
register(${JSON.stringify(href(dir, 'hooks.mjs'))});
await import(${JSON.stringify(href(dir, 'playwright.mjs'))});
`);
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', href(dir, 'register.mjs'), join(ROOT, script), ...args], {
      cwd: dir, timeout: 50_000,
      env: { ...process.env, LANDED_TEST: JSON.stringify({ answers: ANSWERS, privatePort: env.privatePort }) },
    }, (err, stdout, stderr) => resolve({ code: err ? err.code : 0, stdout, stderr }));
  });
}

test('real Chromium: browser-extract.mjs reports the refusal, and nothing else, when its read throws text the page took from a private host', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const { code, stdout, stderr } = await cliWithSeams(t, env, 'browser-extract.mjs', [env.publicUrl('/throws')]);
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
  const { code, stdout, stderr } = await cliWithSeams(t, env, 'browser-extract.mjs', [env.publicUrl('/armed-posting')]);
  assert.equal(code, 0, stderr);
  assert.match(JSON.parse(stdout).text, /Platform engineer role/);
});

test('real Chromium: upskill.mjs refuses a page that received a private response, and makes no fetch of its own', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const { code, stdout, stderr } = await cliWithSeams(t, env, 'upskill.mjs', ['--url-text', env.publicUrl('/fetch-then-armed')]);
  assert.equal(code, 1, stderr);
  assert.equal(stdout, '');
  assert.match(stderr, /a response came from private target IP 127\.0\.0\.1/);
  assert.deepEqual(env.nodeHits, [], 'Node fetched the posting itself after the refusal');
  assert.doesNotMatch(stderr, new RegExp(INTERNAL));
});

test('real Chromium: upskill.mjs still reads a posting through the same child', { timeout: 60_000 }, async (t) => {
  const env = await chromiumAndServer(t);
  if (!env) return;
  const { code, stdout, stderr } = await cliWithSeams(t, env, 'upskill.mjs', ['--url-text', env.publicUrl('/armed-posting')]);
  assert.equal(code, 0, stderr);
  assert.equal(JSON.parse(stdout).mode, 'targeted');
  assert.deepEqual(env.nodeHits, []);
});

// scrapeUrl opens its page with browser.newPage, so the batch path gets a
// browser whose page reads only once the page has fetched /armed.
const batchBrowser = (env) => ({ newPage: async (options) => {
  const page = await env.browser.newPage(options);
  const armed = pageArmed(page.context());
  const evaluate = page.evaluate.bind(page);
  page.evaluate = async (...args) => {
    await armed;
    return evaluate(...args);
  };
  return page;
} });

// The liveness check is the real one: a refused posting must not be visited
// again, so the private host sees only the hop the scrape made before refusing.
// The redirected page is refused before any read, so it needs no /armed wait.
for (const [what, path, scrapeHop, armed] of [
  ['received a private response', '/fetch-then-armed', '/cors', true],
  ['threw text it took from a private host', '/throws', '/cors', true],
  ['was redirected to a private host', '/to-private/payroll', '/payroll', false],
]) {
  test(`real Chromium: the batch path never calls the model for a page that ${what}, leaves its line alone, and says why`, { timeout: 60_000 }, async (t) => {
    const env = await chromiumAndServer(t);
    if (!env) return;
    const { processOffer } = await import('../batch-evaluate-gemini.mjs');
    const url = env.publicUrl(path);
    const line = `- [ ] ${url} | Acme | Engineer`;
    let modelCalls = 0;
    const result = await processOffer(armed ? batchBrowser(env) : env.browser, line, 1, async () => { modelCalls++; return ''; });
    assert.equal(modelCalls, 0);
    assert.equal(result.processed, false);
    assert.equal(result.line, line);
    assert.deepEqual(env.privateHits, [scrapeHop]);
    const warnings = env.warned.mock.calls.map((call) => call.arguments.join(' '));
    assert.ok(warnings.some((line) => line.includes(url) && line.includes('blocked_host')), warnings.join('\n'));
    assert.doesNotMatch(warnings.join('\n'), new RegExp(INTERNAL));
  });
}

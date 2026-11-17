// tests/liveness-browser-landed-guard.test.mjs. checkUrlLiveness reads no page
// that landed on a private host, and judges what the page received before it
// gives a verdict. Chromium follows a redirect without asking the route guard,
// so only these checks stand between a 302 into private space and a verdict
// read from the internal page.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { toolRequired } from './required-tools.mjs';
import { HOST_RESOLVER_RULES } from './landed-url-guard-fixtures.mjs';
import { checkUrlLiveness, newLivenessPage, setDialledAddressJudge, setHostResolver } from '../liveness-browser.mjs';

const POSTING = `<h1>Engineer</h1><p>${'Platform engineer role with responsibilities and requirements. '.repeat(30)}</p><button>Apply now</button>`;
const html = (res, body) => res.writeHead(200, { 'content-type': 'text/html' }).end(`<title>Engineer | Acme</title><body>${body}</body>`);

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
  const privateHits = [];
  const internal = createServer((req, res) => {
    privateHits.push(req.url);
    html(res, `INTERNAL ${POSTING}`);
  });
  const other = createServer((req, res) => html(res, POSTING));
  const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  await Promise.all([listen(internal), listen(other)]);
  const privateOrigin = `http://private.example.test:${internal.address().port}`;
  const otherOrigin = `http://careers.example.test:${other.address().port}`;
  const start = createServer((req, res) => {
    if (req.url === '/jobs/4815162342') res.writeHead(302, { location: `${privateOrigin}${req.url}` }).end();
    else if (req.url === '/jobs/2718281828') res.writeHead(302, { location: `${otherOrigin}${req.url}` }).end();
    else if (req.url === '/hop') res.writeHead(302, { location: `${privateOrigin}/cors` }).end();
    // The posting renders only once the private response is in, so the read cannot finish before it.
    else if (req.url === '/jobs/1414213562') html(res, `<template id="posting">${POSTING}</template><script>fetch('/hop', { mode: 'no-cors' }).finally(() => { document.body.innerHTML = document.getElementById('posting').innerHTML; })</script>`);
    else html(res, POSTING);
  });
  await listen(start);
  const internalPort = internal.address().port;
  t.after(setHostResolver(async (host) => (host === 'private.example.test' ? ['10.0.0.5'] : ['93.184.216.34'])));
  // Every name is mapped to loopback, so the private listener is named by its port.
  t.after(setDialledAddressJudge(({ port }) => port === internalPort));
  t.mock.method(console, 'warn', () => {});
  t.after(async () => {
    await browser.close();
    for (const server of [internal, other, start]) server.close();
  });
  return { browser, privateHits, url: (path) => `http://jobs.example.test:${start.address().port}${path}` };
}

test('real Chromium: a posting that redirects to a private host is refused, not judged', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  const verdict = await checkUrlLiveness(page, env.url('/jobs/4815162342'));
  assert.equal(verdict.result, 'uncertain');
  assert.equal(verdict.code, 'blocked_host');
  assert.match(verdict.reason, /private target IP 10\.0\.0\.5/);
});

test('real Chromium: a posting whose page received a private response is refused after the poll', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  const verdict = await checkUrlLiveness(page, env.url('/jobs/1414213562'));
  assert.ok(env.privateHits.includes('/cors'), 'the page reached the private host');
  assert.equal(verdict.result, 'uncertain');
  assert.equal(verdict.code, 'blocked_host');
  assert.match(verdict.reason, /private target IP 127\.0\.0\.1/);
});

test('real Chromium: a redirect between public hosts is still read, and a reused page starts each check clean', { timeout: 60_000 }, async (t) => {
  const env = await setup(t);
  if (!env) return;
  const page = await newLivenessPage(env.browser);
  const listeners = page.context().listenerCount('response');
  assert.equal((await checkUrlLiveness(page, env.url('/jobs/4815162342'))).code, 'blocked_host');
  const after = await checkUrlLiveness(page, env.url('/jobs/2718281828'));
  assert.deepEqual([after.result, after.code], ['active', 'apply_control_visible']);
  assert.equal(page.context().listenerCount('response'), listeners, 'no recorder outlives its check');
});

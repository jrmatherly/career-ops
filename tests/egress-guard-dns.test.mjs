// tests/egress-guard-dns.test.mjs. The shared Playwright egress guard resolves names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const lb = await import(pathToFileURL(join(ROOT, 'liveness-browser.mjs')).href);

async function verdictFor(url) {
  let handler;
  await lb.installEgressGuard({ addInitScript: async () => {}, route: async (pattern, h) => { assert.equal(pattern, '**/*'); handler = h; } });
  let verdict = null;
  await handler({ request: () => ({ url: () => url }), abort: async (code) => { verdict = `abort:${code}`; }, continue: async () => { verdict = 'continue'; } });
  return verdict;
}

test('a hostname that resolves to loopback is aborted, a public one continues', async (t) => {
  t.after(lb.setHostResolver(async (host) => (host === 'internal.example.test' ? ['127.0.0.1'] : ['93.184.216.34'])));
  assert.equal(await verdictFor('http://internal.example.test/admin'), 'abort:blockedbyclient');
  assert.equal(await verdictFor('https://jobs.example.test/1'), 'continue');
});

test('a request that cannot be continued is aborted and not reported as a DNS block', async (t) => {
  t.after(lb.setHostResolver(async () => ['93.184.216.34']));
  let handler;
  await lb.installEgressGuard({ addInitScript: async () => {}, route: async (_pattern, h) => { handler = h; } });
  const warnings = [];
  const warn = console.warn;
  console.warn = (line) => warnings.push(String(line));
  t.after(() => { console.warn = warn; });
  let aborted = null;
  await handler({ request: () => ({ url: () => 'https://jobs.example.test/1' }), abort: async (code) => { aborted = code; }, continue: async () => { throw new Error('route is already handled'); } });
  assert.equal(aborted, 'blockedbyclient');
  assert.equal(warnings.length, 1);
  assert.doesNotMatch(warnings[0], /DNS/);
});


// tests/verify-portals-probe-budget.test.mjs: the probe request budget bounds
// every fetcher a provider can reach, fetchResponse included, and audit-portals
// spends the same budget per entry and reads a tripped budget as a live board.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { boundedProbeCtx, ProbePageBudgetReached, probeProvider } = await import(pathToFileURL(join(ROOT, 'verify-portals.mjs')).href);
const { auditCompanies, diffAgainstBaseline } = await import(pathToFileURL(join(ROOT, 'audit-portals.mjs')).href);

const job = { title: 'Engineer', location: 'Remote', url: 'https://example.com/j/1' };

function countingCtx() {
  const calls = { n: 0 };
  const answer = async () => { calls.n += 1; return { ok: true, json: async () => ({}) }; };
  return { calls, ctx: { fetchJson: answer, fetchText: answer, fetchResponse: answer } };
}

// Ignores maxPages and spends six fetchResponse calls, as a header-reading provider might.
const greedy = (jobs = []) => ({
  id: 'greedy',
  detect: () => ({ url: 'x' }),
  async fetch(_entry, ctx) {
    for (let i = 0; i < 6; i += 1) await ctx.fetchResponse('https://example.com/page');
    return jobs;
  },
});

test('boundedProbeCtx stops fetchResponse at the fifth request', async () => {
  const { ctx: base, calls } = countingCtx();
  const { ctx, wasTripped } = boundedProbeCtx(base);
  for (let i = 0; i < 4; i += 1) await ctx.fetchResponse('https://example.com/page');
  assert.equal(wasTripped(), false);
  await assert.rejects(ctx.fetchResponse('https://example.com/page'), ProbePageBudgetReached);
  assert.equal(wasTripped(), true);
  assert.equal(calls.n, 4);
});

test('boundedProbeCtx leaves fetchResponse absent when the base ctx has none', () => {
  const { ctx } = boundedProbeCtx({ fetchJson: async () => ({}), fetchText: async () => '' });
  assert.notEqual(typeof ctx.fetchResponse, 'function');
});

test('a partial audit row carries partial and is left out of the baseline diff', async () => {
  const rows = [{ name: 'Delta Co', count: 1, partial: true }];
  assert.deepEqual(diffAgainstBaseline(rows, [{ name: 'Delta Co', count: 40 }]), []);
});

test('auditCompanies spends at most four requests per entry and reports a cut-off board as live', async () => {
  const { ctx: httpCtx, calls } = countingCtx();
  const rows = await auditCompanies(
    [
      { name: 'Alpha Co', careers_url: 'https://example.com/a' },
      { name: 'Beta Co', careers_url: 'https://example.com/b' },
    ],
    { providers: new Map([['greedy', greedy()]]), httpCtx, concurrency: 1 },
  );
  assert.equal(calls.n, 8);
  assert.deepEqual(rows.map((r) => r.verdict), ['ok', 'ok']);
  assert.ok(rows.every((r) => r.count === null && /partial/.test(r.detail)), JSON.stringify(rows));
});

test('auditCompanies reports a provider that swallows the sentinel and returns [] as live', async () => {
  const { ctx: httpCtx, calls } = countingCtx();
  const swallowing = {
    id: 'swallowing',
    detect: () => ({ url: 'x' }),
    async fetch(_entry, ctx) {
      for (let i = 0; i < 6; i += 1) {
        try { await ctx.fetchResponse('https://example.com/locale'); } catch { /* next locale */ }
      }
      return [];
    },
  };
  const [row] = await auditCompanies(
    [{ name: 'Gamma Co', careers_url: 'https://example.com/g' }],
    { providers: new Map([['swallowing', swallowing]]), httpCtx, concurrency: 1 },
  );
  assert.equal(calls.n, 4);
  assert.equal(row.verdict, 'ok');
  assert.match(row.detail, /partial/);
});

test('auditCompanies keeps the postings a cut-off provider did return', async () => {
  const { ctx: httpCtx } = countingCtx();
  const partialJobs = {
    id: 'partial',
    detect: () => ({ url: 'x' }),
    async fetch(_entry, ctx) {
      const out = [];
      try {
        for (let i = 0; i < 6; i += 1) { await ctx.fetchResponse('https://example.com/p'); out.push(job); }
      } catch { /* budget reached */ }
      return out;
    },
  };
  const [row] = await auditCompanies(
    [{ name: 'Delta Co', careers_url: 'https://example.com/d' }],
    { providers: new Map([['partial', partialJobs]]), httpCtx, concurrency: 1, smallThreshold: 0 },
  );
  assert.equal(row.verdict, 'ok');
  assert.equal(row.count, 4);
  assert.equal(row.partial, true);
  assert.match(row.detail, /partial/);
});

function rejectingCtx() {
  const calls = { n: 0 };
  const fail = async () => { calls.n += 1; throw Object.assign(new Error('HTTP 404'), { status: 404 }); };
  return { calls, ctx: { fetchJson: fail, fetchText: fail, fetchResponse: fail } };
}

// Both skip each failed request like a dead locale; the fifth attempt trips the budget.
const swallowsEverything = {
  id: 'swallows',
  detect: () => ({ url: 'x' }),
  async fetch(_entry, ctx) {
    for (let i = 0; i < 6; i += 1) {
      try { await ctx.fetchResponse('https://example.com/locale'); } catch { /* next locale */ }
    }
    return [];
  },
};
const propagatesSentinel = {
  id: 'propagates',
  detect: () => ({ url: 'x' }),
  async fetch(_entry, ctx) {
    for (let i = 0; i < 6; i += 1) {
      try {
        await ctx.fetchResponse('https://example.com/locale');
      } catch (err) {
        if (err instanceof ProbePageBudgetReached) throw err;
      }
    }
    return [];
  },
};

test('ProbePageBudgetReached names itself in its message', () => {
  assert.equal(new ProbePageBudgetReached().message, 'probe request budget reached');
});

test('one budget is shared across fetchJson, fetchText and fetchResponse', async () => {
  const { ctx: base, calls } = countingCtx();
  const { ctx, wasTripped, anySucceeded } = boundedProbeCtx(base);
  await ctx.fetchJson('https://example.com/a');
  await ctx.fetchJson('https://example.com/b');
  await ctx.fetchText('https://example.com/c');
  await ctx.fetchText('https://example.com/d');
  await assert.rejects(ctx.fetchResponse('https://example.com/e'), ProbePageBudgetReached);
  assert.equal(calls.n, 4);
  assert.equal(wasTripped(), true);
  assert.equal(anySucceeded(), true);
});

for (const provider of [swallowsEverything, propagatesSentinel]) {
  test(`auditCompanies reports a board whose every request failed as error (${provider.id})`, async () => {
    const { ctx: httpCtx, calls } = rejectingCtx();
    const [row] = await auditCompanies(
      [{ name: 'Dead Co', careers_url: 'https://example.com/dead' }],
      { providers: new Map([[provider.id, provider]]), httpCtx, concurrency: 1 },
    );
    assert.equal(calls.n, 4);
    assert.equal(row.verdict, 'error', JSON.stringify(row));
    assert.match(row.detail, /every request failed/);
  });

  test(`probeProvider reports a board whose every request failed as missing (${provider.id})`, async () => {
    const { ctx } = rejectingCtx();
    const result = await probeProvider({ name: 'Dead Co' }, provider, ctx);
    assert.equal(result.status, 'missing', JSON.stringify(result));
    assert.match(result.reason, /every request failed/);
  });
}

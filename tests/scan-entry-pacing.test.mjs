// tests/scan-entry-pacing.test.mjs — a portals.yml entry's request_delay_ms is
// the time between the starts of two of that entry's requests, to within a timer's millisecond.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applyEntryPacing, MAX_REQUEST_DELAY_MS } from '../lib/entry-pacing.mjs';
import { fetchJsonWithRetry } from '../providers/_http.mjs';

// A ctx whose clock records each wait instead of waiting, and whose fetchers record their calls.
function recordingCtx() {
  const waits = [];
  const calls = [];
  const record = (method) => async (url, opts) => { calls.push({ method, url, opts }); return method; };
  return {
    waits,
    calls,
    ctx: { sleep: async (ms) => { waits.push(ms); }, fetchJson: record('fetchJson'), fetchText: record('fetchText'), fetchResponse: record('fetchResponse') },
  };
}
// The clock does not advance performance.now, so a full wait is the delay less the few ms the test took.
const nearly = (ms, delay) => ms > delay - 1000 && ms <= delay;

test('an entry without request_delay_ms leaves the ctx as it is', () => {
  const { ctx } = recordingCtx();
  const before = { ...ctx };
  applyEntryPacing(ctx, { name: 'Acme' });
  assert.deepEqual(ctx, before);
});

test('the first request leaves at once and each later one waits, whichever fetcher sends it', async () => {
  const { ctx, waits, calls } = recordingCtx();
  applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: 10_000 });
  // A provider that pages back to back, with no wait of its own.
  assert.equal(await ctx.fetchJson('https://example.com/1', { redirect: 'error' }), 'fetchJson');
  assert.deepEqual(waits, []);
  await ctx.fetchText('https://example.com/2');
  await ctx.fetchResponse('https://example.com/3');
  assert.equal(waits.length, 2);
  assert.ok(waits.every((ms) => nearly(ms, 10_000)), String(waits));
  assert.deepEqual(calls.map((c) => c.method), ['fetchJson', 'fetchText', 'fetchResponse']);
  assert.deepEqual(calls[0].opts, { redirect: 'error' });
});

test('a retry is paced like any other request', async () => {
  const { ctx, waits } = recordingCtx();
  let attempts = 0;
  ctx.fetchJson = async () => {
    if (++attempts === 1) throw Object.assign(new Error('rate limited'), { status: 429 });
    return { ok: true };
  };
  applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: 10_000 });
  assert.deepEqual(await fetchJsonWithRetry(ctx, 'https://example.com/a', {}, { retries: 1, baseDelayMs: 500, maxDelayMs: 8_000 }), { ok: true });
  // The helper's own backoff, then the gate before the second attempt.
  assert.equal(waits.length, 2);
  assert.ok(nearly(waits[1], 10_000), String(waits));
});

test('requests sent at once leave one at a time, each after its own timer when the ctx has no clock', async (t) => {
  const real = globalThis.setTimeout;
  const log = [];
  // The timer is asked for the delay and fires at once, so no OS timer accuracy is measured.
  t.mock.method(globalThis, 'setTimeout', (fn, ms) => {
    log.push(nearly(ms, 10_000) ? 'timer' : `timer ${ms}`);
    return real(() => { log.push('fired'); fn(); }, 0);
  });
  const ctx = { fetchJson: async (url) => { log.push(`start ${url}`); } };
  applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: 10_000 });
  await Promise.all([ctx.fetchJson('a'), ctx.fetchJson('b'), ctx.fetchJson('c')]);
  assert.deepEqual(log, ['start a', 'timer', 'fired', 'start b', 'timer', 'fired', 'start c']);
});

test('a clock that rejects fails its own request and not the next', async () => {
  const { ctx, calls } = recordingCtx();
  let sleeps = 0;
  ctx.sleep = async () => { if (++sleeps === 1) throw new Error('clock'); };
  applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: 10_000 });
  await ctx.fetchJson('a');
  await assert.rejects(ctx.fetchJson('b'), /clock/);
  await ctx.fetchJson('c');
  assert.deepEqual(calls.map((c) => c.url), ['a', 'c']);
});

test('a caller with a time limit shortens a longer delay and leaves a shorter one', async () => {
  for (const [delay, expected] of [[60_000, 5_000], [2_000, 2_000]]) {
    const { ctx, waits } = recordingCtx();
    applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: delay }, { maxDelayMs: 5_000 });
    await ctx.fetchJson('a');
    await ctx.fetchJson('b');
    assert.equal(waits.length, 1);
    assert.ok(nearly(waits[0], expected), String(waits));
  }
});

test('a second ctx for the same entry waits behind the first, as a scan-level retry does', async () => {
  const entry = { name: 'SlowCo', request_delay_ms: 10_000 };
  const first = recordingCtx();
  const second = recordingCtx();
  await applyEntryPacing(first.ctx, entry).fetchJson('https://example.com/1');
  await applyEntryPacing(second.ctx, entry).fetchJson('https://example.com/1');
  assert.deepEqual(first.waits, []);
  assert.equal(second.waits.length, 1);
  assert.ok(nearly(second.waits[0], 10_000), String(second.waits));
  // Another entry with the same name and delay has its own gate.
  const other = recordingCtx();
  await applyEntryPacing(other.ctx, { ...entry }).fetchJson('https://example.com/1');
  assert.deepEqual(other.waits, []);
});

test('a failed request does not stop the ones after it', async () => {
  const { ctx } = recordingCtx();
  let n = 0;
  ctx.fetchJson = async () => { if (++n === 1) throw new Error('boom'); return 'ok'; };
  applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: 10_000 });
  await assert.rejects(ctx.fetchJson('a'), /boom/);
  assert.equal(await ctx.fetchJson('b'), 'ok');
});

test('the fetchers keep their receiver', async () => {
  const ctx = { state: 'board', async fetchJson() { return this.state; } };
  applyEntryPacing(ctx, { name: 'SlowCo', request_delay_ms: 1 });
  assert.equal(await ctx.fetchJson('a'), 'board');
});

test('the ceiling is accepted and waited in full, and 1 is accepted', async () => {
  const { ctx, waits } = recordingCtx();
  applyEntryPacing(ctx, { name: 'EdgeCo', request_delay_ms: MAX_REQUEST_DELAY_MS });
  await ctx.fetchJson('a');
  await ctx.fetchJson('b');
  assert.ok(nearly(waits[0], MAX_REQUEST_DELAY_MS), String(waits));
  const one = recordingCtx();
  const before = one.ctx.fetchJson;
  applyEntryPacing(one.ctx, { name: 'EdgeCo', request_delay_ms: 1 });
  assert.notEqual(one.ctx.fetchJson, before);
});

test('an unusable request_delay_ms is ignored with a warning naming the entry', (t) => {
  const warnings = [];
  t.mock.method(console, 'error', (msg) => { warnings.push(String(msg)); });
  const bads = [0, -5, 1.5, MAX_REQUEST_DELAY_MS + 1, 'slow', '10000', true, [10000], Number.NaN, Number.POSITIVE_INFINITY];
  for (const bad of bads) {
    const { ctx } = recordingCtx();
    const before = ctx.fetchJson;
    applyEntryPacing(ctx, { name: 'BadCo', request_delay_ms: bad });
    assert.equal(ctx.fetchJson, before, `value: ${String(bad)}`);
  }
  assert.equal(warnings.length, bads.length);
  assert.ok(warnings.every((w) => w.includes('BadCo') && w.includes('request_delay_ms')));
});

// scan.mjs has no seam to run one entry through; the two checks are run in verify-portals-entry-pacing.test.mjs.
test('scan.mjs applies the entry pacing', () => {
  assert.match(readFileSync(new URL('../scan.mjs', import.meta.url), 'utf8'), /applyEntryPacing\(ctx, company\)/);
});

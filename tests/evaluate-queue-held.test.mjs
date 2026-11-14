// queueCandidates holds a ranked row whose URL is in `held`: it is written to
// the ledger as skipped / held-location and never drained.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { HELD_LOCATION, drainPlan, queueCandidates, readLedger } from '../lib/evaluate-queue.mjs';

const A = 'https://jobs.example.test/a';
const B = 'https://jobs.example.test/b';
const job = { jobId: 'job-1', runId: 'run-1', rankThreshold: 3.5 };
const states = (root) => Object.fromEntries(readLedger(root).map((entry) => [entry.url, [entry.state, entry.reason]]));

function withRoot(fn) {
  return async () => {
    const root = mkdtempSync(join(tmpdir(), 'co-queue-held-'));
    try { await fn(root); } finally { rmSync(root, { recursive: true, force: true }); }
  };
}

test('a held row at or above the threshold is skipped as held-location, not queued', withRoot(async (root) => {
  const queued = await queueCandidates(root, { ...job, held: new Set([A]) }, [{ url: A, rank: 4.2 }, { url: B, rank: 4.0 }]);
  assert.equal(queued, 1);
  assert.deepEqual(states(root), { [A]: ['skipped', HELD_LOCATION], [B]: ['queued', ''] });
  assert.equal(HELD_LOCATION, 'held-location');
}));

test('a held row below the threshold keeps the below-threshold reason', withRoot(async (root) => {
  await queueCandidates(root, { ...job, held: new Set([A]) }, [{ url: A, rank: 2.0 }]);
  assert.deepEqual(states(root), { [A]: ['skipped', 'below-threshold'] });
}));

test('with no held set every row is decided as before', withRoot(async (root) => {
  assert.equal(await queueCandidates(root, job, [{ url: A, rank: 4.2 }]), 1);
}));

test('a held row is never returned by drainPlan', withRoot(async (root) => {
  await queueCandidates(root, { ...job, held: new Set([A]) }, [{ url: A, rank: 4.2 }]);
  assert.deepEqual(drainPlan(root, { jobId: 'job-1', rankThreshold: 3.5 }), []);
}));

test('a held row is not weighed again by a later pass without the hold', withRoot(async (root) => {
  await queueCandidates(root, { ...job, held: new Set([A]) }, [{ url: A, rank: 4.2 }]);
  assert.equal(await queueCandidates(root, job, [{ url: A, rank: 4.2 }]), 0);
  assert.deepEqual(states(root), { [A]: ['skipped', HELD_LOCATION] });
}));

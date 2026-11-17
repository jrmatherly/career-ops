// tests/tracker-row-damage-sweep.test.mjs: no single edit to a valid tracker row gets it rewritten shifted or duplicated by the merge.
//
// CAREER_OPS_SWEEP_PAIRS=1 adds every ordered pair of edits (about 5,000 merges, minutes).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { damagedRows, mergeOver, mergeViolation, pooled } from './helpers/tracker-damage.mjs';

test('the merge never rewrites or duplicates a damaged row', async () => {
  const variants = damagedRows({ pairs: process.env.CAREER_OPS_SWEEP_PAIRS === '1' });
  const results = await pooled(variants, Math.min(availableParallelism(), 12), async ({ name, line }) => {
    const r = await mergeOver(line);
    return { name, line, status: r.status, violation: mergeViolation(line, r) };
  });
  const violations = results.filter(r => r.violation);
  const merged = results.filter(r => r.status === 0).length;
  console.log(`swept ${results.length} rows: ${merged} merged, ${results.length - merged} refused, ${violations.length} violations`);
  assert.deepEqual(violations.map(v => `${v.name}: ${v.violation}: ${v.line}`), []);
  assert.ok(results.some(r => r.name.startsWith('valid/') && r.status === 0), 'the valid row was refused');
  assert.ok(results.length - merged > results.length / 2, 'most damaged rows should be refused');
});

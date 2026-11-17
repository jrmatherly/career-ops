// --backfill-urls reads a row that closes with a pipe and has every cell before URL. An open row that stops there is a fault it names.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |', '|---|---|---|---|---|---|---|---|---|---|'];

function backfill(rows) {
  const work = mkdtempSync(join(tmpdir(), 'co-backfill-'));
  mkdirSync(join(work, 'data'));
  mkdirSync(join(work, 'batch', 'tracker-additions'), { recursive: true });
  const tracker = join(work, 'data', 'applications.md');
  writeFileSync(tracker, [...HEAD, ...rows, ''].join('\n'));
  const run = spawnSync(process.execPath, [join(ROOT, 'merge-tracker.mjs'), '--backfill-urls'], { encoding: 'utf-8', timeout: 60_000, env: { ...process.env, CAREER_OPS_ROOT: work, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: join(work, 'batch', 'tracker-additions'), CAREER_OPS_BATCH_STATE: join(work, 'batch-state.tsv') } });
  const after = readFileSync(tracker, 'utf-8');
  rmSync(work, { recursive: true, force: true });
  return { status: run.status, out: run.stdout + run.stderr, after };
}

const OPEN_ROW = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note';

test('a row that stops before its URL cell and has no closing pipe stops the backfill, which names it', () => {
  const { status, out, after } = backfill([OPEN_ROW]);
  assert.equal(status, 1, out);
  assert.match(out, /❌ Row #1 \(line 5\) cannot be read as a tracker row/);
  assert.match(out, /Nothing backfilled: 1 tracker row/);
  assert.doesNotMatch(out, /TypeError/);
  assert.ok(after.includes(OPEN_ROW), 'the row was changed');
});

test('the same row closed with a pipe is given its URL cell', () => {
  const { status, out, after } = backfill([`${OPEN_ROW} |`]);
  assert.equal(status, 0, out);
  assert.match(after, /\| my note \| [^|]* \|\n/);
});

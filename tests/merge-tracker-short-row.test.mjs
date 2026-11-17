// tests/merge-tracker-short-row.test.mjs: a tracker row that cannot be read stops the merge before any addition is applied.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODE, ROOT } from './helpers.mjs';
import { describeSpawn, exitedNonZero } from './helpers/describe-spawn.mjs';

const HEADER = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |',
  '|---|---|---|---|---|---|---|---|---|---|'];
const ADDITION = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n'
  + '2\t2026-02-01\tAcme\tData Engineer\tEvaluated\t4.5/5\t❌\t[2](reports/002-acme-2026-02-01.md)\tre-eval\thttps://jobs.acme.com/1\n';

/** Run merge-tracker over a tracker holding `rows` and one pending re-evaluation of row #1. */
function mergeOver(t, rows, args = [], header = HEADER) {
  const work = mkdtempSync(join(tmpdir(), 'cops-short-row-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const adds = join(work, 'adds');
  mkdirSync(adds);
  const tracker = join(work, 'applications.md');
  const before = [...header, ...rows, ''].join('\n');
  writeFileSync(tracker, before);
  writeFileSync(join(adds, '002-acme.tsv'), ADDITION);
  const r = spawnSync(NODE, [join(ROOT, 'merge-tracker.mjs'), ...args], { encoding: 'utf-8', timeout: 30_000,
    env: { ...process.env, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: adds, CAREER_OPS_BATCH_STATE: join(work, 'batch-state.tsv') } });
  return {
    spawn: r,
    status: r.status,
    out: `${r.stdout}${r.stderr}`,
    before,
    text: readFileSync(tracker, 'utf-8'),
    pending: existsSync(join(adds, '002-acme.tsv')),
  };
}

// The PDF cell is missing, so every later cell sits one column left.
const SHORT = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
// Every cell is present; only the closing pipe was dropped by hand.
const NO_PIPE = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1';
// A row written before the URL column was added: complete but for the URL cell.
const NO_URL = (n) => `| ${n} | 2026-01-0${n} | Acme ${n} | Data Engineer | 3.0/5 | Applied | ✅ | [${n}](../reports/00${n}-acme-2026-01-0${n}.md) | my note |`;

test('a row missing an interior cell stops the merge and leaves the tracker and the addition alone', (t) => {
  const r = mergeOver(t, [SHORT]);
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'expected the merge to refuse'));
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.ok(r.pending, 'the addition was moved out of the pending directory');
  assert.match(r.out, /Row #1 \(line \d+\) cannot be read as a tracker row/);
});

test('a tracker whose rows all lack the URL cell is refused the same way', (t) => {
  const r = mergeOver(t, [NO_URL(1), NO_URL(3)]);
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'expected the merge to refuse'));
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.ok(r.pending, 'the addition was moved out of the pending directory');
  assert.match(r.out, /Row #1 \(line \d+\) cannot be read as a tracker row/);
  assert.match(r.out, /Row #3 \(line \d+\) cannot be read as a tracker row/);
});

test('--backfill-urls still repairs a row short only by its URL cell', (t) => {
  const r = mergeOver(t, [NO_URL(1)], ['--backfill-urls']);
  assert.equal(r.status, 0, r.out);
  const row = r.text.split('\n').find((l) => l.startsWith('| 1 |'));
  assert.equal(row.split('|').length, HEADER[2].split('|').length, `row #1 is still short: ${row}`);
});

test('a complete row with no trailing pipe is still matched and updated', (t) => {
  const r = mergeOver(t, [NO_PIPE]);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /cannot be read/);
  const rows = r.text.split('\n').filter((l) => /^\| \d/.test(l));
  assert.equal(rows.length, 1, `expected one row, got:\n${rows.join('\n')}`);
  assert.match(rows[0], /^\| 1 \|.*\| 4\.5\/5 \|.*\[2\]\(/, `row #1 was not updated: ${rows[0]}`);
});

test('a numbered row in another table further down the file does not stop the merge', (t) => {
  const FULL = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
  const r = mergeOver(t, [FULL, '', '## Totals', '', '| # | Metric |', '|---|---|', '| 1 | Applied |']);
  assert.equal(r.status, 0, describeSpawn(r.spawn, 'expected the merge to run'));
  assert.doesNotMatch(r.out, /cannot be read/);
  assert.equal(r.pending, false, 'the addition was left pending');
});

test('a short row after a blank line inside the tracker is still refused', (t) => {
  const FULL = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
  const r = mergeOver(t, [FULL, '', SHORT.replace('| 1 |', '| 3 |')]);
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'expected the merge to refuse'));
  assert.match(r.out, /Row #3 \(line \d+\) cannot be read as a tracker row/);
  assert.ok(r.pending, 'the addition was moved out of the pending directory');
});

test('a dry run warns, writes nothing, and says a real run would stop', (t) => {
  const r = mergeOver(t, [SHORT], ['--dry-run']);
  assert.equal(r.status, 0, r.out);
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.match(r.out, /Row #1 \(line \d+\) cannot be read as a tracker row.*A real run stops here and changes nothing\./);
});

test('a block that starts with an unnumbered tracker row is still the tracker', (t) => {
  const FULL = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
  const r = mergeOver(t, [FULL, '', FULL.replace('| 1 |', '| N/A |'), SHORT.replace('| 1 |', '| 3 |')]);
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'expected the merge to refuse'));
  assert.match(r.out, /Row #3 \(line \d+\) cannot be read as a tracker row/);
});

test('a short row under a header the parser does not recognise is still refused', (t) => {
  const header = ['# Applications Tracker', '', '| # | Date | Org | Role | Score | Status | PDF | Report | Notes |', '|---|---|---|---|---|---|---|---|---|'];
  const r = mergeOver(t, ['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | my note |'], [], header);
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'expected the merge to refuse'));
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.ok(r.pending, 'the addition was moved out of the pending directory');
  assert.match(r.out, /Row #1 \(line \d+\) cannot be read as a tracker row/);
});

test('a row missing an interior cell is refused when an unmapped column follows the mapped ones', (t) => {
  const header = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL | Mood |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  const r = mergeOver(t, [`${SHORT} fine |`], [], header);
  assert.ok(exitedNonZero(r.spawn), describeSpawn(r.spawn, 'expected the merge to refuse'));
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.match(r.out, /Row #1 \(line \d+\) cannot be read as a tracker row/);
});

test('a complete row under a header with an unmapped column is still matched and updated', (t) => {
  const header = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL | Mood |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  const r = mergeOver(t, ['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 | fine |'], [], header);
  assert.equal(r.status, 0, r.out);
  assert.doesNotMatch(r.out, /cannot be read/);
  assert.equal(r.text.split('\n').filter((l) => /^\| \d/.test(l)).length, 1);
});

test('a tracker with no header is not stopped by a numbered row in a later table', (t) => {
  const row = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note |';
  const r = mergeOver(t, [row, '', '| # | Metric |', '|---|---|', '| 1 | 2 |'], [], ['# Applications Tracker', '']);
  assert.doesNotMatch(r.out, /cannot be read/);
  assert.equal(r.pending, false, 'the addition was left pending');
});


// tests/merge-tracker-short-row.test.mjs: a row short of the header is not rewritten by a merge.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODE, ROOT } from './helpers.mjs';

const HEADER = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |',
  '|---|---|---|---|---|---|---|---|---|---|'];
const ADDITION = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n'
  + '2\t2026-02-01\tAcme\tData Engineer\tEvaluated\t4.5/5\t❌\t[2](reports/002-acme-2026-02-01.md)\tre-eval\thttps://jobs.acme.com/1\n';

/** Merge one re-evaluation of row #1 into a tracker holding `row`; return the output and the tracker text. */
function mergeOver(t, row) {
  const work = mkdtempSync(join(tmpdir(), 'cops-short-row-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  const adds = join(work, 'adds');
  mkdirSync(adds);
  const tracker = join(work, 'applications.md');
  writeFileSync(tracker, [...HEADER, row, ''].join('\n'));
  writeFileSync(join(adds, '002-acme.tsv'), ADDITION);
  const r = spawnSync(NODE, [join(ROOT, 'merge-tracker.mjs')], { encoding: 'utf-8', timeout: 30_000,
    env: { ...process.env, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: adds, CAREER_OPS_BATCH_STATE: join(work, 'batch-state.tsv') } });
  const out = `${r.stdout}${r.stderr}`;
  assert.equal(r.status, 0, out);
  return { out, text: readFileSync(tracker, 'utf-8') };
}

// The PDF cell is missing, so every later cell sits one column left.
const SHORT = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
// Every cell is present; only the closing pipe was dropped by hand.
const NO_PIPE = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1';

test('a row missing an interior cell is left as it is and named', (t) => {
  const { out, text } = mergeOver(t, SHORT);
  assert.ok(text.includes(SHORT), `row #1 was rewritten:\n${text}`);
  assert.match(out, /Row #1 is short of the header, so no addition will update it/);
});

test('a complete row with no trailing pipe is still matched and updated', (t) => {
  const { out, text } = mergeOver(t, NO_PIPE);
  assert.doesNotMatch(out, /short of the header/);
  const rows = text.split('\n').filter((l) => /^\| \d/.test(l));
  assert.equal(rows.length, 1, `expected one row, got:\n${rows.join('\n')}`);
  assert.match(rows[0], /^\| 1 \|.*\| 4\.5\/5 \|.*\[2\]\(/, `row #1 was not updated: ${rows[0]}`);
});

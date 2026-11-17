// tests/tracker-row-shape.test.mjs: merge, backfill and verify-pipeline refuse the same damaged tracker rows, judged by what each cell holds.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODE, ROOT } from './helpers.mjs';
import { HEADER, mergeOver } from './helpers/tracker-damage.mjs';

const FULL = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
// The PDF cell is missing, so every later cell sits one column left.
const SHORT = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
const NO_PDF_PIPE_IN_NOTE = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | call back a | b | https://jobs.acme.com/1 |';

function assertRefused(r, pattern) {
  assert.notEqual(r.status, 0, `expected the merge to refuse:\n${r.out}`);
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.ok(r.pending, 'the addition was moved out of the pending directory');
  assert.equal(r.backup, false, 'a backup was written, so something tried to write the tracker');
  assert.match(r.out, pattern);
}

const REFUSED = [
  ['a missing PDF cell hidden by a | in the note', NO_PDF_PIPE_IN_NOTE, /Row #1 \(line 5\) cannot be read as a tracker row: its PDF cell holds "\[1\]/],
  ['the same row with the note pipe escaped', NO_PDF_PIPE_IN_NOTE.replace('a | b', 'a \\| b'), /its PDF cell holds/],
  ['a missing PDF cell hidden by an extra trailing cell', `${SHORT} |`, /its PDF cell holds/],
  ['a complete row whose note holds a |', FULL.replace('my note', 'call a | b'), /it has 11 cells where the header has 10/],
  ['a missing Report cell hidden by a | in the note', FULL.replace(' [1](../reports/001-acme-2026-01-01.md) |', '').replace('my note', 'my | note'), /its Report cell holds "my"/],
  ['a complete row indented by two spaces', `  ${FULL}`, /Row #1 \(line 5\) cannot be read as a tracker row: the line is indented/],
  ['a short row indented by two spaces', `  ${SHORT}`, /the line is indented/],
  ['a short row numbered 0', SHORT.replace('| 1 |', '| 0 |'), /Line 5 \("\| 0 \| 2026-01-01 \| Acme \| Data Engineer \| 3\.0\/5 \| Applied \| "\) cannot be read/],
  ['a short row numbered —', SHORT.replace('| 1 |', '| — |'), /Line 5 \("\| — \| 2026-01-01/],
  ['a short row with a blank #', SHORT.replace('| 1 |', '|  |'), /Line 5 \("\|  \| 2026-01-01/],
  ['a complete row with a blank #', FULL.replace('| 1 |', '|  |'), /its # cell holds "", not a row number/],
];

for (const [name, row, pattern] of REFUSED) {
  test(`the merge refuses ${name}`, async () => assertRefused(await mergeOver(row), pattern));
}

test('a row missing its # cell is named by line, not by the year in its date', async () => {
  const r = await mergeOver(FULL.replace('| 1 ', ''));
  assertRefused(r, /Line 5 \("\| 2026-01-01 \| Acme \| Data Engineer \| 3\.0\/5 \| Applied \| ✅ \| "\) cannot be read/);
  assert.doesNotMatch(r.out, /Row #2026/);
});

test('--backfill-urls refuses a row whose fault is not a missing URL cell', async () => {
  const r = await mergeOver(SHORT, ['--backfill-urls']);
  assert.notEqual(r.status, 0, r.out);
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.match(r.out, /its PDF cell holds/);
  assert.match(r.out, /Nothing backfilled/);
});

test('--backfill-urls leaves a row in another table alone', async () => {
  const other = ['', '## Totals', '', '| # | Metric | A | B | C | D | E | F | G | H |', '|---|---|---|---|---|---|---|---|---|---|', '| 1 | Applied | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 |'];
  const r = await mergeOver([FULL, ...other].join('\n'), ['--backfill-urls']);
  assert.equal(r.status, 0, r.out);
  assert.ok(r.text.includes(other.at(-1)), `the other table's row was rewritten:\n${r.text}`);
});

for (const [name, row] of [
  ['a complete row', FULL],
  ['a complete CRLF row', `${FULL}\r`],
  ['a row with a decimal-comma score', FULL.replace('3.0/5', '3,0/5')],
  ['a row with an empty PDF cell', FULL.replace('✅', '—')],
  ['a row with a bare report number', FULL.replace('[1](../reports/001-acme-2026-01-01.md)', '[1]')],
  ['a row whose URL cell is a markdown link', FULL.replace('https://jobs.acme.com/1', '[jobs.acme.com](https://jobs.acme.com/1)')],
]) {
  test(`${name} is still matched and updated in place`, async () => {
    const r = await mergeOver(row);
    assert.equal(r.status, 0, r.out);
    const rows = r.text.split('\n').filter(l => /^\| \d/.test(l));
    assert.equal(rows.length, 1, `expected one row, got:\n${rows.join('\n')}`);
    assert.match(rows[0], /^\| 1 \|.*\| 4\.5\/5 \|.*my note\. Re-eval/);
  });
}

/** Run verify-pipeline over a tracker holding one row. */
function verifyOver(t, row) {
  const work = mkdtempSync(join(tmpdir(), 'cops-row-shape-verify-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  mkdirSync(join(work, 'reports'));
  writeFileSync(join(work, 'reports', '001-acme-2026-01-01.md'), '# Acme\n\n**URL:** https://jobs.acme.com/1\n');
  const tracker = join(work, 'data', 'applications.md');
  mkdirSync(join(work, 'data'));
  writeFileSync(tracker, [...HEADER, row, ''].join('\n'));
  const r = spawnSync(NODE, [join(ROOT, 'verify-pipeline.mjs')], { encoding: 'utf-8', timeout: 30_000, cwd: work,
    env: { ...process.env, CAREER_OPS_ROOT: work, CAREER_OPS_TRACKER: tracker, CAREER_OPS_REPORTS: join(work, 'reports') } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

test('verify-pipeline reports the row the merge refuses', async (t) => {
  for (const row of [SHORT, NO_PDF_PIPE_IN_NOTE, `  ${FULL}`]) {
    const merged = await mergeOver(row);
    const verified = verifyOver(t, row);
    assert.notEqual(merged.status, 0, merged.out);
    assert.equal(verified.status, 1, verified.out);
    assert.doesNotMatch(verified.out, /All rows properly formatted|Pipeline is clean/);
    assert.match(verified.out, /Row (?:with too few columns|cannot be read): Row #1 \(line 5\)/);
  }
});

test('verify-pipeline passes the row format of a row the merge accepts', (t) => {
  assert.match(verifyOver(t, FULL).out, /All rows properly formatted/);
});

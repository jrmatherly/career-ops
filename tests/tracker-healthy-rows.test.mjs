// tests/tracker-healthy-rows.test.mjs: a tracker row that is not damaged never stops the merge, whatever its cells say.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { availableParallelism } from 'node:os';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { loadCanonicalStates } from '../tracker-utils.mjs';
import { CELLS, HEADER, dataRows, mergeOver, pooled, verifyOver } from './helpers/tracker-damage.mjs';

const FULL = `| ${CELLS.join(' | ')} |`;
const withCell = (at, value) => `| ${CELLS.map((cell, i) => (i === at ? value : cell)).join(' | ')} |`;
const STATES = loadCanonicalStates(join(ROOT, 'templates', 'states.yml'));

/**
 * What stopped `row` from being matched and updated in place, or null.
 * @param {string} row - The tracker's only row.
 * @param {{header?: string[], addition?: string}} [options]
 * @returns {Promise<string|null>}
 */
async function notUpdated(row, options) {
  const r = await mergeOver(row, [], options);
  if (r.status !== 0) return `exit ${r.status}: ${r.out.split('\n').find(l => l.includes('❌')) ?? r.out}`;
  const rows = dataRows(r.text);
  if (rows.length !== 1) return `expected one row, got ${rows.length}`;
  if (!rows[0].includes('| 4.5/5 |')) return `the row was not updated: ${rows[0]}`;
  return null;
}

/** Every value of one cell, each in its own tracker, that the merge failed to update. */
async function refusedValues(at, values) {
  const outcomes = await pooled(values, Math.min(availableParallelism(), 12), value => notUpdated(withCell(at, value)));
  return values.flatMap((value, i) => (outcomes[i] ? [`"${value}": ${outcomes[i]}`] : []));
}

test('a row is matched and updated under every status the product accepts', async () => {
  const accepted = STATES.flatMap(state => [state.label, state.id, ...state.aliases]);
  assert.ok(accepted.length > 60, 'states.yml gave too few statuses to mean anything');
  assert.deepEqual(await refusedValues(5, [...new Set(accepted)]), []);
});

test('a row is matched and updated under a status the vocabulary does not list', async () => {
  assert.deepEqual(await refusedValues(5, ['Interviewing', 'Withdrawn', 'Ghosted', 'Phone screen', '✅ Applied', '🟢 Interview',
    'Geo-Blocker', 'Cancelada por empresa', '', '—', '**Applied**', 'Applied 2026-01-02']), []);
});

test('a row is matched and updated under every score sentinel', async () => {
  assert.deepEqual(await refusedValues(4, ['N/A', '—', '-', '3,0/5', 'DUP', '**3.0/5**']), []);
});

test('a row is matched and updated under every PDF value', async () => {
  assert.deepEqual(await refusedValues(6, ['✅', '❌', '—', '']), []);
});

test('a row is matched and updated with no date', async () => {
  assert.deepEqual(await refusedValues(1, ['', '—']), []);
});

for (const num of ['N/A', '—']) {
  test(`a complete row numbered ${num} is left alone and does not stop the merge`, async () => {
    const row = withCell(0, num);
    const r = await mergeOver(row);
    assert.equal(r.status, 0, r.out);
    assert.ok(dataRows(r.text).includes(row), `the row was rewritten:\n${r.text}`);
    assert.equal(r.pending, false, 'the addition was left pending');
  });
}

test('the documented Materials layout is matched and updated', async () => {
  const header = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | Materials | Apply Link | Follow-up | Notes |',
    '|---|------|---------|------|-------|--------|-----------|------------|-----------|-------|'];
  const row = '| 7 | 2026-06-01 | Acme | Staff Eng | 4.2/5 | Applied | CV v3 | https://acme.example/jobs/7 | 2026-06-14 | strong fit |';
  const addition = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\n'
    + '8\t2026-07-01\tAcme\tStaff Eng\tEvaluated\t4.5/5\t❌\t[13](reports/013-acme-2026-07-01.md)\tre-eval\n';
  const r = await mergeOver(row, [], { header, addition, again: true });
  assert.equal(r.status, 0, r.out);
  const rows = dataRows(r.text);
  assert.equal(rows.length, 1, `expected one row, got:\n${rows.join('\n')}`);
  assert.match(rows[0], /^\| 7 \|.*\| 4\.5\/5 \| Applied \|.*\| https:\/\/acme\.example\/jobs\/7 \| 2026-06-14 \| strong fit.*\[13\]\(/);
  assert.equal(r.again.status, 0, `the next merge refused the row this one wrote:\n${r.again.out}`);
});

test('a legacy tracker with no URL column is matched and updated', async () => {
  const header = [HEADER[0], '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |', '|---|---|---|---|---|---|---|---|---|'];
  assert.equal(await notUpdated(`| ${CELLS.slice(0, 9).join(' | ')} |`, { header }), null);
});

test('a tracker with no Notes column is matched and updated', async () => {
  const header = [HEADER[0], '', '| # | Date | Company | Role | Score | Status | PDF | Report |', '|---|---|---|---|---|---|---|---|'];
  assert.equal(await notUpdated(`| ${CELLS.slice(0, 8).join(' | ')} |`, { header }), null);
});

test('a line below the tracker that is not a row is warned about and does not stop the merge', async (t) => {
  const tracker = [FULL, '', '| Totals | 1 |'].join('\n');
  const r = await mergeOver(tracker);
  assert.equal(r.status, 0, r.out);
  assert.match(r.out, /⚠️ {2}Line 7 \("\| Totals \| 1 \|"\) in applications\.md is not a tracker row/);
  assert.ok(r.text.includes('| Totals | 1 |'), 'the line was removed');
  assert.match(dataRows(r.text)[0], /^\| 1 \|.*\| 4\.5\/5 \|/);
  const verified = verifyOver(t, tracker);
  assert.match(verified.out, /All rows properly formatted/);
  assert.match(verified.out, /⚠️ {2}Line 7 \("\| Totals \| 1 \|"\) is not a tracker row/);
});

test('a link to a web address in the URL cell is a posting URL, whatever its text or ending, and a local report link there is refused', async () => {
  const { resolveColumns, trackerRowFault } = await import('../tracker-parse.mjs');
  const head = ['| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |', '|---|---|---|---|---|---|---|---|---|---|'];
  const colmap = resolveColumns(head);
  const row = (url) => `| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | note | ${url} |`;
  assert.equal(trackerRowFault(row('[1](https://jobs.acme.com/1)'), colmap, { cellCount: 10 }), null);
  assert.equal(trackerRowFault(row('[github.com](https://github.com/acme/jobs/blob/main/data-engineer.md)'), colmap, { cellCount: 10 }), null);
  assert.equal(trackerRowFault(row('[2](../reports/002-acme-2026-01-02.md)'), colmap, { cellCount: 10 })?.cell, 'url');
  assert.equal(trackerRowFault(row('[report](../reports/002-acme-2026-01-02.md)'), colmap, { cellCount: 10 })?.cell, 'url');
});

// tests/tracker-refusal-guidance.test.mjs: a refusal says what happened to the row and what to do, and the merge never writes a row its next run refuses.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CELLS, dataRows, mergeOver, verifyOver } from './helpers/tracker-damage.mjs';

const FULL = `| ${CELLS.join(' | ')} |`;
const without = at => `| ${CELLS.filter((_, i) => i !== at).join(' | ')} |`;
const NO_PDF = without(6);
const NO_URL = without(9);
const BACKFILL_HINT = /--backfill-urls/;

test('a missing interior cell is described as a shift, with the row printed', async () => {
  const r = await mergeOver(`${NO_PDF} |`);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Row #1 \(line 5\) cannot be read as a tracker row: its PDF cell holds a report link \("\[1\]\(.*\)"\), so the cells from PDF onward look shifted one place to the left: a cell is probably missing at PDF or before it\. Add the missing cell/);
  assert.ok(r.out.includes(`\n     ${NO_PDF} |\n`), `the row was not printed:\n${r.out}`);
  assert.doesNotMatch(r.out, BACKFILL_HINT);
});

test('a short row says a cell is missing and does not offer the URL backfill', async () => {
  const r = await mergeOver(NO_PDF);
  assert.match(r.out, /it has 9 cells where the header has 10, so a cell is missing\. Add the missing cell/);
  assert.doesNotMatch(r.out, BACKFILL_HINT);
});

test('a row missing only its trailing URL cell is offered the URL backfill', async () => {
  const r = await mergeOver(NO_URL);
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /Only the URL cell at the end is missing here, and node merge-tracker\.mjs --backfill-urls adds it\./);
});

test('a row split by a | says to replace it', async () => {
  const r = await mergeOver(FULL.replace('my note', 'call a | b'));
  assert.match(r.out, /it has 11 cells where the header has 10\. A \| typed inside a cell splits it in two: replace that \| with \/ or -\./);
  assert.doesNotMatch(r.out, BACKFILL_HINT);
});

test('an indented row says to remove the leading spaces, not that no reader sees it', async () => {
  const r = await mergeOver(`  ${FULL}`);
  assert.match(r.out, /the merge cannot match an indented row\. Remove the leading spaces\./);
  assert.doesNotMatch(r.out, /no reader sees it/);
});

test('a column is named by the tracker\'s own header', async () => {
  const header = ['# Applications Tracker', '', '| # | Fecha | Empresa | Puesto | Score | Status | PDF | Report | Notes |', '|---|---|---|---|---|---|---|---|---|'];
  const r = await mergeOver('| 1 | Acme | 2026-01-01 | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note |', [], { header });
  assert.equal(r.status, 1, r.out);
  assert.match(r.out, /its Empresa cell holds a date \("2026-01-01"\)/);
});

test('verify-pipeline prints the guidance the merge prints', async (t) => {
  const guidance = out => out.split('\n').flatMap((l, i, all) => (l.includes('cannot be read as a tracker row') ? [l.slice(l.indexOf('Row #')), all[i + 1]] : []));
  for (const row of [NO_PDF, `${NO_PDF} |`, NO_URL, `  ${FULL}`, FULL.replace('my note', 'call a | b')]) {
    const merged = guidance((await mergeOver(row)).out);
    assert.equal(merged.length, 2, `the merge did not refuse: ${row}`);
    assert.deepEqual(guidance(verifyOver(t, row).out), merged);
  }
});

test('a note in the Report cell is not taken for a report link', async () => {
  const row = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | met [Jane] | at meetup | https://jobs.acme.com/1 |';
  const r = await mergeOver(row);
  assert.equal(r.status, 1, r.out);
  assert.equal(r.text, r.before, 'the tracker was written');
  assert.match(r.out, /its Report cell holds "met \[Jane\]", which is not a report link/);
});

const addition = (fields) => {
  const cells = { num: '2', date: '2026-02-01', company: 'Globex', role: 'Analyst', status: 'Evaluated', score: '4.0/5', pdf: '❌',
    report: '[2](reports/002-globex-2026-02-01.md)', notes: 'new', url: 'https://globex.com/2', ...fields };
  return `${Object.keys(cells).join('\t')}\n${Object.values(cells).join('\t')}\n`;
};

for (const [field, value] of [
  ['date', '2026-2-1'], ['date', '2026/02/01'],
  ['pdf', 'pending'], ['pdf', 'Yes'], ['pdf', '📄'], ['pdf', '✅ PDF'],
  ['report', 'reports/002-globex-2026-02-01.md'],
  ['url', 'globex.com/2'], ['url', '<https://globex.com/2>'],
]) {
  test(`an addition whose ${field} is "${value}" is written and the next merge reads it back`, async () => {
    const r = await mergeOver(FULL, [], { addition: addition({ [field]: value }), again: true });
    assert.equal(r.status, 0, r.out);
    assert.equal(dataRows(r.text).length, 2, `the addition was not written:\n${r.out}`);
    assert.equal(r.again.status, 0, `the next merge refused the row this one wrote:\n${r.again.out}`);
  });
}

for (const [field, value, cell] of [
  ['report', 'see notes', 'Report'], ['report', '002', 'Report'], ['url', 'ask the recruiter', 'URL'],
  ['date', '4.0/5', 'Date'], ['pdf', '2026-02-01', 'PDF'], ['company', '2026-02-01', 'Company'],
]) {
  test(`an addition whose ${field} is "${value}" fails the run, is left pending and never reaches the tracker`, async () => {
    const r = await mergeOver(FULL, [], { addition: addition({ [field]: value }) });
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /1 addition\(s\) were NOT merged .*002-acme\.tsv/);
    assert.equal(r.text, r.before, 'the tracker was written');
    assert.ok(r.pending, 'the addition was moved out of the pending directory');
    assert.match(r.out, new RegExp(`Skipping 002-acme\\.tsv: the row it would add could not be read back from the tracker: its ${cell} cell holds`));
    assert.match(r.out, /The addition was left pending\./);
  });
}

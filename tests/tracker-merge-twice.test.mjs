// tests/tracker-merge-twice.test.mjs: a row the merge writes or accepts is accepted by the next merge too, and an addition it refuses fails the run.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODE, ROOT } from './helpers.mjs';

const TSV_HEAD = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes';
const SEP = (n) => `|${'---|'.repeat(n)}`;

/**
 * Run the real merge `runs` times over one tracker and its pending additions.
 * @param {string[]} table - The tracker's header, separator and rows.
 * @param {Object<string,string>} additions - TSV text by file name.
 * @param {(workspace: {run: (script?: string) => {status: number|null, out: string}, text: () => string, pending: (name: string) => boolean}) => void} check
 */
function withTracker(table, additions, check) {
  const work = mkdtempSync(join(tmpdir(), 'co-merge-twice-'));
  try {
    const adds = join(work, 'adds');
    mkdirSync(adds);
    const tracker = join(work, 'applications.md');
    writeFileSync(tracker, ['# Applications Tracker', '', ...table, ''].join('\n'));
    for (const [name, text] of Object.entries(additions)) writeFileSync(join(adds, name), text);
    const env = { ...process.env, CAREER_OPS_ROOT: work, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: adds, CAREER_OPS_BATCH_STATE: join(work, 'batch-state.tsv'), CAREER_OPS_PDF_INDEX: join(work, 'pdf-index.tsv') };
    check({
      run: (script = 'merge-tracker.mjs') => {
        const r = spawnSync(NODE, [join(ROOT, script)], { encoding: 'utf-8', cwd: work, env, timeout: 60_000 });
        return { status: r.status, out: r.stdout + r.stderr };
      },
      text: () => readFileSync(tracker, 'utf-8'),
      pending: name => existsSync(join(adds, name)),
    });
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

const UNKNOWN_HEADER = ['| No. | Date | Company | Role | Score | Status | PDF | Report | Notes | Extra |', SEP(10),
  '| 1 | 2026-08-01 | Acme | Director, Test | 4.5/5 | Evaluated | ✅ | [1](reports/1-acme.md) | note | mine |'];

test('a new row under a header the merge does not recognise is as wide as the header, and the next merge reads it', () => {
  withTracker(UNKNOWN_HEADER, { '002-globex.tsv': `${TSV_HEAD}\n2\t2026-10-02\tGlobex\tData Engineer\tEvaluated\t4.0/5\t❌\t[2](reports/002-globex.md)\tfirst\n` }, ({ run, text }) => {
    const first = run();
    assert.equal(first.status, 0, first.out);
    const added = text().split('\n').find(l => l.includes('Globex'));
    assert.ok(added, `the addition was not written:\n${text()}`);
    assert.equal(added.split('|').length - 2, 10, added);
    const second = run();
    assert.equal(second.status, 0, second.out);
  });
});

test('a row updated under a header the merge does not recognise keeps its width, and the next merge reads it', () => {
  withTracker(UNKNOWN_HEADER, { '002-acme.tsv': `${TSV_HEAD}\n2\t2026-10-02\tAcme\tDirector, Test\tEvaluated\t4.9/5\t❌\t[2](reports/002-acme.md)\tre-eval\n` }, ({ run, text }) => {
    const first = run();
    assert.equal(first.status, 0, first.out);
    const updated = text().split('\n').filter(l => l.includes('Acme'));
    assert.equal(updated.length, 1, text());
    assert.match(updated[0], /\| 4\.9\/5 \|.*\| mine \|$/);
    const second = run();
    assert.equal(second.status, 0, second.out);
  });
});

const URL_HEADER = ['| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |', SEP(10)];

test('a posting URL that ends in .md is a URL, for a row already in the tracker and for a new one', () => {
  const existing = '| 1 | 2026-08-01 | Beta | Platform Engineer | 4.5/5 | Evaluated | ✅ | [1](reports/1-beta.md) | note | [github.com](https://github.com/beta/jobs/blob/main/platform-engineer.md) |';
  const addition = `${TSV_HEAD}\turl\n2\t2026-10-02\tGamma\tSite Reliability Engineer\tEvaluated\t4.0/5\t❌\t[2](reports/002-gamma.md)\tfirst\thttps://github.com/gamma/jobs/blob/main/sre.md\n`;
  withTracker([...URL_HEADER, existing], { '002-gamma.tsv': addition }, ({ run, text, pending }) => {
    const first = run();
    assert.equal(first.status, 0, first.out);
    assert.equal(pending('002-gamma.tsv'), false, first.out);
    assert.match(text(), /Gamma.*\(https:\/\/github\.com\/gamma\/jobs\/blob\/main\/sre\.md\) \|/);
    const second = run();
    assert.equal(second.status, 0, second.out);
    const verified = run('verify-pipeline.mjs');
    assert.doesNotMatch(verified.out, /cannot be read as a tracker row/);
  });
});

test('a new addition whose row could not be read back fails the run and stays pending, and the others still merge', () => {
  const row = '| 1 | 2026-08-01 | Acme | Director, Test | 4.5/5 | Evaluated | ✅ | [1](reports/1-acme.md) | note | https://example.com/jobs/1 |';
  withTracker([...URL_HEADER, row], {
    '002-date.tsv': `${TSV_HEAD}\n2\t2026-10-02\t2026-10-02\tData Engineer\tEvaluated\t4.0/5\t❌\t[2](reports/002-x.md)\tfirst\n`,
    '003-good.tsv': `${TSV_HEAD}\n3\t2026-10-02\tGlobex\tData Engineer\tEvaluated\t4.0/5\t❌\t[3](reports/003-x.md)\tfirst\n`,
  }, ({ run, text, pending }) => {
    const r = run();
    assert.equal(r.status, 1, r.out);
    assert.match(r.out, /1 addition\(s\) were NOT merged .*002-date\.tsv/);
    assert.equal(pending('002-date.tsv'), true);
    assert.equal(pending('003-good.tsv'), false);
    assert.match(text(), /Globex/);
    assert.doesNotMatch(text(), /\| 2026-10-02 \| 2026-10-02 \|/);
  });
});

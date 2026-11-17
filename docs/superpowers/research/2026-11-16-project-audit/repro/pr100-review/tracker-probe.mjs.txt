import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const ROOT = process.cwd(); // run from the repo root
const H10 = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |', '|---|---|---|---|---|---|---|---|---|---|'];
const ADD = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n'
  + '2\t2026-02-01\tAcme\tData Engineer\tEvaluated\t4.5/5\t❌\t[2](reports/002-acme-2026-02-01.md)\tre-eval\thttps://jobs.acme.com/1\n';
export function run(name, rows, args = [], header = H10, add = ADD) {
  const work = mkdtempSync(join(tmpdir(), 'pr100-core-'));
  const adds = join(work, 'adds'); mkdirSync(adds);
  const tracker = join(work, 'applications.md');
  writeFileSync(tracker, [...header, ...rows, ''].join('\n'));
  if (add) writeFileSync(join(adds, '002-acme.tsv'), add);
  const r = spawnSync(process.execPath, [join(ROOT, 'merge-tracker.mjs'), ...args], { encoding: 'utf-8', cwd: work,
    env: { ...process.env, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: adds, CAREER_OPS_BATCH_STATE: join(work, 'bs.tsv') } });
  console.log(`\n===== ${name} (args: ${args.join(' ') || '-'}) exit=${r.status}`);
  console.log((r.stdout + r.stderr).split('\n').filter(l => /Row #|short|Update|Add|merged|Nothing|Backfill|⚠|❌|dry/i.test(l)).join('\n'));
  console.log('--- tracker rows after:');
  console.log(readFileSync(tracker, 'utf-8').split('\n').filter(l => /^\|\s*\d/.test(l) || /^\s+\|/.test(l)).join('\n'));
  console.log('pending:', existsSync(join(adds, '002-acme.tsv')), 'dirfiles:', readdirSync(work).join(','));
}
const c = process.argv[2];
const FULL = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
const SHORT = '| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |';
const cases = {
  // interior cell missing, but a literal pipe in the note restores the width
  pipeMask: () => run('short+pipe-in-note', ['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | call back a | b | https://jobs.acme.com/1 |']),
  escMask: () => run('short+escaped pipe', ['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | [1](../reports/001-acme-2026-01-01.md) | call back a \\| b | https://jobs.acme.com/1 |']),
  fullEsc: () => run('full+escaped pipe in note', ['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | call a \\| b | https://jobs.acme.com/1 |']),
  // interior cell missing, trailing extra empty cell
  extraTail: () => run('short+extra trailing cell', [SHORT + ' |']),
  indented: () => run('indented short row', ['  ' + SHORT]),
  indentedFull: () => run('indented full row', ['  ' + FULL]),
  missingNum: () => run('missing # cell', ['| 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note | https://jobs.acme.com/1 |']),
  crlf: () => run('crlf full', [FULL + '\r'], [], H10.map(l => l + '\r')),
  dry: () => run('dry short', [SHORT], ['--dry-run']),
  backfillShort: () => run('backfill interior short', [SHORT], ['--backfill-urls']),
  backfillDry: () => run('backfill dry', [SHORT], ['--backfill-urls', '--dry-run']),
  nothingPending: () => run('short nothing pending', [SHORT], [], H10, null),
  zeroNum: () => run('short row numbered 0', [SHORT.replace('| 1 |', '| 0 |')]),
  dashNum: () => run('short row no number', [SHORT.replace('| 1 |', '| — |')]),
  twoShort: () => run('two cells short', ['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | my note | https://jobs.acme.com/1 |']),
  full: () => run('full baseline', [FULL]),
  fullTwice: () => { run('full baseline', [FULL]); },
};
if (c === 'all') for (const k of Object.keys(cases)) cases[k](); else cases[c]();

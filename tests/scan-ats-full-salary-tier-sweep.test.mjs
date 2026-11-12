// The directory loop of scan-ats-full.mjs repeats the filter chain inline, so
// the exported passesFilters cannot pin it. Driven end to end the way
// scan-ats-full-resume-no-duplicates.test.mjs is: a stubbed greenhouse provider
// behind an --import preload, a temp data root, and no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, NODE } from './helpers.mjs';

function sweepRoot(t, portals, companies = ['sandbox-co']) {
  const dir = mkdtempSync(join(tmpdir(), 'ats-full-salary-tier-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'portals.yml'), portals);
  mkdirSync(join(dir, 'data', 'cache', 'ats-companies'), { recursive: true });
  writeFileSync(join(dir, 'data', 'cache', 'ats-companies', 'greenhouse.json'), JSON.stringify(companies));
  writeFileSync(join(dir, 'data', 'pipeline.md'), '# Pipeline\n\n## Pendientes\n');
  const preload = join(dir, 'preload.mjs');
  writeFileSync(preload, `
import provider from ${JSON.stringify(pathToFileURL(join(ROOT, 'providers', 'greenhouse.mjs')).href)};
let board = 'sandbox-co';
// The dedup key of a greenhouse posting is its job id, so each board gets its own ids.
let idBase = 0;
const job = (id, title, extra = {}) => ({ title, url: 'https://job-boards.greenhouse.io/' + board + '/jobs/' + (idBase + id),
  company: board, location: 'Remote', postedAt: Date.now(), description: '', ...extra });
provider.fetchListing = undefined;
const resolverDown = () => { const err = new TypeError('fetch failed');
  err.cause = Object.assign(new Error('getaddrinfo EAI_AGAIN boards-api.greenhouse.io'), { code: 'EAI_AGAIN' }); return err; };
provider.fetch = async (entry) => {
  board = entry.name;
  const n = Number(String(entry.name).replace('sandbox-co-', ''));
  idBase = entry.name === 'other-co' ? 100 : Number.isInteger(n) ? 1000 * n : 0;
  if (process.env.STUB_REPLAY) {
    if (n < 5) return Object.assign([job(1, 'Platform Engineer I', { postedAt: undefined }), job(2, 'Principal Engineer', { postedAt: undefined })], { workdayNoDateSkip: true });
    if (process.env.STUB_REPLAY === 'outage') throw resolverDown();
    return [];
  }
  return process.env.STUB_NO_DATE_BOARD ? Object.assign([
  job(7, 'Platform Engineer I', { postedAt: undefined }),
  job(8, 'Principal Engineer', { postedAt: undefined }),
  job(9, 'Sales Associate', { postedAt: undefined }),
], { workdayNoDateSkip: true }) : [
  job(1, 'Director of Engineering'),
  job(2, 'Infrastructure Engineer I'),
  job(3, 'Staff Engineer', { salary: { min: 90000, max: 120000, currency: 'USD' } }),
  job(4, 'Sales Associate I'),
  job(5, 'Platform Engineer I', { postedAt: undefined }),
  job(6, 'Principal Engineer', { postedAt: undefined }),
];
};
provider.enrichDate = async (j) => { process.stderr.write('ENRICHED ' + j.title + '\\n'); };
globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
`);
  const run = (extra = [], env = {}) => spawnSync(NODE, ['--import', pathToFileURL(preload).href, join(ROOT, 'scan-ats-full.mjs'), '--ats', 'greenhouse', ...extra], {
    cwd: dir, encoding: 'utf-8', timeout: 120_000,
    env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_DATA_DIR: '', CAREER_OPS_PORTALS: '', CAREER_OPS_PIPELINE: '', CAREER_OPS_SCAN_HISTORY: '', CAREER_OPS_DNS_LOOKUPS_PER_MIN: '0', ...env },
  });
  return { dir, run };
}

const TITLES = 'title_filter:\n  positive: [director, engineer]\n';

test('the sweep drops and counts a skipped level and a salary under the minimum', (t) => {
  const { dir, run } = sweepRoot(t, `${TITLES}skip_tiers: [Entry]\nsalary_filter:\n  min: 150000\n  currency: USD\n`);
  const result = run(['--json']);
  assert.equal(result.status, 0, result.stderr.slice(-800));
  const report = JSON.parse(result.stdout.trim().split('\n').at(-1));
  assert.equal(report.postingsKept, 1);
  assert.equal(report.postingsDroppedTier, 2, 'the dated and the undated entry-level titles; the off-title one is not a tier drop');
  assert.equal(report.postingsDroppedSalary, 1);
  assert.equal(report.postingsDroppedNoDate, 1, 'an undated skipped level is a tier drop, not an undated one');
  const pending = readFileSync(join(dir, 'data', 'pipeline.md'), 'utf-8').split('\n').filter((l) => l.startsWith('- [ ] '));
  assert.equal(pending.length, 1);
  assert.match(pending[0], /\/jobs\/1\b/);
  assert.match(result.stderr, /ENRICHED Principal Engineer/);
  assert.doesNotMatch(result.stderr, /ENRICHED Platform Engineer I/, 'a skipped level pays for no date request');
});

test('the printed summary names both counts', (t) => {
  const { run } = sweepRoot(t, `${TITLES}skip_tiers: [entry]\nsalary_filter:\n  min: 150000\n`);
  const result = run(['--dry-run']);
  assert.equal(result.status, 0, result.stderr.slice(-800));
  const out = result.stdout + result.stderr;
  assert.match(out, /Tier-filtered:\s+2/);
  assert.match(out, /Salary-filtered:\s+1/);
});

test('with neither setting the same board keeps every on-title dated posting', (t) => {
  const { run } = sweepRoot(t, TITLES);
  const report = JSON.parse(run(['--json']).stdout.trim().split('\n').at(-1));
  assert.equal(report.postingsKept, 3);
  assert.equal(report.postingsDroppedTier, 0);
  assert.equal(report.postingsDroppedSalary, 0);
});

test('a bad skip_tiers or salary_filter stops the sweep with the value named', (t) => {
  for (const [yaml, message] of [
    ['skip_tiers: [junior]\n', /Error: portals\.yml skip_tiers must be a list of intern, entry, mid, senior.*got \["junior"\]/],
    ['salary_filter:\n  min: 200000\n  max: 150000\n', /Error: portals\.yml salary_filter\.min cannot be above salary_filter\.max; got \{"min":200000,"max":150000\}/],
    ['salary_filter: high\n', /Error: portals\.yml salary_filter must be a mapping/],
  ]) {
    const result = sweepRoot(t, TITLES + yaml).run(['--json']);
    assert.equal(result.status, 1, yaml);
    assert.match(result.stderr, message);
  }
});

test('a tier drop is not also reported in the no-date breakdown of its board', (t) => {
  const { run } = sweepRoot(t, `${TITLES}skip_tiers: [entry]\n`);
  const result = run(['--dry-run'], { STUB_NO_DATE_BOARD: '1' });
  assert.equal(result.status, 0, result.stderr.slice(-800));
  const out = result.stdout + result.stderr;
  assert.match(out, /Tier-filtered:\s+1/);
  assert.match(out, /Undated dropped: 2 \(incl\. 2 from 1 workday/);
});

test('a resumed sweep does not count again the drops of boards it replays', (t) => {
  const companies = Array.from({ length: 120 }, (_, i) => `sandbox-co-${i}`);
  const { dir, run } = sweepRoot(t, `${TITLES}skip_tiers: [entry]\n`, companies);
  run(['--json'], { STUB_REPLAY: 'outage' });
  const file = join(dir, 'data', 'cache', 'ats-full-checkpoint.json');
  assert.ok(existsSync(file), 'premise: the resolver breaker stopped the sweep and kept its checkpoint');
  const checkpoint = JSON.parse(readFileSync(file, 'utf-8'));
  assert.equal(checkpoint.counters.droppedTier, 5, 'premise: five boards each dropped one skipped level');
  // What a slow early board does to a periodic checkpoint: the counters hold
  // drops from boards past resumeAt, which the resumed run fetches again.
  checkpoint.current.resumeAt = 0;
  writeFileSync(file, JSON.stringify(checkpoint));
  const resumed = run(['--resume'], { STUB_REPLAY: 'clean' });
  assert.equal(resumed.status, 0, resumed.stderr.slice(-800));
  const out = resumed.stdout + resumed.stderr;
  assert.match(out, /Tier-filtered:\s+5/);
  const [, undated, fromNoDateBoards] = out.match(/Undated dropped: (\d+) \(incl\. (\d+) from/);
  assert.equal(fromNoDateBoards, undated, 'every board here is a no-date board, and a replayed tier drop is not among its undated postings');
});

test('a tier drop on a history board leaves the directory boards\' no-date breakdown alone', (t) => {
  const { dir, run } = sweepRoot(t, `${TITLES}skip_tiers: [entry]\n`);
  writeFileSync(join(dir, 'data', 'scan-history.tsv'),
    'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\nhttps://job-boards.greenhouse.io/other-co/jobs/99\t2026-01-01\tgreenhouse\tDirector\tother-co\tadded\n');
  const result = run(['--dry-run', '--history-seeds'], { STUB_NO_DATE_BOARD: '1' });
  assert.equal(result.status, 0, result.stderr.slice(-800));
  const out = result.stdout + result.stderr;
  assert.match(out, /Application history — 1 unique ATS board/, 'premise: the history board was scanned');
  assert.match(out, /Tier-filtered:\s+2/);
  assert.match(out, /Undated dropped: 4 \(incl\. 2 from 1 workday/);
});

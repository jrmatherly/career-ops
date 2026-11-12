// The directory loop of scan-ats-full.mjs repeats the filter chain inline, so
// the exported passesFilters cannot pin it. Driven end to end the way
// scan-ats-full-resume-no-duplicates.test.mjs is: a stubbed greenhouse provider
// behind an --import preload, a temp data root, and no network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { ROOT, NODE } from './helpers.mjs';

function sweepRoot(t, portals) {
  const dir = mkdtempSync(join(tmpdir(), 'ats-full-salary-tier-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  writeFileSync(join(dir, 'portals.yml'), portals);
  mkdirSync(join(dir, 'data', 'cache', 'ats-companies'), { recursive: true });
  writeFileSync(join(dir, 'data', 'cache', 'ats-companies', 'greenhouse.json'), JSON.stringify(['sandbox-co']));
  writeFileSync(join(dir, 'data', 'pipeline.md'), '# Pipeline\n\n## Pendientes\n');
  const preload = join(dir, 'preload.mjs');
  writeFileSync(preload, `
import provider from ${JSON.stringify(pathToFileURL(join(ROOT, 'providers', 'greenhouse.mjs')).href)};
const job = (id, title, extra = {}) => ({ title, url: 'https://job-boards.greenhouse.io/sandbox-co/jobs/' + id,
  company: 'sandbox-co', location: 'Remote', postedAt: Date.now(), description: '', ...extra });
provider.fetchListing = undefined;
provider.fetch = async () => [
  job(1, 'Director of Engineering'),
  job(2, 'Infrastructure Engineer I'),
  job(3, 'Staff Engineer', { salary: { min: 90000, max: 120000, currency: 'USD' } }),
  job(4, 'Sales Associate I'),
  job(5, 'Platform Engineer I', { postedAt: undefined }),
  job(6, 'Principal Engineer', { postedAt: undefined }),
];
provider.enrichDate = async (j) => { process.stderr.write('ENRICHED ' + j.title + '\\n'); };
globalThis.fetch = async () => { throw new Error('Unexpected network request'); };
`);
  const run = (extra = []) => spawnSync(NODE, ['--import', pathToFileURL(preload).href, join(ROOT, 'scan-ats-full.mjs'), '--ats', 'greenhouse', ...extra], {
    cwd: dir, encoding: 'utf-8', timeout: 120_000,
    env: { ...process.env, CAREER_OPS_ROOT: dir, CAREER_OPS_DATA_DIR: '', CAREER_OPS_PORTALS: '', CAREER_OPS_PIPELINE: '', CAREER_OPS_SCAN_HISTORY: '', CAREER_OPS_DNS_LOOKUPS_PER_MIN: '0' },
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

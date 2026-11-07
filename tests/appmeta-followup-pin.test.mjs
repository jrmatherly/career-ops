#!/usr/bin/env node
/**
 * tests/appmeta-followup-pin.test.mjs — followup-pin.mjs writes a pin followup-cadence.mjs reads.
 *
 * Run: node test-all.mjs --only appmeta-followup-pin
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';

console.log('\nfollowup-pin.mjs — pin the next follow-up date');

// followup-cadence.mjs reads CAREER_OPS_PROFILE at module load; pin it for the
// import only and restore it, as tests/followup-seed.test.mjs explains.
const PRIOR_PROFILE = process.env.CAREER_OPS_PROFILE;
process.env.CAREER_OPS_PROFILE = join(ROOT, 'tests', 'fixtures', 'profile-default-cadence.yml');
let parseNextOverrides;
try {
  ({ parseNextOverrides } = await import('../followup-cadence.mjs'));
} finally {
  if (PRIOR_PROFILE === undefined) delete process.env.CAREER_OPS_PROFILE;
  else process.env.CAREER_OPS_PROFILE = PRIOR_PROFILE;
}

const TRACKER = [
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|---|---|---|---|---|---|---|---|',
  '| 3 | 2026-10-01 | Acme Corp | Backend Engineer | 4.2/5 | Interview | ❌ | — | — |',
  '| 5 | 2026-10-02 | Globex | Platform Engineer | 4.0/5 | Applied | ❌ | — | — |',
  '| 6 | 2026-10-03 | Initech | Data Engineer | 3.9/5 | Applied | ❌ | — | — |',
  '| 12 | 2026-10-05 | Northwind Traders | SRE | 4.1/5 | Applied | ❌ | — | — |',
  '',
].join('\n');
function withTracker(root) {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'applications.md'), TRACKER);
  return root;
}

const tmp = withTracker(mkdtempSync(join(tmpdir(), 'co-pin-')));
const cli = (...args) => run(NODE, [join(ROOT, 'followup-pin.mjs'), ...args], { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: tmp } });
const file = join(tmp, 'data', 'follow-ups.md');

try {
  const out = cli('--num', '3', '--date', '2026-12-01', '--note', 'after the offsite');
  if (out && /^- next #3 2026-12-01 \(set \d{4}-\d{2}-\d{2}\) — after the offsite$/.test(out)) pass('prints the pin line with its note');
  else fail(`output: ${JSON.stringify(out)}`);
  const content = readFileSync(file, 'utf-8');
  if (content.startsWith('# Follow-ups\n\n| num |')) pass('creates the file with the seeder\'s header');
  else fail(`content: ${JSON.stringify(content.slice(0, 30))}`);
  const pin = parseNextOverrides(content).get(3);
  if (pin?.date === '2026-12-01') pass('parseNextOverrides reads the pin');
  else fail(`pins: ${JSON.stringify([...parseNextOverrides(content)])}`);

  const bare = cli('--num', '3', '--date', '2026-12-02');
  const after = readFileSync(file, 'utf-8');
  const pins3 = after.split('\n').filter((l) => /^- next #3 /.test(l));
  if (bare && /^- next #3 2026-12-02 \(set \d{4}-\d{2}-\d{2}\)$/.test(bare) && pins3.length === 1 && parseNextOverrides(after).get(3)?.date === '2026-12-02') pass('a re-pin replaces the earlier pin for that row');
  else fail(`after: ${JSON.stringify(after)}`);

  if (cli('--num', '3', '--date', '2026-02-30') === null) pass('impossible date exits non-zero');
  else fail('impossible date accepted');
  if (cli('--num', '99', '--date', '2026-12-01') === null) pass('a number with no tracker row exits non-zero');
  else fail('missing tracker row accepted');

  const elsewhere = join(tmp, 'elsewhere', 'follow-ups.md');
  const envOut = run(NODE, [join(ROOT, 'followup-pin.mjs'), '--num', '5', '--date', '2026-12-03'], { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: tmp, CAREER_OPS_FOLLOWUPS: elsewhere } });
  if (envOut && parseNextOverrides(readFileSync(elsewhere, 'utf-8')).get(5)?.date === '2026-12-03' && !readFileSync(file, 'utf-8').includes('#5 ')) pass('CAREER_OPS_FOLLOWUPS wins over the data root, as followup-cadence reads it');
  else fail(`env pin: ${JSON.stringify(envOut)}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

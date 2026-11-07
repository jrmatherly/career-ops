#!/usr/bin/env node
/**
 * tests/appmeta-salary-observe.test.mjs — salary-observe.mjs appends a row salary-gap.mjs reads.
 *
 * Run: node test-all.mjs --only appmeta-salary-observe
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';
import { parseObservations } from '../salary-gap.mjs';

console.log('\nsalary-observe.mjs — one data/salary-observations.tsv row');

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

const tmp = withTracker(mkdtempSync(join(tmpdir(), 'co-salobs-')));
const cli = (...args) => run(NODE, [join(ROOT, 'salary-observe.mjs'), ...args], { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: tmp } });

try {
  const out = cli('--num', '3', '--kind', 'desired', '--amount', '150000', '--currency', 'usd', '--source', 'user', '--note', 'base only');
  if (out && /^3\t\d{4}-\d{2}-\d{2}\tdesired\t150000\tUSD\tuser\tbase only$/.test(out)) pass('prints the row with the currency uppercased');
  else fail(`output: ${JSON.stringify(out)}`);
  cli('--num', '3', '--kind', 'advertised', '--amount', '140000', '--currency', 'USD', '--source', 'jd');
  const obs = parseObservations(readFileSync(join(tmp, 'data', 'salary-observations.tsv'), 'utf-8'));
  if (obs.length === 2 && obs[0].type === 'desired' && obs[0].num === '3' && obs[0].currency === 'USD' && obs[0].parsed !== null) pass('parseObservations reads both rows');
  else fail(`parsed: ${JSON.stringify(obs)}`);
  if (cli('--num', '3', '--kind', 'wished', '--amount', '1', '--currency', 'USD', '--source', 'user') === null) pass('unknown kind exits non-zero');
  else fail('unknown kind accepted');
  if (cli('--num', '3', '--kind', 'desired', '--amount', '1', '--currency', 'DOLLARS', '--source', 'user') === null) pass('bad currency exits non-zero');
  else fail('bad currency accepted');
  if (cli('--num', '99', '--kind', 'desired', '--amount', '1', '--currency', 'USD', '--source', 'user') === null) pass('a number with no tracker row exits non-zero');
  else fail('missing tracker row accepted');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

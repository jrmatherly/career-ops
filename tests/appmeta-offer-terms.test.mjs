#!/usr/bin/env node
/**
 * tests/appmeta-offer-terms.test.mjs — offer-terms.mjs writes data/offers/<slug>/terms.md.
 *
 * Run: node test-all.mjs --only appmeta-offer-terms
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';

console.log('\noffer-terms.mjs — current offer terms');

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

const tmp = withTracker(mkdtempSync(join(tmpdir(), 'co-offer-')));
const cli = (...args) => run(NODE, [join(ROOT, 'offer-terms.mjs'), ...args], { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: tmp } });
const file = join(tmp, 'data', 'offers', 'acme-corp', 'terms.md');

try {
  const out = cli('--company', 'acme-corp', '--num', '3', '--start-date', '2027-01-04', '--base', '150000', '--currency', 'usd', '--period', 'annual', '--equity', '0.1% | 4y', '--respond-by', '2026-11-20');
  if (out?.startsWith(file)) pass('prints the path first');
  else fail(`output: ${JSON.stringify(out)}`);
  const body = readFileSync(file, 'utf-8');
  const lines = body.split('\n');
  if (lines[0] === '# Offer terms — acme-corp' && lines.includes('Tracker: #3') && /^Recorded: \d{4}-\d{2}-\d{2}$/m.test(body)) pass('header names the slug, tracker row and date');
  else fail(`header: ${JSON.stringify(lines.slice(0, 5))}`);
  const rows = lines.filter((l) => l.startsWith('| ') && !l.startsWith('| Field'));
  const expected = ['| Base | 150000 |', '| Currency | USD |', '| Period | annual |', '| Equity | 0.1% / 4y |', '| Respond by | 2026-11-20 |', '| Start date | 2027-01-04 |'];
  if (JSON.stringify(rows) === JSON.stringify(expected)) pass('rows follow the fixed order and escape pipes');
  else fail(`rows: ${JSON.stringify(rows)}`);

  cli('--company', 'acme-corp', '--num', '3', '--base', '160000');
  const rows2 = readFileSync(file, 'utf-8').split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Field'));
  if (JSON.stringify(rows2) === JSON.stringify(['| Base | 160000 |', ...expected.slice(1)])) pass('a second run merges: the new base replaces the old, every other term stays');
  else fail(`after merge: ${JSON.stringify(rows2)}`);
  if (cli('--company', 'acme-corp', '--num', '3') === null) pass('a run that names no term exits non-zero');
  else fail('a run with no terms succeeded');
  if (cli('--company', 'acme-corp', '--num', '99', '--base', '1') === null) pass('a number with no tracker row exits non-zero');
  else fail('missing tracker row accepted');

  if (cli('--company', '../evil', '--num', '3', '--base', '1') === null) pass('bad slug exits non-zero');
  else fail('bad slug accepted');
  if (cli('--company', 'acme-corp', '--num', '3', '--respond-by', '2026-02-30') === null) pass('impossible date exits non-zero');
  else fail('impossible date accepted');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

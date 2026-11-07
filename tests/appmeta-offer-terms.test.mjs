#!/usr/bin/env node
/**
 * tests/appmeta-offer-terms.test.mjs — offer-terms.mjs writes data/offers/<slug>/terms.md.
 *
 * Run: node test-all.mjs --only appmeta-offer-terms
 */

import { mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';

console.log('\noffer-terms.mjs — current offer terms');

const tmp = mkdtempSync(join(tmpdir(), 'co-offer-'));
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
  if (JSON.stringify(rows2) === JSON.stringify(['| Base | 160000 |'])) pass('a second run replaces the file');
  else fail(`after overwrite: ${JSON.stringify(rows2)}`);

  if (cli('--company', '../evil', '--num', '3', '--base', '1') === null) pass('bad slug exits non-zero');
  else fail('bad slug accepted');
  if (cli('--company', 'acme-corp', '--num', '3', '--respond-by', '2026-02-30') === null) pass('impossible date exits non-zero');
  else fail('impossible date accepted');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

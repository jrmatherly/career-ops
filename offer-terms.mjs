#!/usr/bin/env node
/**
 * offer-terms.mjs — record the current terms of an offer in
 * data/offers/<company-slug>/terms.md, the directory offer-prep already uses.
 * A run merges the fields it names into the existing table, so a later
 * `--equity` does not erase an earlier `--base`.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags, flagValue, hasFlag } from './lib/cli-flags.mjs';
import { localToday } from './lib/local-today.mjs';
import { parseDate } from './lib/parse-date.mjs';
import { cell, writeFileAtomic } from './tracker-utils.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
import { parseNum, requireTrackerRow } from './lib/application-meta.mjs';

const FIELDS = [
  ['--base', 'Base'],
  ['--currency', 'Currency'],
  ['--period', 'Period'],
  ['--variable', 'Variable'],
  ['--equity', 'Equity'],
  ['--respond-by', 'Respond by'],
  ['--start-date', 'Start date'],
];
const VALUE_FLAGS = ['--company', '--num', ...FIELDS.map(([f]) => f)];
const USAGE = `Usage: node offer-terms.mjs --company <slug> --num N [--base X] [--currency CCC] [--period annual|monthly|hourly]
         [--variable text] [--equity text] [--respond-by YYYY-MM-DD] [--start-date YYYY-MM-DD]`;

function existingValues(content) {
  const out = {};
  for (const line of String(content ?? '').split('\n')) {
    const m = line.match(/^\| (.+?) \| (.*) \|$/);
    const field = m && FIELDS.find(([, label]) => label === m[1]);
    if (field) out[field[0]] = m[2];
  }
  return out;
}

async function main(args) {
  validateFlags(args, [...VALUE_FLAGS, '--help', '-h'], USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const slug = flagValue(args, '--company') ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`--company must be a lowercase slug (a-z, 0-9, -), got "${slug}"\n${USAGE}`);
  const root = getCareerOpsRoot();
  const num = parseNum(flagValue(args, '--num') ?? '');
  requireTrackerRow(root, num);
  const given = Object.fromEntries(FIELDS.filter(([f]) => hasFlag(args, f)).map(([f]) => [f, cell(flagValue(args, f))]));
  if (Object.keys(given).length === 0) throw new Error(`Give at least one term to record\n${USAGE}`);
  for (const [f, v] of Object.entries(given)) if (!v) throw new Error(`${f} needs a value`);
  if (given['--currency']) {
    given['--currency'] = given['--currency'].toUpperCase();
    if (!/^[A-Z]{3}$/.test(given['--currency'])) throw new Error('--currency must be a three-letter code');
  }
  if (given['--period'] && !['annual', 'monthly', 'hourly'].includes(given['--period'])) throw new Error('--period must be annual, monthly or hourly');
  for (const f of ['--respond-by', '--start-date']) {
    if (given[f] && !parseDate(given[f])) throw new Error(`${f} must be a real YYYY-MM-DD date, got "${given[f]}"`);
  }

  const file = join(root, 'data', 'offers', slug, 'terms.md');
  if (!existsSync(dirname(file))) console.error(`note: creating data/offers/${slug}/ (no offer-prep files there yet)`);
  mkdirSync(dirname(file), { recursive: true });
  let rows;
  await withPipelineLock(file, () => {
    const values = { ...existingValues(existsSync(file) ? readFileSync(file, 'utf-8') : ''), ...given };
    rows = FIELDS.filter(([f]) => f in values).map(([f, label]) => `| ${label} | ${values[f]} |`);
    writeFileAtomic(file, `# Offer terms — ${slug}\n\nTracker: #${num}\nRecorded: ${localToday()}\n\n| Field | Value |\n|---|---|\n${rows.map((r) => `${r}\n`).join('')}`);
  });
  console.log([file, ...rows].join('\n'));
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

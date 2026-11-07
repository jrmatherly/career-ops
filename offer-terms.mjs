#!/usr/bin/env node
/**
 * offer-terms.mjs — record the current terms of an offer in
 * data/offers/<company-slug>/terms.md, the directory offer-prep already uses.
 * Each run replaces the file: it holds the latest terms, not a history.
 */

import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags, flagValue, hasFlag } from './lib/cli-flags.mjs';
import { localToday } from './lib/local-today.mjs';
import { parseDate } from './lib/parse-date.mjs';
import { cell, writeFileAtomic } from './tracker-utils.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
import { parseNum } from './lib/application-meta.mjs';

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

async function main(args) {
  validateFlags(args, [...VALUE_FLAGS, '--help', '-h'], USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const slug = flagValue(args, '--company') ?? '';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) throw new Error(`--company must be a lowercase slug (a-z, 0-9, -), got "${slug}"\n${USAGE}`);
  const num = parseNum(flagValue(args, '--num') ?? '');
  const values = Object.fromEntries(FIELDS.filter(([f]) => hasFlag(args, f)).map(([f]) => [f, cell(flagValue(args, f))]));
  for (const [f, v] of Object.entries(values)) if (!v) throw new Error(`${f} needs a value`);
  if (values['--currency']) {
    values['--currency'] = values['--currency'].toUpperCase();
    if (!/^[A-Z]{3}$/.test(values['--currency'])) throw new Error('--currency must be a three-letter code');
  }
  if (values['--period'] && !['annual', 'monthly', 'hourly'].includes(values['--period'])) throw new Error('--period must be annual, monthly or hourly');
  for (const f of ['--respond-by', '--start-date']) {
    if (values[f] && !parseDate(values[f])) throw new Error(`${f} must be a real YYYY-MM-DD date, got "${values[f]}"`);
  }

  const rows = FIELDS.filter(([f]) => f in values).map(([f, label]) => `| ${label} | ${values[f]} |`);
  const file = join(getCareerOpsRoot(), 'data', 'offers', slug, 'terms.md');
  const body = `# Offer terms — ${slug}\n\nTracker: #${num}\nRecorded: ${localToday()}\n\n| Field | Value |\n|---|---|\n${rows.map((r) => `${r}\n`).join('')}`;
  mkdirSync(dirname(file), { recursive: true });
  await withPipelineLock(file, () => writeFileAtomic(file, body));
  console.log([file, ...rows].join('\n'));
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

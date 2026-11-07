#!/usr/bin/env node
/**
 * salary-observe.mjs — append one row to data/salary-observations.tsv in the
 * shape salary-gap.mjs parseObservations reads.
 */

import { join } from 'node:path';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags, flagValue } from './lib/cli-flags.mjs';
import { localToday } from './lib/local-today.mjs';
import { appendSidecarRow, parseNum, tsvCell } from './lib/application-meta.mjs';

const KINDS = ['desired', 'advertised', 'actual'];
const VALUE_FLAGS = ['--num', '--kind', '--amount', '--currency', '--source', '--note'];
const USAGE = 'Usage: node salary-observe.mjs --num N --kind desired|advertised|actual --amount X --currency CCC --source s [--note text]';

async function main(args) {
  validateFlags(args, [...VALUE_FLAGS, '--help', '-h'], USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const need = (flag) => {
    const v = tsvCell(flagValue(args, flag));
    if (!v) throw new Error(`${flag} is required\n${USAGE}`);
    return v;
  };
  const num = parseNum(need('--num'));
  const kind = need('--kind');
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}`);
  const amount = need('--amount');
  const currency = need('--currency').toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error(`--currency must be a three-letter code, got "${currency}"`);
  const row = [num, localToday(), kind, amount, currency, need('--source'), tsvCell(flagValue(args, '--note'))].join('\t');
  await appendSidecarRow(join(getCareerOpsRoot(), 'data', 'salary-observations.tsv'), row);
  console.log(row);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

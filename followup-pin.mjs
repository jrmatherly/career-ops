#!/usr/bin/env node
/**
 * followup-pin.mjs — pin the next follow-up date for one application in
 * data/follow-ups.md, in the grammar followup-cadence.mjs OVERRIDE_RE reads.
 * followup-seed.mjs's CLI is not reused because its --date is the apply date
 * the cadence counts from; its replaceNextPin takes the next date directly.
 */

import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags, flagValue } from './lib/cli-flags.mjs';
import { replaceNextPin, formatPinLine } from './followup-seed.mjs';
import { getCareerOpsRoot } from './path-resolver.mjs';
import { parseNum, requireTrackerRow, tsvCell } from './lib/application-meta.mjs';

const VALUE_FLAGS = ['--num', '--date', '--note'];
const USAGE = 'Usage: node followup-pin.mjs --num N --date YYYY-MM-DD [--note text]';

async function main(args) {
  validateFlags(args, [...VALUE_FLAGS, '--help', '-h'], USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const num = parseNum(flagValue(args, '--num') ?? '');
  const date = flagValue(args, '--date') ?? '';
  const note = tsvCell(flagValue(args, '--note'));
  requireTrackerRow(getCareerOpsRoot(), num);
  // replaceNextPin resolves the path itself: CAREER_OPS_FOLLOWUPS first, then
  // the data root, the same order followup-cadence.mjs reads.
  const { changed, setDate } = await replaceNextPin(num, { date, why: note });
  if (!changed) console.error('note: this pin was already in place; nothing written');
  console.log(formatPinLine(num, date, setDate) + (note ? ` — ${note}` : ''));
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

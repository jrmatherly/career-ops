#!/usr/bin/env node
/**
 * evaluate-queue.mjs — read and write data/evaluate-queue.tsv (lib/evaluate-queue.mjs).
 * `dump --json` is the interface a web reader would use: web/src never imports
 * root modules, it runs this CLI through runCoreCli.
 */

import { getCareerOpsRoot, getProfilePath } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { flagValue, hasFlag, validateFlags } from './lib/cli-flags.mjs';
import { appendRow, drainPlan, readDailyCap, readLedger } from './lib/evaluate-queue.mjs';

const VALUE_FLAGS = ['--url', '--state', '--job', '--run', '--rank', '--reason', '--source', '--threshold', '--max'];

const USAGE = `Usage:
  node evaluate-queue.mjs dump --json
  node evaluate-queue.mjs add --url <u> --state <s> --job <id> --run <id> [--rank N] [--reason R] [--source rank-pass|drain]
  node evaluate-queue.mjs drain-plan --json [--job <id>] [--threshold N] [--max N]`;

function numberFlag(args, flag) {
  const raw = flagValue(args, flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value)) throw new Error(`${flag} must be a number, got "${raw}"`);
  return value;
}

function required(args, flag) {
  const value = flagValue(args, flag);
  if (!value) throw new Error(`${flag} is required`);
  return value;
}

async function main(args) {
  validateFlags(args, [...VALUE_FLAGS, '--json', '--help', '-h'], USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  const [cmd, ...rest] = args.filter((a, i) => !a.startsWith('--') && !VALUE_FLAGS.includes(args[i - 1]));
  const root = getCareerOpsRoot();
  if (cmd === 'dump' && !rest.length && hasFlag(args, '--json')) {
    const skipped = [];
    console.log(JSON.stringify(readLedger(root, { skipped }), null, 2));
    if (skipped.length) console.error(`warning: ${skipped.length} malformed row(s) in data/evaluate-queue.tsv skipped`);
  } else if (cmd === 'add' && !rest.length) {
    console.log(await appendRow(root, {
      url: required(args, '--url'),
      state: required(args, '--state'),
      jobId: required(args, '--job'),
      runId: required(args, '--run'),
      rank: numberFlag(args, '--rank'),
      reason: flagValue(args, '--reason') ?? '',
      source: flagValue(args, '--source') ?? 'rank-pass',
    }));
  } else if (cmd === 'drain-plan' && !rest.length && hasFlag(args, '--json')) {
    console.log(JSON.stringify(drainPlan(root, {
      jobId: flagValue(args, '--job'),
      rankThreshold: numberFlag(args, '--threshold'),
      maxPerRun: numberFlag(args, '--max'),
      dailyCap: readDailyCap(getProfilePath()),
    }).map((entry) => entry.url), null, 2));
  } else {
    console.error(USAGE);
    process.exit(1);
  }
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

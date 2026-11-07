#!/usr/bin/env node
/**
 * app-meta.mjs — read and write data/application-meta.tsv (lib/application-meta.mjs).
 * `dump --json` is the interface a web reader is meant to use: the web keeps
 * its own parsers and never imports root modules. No web consumer exists yet.
 */

import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags, flagValue } from './lib/cli-flags.mjs';
import { META_KEYS, parseNum, readMeta, requireTrackerRow, setMeta } from './lib/application-meta.mjs';

const warnSkipped = (skipped) => {
  if (skipped.length) console.error(`warning: ${skipped.length} malformed or unknown-key row(s) in data/application-meta.tsv skipped`);
};

const USAGE = `Usage:
  node app-meta.mjs get <num>
  node app-meta.mjs set <num> <key> <value> [--source s]   keys: ${META_KEYS.join(', ')}
  node app-meta.mjs dump --json`;

async function main(args) {
  validateFlags(args, ['--source', '--json', '--help', '-h'], USAGE, { valueFlags: ['--source'], requireOperand: true });
  const [cmd, ...rest] = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--source');
  const root = getCareerOpsRoot();
  if (cmd === 'get' && rest.length === 1) {
    const skipped = [];
    const rec = readMeta(root, skipped).get(parseNum(rest[0])) ?? {};
    warnSkipped(skipped);
    const show = (k) => [rec[k]?.value ?? ''].flat().join(',');
    console.log(META_KEYS.map((k) => `${k}=${show(k)}`).join(' '));
  } else if (cmd === 'set' && rest.length === 3) {
    requireTrackerRow(root, parseNum(rest[0]));
    console.log(await setMeta(root, rest[0], rest[1], rest[2], flagValue(args, '--source') ?? 'manual'));
  } else if (cmd === 'dump' && rest.length === 0) {
    const skipped = [];
    console.log(JSON.stringify(Object.fromEntries(readMeta(root, skipped)), null, 2));
    warnSkipped(skipped);
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

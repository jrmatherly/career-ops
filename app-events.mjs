#!/usr/bin/env node
/**
 * app-events.mjs — add to and list data/application-events.tsv (lib/application-events.mjs).
 * `list --json` is the interface a web reader is meant to use: the web keeps
 * its own parsers and never imports root modules. No web consumer exists yet.
 */

import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags } from './lib/cli-flags.mjs';
import { EVENT_KINDS, addEvent, readEvents } from './lib/application-events.mjs';
import { parseNum, requireTrackerRow } from './lib/application-meta.mjs';

const USAGE = `Usage:
  node app-events.mjs add <num> <kind> <text...>   kinds: ${EVENT_KINDS.join(', ')}
  node app-events.mjs list [<num>] --json`;

async function main(args) {
  validateFlags(args, ['--json', '--help', '-h'], USAGE);
  const [cmd, ...rest] = args.filter((a) => a !== '--json');
  const root = getCareerOpsRoot();
  if (cmd === 'add' && rest.length >= 3) {
    requireTrackerRow(root, parseNum(rest[0]));
    console.log(await addEvent(root, rest[0], rest[1], rest.slice(2).join(' ')));
  } else if (cmd === 'list' && rest.length <= 1) {
    const skipped = [];
    console.log(JSON.stringify(readEvents(root, rest[0], skipped), null, 2));
    if (skipped.length) console.error(`warning: ${skipped.length} malformed row(s) in data/application-events.tsv skipped`);
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

#!/usr/bin/env node
/**
 * app-events.mjs — add to and list data/application-events.tsv (lib/application-events.mjs).
 * `list --json` is how the web reads the sidecar.
 */

import { getCareerOpsRoot } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { validateFlags } from './lib/cli-flags.mjs';
import { EVENT_KINDS, addEvent, readEvents } from './lib/application-events.mjs';

const USAGE = `Usage:
  node app-events.mjs add <num> <kind> <text...>   kinds: ${EVENT_KINDS.join(', ')}
  node app-events.mjs list [<num>] --json`;

async function main(args) {
  validateFlags(args, ['--json', '--help', '-h'], USAGE);
  const [cmd, ...rest] = args.filter((a) => a !== '--json');
  const root = getCareerOpsRoot();
  if (cmd === 'add' && rest.length >= 3) {
    console.log(await addEvent(root, rest[0], rest[1], rest.slice(2).join(' ')));
  } else if (cmd === 'list' && rest.length <= 1) {
    console.log(JSON.stringify(readEvents(root, rest[0]), null, 2));
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

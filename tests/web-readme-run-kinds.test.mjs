// tests/web-readme-run-kinds.test.mjs — web/README.md names each run kind's tools and the overlay keys.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pass, fail, ROOT } from './helpers.mjs';

// Loaded with import() so a checkout without web/ skips instead of crashing (#3269).
const webLib = join(ROOT, 'web', 'src', 'lib');
const { toolScopeFor, toolNames } = existsSync(webLib) ? await import(pathToFileURL(join(webLib, 'claude-invocation.mjs')).href) : {};
const { KNOWN_KINDS = [] } = existsSync(webLib) ? await import(pathToFileURL(join(webLib, 'worker-capabilities.mjs')).href) : {};
if (!existsSync(webLib)) console.log('  ⏭️  web/ is not in this checkout; run-kind rows not checked');

const readme = existsSync(join(ROOT, 'web', 'README.md')) ? readFileSync(join(ROOT, 'web', 'README.md'), 'utf8') : '';
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
for (const kind of KNOWN_KINDS) {
  const allowed = toolNames(toolScopeFor(kind).allowed).join(', ');
  const row = new RegExp(`\\|\\s*\`${escape(kind)}\`\\s*\\|[^\\n]*${escape(allowed)}`);
  if (row.test(readme)) pass(`web/README.md Safety table names ${kind} with ${allowed}`);
  else fail(`web/README.md Safety table lacks a row for ${kind} listing ${allowed}`);
}
const scheduled = readme.slice(readme.indexOf('## Scheduled scans'), readme.indexOf('## Development'));
for (const marker of ['title_filter.negative', 'title_filter.positive', 'title_filter_full', 'always_allow', 'block_hard', 'io.career-ops.scheduled-scan']) {
  if (scheduled.includes(marker)) pass(`web/README.md Scheduled scans names ${marker}`);
  else fail(`web/README.md Scheduled scans does not name ${marker}`);
}

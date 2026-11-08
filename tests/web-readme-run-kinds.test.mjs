// tests/web-readme-run-kinds.test.mjs — web/README.md names each run kind's tools and the overlay keys.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { pass, fail, ROOT } from './helpers.mjs';

// Loaded with import() so a checkout without web/ skips instead of crashing (#3269).
const webLib = join(ROOT, 'web', 'src', 'lib');
if (!existsSync(webLib)) {
  pass('web/ is not in this checkout; run-kind rows skipped');
} else {
  const { toolScopeFor, toolNames } = await import(pathToFileURL(join(webLib, 'claude-invocation.mjs')).href);
  const { KNOWN_KINDS } = await import(pathToFileURL(join(webLib, 'worker-capabilities.mjs')).href);
  const readme = readFileSync(join(ROOT, 'web', 'README.md'), 'utf8');
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (!Array.isArray(KNOWN_KINDS) || KNOWN_KINDS.length === 0) fail('worker-capabilities.mjs exports no KNOWN_KINDS');
  for (const kind of KNOWN_KINDS ?? []) {
    const allowed = toolNames(toolScopeFor(kind).allowed).join(', ');
    // The whole cell, so a row crediting a kind with an extra tool fails too.
    const row = new RegExp(`\\|\\s*\`${escape(kind)}\`\\s*\\|\\s*${escape(allowed)}\\s*\\|`);
    if (row.test(readme)) pass(`web/README.md Safety table names ${kind} with ${allowed}`);
    else fail(`web/README.md Safety table lacks a row for ${kind} listing exactly ${allowed}`);
  }
  const start = readme.indexOf('## Scheduled scans');
  const end = readme.indexOf('## Development');
  const hasSection = start !== -1 && end > start;
  if (!hasSection) fail('web/README.md has no "## Scheduled scans" section before "## Development"');
  const scheduled = hasSection ? readme.slice(start, end) : '';
  for (const marker of ['title_filter.negative', 'title_filter.positive', 'title_filter_full', 'always_allow', 'block_hard', 'io.career-ops.scheduled-scan']) {
    if (scheduled.includes(marker)) pass(`web/README.md Scheduled scans names ${marker}`);
    else fail(`web/README.md Scheduled scans does not name ${marker}`);
  }
}

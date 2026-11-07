// tests/updater-fork-origin.test.mjs — the updater tracks this fork
// (jrmatherly/career-ops), never upstream: `check` at every session start must
// not prompt for an upstream release, and `apply` must never install upstream's
// tarball over the fork's system layer. The upgrade gate's mirror rewrites the
// same URL, and must keep rewriting the two upstream URLs that old tags embed.
// Plan: docs/superpowers/plans/2026-11-07-upstream-decoupling.md, Task 1.
import { pass, fail } from './helpers.mjs';

console.log('\nupdater fork origin — URL constants name this fork');

const FORK = 'jrmatherly/career-ops';
const UPSTREAM = ['https://github.com/career-ops-hq/career-ops.git', 'https://github.com/santifer/career-ops.git'];

const updater = await import('../update-system.mjs');
const gate = await import('../upgrade-tests.mjs');

for (const name of ['CANONICAL_REPO', 'RAW_VERSION_URL', 'RELEASES_API', 'UPSTREAM_REF_API']) {
  const value = updater[name];
  if (typeof value !== 'string') fail(`${name} is not exported from update-system.mjs`);
  else if (!value.includes(FORK)) fail(`${name} does not name ${FORK}: ${value}`);
  else if (/career-ops-hq|santifer/.test(value)) fail(`${name} still names upstream: ${value}`);
  else pass(`${name} names ${FORK}`);
}

if (gate.CANONICAL === updater.CANONICAL_REPO) pass('upgrade-tests CANONICAL equals the updater CANONICAL_REPO');
else fail(`upgrade-tests CANONICAL (${gate.CANONICAL}) differs from CANONICAL_REPO (${updater.CANONICAL_REPO})`);

const legacy = gate.CANONICAL_LEGACY;
if (Array.isArray(legacy) && UPSTREAM.every((u) => legacy.includes(u))) pass('upgrade-tests CANONICAL_LEGACY still names both upstream URLs');
else fail(`upgrade-tests CANONICAL_LEGACY must list ${UPSTREAM.join(' and ')}; got ${JSON.stringify(legacy)}`);

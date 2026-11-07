// tests/updater-fork-origin.test.mjs — the updater tracks this fork
// (jrmatherly/career-ops), never upstream: `check` at every session start must
// not prompt for an upstream release, and `apply` must never install upstream's
// tree over the fork's system layer. The upgrade gate's mirror rewrites the
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

// The product prompts must walk the channel that exists on this fork: the only
// update-available the fork produces comes from `check --channel main`, so the
// mode's fetch, apply and the AGENTS.md "If yes" line must all name it, and no
// prompt may fetch a `career-ops-v{remote}` tag the fork never has.
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './helpers.mjs';

const mode = readFileSync(join(ROOT, 'modes', 'update.md'), 'utf-8');
if (!/career-ops-v\{remote\}/.test(mode) && /git fetch https:\/\/github\.com\/jrmatherly\/career-ops\.git refs\/heads\/main/.test(mode)) pass('modes/update.md fetches the fork\'s refs/heads/main, not a release tag');
else fail('modes/update.md still fetches a career-ops-v{remote} tag (the fork has none)');
if (/check --channel main --force/.test(mode) && /apply --channel main --confirm/.test(mode)) pass('modes/update.md checks and applies on --channel main');
else fail('modes/update.md check/apply commands do not name --channel main');

const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf-8');
const section = agents.slice(agents.indexOf('## Update Check'), agents.indexOf('\n## ', agents.indexOf('## Update Check') + 1));
if (/If yes → `node update-system\.mjs apply --channel main --confirm`/.test(section)) pass('AGENTS.md Update Check applies on --channel main');
else fail('AGENTS.md Update Check "If yes" line does not apply on --channel main');

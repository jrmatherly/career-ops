// tests/updater-fork-origin.test.mjs — the updater tracks this fork
// (jrmatherly/career-ops), never upstream: `check` at every session start must
// not prompt for an upstream release, and `apply` must never install upstream's
// tree over the fork's system layer. The upgrade gate's mirror rewrites the
// same URL, and must keep rewriting the two upstream URLs that old tags embed.
// Plan: docs/superpowers/plans/completed/2026-11-07-upstream-decoupling.md, Task 1.
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

// The product prompts must walk the channel that exists on this fork. Since
// 2026-11-09 the fork cuts its own `career-ops-v*` releases, so the mode fetches
// `refs/tags/career-ops-v{remote}` from the fork, `check` and `apply` stay on
// the default release channel, and `--channel main --confirm` (the unreleased
// `main`) must not be what the prompts run. Before that date the fork had no
// releases and the prompts walked `main`.
import { readFileSync } from 'fs';
import { join } from 'path';
import { ROOT } from './helpers.mjs';

const mode = readFileSync(join(ROOT, 'modes', 'update.md'), 'utf-8');
if (!/career-ops-hq\/career-ops\.git/.test(mode) && /git fetch https:\/\/github\.com\/jrmatherly\/career-ops\.git refs\/tags\/career-ops-v\{remote\}/.test(mode)) pass('modes/update.md fetches the fork\'s own release tag');
else fail('modes/update.md does not fetch career-ops-v{remote} from jrmatherly/career-ops (the fork cuts its own releases since 2026-11-09)');
if (/check --force/.test(mode) && /apply --confirm/.test(mode) && !/--channel main --confirm/.test(mode)) pass('modes/update.md checks and applies on the default release channel');
else fail('modes/update.md check/apply commands are not on the default release channel');

const agents = readFileSync(join(ROOT, 'AGENTS.md'), 'utf-8');
const section = agents.slice(agents.indexOf('## Update Check'), agents.indexOf('\n## ', agents.indexOf('## Update Check') + 1));
if (/If yes → `node update-system\.mjs apply --confirm`/.test(section)) pass('AGENTS.md Update Check applies on the default release channel');
else fail('AGENTS.md Update Check "If yes" line does not apply on the default release channel');

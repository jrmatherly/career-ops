// tests/fork-deviations-covered.test.mjs — every path where this fork differs
// from the last reviewed upstream commit is named in the upstream-review
// skill's "Deviations decided" table or "Deleted or moved paths" section, so
// the next merge has a resolution rule for each conflict it can produce.
//
// The diff is taken from the merge-base of HEAD and lastReviewedSha, not from
// the SHA itself: after a cherry-pick-only sync that SHA is not an ancestor of
// HEAD, and a diff against it would list upstream-only changes as ours. A path is
// covered by its full path or a parent directory with its slash, never by basename.
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join } from 'path';
import { pass, fail, ROOT } from './helpers.mjs';

console.log('\nfork deviations — every diverged path is named in SKILL.md');

const SKILL = join(ROOT, '.claude', 'skills', 'upstream-review', 'SKILL.md');
const WATERMARK = join(ROOT, '.upstream-review', 'watermark.json');
const LOCAL_PATHS = join(ROOT, 'config', 'local-paths.txt');

const git = (...args) => spawnSync('git', ['-C', ROOT, ...args], { encoding: 'utf-8' });
const { lastReviewedSha } = JSON.parse(readFileSync(WATERMARK, 'utf-8'));

if (git('cat-file', '-e', `${lastReviewedSha}^{commit}`).status !== 0) {
  pass(`upstream base ${lastReviewedSha.slice(0, 7)} not in history (shallow clone), skipped`);
} else {
  const base = git('merge-base', 'HEAD', lastReviewedSha).stdout.trim();
  const rows = git('diff', '--name-status', '--no-renames', '-z', base, 'HEAD').stdout
    .split('\0').filter(Boolean);
  const changes = [];
  for (let i = 0; i + 1 < rows.length; i += 2) changes.push([rows[i], rows[i + 1]]);

  const skill = readFileSync(SKILL, 'utf-8');
  const from = skill.indexOf('## Deleted or moved paths');
  const to = skill.indexOf('## Decision log template');
  if (from === -1 || to <= from) fail('SKILL.md lost its "Deleted or moved paths" or "Decision log template" heading');
  const named = new Set([...skill.slice(from, to).matchAll(/`([^`\n]+)`/g)].map((m) => m[1]));

  const localPrefixes = readFileSync(LOCAL_PATHS, 'utf-8').split('\n')
    .map((l) => l.trim()).filter((l) => l && !l.startsWith('#'));

  const covered = (path) => {
    if (named.has(path)) return true;
    const parts = path.split('/');
    return parts.slice(0, -1).some((_, i) => named.has(`${parts.slice(0, i + 1).join('/')}/`));
  };

  const uncovered = changes.filter(([status, path]) =>
    !(status === 'A' && localPrefixes.some((p) => path === p || path.startsWith(p))) && !covered(path));

  for (const [status, path] of uncovered) fail(`${status} ${path} differs from upstream ${base.slice(0, 7)} but no deviations row names it`);
  if (uncovered.length === 0) pass(`all ${changes.length} diverged paths are named in SKILL.md`);
}

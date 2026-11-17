#!/usr/bin/env node
// Git pre-commit hook for this fork: refuse a newly added gitignored (user-layer)
// file, token-shaped text in the staged diff and syntax errors. Edits and
// deletions of tracked files pass, so a leak can be undone with rm --cached and
// upstream's tracked examples/.../cv.md can be edited; --no-renames makes a
// rename onto an ignored name count as an addition.
// Every User Layer path is gitignored (enforced by
// tests/user-layer-gitignored.test.mjs), so "staged and ignored" is the whole
// personal-data check, with no path list to keep in sync.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function ignoredStagedFiles(root) {
  const staged = spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=A', '--no-renames', '-z'], { cwd: root });
  if (staged.status !== 0) throw new Error(`git diff --cached failed: ${staged.stderr}`);
  if (!staged.stdout.length) return [];
  const ignored = spawnSync('git', ['check-ignore', '--stdin', '-z', '--no-index'], { cwd: root, input: staged.stdout });
  // check-ignore exits 1 when nothing is ignored; 128 is a real error.
  if (ignored.status === 128) throw new Error(`git check-ignore failed: ${ignored.stderr}`);
  return ignored.stdout.toString().split('\0').filter(Boolean);
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const hits = ignoredStagedFiles(root);
if (hits.length) {
  console.error(`pre-commit: refusing to commit gitignored (user-layer) files:\n  ${hits.join('\n  ')}\nUnstage them with: git restore --staged -- ${hits.map((h) => JSON.stringify(h)).join(' ')}`);
  process.exit(1);
}

// GitHub push protection refuses token-shaped text only at the push, after the review and
// the commits built on it, so the staged diff is scanned here. A machine without gitleaks
// commits unscanned: push protection is still behind it. A merge being concluded stages the
// other side's whole history of changes, which its own repository already published.
const LEAKS_FOUND = 3;
const merging = spawnSync('git', ['rev-parse', '-q', '--verify', 'MERGE_HEAD'], { cwd: root }).status === 0;
const leaks = merging ? { status: 0 } : spawnSync('gitleaks', ['git', '--pre-commit', '--staged', '--no-banner', '--redact', '--verbose', '--exit-code', String(LEAKS_FOUND), '--config', join(root, '.githooks', 'gitleaks.toml')], { cwd: root, stdio: 'inherit' });
if (merging) {
  console.error('pre-commit: a merge is being concluded, so the staged diff was not scanned for secrets.');
} else if (leaks.error?.code === 'ENOENT') {
  console.error('pre-commit: gitleaks is not on PATH, so the staged diff was not scanned for secrets.');
} else if (leaks.status === LEAKS_FOUND) {
  console.error('pre-commit: gitleaks found token-shaped text in the staged diff, at the file and line above. A test fixture builds such a value at run time; a real false positive takes a `gitleaks:allow` comment on its line.');
  process.exit(1);
} else if (leaks.status !== 0) {
  console.error(`pre-commit: the gitleaks scan did not run to the end (${leaks.error?.message ?? (leaks.signal ? `killed by ${leaks.signal}` : `exit ${leaks.status}`)}), so the commit is refused. Fix what it reports above.`);
  process.exit(1);
}

const syntax = spawnSync(process.execPath, [join(root, 'scripts', 'check-syntax.mjs')], { cwd: root, stdio: 'inherit' });
process.exit(syntax.status ?? 1);

#!/usr/bin/env node
// Git pre-commit hook for this fork: refuse force-staged user-layer (gitignored)
// files and syntax errors. Every User Layer path is gitignored (enforced by
// tests/user-layer-gitignored.test.mjs), so "staged and ignored" is the whole
// personal-data check, with no path list to keep in sync.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export function ignoredStagedFiles(root) {
  const staged = spawnSync('git', ['diff', '--cached', '--name-only', '-z'], { cwd: root });
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
  console.error(`pre-commit: refusing to commit gitignored (user-layer) files:\n  ${hits.join('\n  ')}\nUnstage them with: git restore --staged -- ${hits.join(' ')}`);
  process.exit(1);
}

const syntax = spawnSync(process.execPath, [join(root, 'scripts', 'check-syntax.mjs')], { cwd: root, stdio: 'inherit' });
process.exit(syntax.status ?? 1);

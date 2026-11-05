#!/usr/bin/env node
// Claude Code SessionStart hook (startup only). Two deterministic chores:
//  1. point git at the fork's pre-commit hook once per clone;
//  2. run the release update check AGENTS.md asks for on the first message,
//     printing only when an update exists (SessionStart stdout enters context).
// Always exits 0: a failed chore must not block the session.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  const current = spawnSync('git', ['config', '--get', 'core.hooksPath'], { cwd: root, encoding: 'utf-8' });
  if (current.status !== 0 || !current.stdout.trim()) {
    const set = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root, encoding: 'utf-8' });
    if (set.status === 0) console.log('Set git core.hooksPath to .githooks for this clone: the pre-commit hook now blocks force-staged user-layer files and syntax errors.');
  }
} catch { /* git missing or not a repo: nothing to do */ }

try {
  // Release channel only: `--channel main` adds a git fetch and can exceed the hook timeout.
  const check = spawnSync(process.execPath, [join(root, 'update-system.mjs'), 'check'], { cwd: root, encoding: 'utf-8', timeout: 12000 });
  const line = (check.stdout || '').trim().split('\n').pop() || '';
  const result = JSON.parse(line);
  if (result.status === 'update-available') console.log(line);
} catch { /* offline, missing deps or non-JSON output: stay silent */ }

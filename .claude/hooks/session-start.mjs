#!/usr/bin/env node
// Claude Code SessionStart hook (startup only). Two deterministic chores:
//  1. point git at the fork's pre-commit hook once per clone (local scope; says
//     when that shadows a global core.hooksPath, warns on a foreign local one);
//  2. run the release update check AGENTS.md asks for on the first message,
//     printing only when an update exists (SessionStart stdout enters context).
// Always exits 0: a failed chore must not block the session.
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = process.env.CLAUDE_PROJECT_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', '..');

try {
  const git = (...args) => spawnSync('git', ['config', ...args], { cwd: root, encoding: 'utf-8' });
  // The local scope wins in git, so it is the one that decides whether this clone is guarded.
  const local = git('--local', '--get', 'core.hooksPath').stdout.trim();
  if (!local) {
    // "<scope>\t<value>" from whichever scope supplies the value today, if any.
    const [scope, shadowed] = git('--show-scope', '--get', 'core.hooksPath').stdout.trim().split('\t');
    if (git('core.hooksPath', '.githooks').status === 0) {
      const note = shadowed ? ` (this clone now uses .githooks instead of the ${scope} core.hooksPath "${shadowed}")` : '';
      console.log(`Set git core.hooksPath to .githooks for this clone: the pre-commit hook now blocks newly added user-layer files and syntax errors.${note}`);
    }
  } else if (local !== '.githooks') {
    console.log(`WARNING: git core.hooksPath is "${local}" in this clone's local config, so the fork's pre-commit guard in .githooks is not active here.`);
  }
} catch { /* git missing or not a repo: nothing to do */ }

try {
  // Release channel only: `--channel main` adds a git fetch and can exceed the hook timeout.
  const check = spawnSync(process.execPath, [join(root, 'update-system.mjs'), 'check'], { cwd: root, encoding: 'utf-8', timeout: 12000 });
  const line = (check.stdout || '').trim().split('\n').pop() || '';
  const result = JSON.parse(line);
  if (result.status === 'update-available') console.log(line);
} catch { /* offline, missing deps or non-JSON output: stay silent */ }

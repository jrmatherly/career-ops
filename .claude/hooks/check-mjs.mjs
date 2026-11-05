#!/usr/bin/env node
// Claude Code PostToolUse hook (Edit|Write): `node --check` the edited .mjs
// file so a syntax error reaches Claude at edit time instead of at CI time
// (scripts/check-syntax.mjs covers the whole tree there). Exit 2 shows stderr
// to Claude; exit 0 is silent.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { isAbsolute, relative, resolve } from 'node:path';

export function targetOf(input, root) {
  const file = input?.tool_input?.file_path;
  if (typeof file !== 'string' || !file.endsWith('.mjs')) return null;
  const rel = relative(resolve(root), resolve(file));
  if (rel.startsWith('..') || isAbsolute(rel)) return null;
  return resolve(file);
}

let payload = {};
try { payload = JSON.parse(readFileSync(0, 'utf-8')); } catch { process.exit(0); }

const file = targetOf(payload, process.env.CLAUDE_PROJECT_DIR || process.cwd());
if (!file) process.exit(0);

const check = spawnSync(process.execPath, ['--check', file], { encoding: 'utf-8' });
if (check.status !== 0) {
  console.error(`Syntax error in ${file}:\n${check.stderr}`);
  process.exit(2);
}

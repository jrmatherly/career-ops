// tests/claude-hooks.test.mjs — the fork's Claude Code hooks and git pre-commit
// hook (.claude/hooks/*.mjs, .githooks/pre-commit.mjs) behave as documented in
// .claude/rules/dev-workflow.md: the syntax hook flags only an invalid .mjs
// inside the project, and the pre-commit hook refuses a force-staged
// gitignored (user-layer) file while letting a clean index through.
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pass, fail, ROOT, NODE } from './helpers.mjs';

console.log('\nclaude hooks — syntax hook and pre-commit guard');

const CHECK = join(ROOT, '.claude', 'hooks', 'check-mjs.mjs');
const PRECOMMIT = join(ROOT, '.githooks', 'pre-commit.mjs');

function runHook(script, payload, env = {}) {
  return spawnSync(NODE, [script], {
    input: JSON.stringify(payload),
    encoding: 'utf-8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: ROOT, ...env },
  });
}

const work = mkdtempSync(join(tmpdir(), 'claude-hooks-'));
try {
  const bad = join(work, 'bad.mjs');
  const good = join(work, 'good.mjs');
  writeFileSync(bad, 'export const x = ;\n');
  writeFileSync(good, 'export const x = 1;\n');

  // Files outside CLAUDE_PROJECT_DIR are not this hook's business.
  let r = runHook(CHECK, { tool_name: 'Write', tool_input: { file_path: bad } });
  if (r.status === 0) pass('check-mjs ignores an .mjs outside the project');
  else fail(`check-mjs should ignore files outside the project, exited ${r.status}: ${r.stderr}`);

  // Inside the project: invalid blocks (exit 2, stderr names the file), valid is silent.
  r = runHook(CHECK, { tool_name: 'Write', tool_input: { file_path: bad } }, { CLAUDE_PROJECT_DIR: work });
  if (r.status === 2 && r.stderr.includes('bad.mjs')) pass('check-mjs exits 2 and names an invalid .mjs inside the project');
  else fail(`check-mjs expected exit 2 naming bad.mjs, got ${r.status}: ${r.stderr}`);

  r = runHook(CHECK, { tool_name: 'Edit', tool_input: { file_path: good } }, { CLAUDE_PROJECT_DIR: work });
  if (r.status === 0 && !r.stderr) pass('check-mjs is silent on a valid .mjs');
  else fail(`check-mjs expected a silent exit 0, got ${r.status}: ${r.stderr}`);

  r = runHook(CHECK, { tool_name: 'Write', tool_input: { file_path: join(work, 'notes.md') } }, { CLAUDE_PROJECT_DIR: work });
  if (r.status === 0) pass('check-mjs ignores a non-.mjs file');
  else fail(`check-mjs should ignore .md files, exited ${r.status}`);

  r = spawnSync(NODE, [CHECK], { input: 'not json', encoding: 'utf-8' });
  if (r.status === 0) pass('check-mjs exits 0 on malformed hook input');
  else fail(`check-mjs should tolerate malformed input, exited ${r.status}`);

  // Pre-commit guard in a throwaway repo that ignores cv.md the way the fork does.
  const repo = join(work, 'repo');
  mkdirSync(join(repo, 'scripts'), { recursive: true });
  const git = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf-8' });
  git('init', '-q');
  git('config', 'user.email', 'hooks@test.invalid');
  git('config', 'user.name', 'hooks test');
  writeFileSync(join(repo, '.gitignore'), 'cv.md\n');
  // A stand-in for scripts/check-syntax.mjs so the guard's second step is exercised in isolation.
  writeFileSync(join(repo, 'scripts', 'check-syntax.mjs'), 'export const ok = true;\n');
  mkdirSync(join(repo, '.githooks'));
  // The hook resolves the repo root from its own location, so run a copy from inside the fixture.
  writeFileSync(join(repo, '.githooks', 'pre-commit.mjs'), readFileSync(PRECOMMIT, 'utf-8'));
  const hook = join(repo, '.githooks', 'pre-commit.mjs');

  writeFileSync(join(repo, 'README.md'), 'hello\n');
  writeFileSync(join(repo, 'cv.md'), 'personal\n');
  git('add', 'README.md');
  git('add', '-f', 'cv.md');
  r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
  if (r.status === 1 && r.stderr.includes('cv.md') && !r.stderr.includes('README.md')) pass('pre-commit refuses a force-staged gitignored file and names only it');
  else fail(`pre-commit expected exit 1 naming cv.md only, got ${r.status}: ${r.stderr}`);

  git('rm', '--cached', '-q', '--', 'cv.md'); // no HEAD yet in the fixture, so restore --staged cannot be used
  r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
  if (r.status === 0) pass('pre-commit lets a clean index through');
  else fail(`pre-commit expected exit 0 on a clean index, got ${r.status}: ${r.stderr}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}

// tests/claude-hooks.test.mjs — the fork's Claude Code hooks and git pre-commit
// hook (.claude/hooks/*.mjs, .githooks/pre-commit.mjs) behave as documented in
// .claude/rules/dev-workflow.md: the syntax hook flags only an invalid .mjs
// inside the project, and the pre-commit hook refuses a newly added (or renamed-in)
// gitignored (user-layer) file while letting a clean index, a staged deletion
// and an edit to a tracked-but-ignored file through; the session-start hook sets
// core.hooksPath locally, says when that shadows a global value, and warns on a
// foreign local one; the commit-msg hook enforces Conventional Commits with a scope.
import { spawnSync } from 'child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pass, fail, ROOT, NODE } from './helpers.mjs';

console.log('\nclaude hooks — syntax hook and pre-commit guard');

const CHECK = join(ROOT, '.claude', 'hooks', 'check-mjs.mjs');
const PRECOMMIT = join(ROOT, '.githooks', 'pre-commit.mjs');
const SESSION_START = join(ROOT, '.claude', 'hooks', 'session-start.mjs');
const COMMIT_MSG = join(ROOT, '.githooks', 'commit-msg.mjs');
const ok = (cond, msg) => (cond ? pass(msg) : fail(msg));

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

  // Only newly ADDED paths are graded: a leak already committed can be undone
  // with rm --cached, and upstream tracks examples/.../cv.md, which .gitignore matches.
  git('add', '-f', 'cv.md');
  git('commit', '-qm', 'leak'); // README.md + the leaked cv.md
  git('rm', '--cached', '-q', '--', 'cv.md');
  r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
  if (r.status === 0) pass('pre-commit lets a staged deletion of a leaked file through');
  else fail(`pre-commit expected exit 0 on a staged deletion, got ${r.status}: ${r.stderr}`);

  git('reset', '-q', '--hard');
  writeFileSync(join(repo, 'cv.md'), 'edited\n');
  git('add', 'cv.md');
  r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
  if (r.status === 0) pass('pre-commit lets an edit to a tracked-but-ignored file through');
  else fail(`pre-commit expected exit 0 on a tracked-file edit, got ${r.status}: ${r.stderr}`);

  // A rename onto a user-layer name is an addition, not a rename, to the guard.
  git('reset', '-q', '--hard');
  git('rm', '--cached', '-q', '--', 'cv.md');
  git('commit', '-qm', 'clean');
  rmSync(join(repo, 'cv.md'));
  git('mv', 'README.md', 'cv.md');
  r = spawnSync(NODE, [hook], { cwd: repo, encoding: 'utf-8' });
  if (r.status === 1 && r.stderr.includes('cv.md')) pass('pre-commit refuses a rename onto a gitignored name');
  else fail(`pre-commit expected exit 1 naming cv.md on a rename, got ${r.status}: ${r.stderr}`);

  // session-start sets core.hooksPath in the LOCAL scope. The env keeps git away
  // from the developer's own config; update-system.mjs is absent in the fixture,
  // so the hook's update check fails and stays silent as its catch intends.
  const hookEnv = { ...process.env, HOME: work, GIT_CONFIG_NOSYSTEM: '1', CLAUDE_PROJECT_DIR: repo };
  const localHooksPath = () => git('config', '--local', '--get', 'core.hooksPath').stdout.trim();
  r = spawnSync(NODE, [SESSION_START], { cwd: repo, encoding: 'utf-8', env: hookEnv });
  ok(/Set git core.hooksPath/.test(r.stdout) && localHooksPath() === '.githooks', 'session-start sets the local hooksPath');

  writeFileSync(join(work, 'gitconfig'), '[core]\n\thooksPath = /tmp/husky\n');
  git('config', '--local', '--unset', 'core.hooksPath');
  r = spawnSync(NODE, [SESSION_START], { cwd: repo, encoding: 'utf-8', env: { ...hookEnv, GIT_CONFIG_GLOBAL: join(work, 'gitconfig') } });
  ok(/Set git core.hooksPath/.test(r.stdout) && /instead of the global core.hooksPath "\/tmp\/husky"/.test(r.stdout) && localHooksPath() === '.githooks', 'session-start overrides a global hooksPath locally and says so');

  git('config', '--local', 'core.hooksPath', '.husky');
  r = spawnSync(NODE, [SESSION_START], { cwd: repo, encoding: 'utf-8', env: hookEnv });
  ok(/WARNING: git core.hooksPath is "\.husky"/.test(r.stdout) && localHooksPath() === '.husky', 'session-start warns on a foreign local hooksPath and does not change it');

  // commit-msg enforces Conventional Commits with a scope on the first subject line.
  const subject = (text) => {
    const file = join(work, 'COMMIT_EDITMSG');
    writeFileSync(file, text);
    return spawnSync(NODE, [COMMIT_MSG, file], { cwd: repo, encoding: 'utf-8' });
  };
  ok(subject('feat(scan): x\n').status === 0, 'commit-msg accepts type(scope): summary');
  r = subject('update stuff\n');
  ok(r.status === 1 && /commit subject must be/.test(r.stderr), 'commit-msg refuses a subject without type and scope');
  ok(subject("Merge branch 'careerops/main'\n").status === 0, 'commit-msg accepts a merge commit');
  ok(subject('  fix(a): leading space\n').status === 0, 'commit-msg trims the subject before matching');
} finally {
  rmSync(work, { recursive: true, force: true });
}

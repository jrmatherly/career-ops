// .githooks/pre-commit.mjs refuses a commit whose staged diff carries token-shaped text,
// which GitHub push protection would otherwise refuse only at the push.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { delimiter, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, hermeticGitEnv, sealProcessGitEnv } from './helpers.mjs';

// Under a hook or `git rebase -x` an inherited GIT_DIR would point the scratch commits at the real repository.
sealProcessGitEnv();

const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;
// The Ubuntu leg of the test job installs gitleaks and sets this, so there a missing gitleaks fails and does not skip.
const mustScan = process.env.CAREER_OPS_REQUIRE_GITLEAKS === '1';

// The system directories alone: git is there, and gitleaks is not unless it was installed into one.
// tests/batch-runner-dry-run-without-cli.test.mjs takes an agent CLI off PATH the same way.
const SYSTEM_PATH = ['/usr/bin', '/bin', '/usr/sbin', '/sbin'].join(delimiter);
const onSystemPath = (tool, arg) => spawnSync(tool, [arg], { env: { PATH: SYSTEM_PATH } }).status === 0;
function noGitleaksSkip() {
  if (process.platform === 'win32') return 'Windows has no such directories';
  if (onSystemPath('gitleaks', 'version')) return 'gitleaks is installed in a system directory';
  // On the leg that must scan, a git missing from the system directories fails the test and does not skip it.
  return !mustScan && !onSystemPath('git', '--version') && 'git is not in a system directory';
}

function scratchRepo(t) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'pre-commit-scan-')));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const env = hermeticGitEnv(join(repo, 'gitconfig'));
  const git = (...args) => assert.equal(spawnSync('git', args, { cwd: repo, env }).status, 0, args.join(' '));
  mkdirSync(join(repo, '.githooks'));
  for (const file of ['pre-commit.mjs', 'gitleaks.toml']) cpSync(join(ROOT, '.githooks', file), join(repo, '.githooks', file));
  // The syntax check is another suite's subject; here it only has to pass.
  mkdirSync(join(repo, 'scripts'));
  writeFileSync(join(repo, 'scripts', 'check-syntax.mjs'), '');
  git('init', '-q', '-b', 'main');
  const hook = (hookEnv = env) => spawnSync(process.execPath, [join(repo, '.githooks', 'pre-commit.mjs')], { cwd: repo, env: hookEnv, encoding: 'utf-8' });
  return { repo, env, git, hook };
}

// Built here so this file holds no token-shaped literal for push protection to refuse.
const token = ['gl', 'pat-', 'x'.repeat(4), 'Ab3dE7gH9jK1mN5pQ8r'].join('');

test('a machine without gitleaks commits with a warning, not a refusal', { skip: noGitleaksSkip() }, (t) => {
  const { repo, env, git, hook } = scratchRepo(t);
  writeFileSync(join(repo, 'fixture.mjs'), `export const token = "${token}";\n`);
  git('add', 'fixture.mjs');
  const unscanned = hook({ ...env, PATH: SYSTEM_PATH });
  assert.equal(unscanned.status, 0, unscanned.stderr);
  assert.match(unscanned.stderr, /gitleaks is not on PATH, so the staged diff was not scanned/);
});

test('a staged token-shaped value is refused, and the same file without it commits', { skip: hasGitleaks || mustScan ? false : 'gitleaks is not on PATH' }, (t) => {
  const { repo, env, git, hook } = scratchRepo(t);
  writeFileSync(join(repo, 'fixture.mjs'), `export const token = "${token}";\n`);
  git('add', 'fixture.mjs');
  const refused = hook();
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /gitleaks found token-shaped text/);
  const report = `${refused.stdout}${refused.stderr}`;
  assert.match(report, /fixture\.mjs/, 'the report names the file');
  assert.ok(!report.includes(token), 'the value is redacted in the report');

  // A public search key in a request header is what the provider suites carry.
  const searchKey = `export const headers = { "x-api-key": "${'9f3b1c7a5e2d4068'.repeat(2)}" };\n`;
  writeFileSync(join(repo, 'fixture.mjs'), 'export const token = process.env.TOKEN;\n');
  mkdirSync(join(repo, 'tests'));
  writeFileSync(join(repo, 'tests', 'board.test.mjs'), searchKey);
  git('add', 'fixture.mjs', 'tests/board.test.mjs');
  const passed = hook();
  assert.equal(passed.status, 0, `${passed.stdout}${passed.stderr}`);
  writeFileSync(join(repo, 'fixture.mjs'), searchKey);
  git('add', 'fixture.mjs');
  assert.equal(hook().status, 1, 'the same value outside the suites, the providers and the docs is refused');
  writeFileSync(join(repo, 'fixture.mjs'), 'export const token = process.env.TOKEN;\n');
  git('add', 'fixture.mjs');

  // Concluding a merge stages the other side's changes, which are not this commit's to answer for.
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'base');
  writeFileSync(join(repo, 'fixture.mjs'), `export const token = "${token}";\n`);
  git('add', 'fixture.mjs');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, env, encoding: 'utf-8' }).stdout.trim();
  writeFileSync(join(repo, '.git', 'MERGE_HEAD'), `${head}\n`);
  const merge = hook();
  assert.equal(merge.status, 0, merge.stderr);
  assert.match(merge.stderr, /a merge is being concluded, so the staged diff was not scanned/);
  rmSync(join(repo, '.git', 'MERGE_HEAD'));
  assert.equal(hook().status, 1, 'the same index outside a merge is refused');

  writeFileSync(join(repo, '.githooks', 'gitleaks.toml'), 'not toml [');
  const broken = hook();
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /did not run to the end/, 'a scan that failed is not reported as a leak');
});

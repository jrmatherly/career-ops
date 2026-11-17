// .githooks/pre-commit.mjs refuses a commit whose staged diff carries token-shaped text,
// which GitHub push protection would otherwise refuse only at the push.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, hermeticGitEnv } from './helpers.mjs';

const hasGitleaks = spawnSync('gitleaks', ['version']).status === 0;

test('a staged token-shaped value is refused, and the same file without it commits', { skip: hasGitleaks ? false : 'gitleaks is not on PATH' }, (t) => {
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
  const hook = () => spawnSync(process.execPath, [join(repo, '.githooks', 'pre-commit.mjs')], { cwd: repo, env, encoding: 'utf-8' });

  // Built here so this file holds no token-shaped literal for push protection to refuse.
  const token = ['gl', 'pat-', 'x'.repeat(4), 'Ab3dE7gH9jK1mN5pQ8r'].join('');
  writeFileSync(join(repo, 'fixture.mjs'), `export const token = "${token}";\n`);
  git('add', 'fixture.mjs');
  const refused = hook();
  assert.equal(refused.status, 1, refused.stderr);
  assert.match(refused.stderr, /gitleaks found token-shaped text/);
  const report = `${refused.stdout}${refused.stderr}`;
  assert.match(report, /fixture\.mjs/, 'the report names the file');
  assert.ok(!report.includes(token), 'the value is redacted in the report');

  // A public search key in a request header is what the provider suites carry.
  writeFileSync(join(repo, 'fixture.mjs'), `export const headers = { "x-api-key": "${'9f3b1c7a5e2d4068'.repeat(2)}" };\n`);
  git('add', 'fixture.mjs');
  const passed = hook();
  assert.equal(passed.status, 0, `${passed.stdout}${passed.stderr}`);

  // Concluding a merge stages the other side's changes, which are not this commit's to answer for.
  git('-c', 'user.name=t', '-c', 'user.email=t@example.invalid', 'commit', '-q', '-m', 'base');
  writeFileSync(join(repo, 'fixture.mjs'), `export const token = "${token}";\n`);
  git('add', 'fixture.mjs');
  const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repo, env, encoding: 'utf-8' }).stdout.trim();
  writeFileSync(join(repo, '.git', 'MERGE_HEAD'), `${head}\n`);
  assert.equal(hook().status, 0, 'a merge being concluded is not scanned');
  rmSync(join(repo, '.git', 'MERGE_HEAD'));
  assert.equal(hook().status, 1, 'the same index outside a merge is refused');

  writeFileSync(join(repo, '.githooks', 'gitleaks.toml'), 'not toml [');
  const broken = hook();
  assert.equal(broken.status, 1);
  assert.match(broken.stderr, /did not run to the end/, 'a scan that failed is not reported as a leak');
});

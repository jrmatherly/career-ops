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
  cpSync(join(ROOT, '.githooks', 'pre-commit.mjs'), join(repo, '.githooks', 'pre-commit.mjs'));
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
  assert.ok(!`${refused.stdout}${refused.stderr}`.includes(token), 'the value is redacted in the report');

  writeFileSync(join(repo, 'fixture.mjs'), 'export const token = process.env.TOKEN;\n');
  git('add', 'fixture.mjs');
  const passed = hook();
  assert.equal(passed.status, 0, passed.stderr);
});

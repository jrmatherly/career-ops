// The push gate in .githooks: pre-push.mjs lets a PR branch go only when its tip commit
// has a review on record, and coderabbit-review.mjs is what records one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { main, readMarker } from '../.githooks/coderabbit-review.mjs';
import { pushVerdict } from '../.githooks/pre-push.mjs';

const ZERO = '0'.repeat(40);

function scratchRepo(t) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'cr-gate-')));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const git = (...args) => {
    const run = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.invalid', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { cwd: repo, encoding: 'utf-8' });
    assert.equal(run.status, 0, run.stderr);
    return run.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  const commit = () => {
    git('commit', '-q', '--allow-empty', '-m', 'work');
    return git('rev-parse', 'HEAD');
  };
  return { repo, git, commit };
}

const reviewWith = (findings, status = findings ? 2 : 0) => () => ({ status, stdout: `{"type":"heartbeat"}\n{"type":"complete","findings":${findings}}\n` });
const line = (sha, branch = 'feat') => `refs/heads/${branch} ${sha} refs/heads/${branch} ${ZERO}\n`;

test('a branch whose tip has no review is refused, and main, a tag and a deletion pass', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  assert.match(pushVerdict(line(sha), repo).refused[0], /has no CodeRabbit review/);
  const free = `${line(sha, 'main')}refs/tags/v1 ${sha} refs/tags/v1 ${ZERO}\n(delete) ${ZERO} refs/heads/feat ${sha}\n`;
  assert.deepEqual(pushVerdict(free, repo), { refused: [], notes: [] });
});

test('a clean review lets its commit through, and a commit made after it needs its own', (t) => {
  const { repo, commit } = scratchRepo(t);
  const reviewed = commit();
  assert.equal(main([], { cwd: repo, run: reviewWith(0) }).code, 0);
  assert.deepEqual(pushVerdict(line(reviewed), repo), { refused: [], notes: [] });
  assert.match(pushVerdict(line(commit()), repo).refused[0], /has no CodeRabbit review/);
});

test('a review with findings exits 2 and blocks the push until the findings are declined with a reason', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  const review = main([], { cwd: repo, run: reviewWith(2) });
  assert.equal(review.code, 2, 'so a `review && git push` chain stops');
  assert.match(pushVerdict(line(sha), repo).refused[0], /has 2 open finding\(s\)/);
  assert.equal(main(['--decline', ' '], { cwd: repo }).code, 1, 'a decline needs a reason');
  assert.equal(main(['--decline', 'both are style nits'], { cwd: repo }).code, 0);
  const verdict = pushVerdict(line(sha), repo);
  assert.deepEqual(verdict.refused, []);
  assert.match(verdict.notes[0], /2 finding\(s\) declined: both are style nits/);
});

test('a decline needs a review with findings to decline', (t) => {
  const { repo, commit } = scratchRepo(t);
  commit();
  assert.equal(main(['--decline', 'nothing to see'], { cwd: repo }).code, 1);
  main([], { cwd: repo, run: reviewWith(0) });
  assert.equal(main(['--decline', 'nothing to see'], { cwd: repo }).code, 1);
});

test('a review that did not complete records nothing', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  const review = main([], { cwd: repo, run: () => ({ status: 1, stdout: '{"type":"error","message":"rate limited"}\n' }) });
  assert.equal(review.code, 1);
  assert.match(review.err, /did not complete/);
  assert.equal(readMarker(repo, sha), null);
});

test('a skip with a reason lets the commit through and the push names the reason', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  assert.equal(main(['--skip'], { cwd: repo }).code, 1);
  assert.equal(main(['--skip', 'quota spent until 14:00'], { cwd: repo }).code, 0);
  assert.match(pushVerdict(line(sha), repo).notes[0], /no review: quota spent until 14:00/);
});

test('a review made in one worktree counts in another', (t) => {
  const { repo, git, commit } = scratchRepo(t);
  commit();
  const other = `${repo}-wt`;
  t.after(() => rmSync(other, { recursive: true, force: true }));
  git('worktree', 'add', '-q', '-b', 'wt', other);
  const sha = git('rev-parse', 'HEAD');
  main([], { cwd: other, run: reviewWith(0) });
  assert.deepEqual(pushVerdict(line(sha, 'wt'), repo).refused, []);
});

test('--help prints the usage and exits 0', () => {
  const run = spawnSync(process.execPath, [join(import.meta.dirname, '..', '.githooks', 'coderabbit-review.mjs'), '--help'], { encoding: 'utf-8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^Usage: node \.githooks\/coderabbit-review\.mjs/);
});

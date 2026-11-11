// The push gate in .githooks: pre-push.mjs lets a PR branch go only when its tip commit
// has a review on record, and coderabbit-review.mjs is what records one.
import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { ROOT, hermeticGitEnv, sealProcessGitEnv } from './helpers.mjs';
import { main, markerDir, readMarker, reviewResult } from '../.githooks/coderabbit-review.mjs';
import { pushVerdict } from '../.githooks/pre-push.mjs';

// The scripts under test run git with the process environment, so seal it: under a hook or
// `git rebase -x` an inherited GIT_DIR would point every scratch commit at the real repository.
sealProcessGitEnv();

const ZERO = '0'.repeat(40);
// The closing events of two real runs, CodeRabbit CLI 0.9.3, with `reviewedFiles` cut short.
const REAL_CLEAN = '{"type":"complete","status":"review_completed","findings":0,"gate":{"threshold":"info","status":"passed","blockingFindings":0},"reviewedFiles":[".githooks/pre-push"],"outcome":"completed","message":"Review completed"}';
const REAL_BLOCKED = '{"type":"complete","status":"review_completed","findings":1,"gate":{"threshold":"minor","status":"blocked","blockingFindings":1},"reviewedFiles":["web/scripts/evaluate-drain.mjs"],"outcome":"completed","message":"Review completed"}';

function scratchRepo(t) {
  const repo = realpathSync(mkdtempSync(join(tmpdir(), 'cr-gate-')));
  t.after(() => rmSync(repo, { recursive: true, force: true }));
  const env = { ...hermeticGitEnv(join(repo, 'gitconfig')), GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@example.invalid', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@example.invalid' };
  const run = (...args) => spawnSync('git', args, { cwd: repo, encoding: 'utf-8', env });
  const git = (...args) => {
    const done = run(...args);
    assert.equal(done.status, 0, done.stderr);
    return done.stdout.trim();
  };
  git('init', '-q', '-b', 'main');
  const commit = () => {
    git('commit', '-q', '--allow-empty', '-m', 'work');
    return git('rev-parse', 'HEAD');
  };
  return { repo, git, run, commit };
}

const event = (findings, extra = {}) => `{"type":"heartbeat"}\n${JSON.stringify({ type: 'complete', findings, outcome: 'completed', gate: { status: findings ? 'blocked' : 'passed' }, ...extra })}\n`;
const reviewWith = (findings, status = findings ? 2 : 0) => () => ({ status, stdout: event(findings) });
const line = (sha, branch = 'feat', local = `refs/heads/${branch}`) => `${local} ${sha} refs/heads/${branch} ${ZERO}\n`;
const plant = (repo, sha, body) => {
  mkdirSync(markerDir(repo), { recursive: true });
  writeFileSync(join(markerDir(repo), `${sha}.json`), body);
};

test('a branch whose tip has no review is refused, and main, a tag and a deletion pass', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  assert.match(pushVerdict(line(sha), repo).refused[0], /has no CodeRabbit review/);
  const free = `${line(sha, 'main')}refs/tags/v1 ${sha} refs/tags/v1 ${ZERO}\n(delete) ${ZERO} refs/heads/feat ${sha}\n`;
  assert.deepEqual(pushVerdict(free, repo), { refused: [], notes: [] });
});

test('the remote branch decides, whatever the local ref is called', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  for (const local of ['HEAD', 'refs/heads/main', sha, 'HEAD@{1 day ago}']) {
    const verdict = pushVerdict(line(sha, 'other', local), repo);
    assert.equal(verdict.refused.length, 1, `${local} pushed to another branch needs a review`);
    assert.ok(verdict.refused[0].startsWith(`${local} (`));
  }
  assert.deepEqual(pushVerdict(line(sha, 'main', 'refs/heads/feat'), repo).refused, [], 'a push onto main is not gated');
});

test('one unreviewed branch among several is the only one refused', (t) => {
  const { repo, commit } = scratchRepo(t);
  const good = commit();
  main([], { cwd: repo, run: reviewWith(0) });
  const bad = commit();
  const verdict = pushVerdict(line(good, 'good') + line(bad, 'bad') + line(bad, 'main'), repo);
  assert.equal(verdict.refused.length, 1);
  assert.match(verdict.refused[0], /^refs\/heads\/bad /);
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
  assert.equal(main([], { cwd: repo, run: reviewWith(2) }).code, 2, 'so no caller takes it for a clean run');
  assert.match(pushVerdict(line(sha), repo).refused[0], /has 2 open finding\(s\)/);
  assert.equal(main(['--decline', ' '], { cwd: repo }).code, 1, 'a decline needs a reason');
  assert.equal(main(['--skip', 'in a hurry'], { cwd: repo }).code, 1, 'a skip is no way round findings');
  assert.equal(readMarker(repo, sha).state, 'findings');
  assert.equal(main(['--decline', 'both are style nits'], { cwd: repo }).code, 0);
  const verdict = pushVerdict(line(sha), repo);
  assert.deepEqual(verdict.refused, []);
  assert.match(verdict.notes[0], /2 finding\(s\) declined: both are style nits/);
});

test('a second review of a declined commit replaces the decline, and a failed one leaves it', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  main([], { cwd: repo, run: reviewWith(2) });
  main(['--decline', 'style nits'], { cwd: repo });
  assert.equal(main([], { cwd: repo, run: () => ({ status: 1, stdout: '' }) }).code, 1);
  assert.equal(readMarker(repo, sha).state, 'declined');
  assert.equal(main(['--decline', 'still style nits'], { cwd: repo }).code, 0);
  assert.equal(readMarker(repo, sha).reason, 'still style nits');
  assert.equal(main([], { cwd: repo, run: reviewWith(1) }).code, 2);
  assert.match(pushVerdict(line(sha), repo).refused[0], /has 1 open finding\(s\)/);
});

test('a decline needs a review with findings to decline', (t) => {
  const { repo, commit } = scratchRepo(t);
  commit();
  assert.equal(main(['--decline', 'nothing to see'], { cwd: repo }).code, 1);
  main([], { cwd: repo, run: reviewWith(0) });
  assert.equal(main(['--decline', 'nothing to see'], { cwd: repo }).code, 1);
});

test('the closing event of a real run is read: clean when the gate passed, findings when it is blocked', () => {
  assert.deepEqual(reviewResult(0, `${REAL_CLEAN}\n`), { state: 'clean', findings: 0 });
  assert.deepEqual(reviewResult(2, `${REAL_BLOCKED}\n`), { state: 'findings', findings: 1 });
  assert.deepEqual(reviewResult(0, event(0, { outcome: 'completed_with_warnings', unreviewedFileCount: 0 })), { state: 'clean', findings: 0 }, 'warnings with every file reviewed are still a full review');
});

test('a review that failed, covered part of the diff or contradicts its exit status records nothing, unless it reports findings', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  const runs = {
    'no closing event': { status: 1, stdout: '{"type":"error","message":"rate limited"}\n' },
    'a failed outcome': { status: 0, stdout: event(0, { outcome: 'failed' }) },
    'a file left unreviewed': { status: 0, stdout: event(0, { outcome: 'completed_with_warnings', unreviewedFileCount: 1 }) },
    'a clean event behind a failing exit': { status: 1, stdout: event(0) },
    'a clean event behind the gate exit': { status: 2, stdout: event(0) },
    'a gate with no result': { status: 0, stdout: event(0, { gate: { status: 'incomplete' } }) },
    'a missing CLI': { status: null, error: Object.assign(new Error('spawnSync coderabbit ENOENT'), { code: 'ENOENT' }) },
    'a killed review': { status: null, signal: 'SIGTERM', stdout: '' },
  };
  for (const [name, result] of Object.entries(runs)) {
    const review = main([], { cwd: repo, run: () => result });
    assert.equal(review.code, 1, name);
    assert.match(review.err, /Nothing is recorded .* --skip "<reason>"/, name);
    assert.equal(readMarker(repo, sha), null, name);
  }
  assert.match(main([], { cwd: repo, run: () => runs['a missing CLI'] }).err, /not on PATH/);
  for (const partial of [{ status: 1, stdout: event(2, { outcome: 'failed', unreviewedFileCount: 3 }) }, { status: 0, stdout: event(2) }]) {
    assert.equal(main([], { cwd: repo, run: () => partial }).code, 2, 'findings from a partial review are still findings');
    assert.equal(main(['--skip', 'it only half ran'], { cwd: repo }).code, 1);
    rmSync(join(markerDir(repo), `${sha}.json`));
  }
  assert.match(main([], { cwd: repo, run: () => runs['a killed review'] }).err, /killed by SIGTERM/);
});

test('a marker in any shape the script does not write is no review', (t) => {
  const { repo, commit } = scratchRepo(t);
  const sha = commit();
  for (const body of ['{}', '[]', '"x"', '42', 'null', '', '{"state":"clean"', '{"state":"cleen"}', '{"state":"skipped"}', '{"state":"declined","reason":"x"}', '{"state":"findings"}']) {
    plant(repo, sha, body);
    assert.match(pushVerdict(line(sha), repo).refused[0], /has no CodeRabbit review on record/, body);
  }
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

// Git for Windows runs the shim with its own sh; the hook's logic is covered above on every OS.
test('a real push through the hook is refused until the tip is reviewed', { skip: process.platform === 'win32' }, (t) => {
  const { repo, git, run, commit } = scratchRepo(t);
  // The checkout's hooks serve the scratch repository, as one checkout's serve every worktree.
  const hooks = join(repo, 'hooks', '.githooks');
  mkdirSync(hooks, { recursive: true });
  for (const file of ['pre-push', 'pre-push.mjs', 'coderabbit-review.mjs']) cpSync(join(ROOT, '.githooks', file), join(hooks, file));
  mkdirSync(join(repo, 'hooks', 'lib'));
  cpSync(join(ROOT, 'lib', 'is-main-module.mjs'), join(repo, 'hooks', 'lib', 'is-main-module.mjs'));
  git('config', 'core.hooksPath', hooks);
  git('init', '-q', '--bare', 'remote.git');
  git('remote', 'add', 'origin', join(repo, 'remote.git'));
  commit();
  assert.equal(run('push', '-q', 'origin', 'main').status, 0, 'main goes with no review');
  git('switch', '-q', '-c', 'feat');
  commit();
  const refused = run('push', '-q', 'origin', 'feat');
  assert.equal(refused.status, 1);
  assert.match(refused.stderr, /pre-push: refs\/heads\/feat .* has no CodeRabbit review on record/);
  assert.notEqual(run('--git-dir', 'remote.git', 'rev-parse', '--verify', '-q', 'refs/heads/feat').status, 0, 'nothing reached the remote');
  assert.equal(run('push', '-q', 'origin', 'HEAD@{0 minutes ago}:refs/heads/spaced').status, 1, 'a local ref with spaces is gated too');
  main([], { cwd: repo, run: reviewWith(0) });
  assert.equal(run('push', '-q', 'origin', 'feat').status, 0);
  assert.equal(run('push', '-q', 'origin', 'feat').status, 0, 'a push with nothing to send passes');
});

test('the shim is committed executable', () => {
  const mode = spawnSync('git', ['ls-files', '-s', '.githooks/pre-push'], { cwd: ROOT, encoding: 'utf-8' }).stdout;
  assert.match(mode, /^100755 /, 'without the bit git skips the hook on macOS and Linux');
});

test('--help prints the usage and exits 0', () => {
  const run = spawnSync(process.execPath, [join(ROOT, '.githooks', 'coderabbit-review.mjs'), '--help'], { encoding: 'utf-8' });
  assert.equal(run.status, 0);
  assert.match(run.stdout, /^Usage: node \.githooks\/coderabbit-review\.mjs/);
});

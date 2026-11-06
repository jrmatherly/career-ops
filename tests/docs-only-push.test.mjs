// tests/docs-only-push.test.mjs — the fork's docs-only answer for a push, and
// how test.yml and codeql.yml use it.
//
// As in tests/docs-only-change.test.mjs, the failure that matters is a wrong
// "yes", so the git cases run on real pushes into a real origin, including the
// depth-2 clone CI checks out.
//
// Run:  node --test tests/docs-only-push.test.mjs

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { load } from 'js-yaml';
import { classify, classifyPush, isForkDocsPath } from '../.github/scripts/docs-only-push.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, '.github', 'scripts', 'docs-only-push.mjs');

test('isForkDocsPath adds the fork prose to upstream docs paths', () => {
  for (const path of [
    'README.md', 'docs/a.md', 'FORK.md', 'MAINTAINERS.md', 'DOCKER.md', 'LEGAL_DISCLAIMER.md',
    'CONTRIBUTORS.md', '.upstream-review/reviews/2026-11-06.md',
  ]) assert.equal(isForkDocsPath(path), true, path);
});

test('isForkDocsPath refuses files tests or agents read', () => {
  for (const path of [
    'CHANGELOG.md', 'TRADEMARK.md', 'MANIFESTO.md', 'HIRED.md', 'AGENTS.md', 'DATA_CONTRACT.md',
    '.upstream-review/watermark.json', '.upstream-review/reviews/nested/x.md',
    'modes/scan.md', '.claude/skills/x/SKILL.md', 'docs/FORK.md/x.mjs', 'web/FORK.md',
  ]) assert.equal(isForkDocsPath(path), false, path);
});

// ── A real push ─────────────────────────────────────────────────────────────

const sandboxes = [];
function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'co-docs-push-'));
  sandboxes.push(dir);
  return dir;
}
after(() => { for (const dir of sandboxes) rmSync(dir, { recursive: true, force: true }); });

// Removed from process.env itself because classifyPush runs in this process.
for (const name of ['GIT_DIR', 'GIT_WORK_TREE', 'GIT_INDEX_FILE', 'GIT_PREFIX']) delete process.env[name];
const GIT_ENV = { ...process.env };

function git(cwd, ...args) {
  return execFileSync('git', [
    '-c', 'user.name=Test', '-c', 'user.email=test@example.com',
    '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args,
  ], { cwd, encoding: 'utf8', env: GIT_ENV, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function write(repo, path, text) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), text);
}

function commitAll(repo, message) {
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', message);
  return git(repo, 'rev-parse', 'HEAD');
}

/**
 * A bare origin that received a push of `commits` (each a function editing the
 * work tree) on top of a base with code and docs. Returns the origin URL and
 * the push's `before` and `sha`.
 */
function pushed(...commits) {
  const origin = join(tempDir(), 'origin.git');
  git(dirname(origin), 'init', '-q', '--bare', '-b', 'main', origin);
  const url = pathToFileURL(origin).href;
  const work = join(tempDir(), 'work');
  git(dirname(work), 'clone', '-q', url, work);
  git(work, 'symbolic-ref', 'HEAD', 'refs/heads/main');
  write(work, 'scan.mjs', 'export {};\n');
  write(work, 'README.md', '# hello\n');
  write(work, '.upstream-review/watermark.json', '{}\n');
  const base = commitAll(work, 'base');
  git(work, 'push', '-q', 'origin', 'main');
  let sha = base;
  commits.forEach((change, i) => { change(work); sha = commitAll(work, `change ${i}`); });
  git(work, 'push', '-q', 'origin', 'main');
  return { url, work, before: base, sha };
}

test('a push changing README.md and FORK.md is docs-only', () => {
  const { work, before, sha } = pushed((r) => { write(r, 'README.md', '# hi\n'); write(r, 'FORK.md', 'x\n'); });
  assert.equal(classifyPush({ before, sha, cwd: work }).docsOnly, true);
});

test('a push touching AGENTS.md is not docs-only, and says which', () => {
  const { work, before, sha } = pushed((r) => { write(r, 'README.md', '# hi\n'); write(r, 'AGENTS.md', 'x\n'); });
  const { docsOnly, reason } = classifyPush({ before, sha, cwd: work });
  assert.equal(docsOnly, false);
  assert.match(reason, /"AGENTS\.md"/);
});

test('the upstream-review watermark is not docs', () => {
  const { work, before, sha } = pushed((r) => write(r, '.upstream-review/watermark.json', '{"a":1}\n'));
  assert.equal(classifyPush({ before, sha, cwd: work }).docsOnly, false);
});

test('an upstream review note is docs', () => {
  const { work, before, sha } = pushed((r) => write(r, '.upstream-review/reviews/x.md', 'x\n'));
  assert.equal(classifyPush({ before, sha, cwd: work }).docsOnly, true);
});

test('a push with an all-zero before has no base', () => {
  const { work, sha } = pushed((r) => write(r, 'README.md', '# hi\n'));
  const { docsOnly, reason } = classifyPush({ before: '0'.repeat(40), sha, cwd: work });
  assert.equal(docsOnly, false);
  assert.match(reason, /no base commit/);
});

test('a before the origin does not have is not docs-only, and does not throw', () => {
  const { work, sha } = pushed((r) => write(r, 'README.md', '# hi\n'));
  const { docsOnly, reason } = classifyPush({ before: 'ab'.repeat(20), sha, cwd: work });
  assert.equal(docsOnly, false);
  assert.match(reason, /not reachable/);
});

test('a before that is not a commit id never reaches git', () => {
  const { work, sha } = pushed((r) => write(r, 'README.md', '# hi\n'));
  assert.equal(classifyPush({ before: '--upload-pack=x', sha, cwd: work }).docsOnly, false);
});

test('events other than push and pull_request have nothing to classify', () => {
  for (const event of ['workflow_dispatch', 'schedule', undefined]) {
    const { docsOnly, reason } = classify({ GITHUB_EVENT_NAME: event }, tempDir());
    assert.equal(docsOnly, false);
    assert.match(reason, /has no change to classify/);
  }
});

test('a depth-2 clone fetches a before two commits back and classifies the push', () => {
  const docs = pushed((r) => write(r, 'README.md', '# one\n'), (r) => write(r, 'FORK.md', 'two\n'));
  const code = pushed((r) => write(r, 'README.md', '# one\n'), (r) => write(r, 'scan.mjs', 'export const x = 1;\n'));
  for (const [{ url, before, sha }, expected] of [[docs, true], [code, false]]) {
    const clone = join(tempDir(), 'clone');
    git(dirname(clone), 'clone', '-q', '--depth=2', url, clone);
    assert.throws(() => git(clone, 'cat-file', '-e', `${before}^{commit}`), 'before is outside the shallow clone');
    assert.equal(classify({ GITHUB_EVENT_NAME: 'push', DOCS_ONLY_BEFORE: before, GITHUB_SHA: sha }, clone).docsOnly, expected);
  }
});

test('the script writes its answer to GITHUB_OUTPUT', () => {
  const { work, before, sha } = pushed((r) => write(r, 'FORK.md', 'x\n'));
  const output = join(tempDir(), 'output');
  const r = spawnSync(process.execPath, [SCRIPT], {
    cwd: work, encoding: 'utf8',
    env: { ...GIT_ENV, GITHUB_EVENT_NAME: 'push', DOCS_ONLY_BEFORE: before, GITHUB_SHA: sha, GITHUB_OUTPUT: output },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /^docs_only=true: /);
  assert.equal(readFileSync(output, 'utf8'), 'docs_only=true\n');
});

// ── The workflows' use of the answer ────────────────────────────────────────

let testJobs;
let codeql;
before(() => {
  testJobs = load(readFileSync(join(ROOT, '.github', 'workflows', 'test.yml'), 'utf8')).jobs;
  codeql = load(readFileSync(join(ROOT, '.github', 'workflows', 'codeql.yml'), 'utf8'));
});

test('the changes job runs on push, through the fork classifier', () => {
  assert.doesNotMatch(testJobs.changes.if, /== 'pull_request'/);
  const step = testJobs.changes.steps.find((s) => s.id === 'classify');
  assert.match(step.run, /docs-only-push\.mjs/);
  assert.ok('DOCS_ONLY_BEFORE' in (step.env || {}), 'the push base reaches the script');
});

test('CodeQL skips prose and image pushes, and never ignores workflows', () => {
  // js-yaml reads the bare `on` key as the string "on", not a boolean.
  const ignored = codeql.on.push['paths-ignore'];
  assert.ok(ignored.includes('**/*.md'));
  assert.deepEqual(codeql.on.pull_request['paths-ignore'], ignored);
  for (const entry of ignored) assert.ok(!entry.startsWith('.github'), entry);
});

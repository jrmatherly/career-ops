import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseStories } from '../lib/story-bank.mjs';
import { COMMON_PROMPTS, coverage, pendingStories } from '../story-coverage.mjs';

const SCRIPT = fileURLToPath(new URL('../story-coverage.mjs', import.meta.url));
const bank = (lines) => parseStories(lines.join('\n'));

test('there are twelve prompts with unique ids', () => {
  assert.equal(COMMON_PROMPTS.length, 12);
  assert.equal(new Set(COMMON_PROMPTS.map((p) => p.id)).size, 12);
});

test('a tagged story covers its prompt, and an empty bank covers none', () => {
  const stories = bank(['### [Team] The vendor dispute', '**A (Action):** Mediated.', '**R (Result):** Resolved.', '**Best for questions about:** conflict, stakeholder']);
  const row = coverage(stories).find((r) => r.id === 'disagreement');
  assert.equal(row.status, 'covered');
  assert.equal(row.best.title, 'The vendor dispute');
  assert.equal(row.best.tagged, true);
  assert.ok(coverage([]).every((r) => r.status === 'none' && r.best === null));
});

test('a body-only match is thin, and a title plus body match is covered with its score', () => {
  const thin = coverage(bank(['### [Ops] Shift work', '**A (Action):** Fixed a process.', '**R (Result):** Faster.']))
    .find((r) => r.id === 'process-improvement');
  assert.equal(thin.status, 'thin');
  assert.equal(thin.best.score, 1);
  const covered = coverage(bank(['### [Ops] Process cleanup', '**A (Action):** Rebuilt the intake process.', '**R (Result):** Faster.']))
    .find((r) => r.id === 'process-improvement');
  assert.equal(covered.status, 'covered');
  assert.equal(covered.best.score, 3);
  assert.equal(covered.best.tagged, false);
});

test('the best of several stories wins, and a title hit alone is thin', () => {
  const stories = bank([
    '### [Ops] Shift work', '**A (Action):** Fixed a process.',
    '### [Ops] Intake rebuild', '**A (Action):** Rebuilt intake.', '**Best for questions about:** process',
    '### [Ops] Night shift', '**A (Action):** Kept the process running.',
  ]);
  assert.deepEqual(coverage(stories).find((r) => r.id === 'process-improvement').best, { title: 'Intake rebuild', score: 3, tagged: true });
  const titleOnly = coverage(bank(['### [Ops] Process notes', '**A (Action):** Wrote them.'])).find((r) => r.id === 'process-improvement');
  assert.equal(titleOnly.status, 'thin');
  assert.equal(titleOnly.best.score, 2);
  const filler = coverage(bank(['### [Ops] Made the build faster without being asked', '**A (Action):** Fixed the cache.']));
  assert.ok(filler.every((r) => r.status === 'none'), 'a prompt holds no filler word for an unrelated story to match');
});

test('stories with a pending result are listed by title and line', () => {
  const stories = bank(['### [Ops] Intake form', '**A (Action):** Built it.', '**R (Result):** pending']);
  assert.deepEqual(pendingStories(stories), [{ title: 'Intake form', line: 1 }]);
});

test('the CLI reports twelve prompts and the pending story, and exits 1 on a missing bank', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'story-coverage-')));
  try {
    const path = join(dir, 'story-bank.md');
    writeFileSync(path, [
      '### [Team] The vendor dispute', '**A (Action):** Mediated.', '**R (Result):** Resolved.', '**Best for questions about:** conflict',
      '', '### [Ops] Intake form', '**A (Action):** Built it.', '**R (Result):** pending: Q1 numbers',
      '', '### [Ops] Half written', '**R (Result):** pending',
    ].join('\n'));
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

    const json = run('--json', '--story-bank', path);
    assert.equal(json.status, 0, json.stderr);
    const report = JSON.parse(json.stdout);
    assert.equal(report.prompts.length, 12);
    assert.deepEqual(report.pending.map((s) => s.title), ['Intake form']);
    assert.equal(report.stories, 2);
    assert.deepEqual(report.unreadable.map((u) => u.line), [10]);
    assert.match(json.stderr, /1 entry in .* cannot be read/);

    const text = run('--story-bank', path);
    assert.equal(text.status, 0, text.stderr);
    assert.match(text.stdout, /^covered +disagreement +"The vendor dispute" \(score 3\)$/m);
    assert.match(text.stdout, /1 covered, \d+ thin, \d+ with no story, of 12 prompts\. 2 stories read from /);

    mkdirSync(join(dir, 'interview-prep'));
    writeFileSync(join(dir, 'interview-prep', 'story-bank.md'), '### [Ops] Root story\n**A (Action):** Did it.\n');
    const { CAREER_OPS_DATA_DIR: _unused, ...env } = process.env;
    const fromRoot = spawnSync(process.execPath, [SCRIPT, '--json'], { encoding: 'utf-8', env: { ...env, CAREER_OPS_ROOT: dir } });
    assert.equal(fromRoot.status, 0, fromRoot.stderr);
    assert.equal(JSON.parse(fromRoot.stdout).bank, join(dir, 'interview-prep', 'story-bank.md'));

    for (const absent of [join(dir, 'absent.md'), dir]) {
      const missing = run('--story-bank', absent);
      assert.equal(missing.status, 1);
      assert.match(missing.stderr, /not found\./);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the CLI refuses a bank with no story, names text cut off by a table, and lists a pending result', () => {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'story-coverage-')));
  try {
    const path = join(dir, 'story-bank.md');
    const run = (...args) => spawnSync(process.execPath, [SCRIPT, ...args], { encoding: 'utf-8' });

    writeFileSync(path, 'Notes only, no story yet.\n');
    const empty = run('--story-bank', path);
    assert.equal(empty.status, 1);
    assert.match(empty.stderr, /no story/i);
    assert.equal(empty.stdout, '');

    writeFileSync(path, [
      '### [Team] The stakeholder conflict', '**A (Action):** Mediated.', '**R (Result):** pending',
      '| a | b |', '|---|---|', '| 1 | 2 |',
      '**Best for questions about:** conflict',
    ].join('\n'));
    const cut = run('--story-bank', path);
    assert.equal(cut.status, 0, cut.stderr);
    assert.match(cut.stderr, /line 7: text after a table inside "The stakeholder conflict" is not read/);
    assert.match(cut.stdout, /\(score \d, no tag match\)/);
    assert.match(cut.stdout, /Result still pending:\n {2}line 1 {2}The stakeholder conflict/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a story about a difficult problem does not cover the hard-feedback prompt', () => {
  const stories = bank(['### [Ops] The outage', '**A (Action):** Traced it.', '**Best for questions about:** difficult-problem']);
  const rows = coverage(stories);
  assert.equal(rows.find((r) => r.id === 'difficult-problem').status, 'covered');
  assert.equal(rows.find((r) => r.id === 'hard-feedback').status, 'none');
});

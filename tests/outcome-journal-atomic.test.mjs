// tests/outcome-journal-atomic.test.mjs: a failed outcome-journal write leaves the previous journal intact,
// and the journal lock is released after it and refused while another holder has it.
//
// A preload makes every write to outcome.md, or to its `.outcome.md.*` temp
// file, store 10 characters and throw ENOSPC. A plain writeFileSync then leaves
// a truncated journal; writeFileAtomic leaves the old one in place.
//
// Run:  node --test tests/outcome-journal-atomic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describeSpawn } from './helpers/describe-spawn.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

const TRACKER = (role) => [
  '# Applications Tracker',
  '',
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|------|---------|------|-------|--------|-----|--------|-------|',
  `| 1 | 2026-01-05 | Acme | ${role} | 4.6/5 | Interview | ❌ | — | notes |`,
].join('\n');

// set-status writes session markers under the code root unless told otherwise.
const env = (dir) => ({ ...process.env, CAREER_OPS_TRACKER: join(dir, 'data', 'applications.md'), CAREER_OPS_ACTIVITY_DIR: join(dir, 'activity') });

function outcome(dir, args, preload, extraEnv = {}) {
  return spawnSync(process.execPath, [...(preload ? ['--require', preload] : []), join(ROOT, 'outcome.mjs'), ...args], {
    cwd: ROOT, encoding: 'utf-8', timeout: 30_000, env: { ...env(dir), ...extraEnv } });
}

test('a failed journal write leaves the previous journal intact', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-outcome-atomic-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'applications.md'), TRACKER('Senior Backend Engineer'));
    const first = outcome(dir, ['1', 'interview_progress', '--stage', 'Tech Screen']);
    assert.equal(first.status, 0, describeSpawn(first, 'the first recording failed'));
    const journal = join(dir, 'data', 'outcomes', '1_acme_senior-backend-engineer', 'outcome.md');
    const before = readFileSync(journal, 'utf-8');
    const preload = join(dir, 'fail.cjs');
    writeFileSync(preload, `const fs = require('node:fs'); const path = require('node:path'); const w = fs.writeFileSync;
fs.writeFileSync = (f, c, o) => { const b = typeof f === 'string' ? path.basename(f) : '';
  if (b === 'outcome.md' || b.startsWith('.outcome.md.')) { w(f, String(c).slice(0, 10), o); throw Object.assign(new Error('injected disk full'), { code: 'ENOSPC' }); }
  return w(f, c, o); }; require('node:module').syncBuiltinESMExports();`);
    const r = outcome(dir, ['1', 'rejected'], preload);
    assert.equal(r.status, 1, describeSpawn(r, 'expected the journal failure to exit 1'));
    assert.match(`${r.stdout}${r.stderr}`, /outcome journal could not be saved/);
    assert.equal(readFileSync(journal, 'utf-8'), before, 'the journal was truncated');
    assert.equal(existsSync(join(dirname(journal), '.submitted-cv.lock')), false, 'the journal lock outlived the failed write');
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

// The lock is taken by a live holder (this test) right after set-status returns,
// so the CV archive step got it and the journal step does not. The preload also
// moves Date.now forward on each call from then on, so the 60 s wait ends in
// well under a second, still short of the 10 min stale age.
const HOLD_LOCK_AFTER_SET_STATUS = `const cp = require('node:child_process'); const fs = require('node:fs'); const path = require('node:path');
const run = cp.execFileSync; const now = Date.now; let skew = 0; let held = false;
Date.now = () => (held ? (skew = Math.min(skew + 2000, 120000)) : 0) + now();
cp.execFileSync = (file, args, options) => { const out = run(file, args, options);
  if (String(args?.[0] ?? '').endsWith('set-status.mjs')) { const lock = process.env.HELD_LOCK; fs.mkdirSync(lock);
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.ppid, token: 'held-by-test', started_at: new Date(now()).toISOString() })); held = true; }
  return out; }; require('node:module').syncBuiltinESMExports();`;

test('a journal lock held by another process stops the write with journal-locked', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-outcome-locked-'));
  try {
    mkdirSync(join(dir, 'data'), { recursive: true });
    writeFileSync(join(dir, 'data', 'applications.md'), TRACKER('Senior Backend Engineer'));
    const first = outcome(dir, ['1', 'interview_progress', '--stage', 'Tech Screen']);
    assert.equal(first.status, 0, describeSpawn(first, 'the first recording failed'));
    const journal = join(dir, 'data', 'outcomes', '1_acme_senior-backend-engineer', 'outcome.md');
    const before = readFileSync(journal, 'utf-8');
    const preload = join(dir, 'hold.cjs');
    writeFileSync(preload, HOLD_LOCK_AFTER_SET_STATUS);
    const r = outcome(dir, ['1', 'rejected', '--json'], preload, { HELD_LOCK: join(dirname(journal), '.submitted-cv.lock') });
    assert.equal(r.status, 1, describeSpawn(r, 'expected the held lock to exit 1'));
    assert.equal(JSON.parse(r.stdout.trim().split('\n').at(-1)).code, 'journal-locked', describeSpawn(r, 'expected journal-locked'));
    assert.equal(readFileSync(journal, 'utf-8'), before, 'the journal was written under a lock someone else held');
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

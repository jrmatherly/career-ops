// tests/outcome-journal-atomic.test.mjs: a failed outcome-journal write leaves the previous journal intact.
//
// A preload makes every write to outcome.md, or to its `.outcome.md.*` temp
// file, store 10 characters and throw ENOSPC. A plain writeFileSync then leaves
// a truncated journal; writeFileAtomic leaves the old one in place.
//
// Run:  node --test tests/outcome-journal-atomic.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
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

function outcome(dir, args, preload) {
  return spawnSync(process.execPath, [...(preload ? ['--require', preload] : []), join(ROOT, 'outcome.mjs'), ...args], {
    cwd: ROOT, encoding: 'utf-8', timeout: 30_000, env: env(dir) });
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
  } finally {
    rmSync(dir, { recursive: true, force: true, maxRetries: 10 });
  }
});

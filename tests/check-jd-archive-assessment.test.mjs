// tests/check-jd-archive-assessment.test.mjs: a sent application in Assessment is flagged when it has no JD archive.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { findUnarchivedApplications } from '../check-jd-archive.mjs';

test('a sent application in Assessment with no report or capture is flagged', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jd-assessment-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'reports'));
  mkdirSync(join(root, 'jds'));
  const tracker = join(root, 'applications.md');
  writeFileSync(tracker, [
    '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
    '|---|------|---------|------|-------|--------|-----|--------|-------|',
    '| 1 | 2026-11-01 | Acme | Engineer | 4.0/5 | Applied | ❌ | | |',
    '| 2 | 2026-11-01 | Beta | Engineer | 4.0/5 | Assessment | ❌ | | |',
    '| 3 | 2026-11-01 | Gamma | Engineer | 4.0/5 | screening | ❌ | | |',
    '| 4 | 2026-11-01 | Delta | Engineer | 4.0/5 | Evaluated | ❌ | | |',
    '',
  ].join('\n'));
  const found = findUnarchivedApplications(tracker, join(root, 'reports'), join(root, 'jds'));
  assert.deepEqual(found.map((f) => [f.row, f.status]), [[1, 'Applied'], [2, 'Assessment'], [3, 'Assessment']]);
});

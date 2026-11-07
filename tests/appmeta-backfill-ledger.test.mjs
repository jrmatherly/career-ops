#!/usr/bin/env node
/**
 * tests/appmeta-backfill-ledger.test.mjs — appendBackfillRows in tracker-utils.mjs.
 *
 * Run: node test-all.mjs --only appmeta-backfill-ledger
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, ROOT, rmSync } from './helpers.mjs';
import { appendBackfillRows, acquireTrackerLock, trackerLockDirFor, canonicalizeTrackerPath, loadCanonicalStates } from '../tracker-utils.mjs';
import { parseStatusLog } from '../funnel-velocity.mjs';

console.log('\nappendBackfillRows — locked status-log backfill');

const tmp = mkdtempSync(join(tmpdir(), 'co-backfill-'));
const tracker = join(tmp, 'data', 'applications.md');
const ledger = join(tmp, 'data', 'status-log.tsv');

try {
  mkdirSync(join(tmp, 'data'));
  writeFileSync(tracker, '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n');
  writeFileSync(ledger, '1\t2026-09-01\tEvaluated\tApplied\tset-status\t');
  const count = await appendBackfillRows(tracker, [
    { num: 3, date: '2026-10-01', from: null, to: 'Applied', note: 'from import' },
    { num: 3, date: '2026-10-08', from: 'Applied', to: 'Interview' },
  ]);
  const content = readFileSync(ledger, 'utf-8');
  const lines = content.split('\n');
  if (count === 2 && lines[0] === '1\t2026-09-01\tEvaluated\tApplied\tset-status\t' && lines[1] === '3\t2026-10-01\t-\tApplied\tbackfill\tfrom import' && lines[2] === '3\t2026-10-08\tApplied\tInterview\tbackfill\t') pass('rows land after the unterminated last line with source backfill');
  else fail(`ledger: ${JSON.stringify(content)}`);

  const parsed = parseStatusLog(content, loadCanonicalStates(join(ROOT, 'templates', 'states.yml')));
  const backfill = parsed.observations.filter((o) => o.source === 'backfill');
  if (backfill.length === 2 && backfill.every((o) => o.dayMath === false) && parsed.unparseable.length === 0 && parsed.unknownSources.length === 0) pass('parseStatusLog reads them, excluded from day math');
  else fail(`parsed: ${JSON.stringify(parsed)}`);

  const lock = await acquireTrackerLock(trackerLockDirFor(canonicalizeTrackerPath(tracker)), { timeoutMs: 300 });
  let settled = false;
  const pending = appendBackfillRows(tracker, [{ num: 4, date: '2026-10-02', to: 'Applied' }]).finally(() => { settled = true; });
  await new Promise((r) => setTimeout(r, 200));
  const waited = !settled && !readFileSync(ledger, 'utf-8').includes('\n4\t');
  lock.release();
  await pending;
  if (waited && readFileSync(ledger, 'utf-8').endsWith('4\t2026-10-02\t-\tApplied\tbackfill\t\n')) pass('waits for the tracker lock, then writes');
  else fail(`waited=${waited} ledger=${JSON.stringify(readFileSync(ledger, 'utf-8'))}`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}

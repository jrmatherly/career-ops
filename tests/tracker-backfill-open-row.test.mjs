// --backfill-urls admits one faulty shape, a row that stops before a URL column at the end.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveColumns, trackerRowFault } from '../tracker-parse.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const HEAD = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |', '|---|---|---|---|---|---|---|---|---|---|'];

function backfill(rows) {
  const work = mkdtempSync(join(tmpdir(), 'co-backfill-'));
  mkdirSync(join(work, 'data'));
  mkdirSync(join(work, 'batch', 'tracker-additions'), { recursive: true });
  const tracker = join(work, 'data', 'applications.md');
  writeFileSync(tracker, [...HEAD, ...rows, ''].join('\n'));
  const run = spawnSync(process.execPath, [join(ROOT, 'merge-tracker.mjs'), '--backfill-urls'], { encoding: 'utf-8', env: { ...process.env, CAREER_OPS_ROOT: work } });
  const after = readFileSync(tracker, 'utf-8');
  rmSync(work, { recursive: true, force: true });
  return { status: run.status, out: run.stdout + run.stderr, after };
}

test('a row that stops before its URL cell and has no closing pipe does not crash the backfill', () => {
  const { status, out } = backfill(['| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-acme-2026-01-01.md) | my note']);
  assert.equal(status, 0, out);
  assert.doesNotMatch(out, /TypeError/);
});

test('a row that stops short is admitted for backfill only when the URL column is the last one', () => {
  const urlLast = resolveColumns(HEAD);
  assert.equal(trackerRowFault('| 1 | 2026-01-01 | Acme | Data Engineer | 3.0/5 | Applied | ✅ | [1](../reports/001-a.md) | note |', urlLast, { cellCount: 10, urlOptional: true }), null);
  const urlFifth = ['# Applications Tracker', '', '| # | Date | Company | Role | URL | Score | Status | PDF | Report | Notes |', '|---|---|---|---|---|---|---|---|---|---|'];
  const fault = trackerRowFault('| 1 | 2026-11-17 | Acme | Engineer |', resolveColumns(urlFifth), { cellCount: 10, urlOptional: true });
  assert.equal(fault?.cell, 'short');
});

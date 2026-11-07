#!/usr/bin/env node
/**
 * tests/appmeta-events.test.mjs — data/application-events.tsv and app-events.mjs CLI.
 *
 * Run: node test-all.mjs --only appmeta-events
 */

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';
import { readEvents, addEvent } from '../lib/application-events.mjs';

console.log('\napplication-events sidecar — readEvents/addEvent and app-events.mjs');

const TRACKER = [
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|---|---|---|---|---|---|---|---|',
  '| 3 | 2026-10-01 | Acme Corp | Backend Engineer | 4.2/5 | Interview | ❌ | — | — |',
  '| 5 | 2026-10-02 | Globex | Platform Engineer | 4.0/5 | Applied | ❌ | — | — |',
  '| 6 | 2026-10-03 | Initech | Data Engineer | 3.9/5 | Applied | ❌ | — | — |',
  '| 12 | 2026-10-05 | Northwind Traders | SRE | 4.1/5 | Applied | ❌ | — | — |',
  '',
].join('\n');
function withTracker(root) {
  mkdirSync(join(root, 'data'), { recursive: true });
  writeFileSync(join(root, 'data', 'applications.md'), TRACKER);
  return root;
}

const tmp = mkdtempSync(join(tmpdir(), 'co-appevents-'));
const cliRoot = withTracker(mkdtempSync(join(tmpdir(), 'co-appevents-cli-')));
const cli = (...args) => run(NODE, [join(ROOT, 'app-events.mjs'), ...args], { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: cliRoot } });

try {
  const row = await addEvent(tmp, 3, 'note', 'Called the recruiter', 'manual', '2026-11-01T09:30');
  await addEvent(tmp, 4, 'contact', 'Emailed Jane');
  await addEvent(tmp, 3, 'import', 'Imported from LinkedIn', 'import');
  if (row === '3\t2026-11-01T09:30\tnote\tCalled the recruiter\tmanual') pass('addEvent returns the row written');
  else fail(`row: ${JSON.stringify(row)}`);
  if (readFileSync(join(tmp, 'data', 'application-events.tsv'), 'utf-8').split('\n').filter(Boolean).length === 3) pass('one row per event');
  else fail('row count wrong');

  const all = readEvents(tmp);
  if (all.length === 3 && all[1].kind === 'contact' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(all[1].at)) pass('readEvents returns every row in file order');
  else fail(`all: ${JSON.stringify(all)}`);
  const three = readEvents(tmp, 3);
  if (three.length === 2 && three.every((e) => e.num === 3)) pass('readEvents filters by num');
  else fail(`filtered: ${JSON.stringify(three)}`);

  for (const [args, label] of [[[3, 'gossip', 'x'], 'unknown kind'], [[3, 'note', '  '], 'empty text'], [['abc', 'note', 'x'], 'non-integer num']]) {
    let threw = false;
    try { await addEvent(tmp, ...args); } catch { threw = true; }
    if (threw) pass(`${label} throws`); else fail(`${label} accepted`);
  }

  const added = cli('add', '5', 'note', 'Sent', 'thank-you', 'note');
  if (added && /^5\t\d{4}-\d{2}-\d{2}T\d{2}:\d{2}\tnote\tSent thank-you note\tmanual$/.test(added)) pass('CLI add joins the text words and prints the row');
  else fail(`add output: ${JSON.stringify(added)}`);
  cli('add', '6', 'contact', 'Met Bob');
  const listed = JSON.parse(cli('list', '--json') || '[]');
  const listed5 = JSON.parse(cli('list', '5', '--json') || '[]');
  if (listed.length === 2 && listed5.length === 1 && listed5[0].text === 'Sent thank-you note') pass('CLI list --json, with and without num');
  else fail(`list: ${JSON.stringify({ listed, listed5 })}`);
  if (cli('add', '5', 'gossip', 'x') === null) pass('CLI add with an unknown kind exits non-zero');
  else fail('CLI add with an unknown kind succeeded');
  if (cli('add', '99', 'note', 'x') === null) pass('CLI add for a number with no tracker row exits non-zero');
  else fail('CLI add for a missing tracker row succeeded');
} finally {
  rmSync(tmp, { recursive: true, force: true });
  rmSync(cliRoot, { recursive: true, force: true });
}

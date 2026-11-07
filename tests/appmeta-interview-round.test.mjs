#!/usr/bin/env node
/**
 * tests/appmeta-interview-round.test.mjs — interview-round.mjs writes data/active-interviews.md rows
 * that the existing readers parse.
 *
 * Run: node test-all.mjs --only appmeta-interview-round
 */

import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { pass, fail, run, NODE, ROOT, rmSync } from './helpers.mjs';
import { parseActiveInterviews } from '../process-quality.mjs';

console.log('\ninterview-round.mjs — add a round to data/active-interviews.md');

const TRACKER = [
  '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
  '|---|---|---|---|---|---|---|---|---|',
  '| 3 | 2026-10-01 | Acme Corp | Backend Engineer | 4.2/5 | Interview | ❌ | — | — |',
  '',
].join('\n');
const ROW = '| Acme Corp | Backend Engineer | technical | 2026-12-01 14:00 America/New_York (60m) | — | Scheduled | #3 in tracker |';

function makeRoot() {
  const root = mkdtempSync(join(tmpdir(), 'co-round-'));
  mkdirSync(join(root, 'data'));
  writeFileSync(join(root, 'data', 'applications.md'), TRACKER);
  return root;
}
const roots = [];
const cliIn = (root) => (...args) => run(NODE, [join(ROOT, 'interview-round.mjs'), 'add', ...args], { stdio: 'pipe', env: { ...process.env, CAREER_OPS_ROOT: root } });

try {
  const a = makeRoot(); roots.push(a);
  const add = cliIn(a);
  const file = join(a, 'data', 'active-interviews.md');
  const out = add('--num', '3', '--kind', 'technical', '--at', '2026-12-01T14:00', '--tz', 'America/New_York');
  const created = readFileSync(file, 'utf-8');
  if (out === ROW && created === `# Active Interviews\n\n| Company | Role | Round | Date/Time | Interviewer | Status | Notes |\n|---|---|---|---|---|---|---|\n${ROW}\n`) pass('--at creates the file with header and row');
  else fail(`out=${JSON.stringify(out)} file=${JSON.stringify(created)}`);

  writeFileSync(file, `${created}\nTrailing paragraph.\n\n| Other | table |\n|---|---|\n| x | y |\n`);
  add('--num', '3', '--kind', 'onsite', '--at', '2026-12-08T09:30', '--tz', 'America/New_York', '--duration', '240', '--notes', 'bring | laptop');
  const second = readFileSync(file, 'utf-8');
  const lines = second.split('\n');
  const onsiteIdx = lines.findIndex((l) => l.includes('| onsite |'));
  if (onsiteIdx === lines.indexOf(ROW) + 1 && lines.indexOf('Trailing paragraph.') > onsiteIdx && second.endsWith('| x | y |\n')) pass('second add goes inside the first table; the rest is untouched');
  else fail(`file: ${JSON.stringify(second)}`);
  if (lines[onsiteIdx].includes('2026-12-08 09:30 America/New_York (240m)') && lines[onsiteIdx].endsWith('| #3 in tracker; bring / laptop |')) pass('--duration and --notes land in their cells');
  else fail(`row: ${lines[onsiteIdx]}`);

  const again = add('--num', '3', '--kind', 'onsite', '--at', '2026-12-08T09:30', '--tz', 'America/New_York', '--duration', '240', '--notes', 'bring | laptop');
  if (again === lines[onsiteIdx] && readFileSync(file, 'utf-8') === second) pass('repeating an add is a no-op that prints the existing row');
  else fail(`repeat: ${JSON.stringify(again)}`);

  const parsed = parseActiveInterviews(second);
  if (parsed.length === 2 && parsed.every((r) => r.Notes.includes('#3 in tracker'))) pass('parseActiveInterviews reads both rows');
  else fail(`parsed: ${JSON.stringify(parsed)}`);
  // rejection-latency.mjs validates process.argv at import, so its extractDate regex is mirrored here.
  const d = String(parsed[0]['Date/Time']).match(/\d{4}-\d{2}-\d{2}/)?.[0];
  if (d === '2026-12-01') pass('the Date/Time cell yields its leading date the way rejection-latency extractDate reads it');
  else fail(`leading date: ${d}`);

  const b = makeRoot(); roots.push(b);
  const ics = join(b, 'invite.ics');
  writeFileSync(ics, [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:1@test',
    'DTSTART;TZID=America/New_York:20261201T140000', 'DTEND;TZID=America/New_York:20261201T150000',
    'SUMMARY:Technical interview', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n'));
  const icsOut = cliIn(b)('--num', '3', '--kind', 'technical', '--ics', ics, '--tz', 'America/New_York', '--participants', 'Jane Doe (Engineering Manager); Bob Roe');
  if (icsOut?.includes('| 2026-12-01 14:00 America/New_York (60m) |') && icsOut.includes('| Jane Doe (Engineering Manager); Bob Roe |')) pass('--ics yields the same Date/Time cell');
  else fail(`ics out: ${JSON.stringify(icsOut)}`);
  const contacts = readFileSync(join(b, 'data', 'contacts.tsv'), 'utf-8').split('\n').filter((l) => l && !l.startsWith('#'));
  if (contacts.length === 2 && contacts[0] === 'Jane Doe\tAcme Corp\tinterviewer\tEngineering Manager\t\t\t\t3\t' && contacts[1].startsWith('Bob Roe\tAcme Corp\tinterviewer\t\t')) pass('participants land in data/contacts.tsv');
  else fail(`contacts: ${JSON.stringify(contacts)}`);

  if (add('--num', '99', '--kind', 'technical', '--at', '2026-12-01T14:00', '--tz', 'America/New_York') === null) pass('unknown tracker row exits non-zero');
  else fail('unknown tracker row accepted');
  if (add('--num', '3', '--kind', 'technical', '--at', '2026-12-01T14:00', '--tz', 'Mars/Olympus') === null) pass('non-IANA --tz exits non-zero');
  else fail('bad --tz accepted');
  if (add('--num', '3', '--kind', 'chat', '--at', '2026-12-01T14:00', '--tz', 'UTC') === null) pass('unknown --kind exits non-zero');
  else fail('bad --kind accepted');
  if (add('--num', '3', '--kind', 'technical', '--at', '2026-12-01T14:00') === null) pass('--at without --tz exits non-zero');
  else fail('--at without --tz accepted');
  if (add('--num', '3', '--kind', 'technical', '--at', '2026-12-01T14:00', '--tz', 'UTC', '--ics', ics) === null) pass('both --at and --ics exits non-zero');
  else fail('both --at and --ics accepted');
  const before = readFileSync(file, 'utf-8');
  if (add('--num', '3', '--kind', 'technical', '--at', '2026-12-01T14:00', '--tz', 'UTC', '--participants', '(Recruiter)') === null && readFileSync(file, 'utf-8') === before) pass('a nameless participant is refused before anything is written');
  else fail('nameless participant accepted or the row was written');

  const c = makeRoot(); roots.push(c);
  writeFileSync(join(c, 'active-interviews.md'), '| Company | Role | Date | Status | Interviewer | Notes |\n|---|---|---|---|---|---|\n| Globex | PM | 2026-10-01 | Done | Sam | [process-friction] late |\n');
  const rootOut = cliIn(c)('--num', '3', '--kind', 'onsite', '--at', '2026-12-02T10:00', '--tz', 'UTC');
  const rootFile = readFileSync(join(c, 'active-interviews.md'), 'utf-8');
  const rootRows = parseActiveInterviews(rootFile);
  if (rootOut === '| Acme Corp | Backend Engineer | 2026-12-02 10:00 UTC (60m) | Scheduled | — | #3 in tracker |' && !existsSync(join(c, 'data', 'active-interviews.md')) && rootRows.length === 2 && rootRows[1].Date === '2026-12-02 10:00 UTC (60m)' && rootRows[1].Notes === '#3 in tracker') pass('a root-level file with its own column order gets the row in that order, and no data/ copy is created');
  else fail(`root-level: out=${JSON.stringify(rootOut)} file=${JSON.stringify(rootFile)}`);
  writeFileSync(join(c, 'active-interviews.md'), '| Company | Role | When |\n|---|---|---|\n');
  if (cliIn(c)('--num', '3', '--kind', 'onsite', '--at', '2026-12-02T10:00', '--tz', 'UTC') === null) pass('a table without Date/Time or Notes columns is refused');
  else fail('row written into a table the readers cannot match');
} finally {
  for (const r of roots) rmSync(r, { recursive: true, force: true });
}

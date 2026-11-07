#!/usr/bin/env node
/**
 * interview-round.mjs — add one scheduled round to data/active-interviews.md.
 *
 * The fork-local writer for that file; ics-interview.mjs stays read-only. The
 * row carries `#N in tracker` in Notes so tracker-sync-check.mjs matches it,
 * and Date/Time leads with YYYY-MM-DD so every existing reader takes the date.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { getCareerOpsRoot, resolveTrackerPath } from './path-resolver.mjs';
import { isMainModule } from './lib/is-main-module.mjs';
import { parseDate } from './lib/parse-date.mjs';
import { validateFlags, flagValue, hasFlag } from './lib/cli-flags.mjs';
import { cell, writeFileAtomic } from './tracker-utils.mjs';
import { withPipelineLock } from './pipeline-lock.mjs';
import { isValidZone, parseIcs, resolveDisplayZone } from './ics-interview.mjs';
import { appendContact } from './contact-extract.mjs';
import { parseNum, requireTrackerRow } from './lib/application-meta.mjs';

const KINDS = ['screening', 'technical', 'behavioral', 'onsite', 'other'];
const VALUE_FLAGS = ['--num', '--kind', '--at', '--tz', '--ics', '--duration', '--participants', '--notes'];
const USAGE = `Usage: node interview-round.mjs add --num N --kind ${KINDS.join('|')}
         (--at YYYY-MM-DDTHH:MM --tz <IANA> | --ics <file> [--tz <IANA>])
         [--duration 60] [--participants "Name (role); Name2"] [--notes text]`;
const COLUMNS = ['Company', 'Role', 'Round', 'Date/Time', 'Interviewer', 'Status', 'Notes'];
const HEADER = `| ${COLUMNS.join(' | ')} |\n|${COLUMNS.map(() => '---').join('|')}|`;
const isTableLine = (line) => /^\s*\|.*\|\s*$/.test(line);
const splitRow = (line) => line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());

// The same fallback process-quality.mjs, rejection-latency.mjs and
// tracker-sync-check.mjs read with, so a root-level file keeps its rows.
function interviewsPath(root) {
  const inData = join(root, 'data', 'active-interviews.md');
  const atRoot = join(root, 'active-interviews.md');
  return !existsSync(inData) && existsSync(atRoot) ? atRoot : inData;
}

// Readers such as process-quality.mjs parseActiveInterviews read only the
// first contiguous table and look cells up by header name, so the row goes
// at that table's end in that table's column order.
function insertRow(content, cells) {
  const fixed = `| ${COLUMNS.map((c) => cells[c.toLowerCase()]).join(' | ')} |`;
  if (content == null) return `# Active Interviews\n\n${HEADER}\n${fixed}\n`;
  const lines = content.split('\n');
  const start = lines.findIndex(isTableLine);
  if (start === -1) return `${content.replace(/\n*$/, '\n\n')}${HEADER}\n${fixed}\n`;
  const header = splitRow(lines[start]).map((h) => h.toLowerCase());
  const byName = (name) => cells[name] ?? (name === 'date' ? cells['date/time'] : undefined);
  for (const need of ['company', 'role', 'notes']) {
    if (!header.includes(need)) throw new Error(`The first table has no ${need} column; add the round by hand`);
  }
  if (!header.includes('date/time') && !header.includes('date')) throw new Error('The first table has no Date/Time column; add the round by hand');
  let end = start;
  while (end + 1 < lines.length && isTableLine(lines[end + 1])) end++;
  lines.splice(end + 1, 0, `| ${header.map((h) => byName(h) ?? '—').join(' | ')} |`);
  return lines.join('\n');
}

function when(args) {
  const at = flagValue(args, '--at');
  const ics = flagValue(args, '--ics');
  const tz = flagValue(args, '--tz');
  if (Boolean(at) === Boolean(ics)) throw new Error(`Give exactly one of --at or --ics\n${USAGE}`);
  if (tz !== undefined && !isValidZone(tz)) throw new Error(`--tz "${tz}" is not an IANA time zone`);
  let duration = null;
  if (hasFlag(args, '--duration')) {
    duration = Number(flagValue(args, '--duration'));
    if (!Number.isInteger(duration) || duration <= 0) throw new Error('--duration must be a positive number of minutes');
  }
  if (at) {
    if (!tz) throw new Error('--at needs --tz');
    // Wall time in --tz, so only its shape and calendar are checked.
    if (!/^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/.test(at) || !parseDate(at.slice(0, 10))) {
      throw new Error(`--at must be a real YYYY-MM-DDTHH:MM, got "${at}"`);
    }
    return { date: at.slice(0, 10), time: at.slice(11), zone: tz, minutes: duration ?? 60 };
  }
  const zone = tz ?? resolveDisplayZone(undefined).zone;
  const { event } = parseIcs(readFileSync(ics, 'utf-8'), { displayZone: zone });
  if (!event || event.cancelled || !event.display) throw new Error(`${ics} has no timed, uncancelled event to schedule`);
  return { date: event.display.start.date, time: event.display.start.time, zone, minutes: duration ?? event.durationMinutes ?? 60 };
}

function participantsOf(text) {
  return text.split(';').map((p) => p.trim()).filter(Boolean).map((part) => {
    const m = part.match(/^(.*?)\s*\(([^)]*)\)$/);
    const name = (m ? m[1] : part).trim();
    if (!name) throw new Error(`--participants entry "${part}" has no name`);
    return { name, title: m ? m[2].trim() : '' };
  });
}

async function main(args) {
  validateFlags(args, [...VALUE_FLAGS, '--help', '-h'], USAGE, { valueFlags: VALUE_FLAGS, requireOperand: true });
  if (args[0] !== 'add') throw new Error(USAGE);
  const num = parseNum(flagValue(args, '--num') ?? '');
  const kind = flagValue(args, '--kind');
  if (!KINDS.includes(kind)) throw new Error(`--kind must be one of ${KINDS.join(', ')}`);
  const root = getCareerOpsRoot();
  const tracker = requireTrackerRow(root, num);
  const { date, time, zone, minutes } = when(args);
  const participants = cell(flagValue(args, '--participants'));
  const people = participantsOf(participants);
  const notes = cell(flagValue(args, '--notes'));
  const cells = {
    company: cell(tracker.company), role: cell(tracker.role), round: kind,
    'date/time': `${date} ${time} ${zone} (${minutes}m)`, interviewer: participants || '—',
    status: 'Scheduled', notes: `#${num} in tracker${notes ? `; ${notes}` : ''}`,
  };

  const file = interviewsPath(root);
  // Contacts first: appendContact is an upsert, so a retry after a failure
  // here is harmless, while a second row would be a second round.
  for (const { name, title } of people) {
    await appendContact({ name, company: tracker.company, type: 'interviewer', title, tracker: String(num) }, join(root, 'data', 'contacts.tsv'));
  }
  mkdirSync(dirname(file), { recursive: true });
  let written;
  await withPipelineLock(file, () => {
    const current = existsSync(file) ? readFileSync(file, 'utf-8') : null;
    const sameRound = (l) => l.includes(`| ${cells.notes} |`) && l.includes(`| ${cells['date/time']} |`);
    written = current?.split('\n').find(sameRound);
    if (written) {
      console.error('note: this round is already recorded; nothing written');
      return;
    }
    const next = insertRow(current, cells);
    written = next.split('\n').find(sameRound);
    writeFileAtomic(file, next);
  });
  console.log(written);
}

if (isMainModule(import.meta.url)) {
  main(process.argv.slice(2)).catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exit(1);
  });
}

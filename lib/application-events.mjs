/**
 * lib/application-events.mjs — free-form per-application timeline in
 * data/application-events.tsv. Row: {num}\t{at}\t{kind}\t{text}\t{source},
 * `at` as local YYYY-MM-DDTHH:MM.
 */

import { join } from 'node:path';
import { localToday } from './local-today.mjs';
import { appendSidecarRow, parseNum, readSidecarRows, tsvCell } from './application-meta.mjs';

export const EVENT_KINDS = ['note', 'contact', 'import'];

export const eventsPath = (root) => join(root, 'data', 'application-events.tsv');

const localNow = (d = new Date()) => `${localToday(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

export function readEvents(root, num) {
  const want = num === undefined ? null : parseNum(num);
  return readSidecarRows(eventsPath(root))
    .filter(([n]) => want === null || n === want)
    .map(([n, at, kind, text, source]) => ({ num: n, at, kind, text, source }));
}

export async function addEvent(root, num, kind, text, source = 'manual', at = localNow()) {
  if (!EVENT_KINDS.includes(kind)) throw new Error(`Unknown event kind "${kind}"; expected one of ${EVENT_KINDS.join(', ')}`);
  if (!tsvCell(text)) throw new Error('Event text is required');
  const row = [parseNum(num), at, kind, text, source].map(tsvCell).join('\t');
  await appendSidecarRow(eventsPath(root), row);
  return row;
}

/**
 * lib/application-meta.mjs — per-application metadata kept beside the tracker
 * in data/application-meta.tsv, so lanes, tags and close reasons never need a
 * new column in data/applications.md.
 *
 * Row: {num}\t{date}\t{key}\t{value}\t{source}. Append-only; the last row per
 * (num, key) wins, except `tag`, which collects every value.
 */

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { localToday } from './local-today.mjs';
import { appendLedgerRows } from '../tracker-utils.mjs';
import { withPipelineLock } from '../pipeline-lock.mjs';

export const META_KEYS = ['lane', 'tag', 'closed_reason', 'source', 'closed_at'];

export const metaPath = (root) => join(root, 'data', 'application-meta.tsv');
export const tsvCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

export function parseNum(num) {
  const n = typeof num === 'number' ? num : /^\d+$/.test(String(num).trim()) ? Number(num) : NaN;
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Tracker number must be a positive integer, got "${num}"`);
  return n;
}

/** Append one row under the per-file lock every sidecar writer shares. */
export async function appendSidecarRow(filePath, line) {
  mkdirSync(dirname(filePath), { recursive: true });
  return withPipelineLock(filePath, () => appendLedgerRows(filePath, `${line}\n`));
}

/** Data rows of a sidecar TSV as cell arrays, `cells[0]` already a positive integer. */
export function readSidecarRows(filePath) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  for (const line of readFileSync(filePath, 'utf-8').split('\n')) {
    if (!line || line[0] === '#') continue;
    const cells = line.split('\t');
    if (cells.length < 5) continue;
    const num = Number(cells[0]);
    if (!cells[0] || !Number.isInteger(num) || num <= 0) continue;
    cells[0] = num;
    cells[4] = cells[4].trimEnd();
    rows.push(cells);
  }
  return rows;
}

/** @returns {Map<number, Record<string, {value: string|string[], date: string, source: string}>>} */
export function readMeta(root) {
  const out = new Map();
  for (const [num, date, key, value, source] of readSidecarRows(metaPath(root))) {
    if (!META_KEYS.includes(key)) continue;
    let rec = out.get(num);
    if (!rec) out.set(num, (rec = {}));
    if (key === 'tag') {
      const tags = rec.tag?.value ?? [];
      if (!tags.includes(value)) tags.push(value);
      rec.tag = { value: tags, date, source };
    } else {
      rec[key] = { value, date, source };
    }
  }
  return out;
}

export async function setMeta(root, num, key, value, source = 'manual', date = localToday()) {
  if (!META_KEYS.includes(key)) throw new Error(`Unknown meta key "${key}"; expected one of ${META_KEYS.join(', ')}`);
  const row = [parseNum(num), date, key, value, source].map(tsvCell).join('\t');
  await appendSidecarRow(metaPath(root), row);
  return row;
}

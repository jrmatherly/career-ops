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
import { parseDate } from './parse-date.mjs';
import { appendLedgerRows } from '../tracker-utils.mjs';
import { withPipelineLock } from '../pipeline-lock.mjs';
import { resolveTrackerPath } from '../path-resolver.mjs';
import { resolveColumns, parseTrackerRow } from '../tracker-parse.mjs';

export const META_KEYS = ['lane', 'tag', 'closed_reason', 'source', 'closed_at'];

export const metaPath = (root) => join(root, 'data', 'application-meta.tsv');
export const tsvCell = (v) => String(v ?? '').replace(/[\t\r\n]+/g, ' ').trim();

export function parseNum(num) {
  const n = typeof num === 'number' ? num : /^\d+$/.test(String(num).trim()) ? parseInt(String(num).trim(), 10) : NaN;
  if (!Number.isInteger(n) || n <= 0) throw new Error(`Tracker number must be a positive integer, got "${num}"`);
  return n;
}

/** The tracker row for `num`, or a throw: a sidecar row for a number no tracker row has is a typo filed forever. */
export function requireTrackerRow(root, num) {
  const file = resolveTrackerPath(root);
  if (!existsSync(file)) throw new Error(`No tracker at ${file}`);
  const lines = readFileSync(file, 'utf-8').split('\n');
  const colmap = resolveColumns(lines);
  for (const line of lines) {
    const row = parseTrackerRow(line, colmap);
    if (row?.num === num) return row;
  }
  throw new Error(`No tracker row #${num} in ${file}`);
}

/** Append one row under the per-file pipeline lock the TSV sidecar appenders share. */
export async function appendSidecarRow(filePath, line) {
  mkdirSync(dirname(filePath), { recursive: true });
  return withPipelineLock(filePath, () => appendLedgerRows(filePath, `${line}\n`));
}

/**
 * Data rows of a sidecar TSV as cell arrays, `cells[0]` already a positive
 * integer. A row that does not parse is pushed to `skipped` as {line, raw},
 * never dropped in silence.
 */
export function readSidecarRows(filePath, skipped = []) {
  const rows = [];
  if (!existsSync(filePath)) return rows;
  const lines = readFileSync(filePath, 'utf-8').split('\n');
  lines.forEach((line, i) => {
    if (!line || line[0] === '#') return;
    const cells = line.split('\t');
    const num = Number(cells[0]);
    if (cells.length < 5 || !cells[0] || !Number.isInteger(num) || num <= 0) {
      skipped.push({ line: i + 1, raw: line });
      return;
    }
    cells[0] = num;
    cells[4] = cells[4].trimEnd();
    rows.push(cells);
  });
  return rows;
}

/** @returns {Map<number, Record<string, {value: string|string[], date: string, source: string}>>} */
export function readMeta(root, skipped = []) {
  const out = new Map();
  const file = metaPath(root);
  for (const cells of readSidecarRows(file, skipped)) {
    const [num, date, key, value, source] = cells;
    if (!META_KEYS.includes(key)) {
      skipped.push({ line: null, raw: cells.join('\t') });
      continue;
    }
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
  const clean = tsvCell(value);
  if (!clean) throw new Error(`A value is required for ${key}`);
  if (key === 'closed_at' && !parseDate(clean)) throw new Error(`closed_at must be a real YYYY-MM-DD date, got "${clean}"`);
  const row = [parseNum(num), date, key, clean, source].map(tsvCell).join('\t');
  await appendSidecarRow(metaPath(root), row);
  return row;
}

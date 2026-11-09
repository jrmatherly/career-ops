/**
 * lib/evaluate-queue.mjs — data/evaluate-queue.tsv, the ledger of auto-mode
 * evaluations: the rows a scheduled job's rank pass queued and what the drain
 * did with each.
 *
 * Row: url, at, jobId, runId, rank, reason, state, source. Append-only; rows
 * group per URL by normalizeUrl, and the last row is the URL's state. The raw
 * URL a reader gets back is the first row's, the spelling the pipeline holds.
 */

import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { normalizeUrl } from '../url-key.mjs';
import { appendLedgerRows } from '../tracker-utils.mjs';
import { withPipelineLock } from '../pipeline-lock.mjs';
import { tsvCell } from './application-meta.mjs';
import { escapeFormulaCell, unescapeFormulaCell } from './tsv-formula-escape.mjs';
import { loadYaml } from './yaml-document.mjs';

export const COLUMNS = ['url', 'at', 'jobId', 'runId', 'rank', 'reason', 'state', 'source'];
export const STATES = ['queued', 'running', 'evaluated', 'failed', 'gated', 'skipped'];
export const SOURCES = ['rank-pass', 'drain'];
// The route kills an evaluation at 740 s and persists within 60 s more; a
// `running` row older than that plus a minute's margin belongs to a drain that died.
export const RUNNING_STALE_MS = 860_000;
export const MAX_FAILURES = 3;
export const DEFAULT_DAILY_CAP = 10;

export const ledgerPath = (root) => join(root, 'data', 'evaluate-queue.tsv');

function formatRow(row) {
  if (!STATES.includes(row.state)) throw new Error(`Unknown ledger state "${row.state}"; expected one of ${STATES.join(', ')}`);
  if (!SOURCES.includes(row.source)) throw new Error(`Unknown ledger source "${row.source}"; expected one of ${SOURCES.join(', ')}`);
  if (!normalizeUrl(tsvCell(row.url))) throw new Error(`Not a posting URL: "${row.url}"`);
  if (row.rank !== undefined && !Number.isFinite(row.rank)) throw new Error(`Rank must be a number, got "${row.rank}"`);
  const cells = { ...row, at: row.at ?? new Date().toISOString(), rank: row.rank ?? '' };
  return COLUMNS.map((column) => escapeFormulaCell(tsvCell(cells[column]))).join('\t');
}

/** Append one row; the header goes in first when the file is new, inside the same lock. */
export async function appendRow(root, row) {
  const file = ledgerPath(root);
  const line = formatRow(row);
  mkdirSync(dirname(file), { recursive: true });
  await withPipelineLock(file, () => {
    const header = !existsSync(file) || statSync(file).size === 0 ? `${COLUMNS.join('\t')}\n` : '';
    appendLedgerRows(file, `${header}${line}\n`);
  });
  return line;
}

// A NaN timestamp counts as outlived, so a mangled `at` cannot keep a row running forever.
const outlived = (row, laterMs) => !(laterMs - Date.parse(row.at) < RUNNING_STALE_MS);

function fold(entry, now) {
  const last = entry.rows.at(-1);
  const stale = last.state === 'running' && outlived(last, now);
  const state = stale ? 'failed' : last.state;
  // A `running` row is a drain that died mid-run when another `running` row
  // follows it, or when whatever follows came after it went stale (an offline
  // tick's row, say). A `queued` row soon after it (a 409, a dropped
  // connection) spends no retry.
  const died = entry.rows.filter((row, i) => {
    const next = entry.rows[i + 1];
    return row.state === 'running' && (next?.state === 'running' || outlived(row, next ? Date.parse(next.at) : now));
  }).length;
  const failures = entry.rows.filter((row) => row.state === 'failed').length + died;
  const rank = entry.rows.findLast((row) => row.rank !== undefined)?.rank;
  return {
    key: entry.key,
    url: entry.url,
    state,
    reason: stale ? 'running row went stale' : last.reason,
    rank,
    jobId: entry.rows[0].jobId,
    runId: entry.rows[0].runId,
    failures,
    final: failures >= MAX_FAILURES || !['queued', 'running', 'failed'].includes(state),
    rows: entry.rows,
  };
}

/**
 * Every URL's history, in first-seen order. A row that does not parse goes to
 * `skipped` as {line, raw}.
 *
 * @returns {Array<{ key: string, url: string, state: string, reason: string, rank?: number, jobId: string, runId: string, failures: number, final: boolean, rows: object[] }>}
 */
export function readLedger(root, { now = Date.now(), skipped = [] } = {}) {
  const file = ledgerPath(root);
  const entries = new Map();
  if (!existsSync(file)) return [];
  readFileSync(file, 'utf-8').split('\n').forEach((raw, i) => {
    if (!raw.trim()) return;
    const cells = raw.replace(/\r$/, '').split('\t').map(unescapeFormulaCell);
    if (cells[0] === 'url') return;
    const key = normalizeUrl(cells[0]);
    if (cells.length < COLUMNS.length || !STATES.includes(cells[6]) || !key || (cells[4] !== '' && !Number.isFinite(Number(cells[4])))) {
      skipped.push({ line: i + 1, raw });
      return;
    }
    const row = Object.fromEntries(COLUMNS.map((column, j) => [column, cells[j]]));
    row.rank = row.rank === '' ? undefined : Number(row.rank);
    let entry = entries.get(key);
    if (!entry) entries.set(key, (entry = { key, url: row.url, rows: [] }));
    entry.rows.push(row);
  });
  return [...entries.values()].map((entry) => fold(entry, now));
}

/** Evaluations a drain started today (UTC): `running` rows dated today, whatever happened to them after. */
export function startedToday(entries, now = Date.now()) {
  const today = new Date(now).toISOString().slice(0, 10);
  return entries.flatMap((entry) => entry.rows).filter((row) => row.state === 'running' && row.at.startsWith(today)).length;
}

/**
 * The ledger entries to evaluate next for `jobId` (every job when absent):
 * queued or failed-but-not-final rows at or above `rankThreshold`, best rank
 * first, at most `maxPerRun` and what is left of `dailyCap` today. Keys in
 * `exclude` are left out, so a drain can step past a row it already tried.
 */
export function drainPlan(root, { jobId, rankThreshold = -Infinity, maxPerRun = Infinity, dailyCap = DEFAULT_DAILY_CAP, now = Date.now(), exclude = new Set() } = {}) {
  const entries = readLedger(root, { now });
  const room = Math.max(0, Math.min(maxPerRun, dailyCap - startedToday(entries, now)));
  return entries
    .filter((entry) => (!jobId || entry.jobId === jobId) && !exclude.has(entry.key)
      && (entry.state === 'queued' || entry.state === 'failed') && !entry.final
      && (entry.rank ?? -Infinity) >= rankThreshold)
    .sort((a, b) => (b.rank ?? 0) - (a.rank ?? 0))
    .slice(0, room);
}

/**
 * The rank pass's half: one row per pending row the ledger has not seen,
 * `queued` at or above `rankThreshold`, else `skipped` as `below-threshold` or
 * `unranked`. A row skipped as unranked is weighed against the threshold again
 * if a later pass ranks it; that pass sees it only while it is still a candidate
 * of the job's window (evaluate-candidates.mjs), so a row the window has moved
 * past stays skipped.
 *
 * @param {Array<{ url: string, rank?: number }>} rows
 * @returns {Promise<number>} How many it queued.
 */
export async function queueCandidates(root, { jobId, runId, rankThreshold }, rows) {
  const ledger = new Map(readLedger(root).map((entry) => [entry.key, entry]));
  let queued = 0;
  for (const row of rows) {
    const entry = ledger.get(normalizeUrl(row.url));
    const ranked = Number.isFinite(row.rank);
    if (entry && !(ranked && entry.state === 'skipped' && entry.reason === 'unranked')) continue;
    const state = ranked && row.rank >= rankThreshold ? 'queued' : 'skipped';
    const reason = state === 'queued' ? '' : ranked ? 'below-threshold' : 'unranked';
    await appendRow(root, { url: row.url, jobId, runId, rank: ranked ? row.rank : undefined, reason, state, source: 'rank-pass' });
    if (state === 'queued') queued += 1;
  }
  return queued;
}

/** `pipeline.auto_evaluate_daily_cap` from the profile at `profilePath`, else DEFAULT_DAILY_CAP. */
export function readDailyCap(profilePath) {
  let profile;
  try {
    profile = loadYaml(readFileSync(profilePath, 'utf-8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return DEFAULT_DAILY_CAP;
    throw error;
  }
  const cap = profile?.pipeline?.auto_evaluate_daily_cap;
  if (cap === undefined) return DEFAULT_DAILY_CAP;
  if (Number.isInteger(cap) && cap >= 0) return cap;
  process.stderr.write(`evaluate-queue: pipeline.auto_evaluate_daily_cap is ${JSON.stringify(cap)}, not a whole number of 0 or more; using ${DEFAULT_DAILY_CAP}\n`);
  return DEFAULT_DAILY_CAP;
}

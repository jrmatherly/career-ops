// tests/helpers/tracker-damage.mjs: damaged variants of one valid tracker row, and a merge run over each.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NODE, ROOT } from '../helpers.mjs';
// A namespace import, so on a tree without trackerRowFault the tests that only
// run the merge still load and fail on what the merge did.
import * as trackerParse from '../../tracker-parse.mjs';

export const HEADER = ['# Applications Tracker', '', '| # | Date | Company | Role | Score | Status | PDF | Report | Notes | URL |',
  '|---|---|---|---|---|---|---|---|---|---|'];
export const COLMAP = { ...trackerParse.LEGACY_COLMAP, url: 10 };
export const CELLS = ['1', '2026-01-01', 'Acme', 'Data Engineer', '3.0/5', 'Applied', '✅',
  '[1](../reports/001-acme-2026-01-01.md)', 'my note', 'https://jobs.acme.com/1'];
// A re-evaluation of the same posting: same company, role and URL as CELLS.
const ADDITION = 'num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl\n'
  + '2\t2026-02-01\tAcme\tData Engineer\tEvaluated\t4.5/5\t❌\t[2](reports/002-acme-2026-02-01.md)\tre-eval\thttps://jobs.acme.com/1\n';

const render = (cells, { indent = '', close = true } = {}) => `${indent}| ${cells.join(' | ')}${close ? ' |' : ''}`;
const without = (cells, i) => cells.filter((_, at) => at !== i);
const swapped = (cells, i, j) => cells.map((cell, at) => (at === i ? cells[j] : at === j ? cells[i] : cell));
// A `|` typed inside cell i splits it in two at the middle.
const piped = (cells, i) => {
  const half = Math.ceil(cells[i].length / 2);
  return [...cells.slice(0, i), cells[i].slice(0, half), cells[i].slice(half), ...cells.slice(i + 1)];
};

/** Every edit of one kind that can be made to a row's cells. */
const CELL_EDITS = [
  ...CELLS.map((_, i) => ({ name: `drop${i}`, apply: cells => (i < cells.length ? without(cells, i) : cells) })),
  ...CELLS.map((_, i) => ({ name: `pipe${i}`, apply: cells => (i < cells.length ? piped(cells, i) : cells) })),
  ...CELLS.map((_, i) => ({ name: `empty${i}`, apply: cells => [...cells.slice(0, i), '', ...cells.slice(i)] })),
  ...CELLS.flatMap((_, i) => CELLS.slice(i + 1).map((__, k) => ({ name: `swap${i}-${i + k + 1}`,
    apply: cells => (i + k + 1 < cells.length ? swapped(cells, i, i + k + 1) : cells) }))),
  ...['', '0', '—', 'N/A', '-', '12draft', '#'].map(num => ({ name: `num(${num})`, apply: cells => [num, ...cells.slice(1)] })),
  { name: 'tail', apply: cells => [...cells, ''] },
];
const LINE_EDITS = [{ name: 'plain' }, { name: 'indent2', indent: '  ' }, { name: 'tab', indent: '\t' }, { name: 'open', close: false }];

/**
 * The valid row and every single edit of it in every line shape, then, with
 * `pairs`, every ordered pair of edits as a plain line.
 * @param {{pairs?: boolean}} [options]
 * @returns {{name: string, line: string}[]} Unique lines.
 */
export function damagedRows({ pairs = false } = {}) {
  const seen = new Map();
  const add = (name, cells, shapes = LINE_EDITS) => {
    for (const shape of shapes) {
      const line = render(cells, shape);
      if (!seen.has(line)) seen.set(line, `${name}/${shape.name}`);
    }
  };
  add('valid', CELLS);
  for (const first of CELL_EDITS) add(first.name, first.apply(CELLS));
  if (pairs) {
    for (const first of CELL_EDITS) {
      for (const second of CELL_EDITS) add(`${first.name}+${second.name}`, second.apply(first.apply(CELLS)), LINE_EDITS.slice(0, 1));
    }
  }
  return [...seen].map(([line, name]) => ({ name, line }));
}

/** Whether the shared rule calls this line a tracker row a writer may touch. */
export const isSound = line => trackerParse.trackerRowFault(line, COLMAP, { cellCount: CELLS.length, isStatus: cell => cell === 'Applied' }) === null;

// Date, Score, PDF, Report and URL: the cells of the valid row that only their own column holds.
const TYPED = [1, 4, 6, 7, 9];
const NOTES = 8;

/** Cells of a pipe row, read the way a Markdown table renders them. */
export const cellsOf = (line) => {
  const cells = line.trim().split('|').map(s => s.trim());
  cells.shift();
  if (line.trim().endsWith('|')) cells.pop();
  return cells;
};

/**
 * Run the real merge over a tracker holding `row` and one pending addition.
 * @param {string} row - The tracker's data lines (one row unless it holds a newline).
 * @param {string[]} [args] - Extra merge-tracker flags.
 * @param {{header?: string[], addition?: string, again?: boolean}} [options]
 *   `addition` defaults to a re-evaluation of the valid row. `again` runs the
 *   merge a second time over the tracker a clean first run left.
 * @returns {Promise<{status: number|null, out: string, before: string, text: string, pending: boolean, backup: boolean, again?: {status: number|null, out: string}}>}
 */
export async function mergeOver(row, args = [], { header = HEADER, addition = ADDITION, again = false } = {}) {
  const work = mkdtempSync(join(tmpdir(), 'cops-row-damage-'));
  const adds = join(work, 'adds');
  mkdirSync(adds);
  const tracker = join(work, 'applications.md');
  const before = [...header, row, ''].join('\n');
  writeFileSync(tracker, before);
  writeFileSync(join(adds, '002-acme.tsv'), addition);
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(NODE, [join(ROOT, 'merge-tracker.mjs'), ...args], {
      env: { ...process.env, CAREER_OPS_ROOT: work, CAREER_OPS_TRACKER: tracker, CAREER_OPS_ADDITIONS: adds, CAREER_OPS_BATCH_STATE: join(work, 'batch-state.tsv'), CAREER_OPS_PDF_INDEX: join(work, 'pdf-index.tsv') },
    });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    child.on('error', reject);
    child.on('close', status => resolve({ status, out }));
  });
  try {
    const first = await run();
    const result = { ...first, before, text: readFileSync(tracker, 'utf-8'),
      pending: existsSync(join(adds, '002-acme.tsv')), backup: readdirSync(work).some(name => name.endsWith('.bak')) };
    if (again && first.status === 0) result.again = await run();
    return result;
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

/** The tracker's data rows after a merge: every pipe line below the header and separator. */
export const dataRows = text => text.split('\n').filter(l => l.trim().startsWith('|')).slice(2);

/**
 * Run verify-pipeline over a tracker holding `row`, with row #1's report on disk.
 * @param {import('node:test').TestContext} t
 * @param {string} row
 * @returns {{status: number|null, out: string}}
 */
export function verifyOver(t, row) {
  const work = mkdtempSync(join(tmpdir(), 'cops-row-shape-verify-'));
  t.after(() => rmSync(work, { recursive: true, force: true }));
  mkdirSync(join(work, 'reports'));
  writeFileSync(join(work, 'reports', '001-acme-2026-01-01.md'), '# Acme\n\n**URL:** https://jobs.acme.com/1\n');
  const tracker = join(work, 'data', 'applications.md');
  mkdirSync(join(work, 'data'));
  writeFileSync(tracker, [...HEADER, row, ''].join('\n'));
  const r = spawnSync(NODE, [join(ROOT, 'verify-pipeline.mjs')], { encoding: 'utf-8', timeout: 30_000, cwd: work,
    env: { ...process.env, CAREER_OPS_ROOT: work, CAREER_OPS_TRACKER: tracker, CAREER_OPS_REPORTS: join(work, 'reports') } });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
}

/**
 * What a merge did wrong with one damaged row, or null.
 *
 * The first two checks are the owner's rule. The last does not use the shared
 * rule at all: a row the merge rewrote had its ten cells, its report and URL
 * where the valid row has them (or blank), and no date, score, PDF mark,
 * report link or URL under another column. Notes is exempt, because a note
 * may be any of those. Company, role, status and note are free text, so no
 * check can place them, and one of them exchanged with a date, a score or a
 * PDF mark puts free text where the rule accepts free text.
 *
 * @param {string} line - The tracker's only data line before the merge.
 * @param {Awaited<ReturnType<typeof mergeOver>>} r
 * @returns {string|null}
 */
export function mergeViolation(line, r) {
  if (r.status !== 0) {
    if (r.status !== 1) return `the merge did not run to an exit code (status ${r.status})`;
    if (r.text !== r.before) return 'refused, but the tracker was written';
    if (!r.pending) return 'refused, but the addition was archived';
    return null;
  }
  if (r.again && r.again.status !== 0) return 'the merge refused the tracker it had just written';
  const rows = dataRows(r.text);
  const kept = rows.includes(line);
  if (!kept && !isSound(line)) return 'rewrote a row the shared rule calls unreadable';
  const samePosting = rows.filter((l) => { const c = cellsOf(l); return c[2] === 'Acme' && c[3] === 'Data Engineer'; });
  // A complete row with a sentinel `#` has no number to match on, so the merge
  // has always added beside it (AGENTS.md, "Row order").
  const unnumbered = /^(?:n\/a|—|-)$/i.test(cellsOf(line)[0]) && isSound(line.replace(cellsOf(line)[0], '1'));
  if (samePosting.length > 1 && !unnumbered) return 'appended a second row for the same company and role';
  const was = cellsOf(line);
  const moved = was.flatMap((value, at) => {
    const emptied = [7, 9].includes(at) && value !== CELLS[at] && value !== '';
    const strayed = at !== NOTES && TYPED.some(home => home !== at && CELLS[home] === value);
    return emptied || strayed ? [at] : [];
  });
  if (!kept && (moved.length || was.length !== CELLS.length)) {
    return `rewrote a row whose cells had moved (${was.length} cells, columns ${moved.join(',') || 'none'} changed)`;
  }
  return null;
}

/** Run `task` over `items`, `width` at a time. */
export async function pooled(items, width, task) {
  const results = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: width }, async () => {
    while (next < items.length) { const at = next++; results[at] = await task(items[at], at); }
  }));
  return results;
}

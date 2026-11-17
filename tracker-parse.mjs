/**
 * tracker-parse.mjs — shared header-aware column mapping for `data/applications.md`.
 *
 * The tracker is a markdown table that several scripts read. #946/#954 made the
 * column layout customizable (e.g. an inserted Location column) by mapping
 * columns *by header name* instead of fixed position — but that logic only
 * lived in `merge-tracker.mjs`. This module is the single home for it, so every
 * reader (merge-tracker, dedup-tracker, followup-cadence, analyze-patterns)
 * tolerates the same layouts and can't drift apart.
 *
 * Indexing matches `line.split('|')`: index 0 is the empty cell before the
 * leading pipe, so the first real column ("#"/num) is index 1.
 */

import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'node:crypto';

/** The original fixed 9-column layout (num … notes at indices 1 … 9). */
export const LEGACY_COLMAP = {
  num: 1, date: 2, company: 3, role: 4, score: 5, status: 6, pdf: 7, report: 8, notes: 9,
};

/**
 * Header text (lowercased) → canonical field name. Includes ES aliases.
 * Loaded from tracker-aliases.json — the ONE shared alias table, which the web
 * read path (web/src/lib/tracker-table.mjs) also loads at runtime, so the two
 * can never drift (PR #1598 review). Add new aliases in the JSON, not here.
 *
 * A missing or corrupt JSON is a broken install (the file ships alongside this
 * module in SYSTEM_PATHS/BOOTSTRAP_PATHS): fail fast with an actionable
 * message rather than degrading silently — a quiet fallback here would
 * reintroduce exactly the reader drift the shared table exists to prevent.
 * (The web loader degrades to the legacy fixed order instead because it reads
 * the file from a user-configured root at request time.)
 */
export const HEADER_ALIASES = (() => {
  const src = new URL('./tracker-aliases.json', import.meta.url);
  try {
    return JSON.parse(readFileSync(src, 'utf-8'));
  } catch (e) {
    throw new Error(
      `tracker-parse.mjs: cannot load tracker-aliases.json (${e.message}). ` +
      'The file ships with career-ops next to tracker-parse.mjs — restore it ' +
      'from the repo or re-run: node update-system.mjs apply',
    );
  }
})();

/**
 * A score cell in the tracker: `N/5` or `N.N/5` (any precision), or the
 * sentinels `N/A` / `DUP` / `—` (em dash) / `-` (hyphen). Markdown bold is
 * stripped first. `—`/`-` mirror the tracker's own "no data" convention used
 * in every other column (Report, PDF, etc.) — see #1799: a backfilled entry
 * with no evaluation (e.g. a rejection for a role never run through
 * `oferta`) needs a score-cell sentinel too, not just `N/A`. A status label
 * never matches this, which is what makes it a reliable discriminator between
 * the score and status columns regardless of their order (#1427).
 */
export const SCORE_CELL_RE = /^\d+(?:\.\d+)?\/5$/;

/** @param {string} v @returns {boolean} whether the cell reads as a score. */
export function looksLikeScoreCell(v) {
  const t = String(v ?? '').replace(/\*\*/g, '').trim();
  return SCORE_CELL_RE.test(t) || t === 'N/A' || t === 'DUP' || t === '—' || t === '-';
}

/**
 * Parse numeric score from a Score cell string.
 *
 * Extracts the first number (including decimals), stripping markdown bold syntax.
 * Normalizes European decimal comma to dot. Returns 0 when no numeric value is
 * present, preserving the documented tracker 'no score' sentinel (#2803).
 *
 * @param {string} [s] - Raw score cell such as `4.2/5` or `**4.2/5**`.
 * @returns {number} Parsed score, or 0 when no numeric value is present.
 */
export function parseScore(s) {
  const m = String(s ?? '').replace(/\*\*/g, '').match(/(\d+(?:[.,]\d+)?)/);
  return m ? parseFloat(m[1].replace(',', '.')) : 0;
}

/**
 * A markdown table separator row: `|---|------|...|`, optionally with alignment
 * colons.
 *
 * Readers used to recognize this row with `line.includes('---')`, which also
 * matched any DATA row whose free text happened to contain three hyphens — a
 * URL slug such as `Senior-Engineer---Platform-Team`, or an em dash typed
 * as `---`. Matching the row's structure instead cannot false-positive that way.
 */
export const SEPARATOR_ROW_RE = /^\|(?:\s*:?-+:?\s*\|)+\s*$/;

/** @param {string} line @returns {boolean} whether the line is the `|---|` separator row. */
export function isSeparatorRow(line) {
  return typeof line === 'string' && SEPARATOR_ROW_RE.test(line);
}

/** The columns a row must label before it counts as the tracker header. */
const REQUIRED_HEADER_FIELDS = ['num', 'company', 'role', 'score', 'status'];

/**
 * The ONE definition of "this row is the tracker header", shared by
 * `isHeaderRow` and `detectColumns`.
 *
 * A row qualifies only by labelling the whole schema — every field in
 * REQUIRED_HEADER_FIELDS. One telltale cell is not enough: a company genuinely
 * named "Company", or a note consisting of that single word, would otherwise be
 * read as table furniture and skip row-format validation, which is the same
 * class of false positive this module exists to stop.
 *
 * Extracted rather than duplicated (PR #2267 review): the two callers had
 * drifted, and a header they disagree about is one that validation skips as
 * furniture while column detection cannot parse — silently falling back to the
 * fixed legacy layout.
 *
 * @param {string[]} cells - Lowercased, trimmed cells from `line.split('|')`.
 * @returns {Object<string,number>|null} Field → column index, or null.
 */
function headerSchemaMap(cells) {
  // The alias table is the whole contract — no literal `company`/`role`
  // pre-filter. There used to be one, which meant a FULLY localized header
  // (`| # | Fecha | Empresa | Puesto | … |`) never reached the aliases that
  // exist for exactly that case, and the tracker silently fell back to
  // LEGACY_COLMAP. On a plain 9-column table the fallback lines up and nothing
  // looks wrong; insert the Location column from #946's own use case and the
  // Score cell is read from Location instead (#2274).
  //
  // Requiring the full schema is what makes the pre-filter unnecessary: a data
  // row would have to carry five different header labels in five different
  // cells to qualify, which no real row does.
  const map = {};
  cells.forEach((c, i) => { if (HEADER_ALIASES[c] != null) map[HEADER_ALIASES[c]] = i; });
  return REQUIRED_HEADER_FIELDS.every(k => map[k] != null) ? map : null;
}

/**
 * Whether a table row is the tracker's header row.
 *
 * @param {string} line - One line from applications.md.
 * @returns {boolean}
 */
export function isHeaderRow(line) {
  if (typeof line !== 'string' || !line.startsWith('|')) return false;
  return headerSchemaMap(line.split('|').map(s => s.trim().toLowerCase())) !== null;
}

/**
 * Given the two adjacent cells that carry score and status in EITHER order,
 * identify which is which by content. This lets HEADERLESS TSV ingestion
 * tolerate the two known column orders (legacy batch TSV writes
 * status-then-score; `applications.md` is score-then-status) instead of
 * trusting position.
 *
 * This discriminator is INCOMPLETE, and that is why headed additions exist
 * (#3517). The comment here used to claim "statuses never are" recognizable as
 * a score. That is false: `looksLikeScoreCell` accepts `—` and `-` as score
 * sentinels (#1799), and `normalize-statuses.mjs` accepts the same two glyphs
 * (plus empty) as a status meaning Discarded. So a discarded, never-scored row
 * carries `—` in BOTH cells and no content rule can order them. That row is
 * refused rather than guessed at — but refusing is still a failure to ingest,
 * so writers should emit a header row and let ingestion resolve by NAME
 * (`resolveTsvColumns`), which has no undecidable case at all.
 *
 * Returns null when the order is undecidable — neither cell, or BOTH cells, look
 * like a score — so callers can fail loudly rather than merge a silent swap.
 *
 * @param {string} a - first of the two cells
 * @param {string} b - second of the two cells
 * @returns {{score: string, status: string}|null}
 */
export function resolveScoreStatus(a, b) {
  const aScore = looksLikeScoreCell(a);
  const bScore = looksLikeScoreCell(b);
  if (aScore === bScore) return null; // ambiguous: neither, or both
  return aScore ? { score: a, status: b } : { score: b, status: a };
}

/**
 * The canonical fields a HEADED tracker addition must label before its header
 * is usable. Deliberately wider than REQUIRED_HEADER_FIELDS (which describes
 * `applications.md`, a file whose optional columns are the user's business):
 * an addition is machine-generated in one shot, every one of these has a
 * documented value, and a header that omits one is a broken emitter — better
 * caught at the header than silently merged as an empty cell.
 *
 * `notes`, `via`, `location` and `url` stay optional, matching the TSV contract
 * in AGENTS.md.
 */
export const TSV_REQUIRED_FIELDS = ['num', 'date', 'company', 'role', 'score', 'status', 'pdf', 'report'];

/**
 * The header line an in-repo TSV writer emits above its data row. Order is
 * arbitrary by construction — ingestion resolves by name — so this exists only
 * so the several writers cannot drift into slightly different LABEL spellings,
 * which is the one thing name resolution cannot absorb.
 */
export const TSV_ADDITION_HEADER = ['num', 'date', 'company', 'role', 'status', 'score', 'pdf', 'report', 'notes'].join('\t');

/** Recognized labels a first row needs before it is READ as a header at all. */
const TSV_HEADER_MIN_LABELS = 3;

/**
 * Whether the first row of an addition file is meant to be a header row.
 *
 * Separate from "is this header VALID": a row that looks like a header but does
 * not resolve must be reported, not silently reinterpreted as data and merged
 * through the positional path — that would turn a typo'd label into exactly the
 * silent column swap headers exist to prevent.
 *
 * Two signals, both required: the first cell is not a tracker number (a data
 * row always leads with one), and at least three cells carry recognized column
 * labels. A data row would have to put three different header words in three
 * different cells to false-positive.
 *
 * @param {string[]} cells - Raw cells of the first row.
 * @returns {boolean}
 */
export function looksLikeTsvHeaderRow(cells) {
  if (!Array.isArray(cells) || cells.length < TSV_HEADER_MIN_LABELS) return false;
  if (/^\d+$/.test(String(cells[0] ?? '').trim())) return false;
  const recognized = new Set();
  for (const c of cells) {
    const key = HEADER_ALIASES[String(c ?? '').trim().toLowerCase()];
    if (key != null) recognized.add(key);
  }
  return recognized.size >= TSV_HEADER_MIN_LABELS;
}

/**
 * Resolve a tracker addition's header row to field name → column index, using
 * the same shared alias table as the markdown tracker (tracker-aliases.json),
 * so the two name-resolution surfaces cannot drift.
 *
 * Reports rather than throws: the caller owns the warning text and the
 * skip-this-file decision.
 *
 * @param {string[]} cells - Raw cells of the header row.
 * @returns {{map: Object<string,number>, missing: string[], duplicates: string[], unknown: string[]}}
 */
export function resolveTsvColumns(cells) {
  const map = {};
  const duplicates = [];
  const unknown = [];
  (cells || []).forEach((c, i) => {
    const label = String(c ?? '').trim();
    if (!label) return;
    const key = HEADER_ALIASES[label.toLowerCase()];
    if (key == null) { unknown.push(label); return; }
    // First occurrence wins for the map, but a repeat is still reported: two
    // columns claiming the same field is an emitter bug, and picking one of
    // them is the guess this whole path exists to avoid.
    if (map[key] != null) { duplicates.push(key); return; }
    map[key] = i;
  });
  const missing = TSV_REQUIRED_FIELDS.filter(k => map[k] == null);
  return { map, missing, duplicates, unknown };
}

// The dashboard also reads legacy rows with a leading pipe and tab-separated
// cells. Opt in only where readers/writers handle that format: other writers
// still rebuild pipe rows and must not silently start accepting tab rows. A tab
// inside a normal pipe table is ordinary whitespace, not a column delimiter.
export function trackerRowSeparator(line) {
  return line.includes('\t') && line.split('|').length <= 3 ? '\t' : '|';
}

/** Return raw cells in the same index space as line.split('|'). */
export function splitTrackerCells(line) {
  if (trackerRowSeparator(line) === '|') return line.split('|');
  const opening = line.indexOf('|');
  if (opening < 0) return line.split('|');
  const closing = line.trimEnd().endsWith('|') ? line.lastIndexOf('|') : -1;
  const body = line.slice(opening + 1, closing > opening ? closing : undefined);
  return [line.slice(0, opening), ...body.split('\t'), ...(closing > opening ? [line.slice(closing + 1)] : [])];
}

/**
 * Scan the table for a header row and build a field-name → column-index map.
 * Indexing matches `line.split('|')`. Returns null — caller should fall back to
 * LEGACY_COLMAP — unless the essential columns are all present, so a stray pipe
 * line can't yield a bogus mapping.
 *
 * @param {string[]} lines - All lines of applications.md.
 * @param {{allowTabs?: boolean, allowIndentation?: boolean}} [options] - Explicit legacy-layout support.
 * @returns {Object<string,number>|null}
 */
export function detectColumns(lines, { allowTabs = false, allowIndentation = false } = {}) {
  for (const line of lines) {
    if (!(allowIndentation ? line.trimStart() : line).startsWith('|')) continue;
    const cells = allowTabs ? splitTrackerCells(line) : line.split('|');
    const map = headerSchemaMap(cells.map(s => s.trim().toLowerCase()));
    if (map) return map;
  }
  return null;
}

/**
 * Convenience: detect the header layout, falling back to the legacy fixed one.
 * @param {string[]} lines
 * @param {{allowTabs?: boolean, allowIndentation?: boolean}} [options]
 * @returns {Object<string,number>}
 */
export function resolveColumns(lines, options) {
  return detectColumns(lines, options) || LEGACY_COLMAP;
}

/**
 * Parse one markdown table row into a tracker object using a column map.
 *
 * Header and separator rows (non-numeric `num` cell) and malformed rows return
 * null. The raw line is preserved so callers can locate/replace the exact line.
 *
 * @param {string} line - One line from applications.md.
 * @param {Object<string,number>} [colmap] - From resolveColumns(); defaults to legacy.
 * @param {{allowTabs?: boolean, allowIndentation?: boolean}} [options] - Opt in only when writes preserve this layout.
 * @returns {object|null} `{num,date,company,role,score,status,pdf,report,notes,url,location?,via?,raw}`.
 */
export function parseTrackerRow(line, colmap = LEGACY_COLMAP, { allowTabs = false, allowIndentation = false } = {}) {
  if (typeof line !== 'string' || !(allowIndentation ? line.trimStart() : line).startsWith('|')) return null;
  const parts = (allowTabs ? splitTrackerCells(line) : line.split('|')).map(s => s.trim());
  // Dynamic width guard: a complete row splits into leading '' + one cell per
  // column (+ trailing '' when the row ends with a pipe). Anything shorter is
  // missing a cell, and a missing INTERIOR cell shifts every later column one
  // left while the trailing empty cell keeps the count plausible — so require
  // the full width rather than mere coverage of the highest mapped index.
  // Hand-edited rows without the trailing pipe are one part narrower but
  // still complete (tracker-utils rebuildRow supports them).
  const width = Math.max(...Object.values(colmap)) + (line.trimEnd().endsWith('|') ? 2 : 1);
  if (parts.length < width) return null;
  const num = parseInt(parts[colmap.num], 10);
  if (isNaN(num)) return null;
  const at = (k) => (colmap[k] != null ? (parts[colmap[k]] ?? '') : '');
  const row = {
    num,
    date: at('date'),
    company: at('company'),
    role: at('role'),
    score: at('score'),
    status: at('status'),
    pdf: at('pdf'),
    report: at('report'),
    notes: at('notes'),
    // The posting URL, always the HREF rather than the raw cell (#3516): the
    // cell is written as a markdown link, and `normalizeUrl('[l](u)')` returns
    // '' — which every consumer reads as "this row has no URL", not as a parse
    // failure. Always present (''), never conditional on the column existing,
    // so `row.url` means the same thing on every tracker layout.
    url: extractCellUrl(at('url')),
    raw: line,
  };
  if (colmap.location != null) row.location = at('location');
  if (colmap.via != null) row.via = at('via');
  // No `row.url = at('url')` here. `url` is set above, always the HREF, and
  // scan.mjs's same-title requisition dedup (#4267) reads it off this row:
  // re-assigning the raw cell hands it `[label](href)`, from which no
  // requisition id can be extracted, so two distinct openings read as one.
  return row;
}

/**
 * Hash of every parsed cell of a tracker row except Status.
 *
 * A reviewer that shows a row, asks a human, and then hands the write to
 * set-status.mjs (`--expect-row`) needs to know the row it writes is still the
 * one that was shown. Status is left out because it has its own guard
 * (`--expect-status`), and `raw` because it repeats the status cell.
 *
 * @param {object} row - parseTrackerRow output (extra keys such as lineIdx are ignored).
 * @returns {string} Lowercase SHA-256 hex digest.
 */
export function trackerRowIdentity(row) {
  const cells = ['num', 'date', 'company', 'role', 'score', 'pdf', 'report', 'notes', 'url', 'location', 'via']
    .map(key => [key, row[key] ?? null]);
  return createHash('sha256').update(JSON.stringify(cells), 'utf8').digest('hex');
}

const TRACKER_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UNNUMBERED_RE = /^(?:n\/a|—|–|-)$/i;
// Digits that are not the start of a date or a score. A numeric prefix counts,
// as it does for parseInt everywhere else: `12draft` is row 12.
const NUM_CELL_RE = /^\d+(?![\d.,/-])/;
// `[12]`, `[12](…)`, or a link to a Markdown file. A link to a web address is a posting URL, not a report, whatever its text or ending.
const REPORT_LINK_RE = /^\[\d+\](?:\((?!<?https?:).+\))?$|^\[[^\]]+\]\((?!<?https?:).+\.md>?\)$/i;
// A markdown link whose target never closes: a `|` cut the cell in two.
const CUT_LINK_RE = /\]\([^)]*$/;
// A bare or `<bracketed>` URL (a hand-pasted one may hold a space), a
// `local:jds/…` pointer, or a markdown link to a URL.
const URL_RE = /^<?(?:https?:\/\/|local:)\S|^\[[^\]]*\]\(<?https?:\/\//i;
// One word with a dot in it: a URL typed without its scheme.
const SCHEMELESS_URL_RE = /^[^\s.]+\.\S+$/;

/**
 * What a cell is recognisably, keyed by the column that holds it. A cell that
 * matches none of these is free text, which no column can be told from.
 */
const CELL_KINDS = {
  date: cell => TRACKER_DATE_RE.test(cell),
  score: cell => SCORE_CELL_RE.test(cell.replace(/\*\*/g, '').replace(',', '.')),
  pdf: cell => cell === '✅' || cell === '❌',
  report: cell => REPORT_LINK_RE.test(cell),
  url: cell => URL_RE.test(cell),
  status: (cell, isStatus) => Boolean(isStatus?.(cell)),
};
const isTypedCell = cell => ['date', 'score', 'pdf', 'report', 'url'].some(kind => CELL_KINDS[kind](cell));
const KIND_NAMES = { date: 'a date', score: 'a score', pdf: 'a PDF mark', report: 'a report link', url: 'a URL', status: 'a status' };
const TEXT_COLUMN_SIGNS = ['date', 'score', 'pdf'];
/**
 * Per column, the kinds of cell that only another column holds. Finding one
 * means the row's cells have moved. Notes is absent: a note may be anything.
 * Whether a Status is a known state, or a Date is filled in, is not asked
 * here. verify-pipeline Check 1 and normalize-statuses.mjs own that.
 */
const SHIFT_SIGNS = {
  date: ['score', 'pdf', 'report', 'url'],
  company: TEXT_COLUMN_SIGNS,
  via: TEXT_COLUMN_SIGNS,
  role: TEXT_COLUMN_SIGNS,
  location: TEXT_COLUMN_SIGNS,
  score: ['date', 'pdf', 'report', 'url', 'status'],
  status: ['date', 'score', 'pdf', 'report', 'url'],
  // No URL here: a Materials column mapped to PDF may link a hosted CV.
  pdf: ['date', 'score', 'report'],
  url: ['score', 'report'],
};
/**
 * The two columns free text cannot sit in, so a note that slid into one is
 * seen. A Report cell is `[12]`, a markdown link or a bare .md path.
 */
const OWN_FORMAT = {
  report: { name: 'a report link such as [12](reports/012-acme.md)',
    test: cell => !CUT_LINK_RE.test(cell) && (/^\[\d+\]$/.test(cell) || /^\S+\.md$/i.test(cell) || parseMarkdownLinks(cell).length > 0) },
  url: { name: 'a URL', test: cell => URL_RE.test(cell) || SCHEMELESS_URL_RE.test(cell) || parseMarkdownLinks(cell).length > 0 },
};
const COLUMN_NAMES = { num: '#', date: 'Date', company: 'Company', via: 'Via', role: 'Role', location: 'Location', score: 'Score', status: 'Status', pdf: 'PDF', report: 'Report', notes: 'Notes', url: 'URL' };
const ADD_A_CELL = 'Add the missing cell (an empty one, "|  |", is enough).';
const REPLACE_THE_PIPE = 'replace that | with / or -';

/** A pipe row's cells between its outer pipes, trimmed. */
function innerCells(line) {
  const text = line.trim();
  const cells = text.split('|').map(s => s.trim());
  cells.shift();
  if (text.endsWith('|')) cells.pop();
  return cells;
}

/**
 * Why a line cannot be read as a tracker row, or null when it can.
 *
 * A cell is evidence of damage only when it holds what a different column
 * holds: a report link under PDF, a ✅ under Status, a note under Report. A
 * dropped cell and a stray `|` cancel out in a count, but they leave exactly
 * that. The count is checked as well, for the damage that leaves every cell
 * in place: a row short at its tail, or a last cell split by a `|`. A tracker
 * with no Notes column has no upper bound, because there the merge keeps
 * notes in cells past the header.
 *
 * Company, Role, Status and Notes are free text, so a cell dropped from one
 * of two neighbouring free-text columns and a `|` typed in the other still
 * pass.
 *
 * `#` is read as every other path reads it (a numeric prefix, so `12draft` is
 * row 12) and is checked last, so a `num` fault means every other cell passed.
 *
 * @param {string} line - One `|` line from applications.md.
 * @param {Object<string,number>} colmap - From resolveColumns().
 * @param {{cellCount?: number|null, labels?: string[]|null, isStatus?: ((cell: string) => boolean)|null, urlOptional?: boolean}} [options]
 *   `cellCount` and `labels` are the header's cell count and cells, when
 *   there is a header. `isStatus` recognises a status word, so one under
 *   Score is seen. `urlOptional` accepts a row that closes with a pipe and
 *   has every cell before URL, whether or not the URL cell and any columns
 *   after it are there. --backfill-urls repairs it.
 * @returns {{cell: string, why: string}|null} `why` says what happened and what to do.
 */
export function trackerRowFault(line, colmap, options = {}) {
  const { cellCount = null, labels = null, isStatus = null, urlOptional = false } = options;
  if (/^\s/.test(line)) {
    return { cell: 'line', why: 'the line starts with a space or a tab, and the merge cannot match an indented row. Remove the leading spaces.' };
  }
  const cells = innerCells(line);
  const need = cellCount ?? Math.max(...Object.values(colmap));
  // The backfill reads only a row that closes with a pipe, so only one may stop before its URL cell.
  // It may stop there wherever that column sits: a layout can keep its own columns after URL.
  const closed = /\|\s*$/.test(line);
  const least = urlOptional && closed && colmap.url != null ? colmap.url - 1 : need;
  if (cells.length < least) {
    const onlyUrl = !urlOptional && closed && colmap.url === need && cells.length === need - 1
      && trackerRowFault(line, colmap, { ...options, urlOptional: true }) === null;
    return { cell: 'short', why: `it has ${cells.length} cells where the header has ${need}, so a cell is missing. ${ADD_A_CELL}`
      + (onlyUrl ? ' Only the URL cell at the end is missing here, and node merge-tracker.mjs --backfill-urls adds it.' : '') };
  }
  if (colmap.notes != null && cellCount != null && cells.length > cellCount) {
    return { cell: 'wide', why: `it has ${cells.length} cells where the header has ${cellCount}. A | typed inside a cell splits it in two: ${REPLACE_THE_PIPE}.` };
  }
  const nameOf = key => labels?.[colmap[key] - 1] || COLUMN_NAMES[key] || key;
  for (const [key, index] of Object.entries(colmap).sort((a, b) => a[1] - b[1])) {
    const value = cells[index - 1] ?? '';
    // isUnsetUrlCell is the tracker's empty-cell test: blank, `—`, `-` or `N/A`.
    if (key === 'num' || isUnsetUrlCell(value)) continue;
    if (key === 'score' && looksLikeScoreCell(value.replace(',', '.'))) continue;
    const held = `its ${nameOf(key)} cell holds`;
    const kind = (SHIFT_SIGNS[key] ?? []).find(k => CELL_KINDS[k](value, isStatus));
    if (kind) {
      const what = `${held} ${KIND_NAMES[kind]} ("${value}")`;
      if (colmap[kind] > index) {
        return { cell: key, why: `${what}, so the cells from ${nameOf(key)} onward look shifted one place to the left: a cell is probably missing at ${nameOf(key)} or before it. ${ADD_A_CELL}` };
      }
      if (colmap[kind] < index) {
        return { cell: key, why: `${what}, so the cells before it look shifted one place to the right: a | typed inside an earlier cell probably split it, so ${REPLACE_THE_PIPE}.` };
      }
      return { cell: key, why: `${what}, which belongs under another column. Move it back.` };
    }
    const own = OWN_FORMAT[key];
    if (own && !own.test(value)) {
      return { cell: key, why: `${held} "${value}", which is not ${own.name}, so the cells look shifted: a cell is probably missing before ${nameOf(key)}, or a | typed inside a cell split it (${REPLACE_THE_PIPE}).` };
    }
  }
  const num = cells[colmap.num - 1] ?? '';
  if (!NUM_CELL_RE.test(num) || !(parseInt(num, 10) > 0)) {
    return { cell: 'num', why: `its ${nameOf('num')} cell holds "${num}", not a row number. Give the row its number.` };
  }
  return null;
}

/**
 * The one refusal text the merge and verify-pipeline print for a row: which
 * line, what happened, what to do, and the row itself.
 *
 * @param {{label: string, why: string, line: string}} fault - From inspectTrackerRows().
 * @returns {string}
 */
export function trackerFaultText({ label, why, line }) {
  return `${label} cannot be read as a tracker row: ${why}\n     ${line.trim()}`;
}

/**
 * Sort the tracker's table lines into rows a writer may touch, rows it must
 * refuse, and lines that are not tracker rows. Shared by merge-tracker.mjs and
 * verify-pipeline.mjs so the health check reports exactly what the merge
 * stops on.
 *
 * A table that brings its own header is not the tracker and is skipped. A
 * block with no header (rows after a blank line) still is. A complete row
 * whose `#` is a backfill sentinel (`N/A`, `—`, `-`) is neither a row nor a
 * fault: it has no number to match on, and it is not damaged. A line with no
 * row number and nothing a tracker cell is recognised by (`| Totals | 1 |`)
 * is a stray: worth a warning, not a stop. A row that lost its `#` cell still
 * holds a date or a score, so it is a fault.
 *
 * @param {string[]} lines - All lines of applications.md.
 * @param {Object<string,number>} colmap - From resolveColumns().
 * @param {{isStatus?: ((cell: string) => boolean)|null, urlOptional?: boolean}} [options]
 * @returns {{rows: {at: number, line: string}[], faults: {at: number, label: string, line: string, cell: string, why: string}[], strays: {at: number, label: string}[], cellCount: number|null}}
 *   `cellCount` is the header width the rows were judged by, null when no table header was found.
 */
export function inspectTrackerRows(lines, colmap, options = {}) {
  const hasTrackerHeader = lines.some(line => isHeaderRow(line));
  const rows = [];
  const faults = [];
  const strays = [];
  let cellCount = null;
  let labels = null;
  let otherTable = false;
  let inBlock = false;
  let tables = 0;
  for (const [at, raw] of lines.entries()) {
    const line = raw.replace(/\r$/, '');
    const wasInBlock = inBlock;
    inBlock = line.trimStart().startsWith('|');
    if (!inBlock) continue;
    if (!wasInBlock) {
      const ownHeader = isSeparatorRow((lines[at + 1] ?? '').trim());
      otherTable = ownHeader && !isHeaderRow(line) && (hasTrackerHeader || tables > 0);
      tables++;
      if (ownHeader) {
        if (!otherTable) { labels = innerCells(line); cellCount = labels.length; }
        continue;
      }
    }
    if (otherTable || isSeparatorRow(line.trim()) || isHeaderRow(line)) continue;
    const fault = trackerRowFault(line, colmap, { ...options, cellCount, labels });
    if (!fault) { rows.push({ at, line: raw }); continue; }
    const cells = innerCells(line);
    const num = cells[colmap.num - 1] ?? '';
    if (fault.cell === 'num' && UNNUMBERED_RE.test(num)) continue;
    const unnamed = `Line ${at + 1} ("${line.trim().slice(0, 60)}")`;
    if (!NUM_CELL_RE.test(num) && !UNNUMBERED_RE.test(num) && !cells.some(isTypedCell)) {
      strays.push({ at, label: unnamed });
      continue;
    }
    const label = /^[1-9]\d*$/.test(num) && fault.cell !== 'num' ? `Row #${num} (line ${at + 1})` : unnamed;
    faults.push({ at, label, line, ...fault });
  }
  return { rows, faults, strays, cellCount };
}

// Matches the req/job-number labels actually seen in this tracker's free-text
// Notes column: `R_1488728`, `Req PRACT011038`, `Req #1311`, `REQ-2026-32061`,
// `Job 202606-116491`, `Job ID 65136`, `Posting ID 5340`, `JR00124259`,
// `Ref R2857957`. The label is required so we don't grab an unrelated number
// (a salary figure, a date fragment) — only text explicitly tagged as a
// req/job/posting/reference id counts.
//
// One id-parameter name may sit between the label and the id (`job id gh_jid
// 1234567`, where `gh_jid` is the Greenhouse parameter the id came from). The id
// must contain a digit, so without this skip the parameter name ended the match
// and the row lost its req id. Only named id parameters are skipped, never any
// snake_case word: `job posted_at 2026-10-01` must not read the date as an id,
// since two rows with different dates would then block a legitimate merge.
export const REQ_NUMBER_RE = /\b(?:job\s*id|posting\s*id|requisition|req|jr|job|posting|ref(?:erence)?|r_)(?:[\s:#-]+(?:gh_jid|(?:job|req|requisition|posting)_id)(?=[\s:#-]))?[\s:#_-]*([a-z][a-z0-9-]*\d[a-z0-9-]*|\d[a-z0-9-]*)\b/i;

/**
 * Extract a req/job/posting number from a tracker Notes cell, if present.
 *
 * Tier-3 duplicate detection (company + fuzzy role match) has no awareness of
 * req numbers on its own, which lets two distinct postings at the same company
 * with similarly-worded titles collapse into one row (#1524 — e.g. two TD Bank
 * L&D postings distinguished only by `R_1494379` vs `R_1488728`). This helper
 * pulls out that number so the caller can treat a confirmed mismatch as proof
 * the rows are NOT duplicates, without touching cases where no number is
 * present on either side. Shared by merge-tracker.mjs (tracker merge) and
 * scan.mjs (company+role scan dedupe).
 *
 * @param {string} notes - Raw Notes cell from a tracker row or TSV addition.
 * @returns {string|null} Uppercased req/job number, or null when none is found.
 */
export function extractReqNumber(notes) {
  if (!notes) return null;
  const m = String(notes).match(REQ_NUMBER_RE);
  return m ? m[1].toUpperCase() : null;
}

/**
 * The destination of one markdown link, given everything between `](` and the
 * matching `)`.
 *
 * Deliberately not a `\(([^)]+)\)` one-liner: a destination may be wrapped in
 * angle brackets, may contain balanced parentheses, and may escape either.
 * Getting that wrong truncates the destination — and for the URL cell a
 * truncated href is worse than none at all, because normalizeUrl() still parses
 * it and it becomes a WRONG dedup key rather than an absent one.
 *
 * @param {string} raw - Text after `](`, up to the closing paren.
 * @returns {string|null} The destination, or null when there is none.
 */
function markdownLinkDestination(raw) {
  const value = String(raw).trimStart();
  if (value.startsWith('<')) {
    for (let i = 1; i < value.length; i++) {
      if (value[i] === '\\') {
        i++;
      } else if (value[i] === '>') {
        return value.slice(1, i).replace(/\\([\\()<> ])/g, '$1');
      }
    }
    return null;
  }

  let depth = 0;
  let end = value.length;
  for (let i = 0; i < value.length; i++) {
    if (value[i] === '\\') {
      i++;
      continue;
    }
    if (value[i] === '(') depth++;
    else if (value[i] === ')' && depth > 0) depth--;
    else if (/\s/.test(value[i]) && depth === 0) {
      end = i;
      break;
    }
  }
  const destination = value.slice(0, end).trim();
  return destination ? destination.replace(/\\([\\()<> ])/g, '$1') : null;
}

/**
 * Every markdown link in a string, as `{label, target}` in encounter order.
 *
 * Shared by the two tracker cells that carry links — `Report`
 * (`[61](../reports/061-….md)`) and `URL` (`[ashby](https://…)`, #3516) — so
 * the strict destination handling above can never be half-applied to one of
 * them. Every script that reads a link out of either cell goes through here
 * (or through firstLinkTarget / soleMarkdownLink below): a private
 * `\]\(([^)]+)\)` copy cut a report named `001-acme-(berlin)-….md` short at
 * the first `)`, so set-status --report-link refused the row and
 * verify-pipeline called a present report missing (#5482).
 *
 * @param {string} value - A raw tracker cell.
 * @returns {{label: string, target: string}[]}
 */
export function parseMarkdownLinks(value) {
  return scanMarkdownLinks(value).map(({ label, target }) => ({ label, target }));
}

/**
 * The destination of the first markdown link in a cell, or null when the cell
 * holds none.
 *
 * @param {string} value - A raw tracker cell.
 * @returns {string|null}
 */
export function firstLinkTarget(value) {
  return scanMarkdownLinks(String(value ?? ''))[0]?.target ?? null;
}

/**
 * The cell's one link, when the trimmed cell is exactly one markdown link and
 * nothing else; null otherwise (no link, two links, or text around it).
 *
 * @param {string} value - A raw tracker cell.
 * @returns {{label: string, target: string}|null}
 */
export function soleMarkdownLink(value) {
  const cell = String(value ?? '').trim();
  const links = scanMarkdownLinks(cell);
  if (links.length !== 1 || links[0].start !== 0 || links[0].end !== cell.length) return null;
  return { label: links[0].label, target: links[0].target };
}

// parseMarkdownLinks plus each link's span in `value` (`end` exclusive).
function scanMarkdownLinks(value) {
  const links = [];
  let cursor = 0;
  while (cursor < value.length) {
    const labelStart = value.indexOf('[', cursor);
    if (labelStart === -1) break;

    let labelEnd = -1;
    for (let i = labelStart + 1; i < value.length; i++) {
      if (value[i] === '\\') i++;
      else if (value[i] === ']') {
        labelEnd = i;
        break;
      }
    }
    if (labelEnd === -1 || value[labelEnd + 1] !== '(') {
      cursor = labelStart + 1;
      continue;
    }

    let depth = 1;
    let linkEnd = -1;
    for (let i = labelEnd + 2; i < value.length; i++) {
      if (value[i] === '\\') {
        i++;
      } else if (value[i] === '(') {
        depth++;
      } else if (value[i] === ')' && --depth === 0) {
        linkEnd = i;
        break;
      }
    }
    if (linkEnd === -1) {
      cursor = labelStart + 1;
      continue;
    }

    const target = markdownLinkDestination(value.slice(labelEnd + 2, linkEnd));
    if (target != null) links.push({ label: value.slice(labelStart + 1, labelEnd), target, start: labelStart, end: linkEnd + 1 });
    cursor = linkEnd + 1;
  }
  return links;
}

/**
 * The posting URL a tracker `URL` cell points at, in either written form.
 *
 * The cell is written as a markdown link (`[careers.acme.com](https://…)`) so
 * the table stays readable — a raw posting URL runs to 141 characters and
 * pushes every other column off screen (#3516). Older trackers, and any row a
 * merge has not rewritten since, still carry the bare URL. Both forms must
 * produce the SAME dedup key, which is why the extraction lives HERE, in the
 * shared row parser, rather than inside merge-tracker alone.
 *
 * THE FAILURE THIS PREVENTS IS SILENT. `normalizeUrl()` (url-key.mjs) starts
 * with `new URL(s)` and returns '' when that throws, and '' means "this row has
 * no URL" — not "parse error". So handing it a markdown-wrapped cell does not
 * error: the row quietly drops out of merge-tracker's exact-match dedup tier
 * (Pass 0) and falls back to fuzzy company+role, where two genuinely distinct
 * postings at one employer merge into one row. The damage surfaces much later,
 * with nothing tying it back to a formatting change.
 *
 * The first http(s) link target wins; a cell with no link (a bare URL, `N/A`,
 * `—`, empty) is returned verbatim, so the callers' placeholder handling and
 * normalizeUrl()'s "no key is not a key" rule keep working unchanged.
 *
 * @param {string} cellValue - Raw `URL` cell from a tracker row.
 * @returns {string} The href, or the trimmed cell when it holds no link.
 */
export function extractCellUrl(cellValue) {
  const value = String(cellValue ?? '').trim();
  if (!value) return '';
  for (const link of parseMarkdownLinks(value)) {
    const target = String(link.target).trim().replace(/^<|>$/g, '');
    if (/^https?:\/\//i.test(target)) return target;
  }
  return value;
}

// URL cells that say "no URL" in words: the tracker's em-dash and hyphen
// empty-cell markers and N/A.
const URL_PLACEHOLDER_RE = /^(?:—|-|n\/a)$/i;

/**
 * Whether a URL cell names no posting: empty, or a placeholder. A reader that
 * falls back to the row's report has to ask this rather than test the cell for
 * truth: `—` is a truthy string, so it hides the report, and then nothing can
 * tell the row from another with the same title.
 *
 * @param {string} [cell] - A URL cell, raw or through extractCellUrl().
 * @returns {boolean}
 */
export function isUnsetUrlCell(cell) {
  const value = String(cell ?? '').trim();
  return value === '' || URL_PLACEHOLDER_RE.test(value);
}

function reportNumberFromTarget(rawTarget) {
  const target = String(rawTarget).trim().replace(/^<|>$/g, '');
  if (!target || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) return null;
  const pathname = target.split(/[?#]/, 1)[0];
  const match = pathname.match(/(?:^|[\\/])reports[\\/]0*(\d+)-/i)
    || pathname.match(/(?:^|[\\/])0*(\d+)-[^\\/]*\.md$/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  return Number.isInteger(num) && num > 0 ? num : null;
}

/**
 * Report links a tracker row names, with the two numbers kept apart: the one
 * the link *points at* and the one the link *says*.
 *
 * `extractTrackerReportNumbers` below flattens both into one list on purpose —
 * for a membership test ("does this row reference report N?") a mismatched link
 * genuinely references both numbers, and collapsing them would hide the
 * collision that `find.mjs` and `set-status.mjs` exist to surface.
 *
 * A caller that needs report *identity* rather than membership needs the
 * opposite: `[5](../reports/006-globex-...md)` names one report, and it is the
 * target, because the target is the file whose contents the row will be joined
 * against. Treating both numbers as linked reports let salary-gap.mjs attach
 * two different companies' advertised figures to one row (#4368 review).
 *
 * The label is returned alongside so the disagreement can be reported instead
 * of silently discarded — a wrong label is a tracker typo worth fixing, and
 * only the caller knows whether it matters.
 *
 * @param {string} reportCell - Report cell, markdown link or bare path.
 * @param {string} [notesCell] - Free-form Notes cell, used when Report is empty.
 * @returns {{target: number, label: number|null}[]} One entry per resolvable
 *   link, in cell order. `label` is null when absent or non-numeric.
 */
export function extractTrackerReportLinks(reportCell, notesCell = '') {
  const value = String(reportCell ?? '').trim();
  if (!value || value === '-' || value === '—') return scanNotesForReportLinks(notesCell);

  const links = [];
  const markdownLinks = parseMarkdownLinks(value);
  for (const link of markdownLinks) {
    const target = reportNumberFromTarget(link.target);
    if (target == null) continue;
    const rawLabel = link.label.trim();
    const labelNum = /^\d+$/.test(rawLabel) ? parseInt(rawLabel, 10) : null;
    links.push({ target, label: labelNum != null && labelNum > 0 ? labelNum : null });
  }

  if (markdownLinks.length === 0) {
    const target = reportNumberFromTarget(value);
    if (target != null) links.push({ target, label: null });
  }
  // A layout with a Report column that simply has no link yet still falls back
  // to Notes, so a customized tracker behaves the same whether its Report cell
  // is absent or empty.
  return links.length > 0 ? links : scanNotesForReportLinks(notesCell);
}

/**
 * Extract report IDs referenced by one tracker Report cell.
 *
 * Both the numeric markdown label and the local report filename are returned.
 * Keeping both makes tracker drift visible instead of silently trusting one
 * side of a malformed link. External URLs are ignored even when their path
 * happens to contain a reports/ segment.
 *
 * @param {string} reportCell - Raw Report cell value.
 * @returns {number[]} Unique positive report IDs in encounter order.
 */
export function extractTrackerReportNumbers(reportCell, notesCell = '') {
  const numbers = new Set();
  for (const { target, label } of extractTrackerReportLinks(reportCell, notesCell)) {
    // Label first, then target: a mismatched link reports the number it claims
    // before the number it points at, which is the order callers already saw.
    if (label != null) numbers.add(label);
    numbers.add(target);
  }
  return [...numbers];
}

export function linkedReportNumbers(reportCell, notesCell) {
  // Link syntax decides the Notes fallback, not a parsed target: `[1](<missing)`
  // is a present-but-invalid link and must not borrow a number from Notes. The
  // label rule is parseMarkdownLinks': it ends at the first unescaped `]`.
  if (!/\[(?:\\[\s\S]|[^\]\\])*\]\(/.test(String(reportCell ?? ''))) return extractTrackerReportNumbers(reportCell, notesCell);
  // Reuse the tracker's canonical local-target validation. It rejects HTTP(S)
  // and protocol-relative links, and returns both numbers on a label/target
  // mismatch. Exactly one number therefore proves a local, self-consistent
  // report link. A present-but-invalid link must not fall back to Notes.
  const validated = extractTrackerReportNumbers(reportCell);
  return validated.length === 1 ? validated : [];
}

/**
 * Report links inside a free-form Notes cell.
 *
 * Customized trackers with no dedicated Report column embed the link in Notes
 * prose instead — the layout merge-tracker.mjs learned to read in 8668ac1, via
 * its own `extractReportNum(reportStr, notesStr)`. set-status.mjs read only the
 * Report cell, so `--report N` could not find a row merge-tracker had linked
 * happily (#3075).
 *
 * DELIBERATELY STRICTER than the Report-cell scan above, which is the same
 * scoping merge-tracker applies. The Report cell holds a report link by
 * contract, so a loose match there is safe; Notes is prose, and a link like
 * `[9](../notes/9-thing.md)` satisfies the generic `N-*.md` shape without being
 * a report at all. Requiring a `reports/` path segment is what keeps an
 * unrelated markdown link — or a job-posting URL in the same sentence — from
 * claiming to be a report number.
 *
 * @param {string} [notesCell] - Free-form Notes cell.
 * @returns {{target: number, label: null}[]} One entry per report link found.
 *   `label` is always null: a number in prose is not a link label.
 */
function scanNotesForReportLinks(notesCell) {
  const notes = String(notesCell ?? '').trim();
  if (!notes) return [];
  const seen = new Set();
  const links = [];
  for (const link of parseMarkdownLinks(notes)) {
    const target = String(link.target).trim().replace(/^<|>$/g, '');
    // Absolute URLs are never a local report path, and a posting URL is the
    // most likely thing to sit next to a report link in the same note.
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(target)) continue;
    const pathname = target.split(/[?#]/, 1)[0];
    if (!/(?:^|[\\/])reports[\\/]/i.test(pathname)) continue;
    const match = pathname.match(/(?:^|[\\/])reports[\\/]0*(\d+)-/i);
    if (!match) continue;
    const num = parseInt(match[1], 10);
    if (!Number.isInteger(num) || num <= 0 || seen.has(num)) continue;
    seen.add(num);
    links.push({ target: num, label: null });
  }
  return links;
}

/**
 * Unicode-aware key for Via (agency) comparison.
 *
 * normalizeCompany()-style keys strip everything outside [a-z0-9], so
 * non-Latin agency names (リクルート, パーソル, …) all collapse to the same
 * empty key — which made the #1596 cross-channel guard treat two different
 * agencies as one channel and silently merge two real submissions. Keep
 * letters and digits of any script instead; NFKC first so full-width/
 * half-width variants compare equal.
 *
 * Shared by every Via consumer (merge-tracker dedup guard, analyze-patterns
 * channel buckets) so agency identity can't drift between scripts.
 *
 * @param {string} name - Raw Via cell or via= tag value.
 * @returns {string} Case-folded, punctuation-free, script-preserving key.
 */
export function normalizeVia(name) {
  return normalizeTextKey(name);
}

/**
 * Unicode-aware grouping key for any free-text tracker/report field.
 *
 * Same rule as normalizeVia(), generalized because Via is not the only field
 * keyed this way: verify-pipeline groups tracker rows and report files by
 * company+role with the same [a-z0-9] strip, so for a non-Latin pipeline every
 * company keys to '' and every role keys to '' — three unrelated 株式会社X all
 * land in one "possible duplicates" cluster (#2393). Keep letters and digits of
 * any script; NFKC first so full-width/half-width variants compare equal.
 *
 * Combining marks are kept too (\p{M}): NFKC composes Latin diacritics into
 * single code points, but Indic matras have no precomposed form, so stripping
 * marks would make Devanagari कंपनी and कपनी — or क and का — the same key and
 * re-introduce the exact collision this function exists to prevent.
 *
 * This is the one key every grouping consumer should share, so company/role
 * identity cannot drift between scripts the way Via identity did.
 *
 * `separator` exists because not every consumer wants a solid key: scan.mjs
 * keys role titles as space-separated words so "engineer (senior)" and
 * "engineer, senior" collapse without "data engineer" and "dataengineer"
 * merging. Passing ' ' keeps that shape while sharing this exact rule, so a
 * second private [a-z0-9] strip never has to exist to get it.
 *
 * @param {string} value - Raw cell value (company, role, agency, slug, …).
 * @param {string} [separator=''] - Replacement for each run of stripped chars.
 *   Passed straight to String.replace, so `$` is special ('$&' would re-insert
 *   the stripped run). Callers should pass a literal such as '' or ' '.
 * @returns {string} Case-folded, punctuation-free, script-preserving key.
 */
export function normalizeTextKey(value, separator = '') {
  // `value ?? ''` rather than String(value): a null/undefined cell must key to
  // '' like any other empty field, not to the literal strings "null"/"undefined"
  // — which would compare equal to each other and form a bogus group.
  return String(value ?? '')
    .normalize('NFKC')
    .toLowerCase()
    // Drop the combining dot that lowercasing a Turkish dotted capital leaves
    // behind. `'İ'.toLowerCase()` yields `i` + U+0307, not a plain `i`, so
    // `İstanbul Tekstil` and `Istanbul Tekstil` keyed differently while reading
    // identically on screen: the tracker treated one employer as two, and the
    // user had no way to see why (#2705, #2736, and verify-pipeline's duplicate
    // check, which returned a false green because of it).
    //
    // NO `NFD` here, and that is the whole safety property. NFKC leaves ż, ė
    // and ġ as SINGLE precomposed code points, so this strip cannot reach
    // their dots — while `i` + U+0307 has no precomposed form and stays
    // exposed. Decomposing first (NFD → strip → NFC) looks equivalent and is
    // not: it collapsed Żubr/Zubr, Ėmė/Eme and Ġenerali/Generali, which is
    // Polish, Lithuanian and Maltese losing the distinction (caught in main
    // by career-ops-ui, 12-ago). The protection is structural, not a list.
    .replace(/̇/gu, '')
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, separator)
    .trim();
}

/**
 * Strip trailing punctuation and a markdown autolink wrapper from a raw
 * `**URL:**` token. Punctuation first: `<https://…/job>,` must become the bare
 * URL, not `https://…/job>` (angle-first leaves the `>` when a comma follows).
 *
 * A trailing `)` is stripped only while the token has more `)` than `(`. One
 * that closes a `(` inside the URL is part of it: `…/eng-(remote)` must not
 * become `…/eng-(remote`, which keys differently from the same posting's URL
 * carried verbatim in a TSV and splits one posting into two tracker rows. The
 * `)` of a wrapping `(see https://…/job)` has no partner and is still dropped.
 *
 * @param {string} token
 * @returns {string}
 */
export function unwrapReportUrlToken(token) {
  let url = String(token);
  let depth = 0;
  for (const ch of url) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
  }
  for (;;) {
    const last = url.at(-1);
    if (last === ',' || last === '.' || last === ';') url = url.slice(0, -1);
    else if (last === ')' && depth < 0) {
      url = url.slice(0, -1);
      depth++;
    } else break;
  }
  return url.replace(/^<|>$/g, '');
}

/**
 * The posting URL recorded in the first of `reportNumbers` whose report file in
 * `reportsRoot` has a `**URL:**` line that `accept` takes. Lives here, not in
 * history-ats-seeds.mjs, because liveness-core.mjs needs it and the web app
 * loads liveness-core: it must not pull in tracker-utils.mjs and its npm
 * dependencies, which the web install does not have.
 */
export function reportUrlForNumbers(reportNumbers, reportsRoot, accept) {
  if (!reportsRoot || !existsSync(reportsRoot) || reportNumbers.length === 0) return null;
  let filenames;
  try { filenames = readdirSync(reportsRoot); } catch { return null; }
  for (const reportNum of reportNumbers) {
    const reportName = filenames.find((name) => new RegExp(`^0*${reportNum}-.*\\.md$`, 'i').test(name));
    if (!reportName) continue;
    let report;
    try { report = readFileSync(join(reportsRoot, reportName), 'utf-8'); } catch { continue; }
    const match = report.match(/\*\*URL:\*\*[ \t]*(\S+)/);
    if (!match) continue;
    const url = unwrapReportUrlToken(match[1]);
    if (accept(url)) return url;
  }
  return null;
}

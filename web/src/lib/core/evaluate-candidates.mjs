/**
 * Which pending pipeline rows a scheduled job's scan added, so the rank pass
 * ranks those and leaves the rest of the Inbox alone.
 *
 * scan-history.tsv records the board, not the job, so two jobs that run on the
 * same day see the same new rows. A row added by hand has no scan-history row
 * and is never a candidate.
 */
import { normalizeUrl } from "./url-key.mjs";

// rank-pipeline.mjs treats any row holding RANK_LABEL as ranked; RANK_SEGMENT is the score and reason it writes.
const RANK_LABEL = "| rank: ";
const RANK_SEGMENT = /\| rank: (\d+(?:\.\d+)?)\/5 — ([^|]*)/;

/** YYYY-MM-DD of `epochMs` in `timeZone`. formatToParts, because `format`'s field order varies across ICU builds. */
export function localDate(epochMs, timeZone) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date(epochMs));
  const part = (type) => parts.find((p) => p.type === type).value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/**
 * The pending `- [ ]` rows of pipeline.md, in file order, read the way
 * rank-pipeline.mjs reads them: the URL is the first cell.
 *
 * @param {string} text
 * @returns {Array<{ url: string, ranked: boolean, rank?: number, reason?: string }>}
 */
export function pendingRows(text) {
  const rows = [];
  for (const line of String(text ?? "").split(/\r?\n/)) {
    if (!line.startsWith("- [ ] ")) continue;
    const url = line.slice(6).split("|")[0].trim();
    const ranked = line.includes(RANK_LABEL);
    const rank = ranked && line.match(RANK_SEGMENT);
    rows.push(rank ? { url, ranked, rank: Number(rank[1]), reason: rank[2].trim() } : { url, ranked });
  }
  return rows;
}

/**
 * The later of the job's `evaluate.enabledAt` and the local date, in the
 * job's timezone, of its newest successful run other than `excludeRunId`.
 */
export function candidateSince({ job, runs, excludeRunId }) {
  const previous = runs
    .filter((run) => run.jobId === job.id && run.state === "success" && run.id !== excludeRunId)
    .map((run) => Date.parse(run.at))
    .filter(Number.isFinite);
  const runDate = previous.length ? localDate(Math.max(...previous), job.timezone || "UTC") : "";
  const enabledAt = job.evaluate?.enabledAt || "";
  return enabledAt > runDate ? enabledAt : runDate;
}

/**
 * A pending row is a candidate when the latest `added` scan-history row for
 * its URL has a `first_seen` on or after `since`. The latest row matters: the
 * scanner appends a row per status, and a URL it skipped once can be added
 * on a later day.
 *
 * @param {{ pendingRows: ReturnType<typeof pendingRows>, scanHistoryRows: Array<{ url: string, first_seen: string, status?: string }>, since: string }} input
 * @returns {Array<{ url: string, ranked: boolean, rank?: number, reason?: string }>}
 */
export function candidatesFor({ pendingRows: rows, scanHistoryRows, since }) {
  const added = new Map();
  for (const row of scanHistoryRows) {
    if ((row.status || "added") !== "added") continue;
    const key = normalizeUrl(row.url);
    if (key) added.set(key, row.first_seen);
  }
  return rows.filter((row) => {
    const firstSeen = added.get(normalizeUrl(row.url));
    return firstSeen && firstSeen >= since;
  });
}

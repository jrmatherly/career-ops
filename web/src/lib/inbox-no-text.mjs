import { canonicalJobKey } from "./core/url-key.mjs";

/** The two reasons the drain skips a ranked row for missing posting text (lib/evaluate-queue.mjs). */
export const NO_TEXT_REASONS = ["no-api-text", "no-text"];

// The states of a second ledger entry that mean the posting is being handled or has a result.
const MOVED_ON = ["running", "evaluated", "gated"];

export const NO_TEXT_LABEL = "Needs manual score";

// Past tense on purpose: a row keeps this reason after its board gets a reader when its
// scan is paused, deleted or manual, or its rank is under the threshold.
const NO_READER_TITLE = "Not scored automatically. No posting-text reader covered this job board when the drain tried it. Save it to the shortlist and score it yourself.";
const NO_TEXT_TITLE = "Not scored automatically. The job board returned no posting text in four tries over a day, so the posting may be closed. Open it before you score it.";

/**
 * Marks each posting a scheduled scan ranked and the drain skipped for missing
 * posting text, by posting identity (the key markGated uses). The ledger keys
 * entries by normalizeUrl, which is stricter than that identity, so one posting
 * can have two entries. A posting whose other entry is running, evaluated or
 * gated is not marked. One whose other entry is queued or failed keeps the mark,
 * because a queued row under a paused scan and a failed row are never tried
 * again and nothing else on the row would say so.
 *
 * @template {{ url: string }} T
 * @param {T[]} jobs
 * @param {{ url?: string, state?: string, reason?: string }[]} ledgerEntries
 * @returns {(T & { noText?: true, noTextReason?: "no-api-text" | "no-text" })[]}
 */
export function markNoText(jobs, ledgerEntries) {
  const reasons = new Map();
  const movedOn = new Set();
  for (const entry of ledgerEntries) {
    const key = canonicalJobKey(entry?.url);
    if (!key) continue;
    if (MOVED_ON.includes(entry.state)) movedOn.add(key);
    else if (entry.state === "skipped" && NO_TEXT_REASONS.includes(entry.reason)) reasons.set(key, entry.reason);
  }
  for (const key of movedOn) reasons.delete(key);
  if (!reasons.size) return jobs;
  let marked = false;
  const out = jobs.map((job) => {
    const reason = reasons.get(canonicalJobKey(job.url));
    if (!reason) return job;
    marked = true;
    return { ...job, noText: true, noTextReason: reason };
  });
  return marked ? out : jobs;
}

/**
 * The badge of a marked posting, or null.
 *
 * @param {{ noText?: boolean, noTextReason?: string }} job
 * @returns {{ label: string, tone: "info", title: string } | null}
 */
export function noTextBadge(job) {
  if (!job.noText) return null;
  return { label: NO_TEXT_LABEL, tone: "info", title: job.noTextReason === "no-api-text" ? NO_READER_TITLE : NO_TEXT_TITLE };
}

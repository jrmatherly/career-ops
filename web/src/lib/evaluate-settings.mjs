import { scheduledEvaluate } from "./scheduled-job-input.mjs";
import { canonicalJobKey } from "./core/url-key.mjs";
import { readTrackerUrl } from "./posting-url.mjs";

/** The threshold and per-run fields apply to Auto only. */
export const evaluateFieldsVisible = (mode) => mode === "auto";

/**
 * The numbers the server will store for these settings: the routes' own
 * `scheduledEvaluate`, so the bounds live in one place. Throws its message on bad input.
 *
 * @param {{ mode: string, rankThreshold?: unknown, maxPerRun?: unknown }} input
 */
export function clampEvaluate(input) {
  const { mode, rankThreshold, maxPerRun } = scheduledEvaluate(input, undefined);
  return { mode, rankThreshold, maxPerRun };
}

/**
 * The `evaluate` a modal sends: undefined (keep what is stored) when the form is Off and
 * the job has no settings to turn off; the mode alone for Off and Review, so the hidden
 * Auto fields are neither validated nor changed; clamped numbers for Auto.
 */
export function evaluateBody(form, stored) {
  if (form.mode === "off" && !stored) return undefined;
  return evaluateFieldsVisible(form.mode) ? clampEvaluate(form) : { mode: form.mode };
}

/** The job card's mode badge, or null when evaluation is off. */
export function evaluateModeLabel(evaluate) {
  if (evaluate?.mode === "review") return "Review, rank only";
  if (evaluate?.mode !== "auto") return null;
  const { rankThreshold: threshold, maxPerRun: max } = evaluate;
  // A store edited by hand may lack a field or hold null or text; name the gap instead of printing NaN or 0.0.
  if (!Number.isFinite(threshold) || !Number.isFinite(max)) return "Auto, settings unreadable; open Edit and save";
  return `Auto, rank ${threshold.toFixed(1)} and above, ${max} per run`;
}

/** The modal's explanation line: Review and Auto share the rank sentence, Auto adds its API-text limit; null for Off. */
export function evaluateCaveat(mode) {
  if (mode !== "review" && mode !== "auto") return null;
  const rank = "Rank is a guess from the title and URL.";
  if (mode === "review") return rank;
  return `${rank} Auto evaluates only postings whose board exposes the job text, and rows another job found on the same day can be picked up, because scan history records the board, not the job.`;
}

const RUN_COUNTS = [["ranked", "ranked"], ["autoQueued", "queued"], ["evaluated", "evaluated"], ["gated", "gated"], ["evalErrors", "errors"]];

/** "ranked 7, queued 7, evaluated 3, gated 1": the run's evaluate counts that are numbers, or "". */
export function runCountsLine(run) {
  return RUN_COUNTS.filter(([key]) => typeof run[key] === "number").map(([key, word]) => `${word} ${run[key]}`).join(", ");
}

export const LEDGER_STATES = ["running", "queued", "failed", "gated", "evaluated", "skipped"];

/**
 * `evaluate-queue.mjs dump --json` entries grouped by state in LEDGER_STATES order, then
 * any state the ledger gains later; empty groups are left out.
 */
export function groupLedger(entries) {
  const states = [...new Set([...LEDGER_STATES, ...entries.map((entry) => entry.state)])];
  return states.map((state) => ({ state, entries: entries.filter((entry) => entry.state === state) }))
    .filter((group) => group.entries.length);
}

/**
 * The Inbox link for a queued entry: the date its first `queued` row was written, which the
 * rank pass does on the tick that scanned it. `at` is UTC and the Inbox's `added` chip is a
 * host-local scan day, so near midnight, or for a row ranked on a later day, the two differ.
 */
export function addedLink(entry) {
  const at = entry.rows?.find((row) => row.state === "queued")?.at;
  return typeof at === "string" && /^\d{4}-\d{2}-\d{2}/.test(at) ? `/pipeline?added=${at.slice(0, 10)}` : null;
}

/** The modal's form state for a job's stored settings; no settings reads as Off with the defaults shown. */
export function evaluateForm(stored) {
  return { mode: stored?.mode ?? "off", rankThreshold: String(stored?.rankThreshold ?? 3.5), maxPerRun: String(stored?.maxPerRun ?? 5) };
}

/** A ledger URL the panel may link to: http(s) only, since the ledger stores whatever the scan found. */
export const postingHref = (url) => (/^https?:\/\//i.test(url) ? url : null);

/**
 * Ledger entries with the tracker row's `company`, `role`, `score` and `trackerN` added when
 * one shares the entry's URL key, else the inbox row's `company` and `role`. Blank cells and a
 * score sentinel (`N/A`, `—`) add nothing, and an entry with no match comes back as it was.
 */
export function enrichLedger(entries, inboxJobs, applications) {
  const tracked = new Map(applications.map((app) => [canonicalJobKey(readTrackerUrl(app.url)), app]));
  const inbox = new Map(inboxJobs.map((job) => [canonicalJobKey(job.url), job]));
  tracked.delete("");
  inbox.delete("");
  return entries.map((entry) => {
    const key = canonicalJobKey(entry.url);
    const app = key ? tracked.get(key) : undefined;
    const job = key ? inbox.get(key) : undefined;
    const found = app ? { company: app.company, role: app.role, score: /\d/.test(app.score ?? "") ? app.score : undefined, trackerN: app.n } : { company: job?.company, role: job?.role };
    return { ...entry, ...Object.fromEntries(Object.entries(found).filter(([, value]) => value)) };
  });
}

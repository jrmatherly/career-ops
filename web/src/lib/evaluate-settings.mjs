import { scheduledEvaluate } from "./scheduled-job-input.mjs";

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
  // Number(): a store edited by hand may lack a field; show NaN rather than crash the page.
  return `Auto, rank ${Number(evaluate.rankThreshold).toFixed(1)} and above, ${Number(evaluate.maxPerRun)} per run`;
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

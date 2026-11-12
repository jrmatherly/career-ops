import { dayInstant } from "./next-step.mjs";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Inbox order. Rows that carry a rank (rank-pipeline.mjs) come first,
 * highest rank first. Everything else, and ties, go newest first, with an
 * unknown age last. A row the drain gated goes after every row it did not,
 * whatever its rank.
 *
 * @param {{ job: { rank?: number, gated?: string }, age: number | null }} a
 * @param {{ job: { rank?: number, gated?: string }, age: number | null }} b
 * @returns {number}
 */
export function compareInboxJobs(a, b) {
  const gated = Number(Boolean(a.job.gated)) - Number(Boolean(b.job.gated));
  if (gated) return gated;
  const rankA = a.job.rank ?? -Infinity;
  const rankB = b.job.rank ?? -Infinity;
  if (rankA !== rankB) return rankB - rankA;
  return (a.age ?? Infinity) - (b.age ?? Infinity);
}

/**
 * The `?added=` value when it is a real YYYY-MM-DD calendar date, else null.
 *
 * @param {string | null} raw
 * @returns {string | null}
 */
export function addedParam(raw) {
  return raw && ISO_DATE.test(raw) && dayInstant(raw) ? raw : null;
}

/**
 * The latest scan dates among the rows not hidden, newest first: the
 * "Added <date>" chips.
 *
 * @param {{ url: string, addedAt?: string }[]} jobs
 * @param {string[]} hidden
 * @param {number} [max]
 * @returns {string[]}
 */
export function latestAddedDates(jobs, hidden, max = 5) {
  const hid = new Set(hidden);
  const dates = new Set();
  for (const job of jobs) if (job.addedAt && !hid.has(job.url)) dates.add(job.addedAt);
  return [...dates].sort().reverse().slice(0, max);
}

/**
 * The empty-state copy when the `?added=` date leaves no pending, unhidden
 * row, else null. A date on which a scan added roles means they were all
 * skipped or tracked since; any other date means the scan added nothing.
 *
 * @param {string | null} added
 * @param {{ url: string, addedAt?: string }[]} jobs - pending inbox rows
 * @param {string[]} hidden
 * @param {string[]} scanDates - the dates a scan added roles (pipelineSummary().scanDates)
 * @returns {{ title: string, hint: string } | null}
 */
export function addedEmptyState(added, jobs, hidden, scanDates) {
  if (added == null || latestAddedDates(jobs, hidden, Infinity).includes(added)) return null;
  const title = scanDates.includes(added)
    ? `Every role added on ${added} has been skipped or tracked`
    : `No roles were added on ${added}`;
  return { title, hint: "Pick another scan date, or clear the filter." };
}

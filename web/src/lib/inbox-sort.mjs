const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Inbox order. Rows that carry a rank (rank-pipeline.mjs) come first,
 * highest rank first. Everything else, and ties, go newest first, with an
 * unknown age last.
 *
 * @param {{ job: { rank?: number }, age: number | null }} a
 * @param {{ job: { rank?: number }, age: number | null }} b
 * @returns {number}
 */
export function compareInboxJobs(a, b) {
  const rankA = a.job.rank ?? -Infinity;
  const rankB = b.job.rank ?? -Infinity;
  if (rankA !== rankB) return rankB - rankA;
  return (a.age ?? Infinity) - (b.age ?? Infinity);
}

/**
 * The `?added=` value when it is a YYYY-MM-DD date, else null.
 *
 * @param {string | null} raw
 * @returns {string | null}
 */
export function addedParam(raw) {
  return raw && ISO_DATE.test(raw) ? raw : null;
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

// Per-entry request pacing for portals.yml boards. No side effects on import, like
// lib/entry-timeout.mjs, so a script can take it without loading scan.mjs.

// Ten minutes: a longer wait is almost certainly a typo.
export const MAX_REQUEST_DELAY_MS = 600_000;

// A health probe sends at most a few requests to a board and runs under a time limit
// (the web check is killed at 110 s, and then reports no board at all), so it waits no longer than this.
export const PROBE_MAX_REQUEST_DELAY_MS = 5_000;

// When each entry's last request started, kept across ctxs: scan.mjs retries a
// board that failed on a transient error with a new ctx, seconds later.
const gates = new WeakMap();

/**
 * Apply an entry's `request_delay_ms` to the ctx a provider fetches with.
 *
 * A board that rate-limits (HTTP 429) is read only partly at its provider's
 * pace. Such a board sets `request_delay_ms` on its own portals.yml entry, and
 * each request for it then starts that long after the one before started, to
 * within a millisecond (a timer can fire that much early). The gate is on the ctx's fetchers, so it holds for a provider that
 * pages with no wait of its own, and for a retry, which is one more request.
 * Requests a provider sends at once leave one at a time, and a second ctx for
 * the same entry object waits its turn behind the first. An entry without the
 * key leaves the ctx as it is. So does a value that is not a whole YAML number
 * from 1 to MAX_REQUEST_DELAY_MS, with a warning naming the entry.
 *
 * @param {object} ctx - The per-entry ctx; its fetchers are replaced in place.
 * @param {{ name?: string, request_delay_ms?: unknown }} entry
 * @param {{ maxDelayMs?: number }} [opts] - `maxDelayMs` shortens a longer delay to that, for a caller with a time limit.
 * @returns {object} The same ctx.
 */
export function applyEntryPacing(ctx, entry, { maxDelayMs = MAX_REQUEST_DELAY_MS } = {}) {
  const raw = entry?.request_delay_ms;
  if (raw === undefined || raw === null) return ctx;
  if (!Number.isInteger(raw) || raw < 1 || raw > MAX_REQUEST_DELAY_MS) {
    console.error(
      `⚠️  ${entry?.name}: request_delay_ms must be a whole number from 1 to ${MAX_REQUEST_DELAY_MS}, got ${JSON.stringify(raw)} — ignored`,
    );
    return ctx;
  }
  const delay = Math.min(raw, maxDelayMs);
  // A ctx clock (tests supply one) is awaited instead of a timer, as sleep() in providers/_http.mjs does.
  const wait = (ms) => (typeof ctx.sleep === 'function' ? ctx.sleep(ms) : new Promise((resolve) => setTimeout(resolve, ms)));
  let gate = gates.get(entry);
  if (!gate) gates.set(entry, (gate = { lastStart: Number.NEGATIVE_INFINITY, queue: Promise.resolve() }));
  const turn = () => {
    const mine = gate.queue.then(async () => {
      // performance.now, not Date.now: the wall clock ticks about every 16 ms on Windows and can step back.
      const remaining = gate.lastStart + delay - performance.now();
      // Rounded up: setTimeout drops the fraction, and would fire up to 1 ms early.
      if (remaining > 0) await wait(Math.ceil(remaining));
      gate.lastStart = performance.now();
    });
    // A clock that rejects fails its own request, not every later one.
    gate.queue = mine.catch(() => {});
    return mine;
  };
  for (const method of ['fetchJson', 'fetchText', 'fetchResponse']) {
    const original = ctx[method];
    if (typeof original !== 'function') continue;
    ctx[method] = async function (...args) {
      await turn();
      return original.apply(this, args);
    };
  }
  return ctx;
}

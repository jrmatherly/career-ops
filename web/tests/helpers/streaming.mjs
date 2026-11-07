// tests/helpers/streaming.mjs — wait out React's streaming reveal after a navigation.
// When a frame paints before a streamed segment arrives, React 19.2 keeps the
// server copy in `div#S:0[hidden]` until its throttled reveal about 300 ms into the
// page, past `load`, while hydration paints the client copy; Playwright's
// strict mode counts hidden elements, so a locator sees two of everything and a
// height read sees the one-viewport shell. page.goto resolves on `load`, inside
// that window. See docs/superpowers/research/2026-11-07-web-browser-suite-flakes/REPORT.md.

const HIDDEN_SEGMENT = 'body > div[hidden][id^="S:"]';
const TIMEOUT_MS = 10_000;

/**
 * Runs a navigation (`() => page.goto(url)` or `() => page.reload()`), then waits
 * until no hidden streamed segment remains and the document is complete (goto and
 * reload resolve on `load` by default; the readyState check keeps a caller who
 * passes `waitUntil: "commit"` from passing before the segment has streamed in).
 * The wait is one in-page `waitForFunction`, which Playwright re-runs in the new
 * document if a late navigation lands mid-poll instead of throwing.
 *
 * @template T
 * @param {import("playwright-core").Page} page
 * @param {() => Promise<T>} action
 * @returns {Promise<T>} what `action()` resolved to
 */
export async function settled(page, action) {
  const result = await action();
  try {
    await page.waitForFunction(
      (selector) => document.readyState === "complete" && document.querySelector(selector) === null,
      HIDDEN_SEGMENT,
      { timeout: TIMEOUT_MS },
    );
  } catch (err) {
    if (err?.name !== "TimeoutError") throw err; // a closed page or crashed renderer is its own story
    // evaluate has no timeout of its own; a wedged renderer must not hang the runner.
    const state = await Promise.race([
      page.evaluate((selector) => ({
        readyState: document.readyState,
        ids: [...document.querySelectorAll(selector)].map((el) => el.id),
      }), HIDDEN_SEGMENT),
      new Promise((resolve) => setTimeout(() => resolve({ unreadable: "evaluate did not answer within 2 s" }), 2_000)),
    ]).catch((e) => ({ unreadable: e.message }));
    const detail = state.unreadable
      ? `page unreadable (${state.unreadable})`
      : `readyState ${state.readyState}, still hidden: ${state.ids.join(", ") || "(none)"}`;
    throw new Error(`streaming reveal did not finish within ${TIMEOUT_MS} ms; ${detail}`, { cause: err });
  }
  return result;
}

// tests/helpers/streaming.mjs — wait out React's streaming reveal after a navigation.
// React 19.2 keeps the server copy of a streamed segment in `div#S:0[hidden]` for
// up to 300 ms after `load` while hydration paints the client copy; Playwright's
// strict mode counts hidden elements, so a locator sees two of everything and a
// height read sees the one-viewport shell. page.goto resolves on `load`, inside
// that window. See docs/superpowers/research/2026-11-07-web-browser-suite-flakes/REPORT.md.

const HIDDEN_SEGMENT = 'body > div[hidden][id^="S:"]';
const TIMEOUT_MS = 10_000;

/**
 * Runs a navigation (`() => page.goto(url)` or `() => page.reload()`), then waits
 * until no hidden streamed segment remains and the document is complete. One
 * `waitForFunction`, so it survives the reload it was wrapped around.
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
    const ids = await page.evaluate((selector) => [...document.querySelectorAll(selector)].map((el) => el.id), HIDDEN_SEGMENT).catch(() => []);
    throw new Error(`streaming reveal did not finish within ${TIMEOUT_MS} ms; still hidden: ${ids.join(", ") || "(none)"}`, { cause: err });
  }
  return result;
}

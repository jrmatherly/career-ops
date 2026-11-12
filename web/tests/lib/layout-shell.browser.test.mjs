// Opt-in real Chrome regression: start the local web server against the
// fictional pipeline-status fixture, then
// LAYOUT_SHELL_TEST_URL=http://127.0.0.1:3000 node --test this-file.mjs.
// Every mutating API is intercepted; no CLI or real data write is invoked.
import assert from "node:assert/strict";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";
import { settled } from "../helpers/streaming.mjs";

// /pipeline opens on the inbox, which this fixture leaves empty; ?tab=ALL is the tracker table.
const ROUTES = ["/", "/explore", "/scheduled-scans", "/pipeline", "/pipeline?tab=ALL", "/followups", "/portals", "/analytics", "/cv", "/resume", "/documents", "/config", "/board", "/shares"];

const url = process.env.LAYOUT_SHELL_TEST_URL;
test("every page sits in one shell under one header, with readable text and reachable targets", { skip: liveServerSkip("LAYOUT_SHELL_TEST_URL"), timeout: 300_000 }, async (t) => {
  const origin = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const unexpected = [];
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/api/**", (route) => {
    if (route.request().method() === "GET") return route.continue();
    unexpected.push(route.request().url());
    return route.abort();
  });
  await page.route("**/api/version", (route) => route.fulfill({ json: { version: "0.0.0-fixture", channel: "alpha", sha: "f1x7ure" } }));

  async function open(route) {
    await settled(page, () => page.goto(`${origin.origin}${route}`));
    await page.locator("main h1").first().waitFor();
    // Client pages fetch after hydration; a page that keeps a stream open never goes idle.
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  }

  const measure = () => page.evaluate(() => {
    const main = document.querySelector("main");
    const mainBox = main.getBoundingClientRect();
    const label = (el) => `<${el.tagName.toLowerCase()}> "${(el.getAttribute("aria-label") || el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 40)}"`;
    const shown = (el) => {
      const box = el.getBoundingClientRect();
      return box.width > 1 && box.height > 1 && getComputedStyle(el).visibility !== "hidden";
    };
    // A rendered document (the cv.md preview) keeps its own title.
    const h1s = [...main.querySelectorAll("h1")].filter((el) => !el.closest("article"));
    const h1 = h1s[0];
    const h1Box = h1.getBoundingClientRect();
    const h1Style = getComputedStyle(h1);
    const smallText = [...main.querySelectorAll("*")]
      .filter((el) => shown(el) && !el.closest("[aria-hidden=true]") && [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent.trim()))
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 12)
      .map((el) => `${label(el)} ${getComputedStyle(el).fontSize}`);
    const smallTargets = [...main.querySelectorAll("input[type=checkbox], button, a")]
      .filter(shown)
      // WCAG 2.5.8 exempts a link in a sentence, whose height is its line's.
      .filter((el) => !(el.tagName === "A" && getComputedStyle(el).display === "inline"))
      .map((el) => ({ el, box: el.getBoundingClientRect() }))
      .filter(({ box }) => box.width < 24 || box.height < 24)
      .map(({ el, box }) => `${label(el)} ${Math.round(box.width)}x${Math.round(box.height)}`);
    return {
      h1Count: h1s.length,
      h1Text: h1.textContent.trim(),
      fontSize: h1Style.fontSize,
      fontFamily: h1Style.fontFamily,
      left: h1Box.left - mainBox.left,
      top: h1Box.top - mainBox.top,
      // main clips its own overflow, so the document alone would never show it.
      scrollWidth: Math.max(document.documentElement.scrollWidth, window.innerWidth - main.clientWidth + main.scrollWidth),
      innerWidth: window.innerWidth,
      lastPad: parseFloat(getComputedStyle(main.lastElementChild).paddingBottom),
      smallText: [...new Set(smallText)],
      smallTargets: [...new Set(smallTargets)],
    };
  });

  for (const route of ROUTES) {
    await open(route);
    const m = await measure();
    await t.test(`${route}: one page header`, () => {
      assert.equal(m.h1Count, 1, `${m.h1Count} h1 elements inside main`);
      assert.equal(m.fontSize, "30px", `h1 "${m.h1Text}"`);
      // next/font names the face after its export: instrumentSerif.
      assert.match(m.fontFamily, /instrument ?serif/i);
      assert.ok(m.left >= 16, `h1 is ${m.left}px from main's left edge`);
      assert.ok(m.top >= 24, `h1 is ${m.top}px below main's top`);
    });
    await t.test(`${route}: no horizontal overflow at 1280`, () => {
      assert.ok(m.scrollWidth <= m.innerWidth, `content is ${m.scrollWidth}px wide in a ${m.innerWidth}px window`);
    });
    // Ask and back to top are docked on the right edge; their stack ends 116px above the bottom.
    await t.test(`${route}: the last block scrolls clear of the docked tabs`, () => {
      assert.ok(m.lastPad >= 116, `main's last block pads ${m.lastPad}px at the bottom`);
    });
    await t.test(`${route}: no text under 12px`, () => {
      assert.deepEqual(m.smallText, []);
    });
    await t.test(`${route}: every checkbox, button and link is at least 24px both ways`, () => {
      assert.deepEqual(m.smallTargets, []);
    });
  }

  await page.setViewportSize({ width: 390, height: 844 });
  for (const route of ROUTES) {
    await open(route);
    const { scrollWidth, innerWidth } = await measure();
    await t.test(`${route}: no horizontal overflow at 390`, () => {
      assert.ok(scrollWidth <= innerWidth, `content is ${scrollWidth}px wide in a ${innerWidth}px window`);
    });
  }

  assert.deepEqual(unexpected, []);
});

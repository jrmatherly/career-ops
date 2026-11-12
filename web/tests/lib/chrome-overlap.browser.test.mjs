// The version pill stays in the sidebar column: at 1440x900 it used to cross
// out of the 240px sidebar onto the page. Ask lives in the bottom-right corner
// at every height, so the page frame's bottom padding must let the last row
// scroll clear of it, and it must never sit on a sidebar link or control.
// Set CHROME_OVERLAP_TEST_URL to a local server. npm test skips this.
import assert from "node:assert/strict";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";

const url = process.env.CHROME_OVERLAP_TEST_URL;

function overlapSize(a, b) {
  if (!a || !b) return null;
  const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
  if (w <= 0 || h <= 0) return null;
  return { w: Math.round(w), h: Math.round(h) };
}

test("the version pill stays in the sidebar and the page scrolls clear of Ask at 1440x900", {
  skip: liveServerSkip("CHROME_OVERLAP_TEST_URL"),
  timeout: 120_000,
}, async (t) => {
  const origin = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin.origin}/`, { waitUntil: "domcontentloaded" });
  const ask = page.getByRole("button", { name: "Ask the assistant", exact: true });
  const report = page.getByRole("button", { name: "Report a bug" });
  await ask.waitFor();
  await report.waitFor();

  const main = await page.locator("main").boundingBox();
  const askBox = await ask.boundingBox();
  const pillBox = await report.locator("xpath=..").boundingBox();
  const sidebar = page.getByRole("complementary").filter({ has: page.getByRole("navigation") });
  const settings = await sidebar.getByText("Settings", { exact: true }).boundingBox();
  assert.ok(main && askBox && pillBox && settings);

  assert.equal(overlapSize(pillBox, main), null, "version pill intersects main");
  assert.equal(overlapSize(askBox, pillBox), null, "Ask button intersects the version pill");
  assert.equal(overlapSize(pillBox, settings), null, "version pill covers the Settings section");
  assert.ok(1440 - (askBox.x + askBox.width) <= 40 && 900 - (askBox.y + askBox.height) <= 40, `Ask is not in the bottom-right corner: ${JSON.stringify(askBox)}`);
  const framePad = await page.locator("main > .mx-auto").last().evaluate((el) => parseFloat(getComputedStyle(el).paddingBottom));
  assert.ok(framePad >= 900 - askBox.y, `the page frame's ${framePad}px bottom padding cannot scroll content clear of Ask at y=${askBox.y}`);

  const hits = await page.evaluate(() => {
    const labelAt = (x, y) => {
      const el = document.elementFromPoint(x, y);
      const control = el?.closest("button, a");
      return control?.getAttribute("aria-label") || control?.textContent?.trim() || "";
    };
    return { left: labelAt(300, 870) };
  });
  assert.equal(hits.left.includes("Report a bug"), false, `bottom of the main column hit ${hits.left}`);
  assert.deepEqual(errors, []);
});

test("Ask stays off the sidebar's links and controls at short and tall desktop heights", {
  skip: liveServerSkip("CHROME_OVERLAP_TEST_URL"),
  timeout: 120_000,
}, async (t) => {
  const origin = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  for (const height of [480, 560, 720, 900]) {
    const page = await browser.newPage({ viewport: { width: 1280, height } });
    await page.goto(`${origin.origin}/`, { waitUntil: "domcontentloaded" });
    const ask = page.getByRole("button", { name: "Ask the assistant", exact: true });
    const sidebar = page.getByRole("complementary").filter({ has: page.getByRole("navigation") });
    await ask.waitFor();
    await sidebar.getByRole("link", { name: "Analytics" }).waitFor();

    const askBox = await ask.boundingBox();
    assert.ok(askBox);
    const controls = await sidebar.locator("a, button").all();
    assert.ok(controls.length >= 5, `only ${controls.length} sidebar controls found`);
    for (const control of controls) {
      const box = await control.boundingBox();
      const name = (await control.getAttribute("aria-label")) || (await control.innerText()).trim();
      assert.equal(overlapSize(askBox, box), null, `Ask covers sidebar control "${name}" at 1280x${height}`);
    }
    await page.close();
  }
});

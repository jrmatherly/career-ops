// Opt-in real Chrome regression: start the local web server against the
// fictional pipeline-status fixture, then
// LAYOUT_SHELL_TEST_URL=http://127.0.0.1:3000 node --test this-file.mjs.
// Every mutating API is intercepted; no CLI or real data write is invoked.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { liveServerSkip } from "../helpers/live-server.mjs";
import { settled } from "../helpers/streaming.mjs";

// /pipeline opens on the inbox, which this fixture leaves empty; ?tab=ALL is the tracker table.
const ROUTES = ["/", "/explore", "/scheduled-scans", "/pipeline", "/pipeline?tab=ALL", "/followups", "/portals", "/analytics", "/cv", "/cv?tab=edit", "/documents", "/config", "/board", "/shares"];

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

  // Visible headings in main, in document order, never skip a level; the rendered CV is checked in its own document.
  const headingLevels = (scope) => scope.evaluate((root) =>
    [...root.querySelectorAll("h1, h2, h3, h4, h5, h6")].filter((el) => el.checkVisibility()).map((el) => Number(el.tagName[1])),
  );
  const skips = (levels) => levels.flatMap((level, i) => (level > (i ? levels[i - 1] : 0) + 1 ? [`h${i ? levels[i - 1] : 0} then h${level}`] : []));
  const pressed = () => page.locator('[role=group][aria-label="CV view"] [aria-pressed=true]').textContent();
  // A tab change goes through history.replaceState, which Next applies to useSearchParams in a transition.
  const tabBecomes = (label) => page.locator('[role=group][aria-label="CV view"] [aria-pressed=true]', { hasText: label }).waitFor({ timeout: 5_000 });

  await t.test("/resume redirects to the CV page's Edit tab", async () => {
    await open("/resume");
    assert.equal(new URL(page.url()).pathname + new URL(page.url()).search, "/cv?tab=edit");
    assert.equal(await pressed(), "Edit");
  });

  await t.test("/cv opens on Preview, and its headings never skip a level on either tab", async () => {
    await open("/cv");
    assert.equal(await pressed(), "Preview");
    assert.deepEqual(skips(await headingLevels(page.locator("main"))), []);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    assert.equal(new URL(page.url()).searchParams.get("tab"), "edit");
    await tabBecomes("Edit");
    assert.deepEqual(skips(await headingLevels(page.locator("main"))), []);
  });

  // The fixture's cv.md has a line the absorb cannot place, so the real response is lossy.
  await t.test("a lossy cv.md shows the banner, which opens Edit at the first unreadable line", async () => {
    await open("/cv");
    const banner = page.getByRole("button", { name: /needs? attention/ });
    assert.match(await banner.textContent(), /^1 section needs attention\. Header \(line 3\) could not be read back cleanly, so it may be missing from tailored CVs\.Fix in editor →$/);
    await banner.click();
    await tabBecomes("Edit");
    await page.waitForFunction(() => document.activeElement instanceof HTMLTextAreaElement);
    const selected = await page.evaluate(() => {
      const el = document.activeElement;
      return el instanceof HTMLTextAreaElement ? el.value.slice(el.selectionStart, el.selectionEnd) : null;
    });
    assert.equal(selected, "Not a real candidate.");
  });

  await t.test("Export opens a menu by keyboard that closes on Escape and outside presses, with Download off while lossy", async () => {
    await open("/cv");
    const exportButton = page.getByRole("button", { name: "Export" });
    await exportButton.focus();
    await page.keyboard.press("Enter");
    const download = page.getByRole("menuitem", { name: "Download PDF" });
    assert.equal(await download.getAttribute("aria-disabled"), "true");
    assert.match(await download.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby")).textContent), /could not be read/);
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Download PDF");
    await page.keyboard.press("ArrowDown");
    assert.equal(await page.evaluate(() => document.activeElement.textContent), "Print");
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("menu").count(), 0);
    assert.equal(await exportButton.evaluate((el) => el === document.activeElement), true);
    await exportButton.click();
    await page.locator("main h1").click();
    assert.equal(await page.getByRole("menu").count(), 0);
  });

  await t.test("a lossless cv.md renders the CV with its caption, an enabled Download PDF and a printable frame", async () => {
    const scratch = mkdtempSync(path.join(tmpdir(), "layout-shell-cv-"));
    t.after(() => rmSync(scratch, { recursive: true, force: true }));
    const codeRoot = fileURLToPath(new URL("../../../", import.meta.url));
    copyFileSync(path.join(codeRoot, "examples", "cv-example.md"), path.join(scratch, "cv.md"));
    const absorbed = spawnSync(process.execPath, [path.join(codeRoot, "resume.mjs"), "absorb", "--json"], { env: { ...process.env, CAREER_OPS_ROOT: scratch }, encoding: "utf8" });
    assert.equal(absorbed.status, 0, absorbed.stderr);
    const data = JSON.parse(readFileSync(path.join(scratch, "data", "resume.json"), "utf8"));
    await page.route("**/api/resume", (route) => route.fulfill({ json: { data, cvMdSha: data.careerOps.cvSha256, report: { unparsed: [] }, lossless: true } }));
    // Rendering the preview reads files and writes only a temp draft.
    await page.route("**/api/resume/preview", (route) => route.continue());
    const blocked = [];
    page.on("console", (msg) => /print\(\)/.test(msg.text()) && blocked.push(msg.text()));
    try {
      await open("/cv");
      assert.equal(await page.getByRole("button", { name: /needs? attention/ }).count(), 0);
      const frame = page.frameLocator('iframe[title="Tailored CV preview"]');
      await frame.locator("h1").first().waitFor();
      assert.match(await page.locator("section[aria-label='Live preview'] p").first().textContent(), /^Page 1 of \d+ · (Letter|A4) · rendered from cv\.md$/);
      assert.deepEqual(skips(await headingLevels(frame.locator("body"))), []);
      await page.getByRole("button", { name: "Export" }).click();
      assert.equal(await page.getByRole("menuitem", { name: "Download PDF" }).getAttribute("aria-disabled"), null);
      // cv-page.browser.test.mjs asserts that print() runs; this checks Chrome did not refuse it.
      await page.getByRole("menuitem", { name: "Print" }).click();
      await page.waitForTimeout(500);
      assert.deepEqual(blocked, []);
    } finally {
      await page.unroute("**/api/resume");
      await page.unroute("**/api/resume/preview");
    }
  });

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

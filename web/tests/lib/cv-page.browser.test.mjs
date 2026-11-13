// Opt-in real Chrome regression for the CV page and the Portals switches. Start
// the built app on the tests/fixtures/cv-page.mjs root, then
// CV_PAGE_TEST_URL=http://127.0.0.1:3000 CV_PAGE_TEST_ROOT=<root> node --test this-file.mjs.
// The suite writes cv.md in that disposable root (saves and a real PDF render);
// every Portals write is intercepted.
import assert from "node:assert/strict";
import { readFileSync, realpathSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";
import { settled } from "../helpers/streaming.mjs";

const url = process.env.CV_PAGE_TEST_URL;
const root = process.env.CV_PAGE_TEST_ROOT;

test("the CV page shows every failure where the user can act on it", { skip: liveServerSkip("CV_PAGE_TEST_URL", "CV_PAGE_TEST_ROOT"), timeout: 300_000 }, async (t) => {
  const origin = new URL(url).origin;
  const fromTmp = path.relative(realpathSync(os.tmpdir()), realpathSync(root));
  assert.ok(fromTmp && !fromTmp.startsWith("..") && !path.isAbsolute(fromTmp), `${root} is not a disposable root`);
  assert.equal(readFileSync(path.join(root, ".cv-page-fixture"), "utf8").trim(), "fictional-only");
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.route("**/api/version", (route) => route.fulfill({ json: { version: "0.0.0-fixture", channel: "alpha", sha: "f1x7ure" } }));

  async function open(route) {
    await settled(page, () => page.goto(`${origin}${route}`));
    await page.locator("main h1").first().waitFor();
    await page.waitForLoadState("networkidle", { timeout: 5_000 }).catch(() => {});
  }
  const frame = () => page.locator('iframe[title="Tailored CV preview"]');
  const exportMenu = async () => {
    await page.getByRole("button", { name: "Export" }).click();
    return page.getByRole("menu", { name: "Export" });
  };
  const tabBecomes = (label) => page.locator('[role=group][aria-label="CV view"] [aria-pressed=true]', { hasText: label }).waitFor({ timeout: 5_000 });
  const markdown = () => page.getByRole("textbox", { name: "CV Markdown" });

  await t.test("Download PDF saves the real render under the slugged filename", async () => {
    await open("/cv");
    await frame().waitFor();
    const response = await page.request.get(`${origin}/api/cv/pdf`);
    assert.equal(response.status(), 200, await response.text());
    assert.equal(response.headers()["content-type"], "application/pdf");
    assert.equal(response.headers()["content-disposition"], 'attachment; filename="alex-chen-cv.pdf"');
    assert.equal((await response.body()).subarray(0, 4).toString(), "%PDF");

    const menu = await exportMenu();
    const [download] = await Promise.all([page.waitForEvent("download", { timeout: 120_000 }), menu.getByRole("menuitem", { name: "Download PDF" }).click()]);
    assert.equal(download.suggestedFilename(), "alex-chen-cv.pdf");
    assert.equal(readFileSync(await download.path()).subarray(0, 4).toString(), "%PDF");
    assert.equal(await page.locator("main").getByRole("alert").count(), 0);
  });

  await t.test("a structured-editor save reaches the markdown editor, and typing afterwards saves without a conflict", async () => {
    await open("/cv?tab=edit");
    await page.getByRole("button", { name: "Structured editor" }).click();
    const summary = page.getByLabel("Summary text");
    await summary.waitFor();
    await summary.fill(`${await summary.inputValue()} Structured edit.`);
    const form = page.getByRole("form", { name: "Resume" });
    await form.getByRole("button", { name: "Save" }).click();
    await form.getByText("cv.md updated").waitFor();
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="CV Markdown"]')?.value.includes("Structured edit."), null, { timeout: 5_000 });

    // Typed into the Summary paragraph, so cv.md stays lossless for the cases below.
    await markdown().fill((await markdown().inputValue()).replace("Structured edit.", "Structured edit. Typed after."));
    await page.locator("main p[role=status]", { hasText: /^Saved$/ }).waitFor({ timeout: 10_000 });
    assert.match(readFileSync(path.join(root, "cv.md"), "utf8"), /Structured edit\. Typed after\./);
    assert.equal(await page.locator("main").getByRole("alert").count(), 0, await page.locator("main").getByRole("alert").allTextContents().then((a) => a.join(" | ")));
  });

  await t.test("closing the structured editor keeps its unsaved edits", async () => {
    await open("/cv?tab=edit");
    const toggle = page.getByRole("button", { name: "Structured editor" });
    await toggle.click();
    await page.getByLabel("Headline").fill("Kept while closed");
    await page.getByRole("button", { name: "Close structured editor" }).click();
    assert.equal(await page.getByLabel("Headline").isVisible(), false);
    await toggle.click();
    assert.equal(await page.getByLabel("Headline").inputValue(), "Kept while closed");
    await frame().waitFor({ state: "attached" });
    assert.match(await (await exportMenu()).textContent(), /use the saved cv\.md, not the unsaved text/);
    await page.keyboard.press("Escape");

    // A markdown save lands while the form holds that edit: the form says so and keeps it.
    await page.evaluate(() => window.dispatchEvent(new CustomEvent("co-cv-saved", { detail: { source: "markdown" } })));
    await page.getByText("cv.md changed in the markdown editor after this form loaded.").waitFor({ timeout: 5_000 });
    assert.equal(await page.getByLabel("Headline").inputValue(), "Kept while closed");
  });

  // Most cases below fulfill /api/resume with this lossless answer; the /api/cv re-read cases use the real cv.md.
  const absorbed = await (await page.request.get(`${origin}/api/resume`)).json();
  assert.equal(absorbed.lossless, true, JSON.stringify(absorbed.report));
  const lossless = (route) => route.fulfill({ json: { ...absorbed, report: { unparsed: [] }, lossless: true } });

  const states = [
    ["a 404", (route) => route.fulfill({ status: 404, json: { error: "cv.md not found" } }), async () => page.getByText("No cv.md yet. Write it in Edit, or upload a PDF or TeX file.").waitFor()],
    ["a 500", (route) => route.fulfill({ status: 500, json: { error: "x" } }), async () => assert.equal(await page.locator("main").getByRole("alert").filter({ hasText: "The preview could not be built: x" }).count(), 1)],
    ["a 200 that is not JSON", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<html>oops</html>" }), async () => assert.equal(await page.locator("main").getByRole("alert").filter({ hasText: "The preview could not be built: HTTP 200" }).count(), 1)],
  ];
  for (const [name, fulfill, check] of states) {
    await t.test(`/api/resume answering ${name} shows that state, not a preview`, async () => {
      await page.route("**/api/resume", fulfill);
      try {
        await open("/cv");
        await check();
        assert.equal(await frame().count(), 0);
        const menu = await exportMenu();
        assert.equal(await menu.getByRole("menuitem", { name: "Download PDF" }).getAttribute("aria-disabled"), "true");
        await page.keyboard.press("Escape");
      } finally {
        await page.unroute("**/api/resume");
      }
    });
  }

  await t.test("a section the template has no slot for is named above the preview, with the render's warnings", async () => {
    await page.route("**/api/resume/preview", async (route) => {
      const response = await route.fetch();
      await route.fulfill({ response, json: { ...(await response.json()), unmapped: ["volunteer"], warnings: ["A render warning."] } });
    });
    try {
      await open("/cv");
      await frame().waitFor();
      await page.getByText("Not shown in the preview, the print or the PDF (still saved in cv.md): Volunteer").waitFor({ timeout: 5_000 });
      await page.getByText("A render warning.").waitFor({ timeout: 5_000 });
      const menu = await exportMenu();
      await menu.getByText("The PDF and the print leave out Volunteer: this template has no place for it. A render warning.").waitFor({ timeout: 5_000 });
      await page.keyboard.press("Escape");
    } finally {
      await page.unroute("**/api/resume/preview");
    }
  });

  await t.test("a lossy read with nothing unreadable says so, and its banner opens the structured editor", async () => {
    await page.route("**/api/resume", (route) => route.fulfill({ json: { data: null, cvMdSha: null, report: { unparsed: [], orphans: [] }, lossless: false } }));
    try {
      await open("/cv");
      const banner = page.getByRole("button", { name: /would be rewritten differently/ });
      assert.match(await banner.textContent(), /^cv\.md was read, but it would be rewritten differently\. .*Open structured editor →$/);
      const menu = await exportMenu();
      const hint = await menu.getByRole("menuitem", { name: "Download PDF" }).evaluate((el) => document.getElementById(el.getAttribute("aria-describedby")).textContent);
      assert.doesNotMatch(hint, /could not be read/);
      assert.match(hint, /would not be rebuilt exactly/);
      await page.keyboard.press("Escape");
      await banner.click();
      await tabBecomes("Edit");
      await page.getByRole("heading", { name: "Structured editor" }).waitFor();
      assert.equal(await page.getByRole("heading", { name: "Structured editor" }).isVisible(), true);
    } finally {
      await page.unroute("**/api/resume");
    }
  });

  await t.test("a preview that fails after a save removes the old render and says so", async () => {
    await page.route("**/api/resume", lossless);
    try {
      await open("/cv");
      await frame().waitFor();
      await page.route("**/api/resume/preview", (route) => route.abort());
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await tabBecomes("Edit");
      await markdown().focus();
      await page.keyboard.press("ControlOrMeta+End");
      await page.keyboard.type("\nAnother line.");
      await page.getByRole("button", { name: "Save", exact: true }).first().click();
      await page.locator("main p[role=status]", { hasText: /^Saved$/ }).waitFor({ timeout: 10_000 });
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await tabBecomes("Preview");
      await page.locator("main").getByRole("alert").filter({ hasText: /^Preview failed:/ }).waitFor({ timeout: 5_000 });
      assert.equal(await frame().count(), 0);
      const menu = await exportMenu();
      assert.equal(await menu.getByRole("menuitem", { name: "Print" }).getAttribute("aria-disabled"), "true");
      await page.keyboard.press("Escape");
    } finally {
      await page.unroute("**/api/resume/preview");
      await page.unroute("**/api/resume");
    }
  });

  await t.test("a refused download shows the route's error on the page", async () => {
    await page.route("**/api/resume", lossless);
    await page.route("**/api/cv/pdf", (route) => route.fulfill({ status: 409, json: { error: "cv.md could not be read cleanly" } }));
    try {
      await open("/cv");
      await frame().waitFor();
      const menu = await exportMenu();
      await menu.getByRole("menuitem", { name: "Download PDF" }).click();
      await page.locator("main").getByRole("alert").filter({ hasText: "The PDF could not be downloaded: cv.md could not be read cleanly" }).waitFor({ timeout: 5_000 });
    } finally {
      await page.unroute("**/api/cv/pdf");
      await page.unroute("**/api/resume");
    }
  });

  await t.test("unsaved text is named in the Export menu", async () => {
    await page.route("**/api/resume", lossless);
    // Hold the save so the text stays unsaved while the menu is read.
    await page.route("**/api/cv", (route) => (route.request().method() === "POST" ? new Promise(() => {}) : route.continue()));
    try {
      await open("/cv?tab=edit");
      await markdown().focus();
      await page.keyboard.type("x");
      const menu = await exportMenu();
      assert.match(await menu.textContent(), /use the saved cv\.md, not the unsaved text/);
      await page.keyboard.press("Escape");
    } finally {
      await page.unroute("**/api/cv");
      await page.unroute("**/api/resume");
    }
  });

  await t.test("a preview that loads on Edit is measured once Preview shows it", async () => {
    const long = `<!doctype html><html><body><div class="page"><h1>Long CV</h1>${"<p>A line of the CV.</p>".repeat(150)}</div></body></html>`;
    await page.route("**/api/resume", lossless);
    await page.route("**/api/resume/preview", (route) => route.fulfill({ json: { html: long } }));
    try {
      await open("/cv?tab=edit");
      await page.waitForFunction(() => document.querySelector('iframe[title="Tailored CV preview"]')?.contentDocument?.querySelector("h1"));
      await page.getByRole("button", { name: "Preview", exact: true }).click();
      await tabBecomes("Preview");
      const caption = () => page.evaluate(() => document.querySelector('section[aria-label="Live preview"] > p')?.textContent ?? "");
      await page.waitForFunction(() => /^Page 1 of [2-9]/.test(document.querySelector('section[aria-label="Live preview"] > p')?.textContent ?? ""), null, { timeout: 5_000 }).catch(() => {});
      assert.match(await caption(), /^Page 1 of [2-9]/);
      const height = Number.parseFloat(await frame().evaluate((el) => el.style.height));
      assert.ok(height > 1056, `the frame is ${height}px tall, one page is 1056px`);
    } finally {
      await page.unroute("**/api/resume/preview");
      await page.unroute("**/api/resume");
    }
  });

  await t.test("Print is off while the markdown editor conflicts with cv.md", async () => {
    await page.route("**/api/resume", lossless);
    await page.route("**/api/cv", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 409, json: { error: "cv.md changed on disk." } }) : route.continue()));
    try {
      await open("/cv?tab=edit");
      await frame().waitFor({ state: "attached" });
      await markdown().focus();
      await page.keyboard.type("x");
      await page.locator("main").getByRole("alert").filter({ hasText: "cv.md changed on disk." }).waitFor({ timeout: 10_000 });
      const menu = await exportMenu();
      const print = menu.getByRole("menuitem", { name: "Print" });
      assert.equal(await print.getAttribute("aria-disabled"), "true");
      const hint = await print.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby")).textContent);
      assert.match(hint, /conflicts with cv\.md on disk/);
      await page.keyboard.press("Escape");
    } finally {
      await page.unroute("**/api/cv");
      await page.unroute("**/api/resume");
    }
  });

  await t.test("an older /api/cv re-read that answers last does not replace a newer one", async () => {
    await open("/cv?tab=edit");
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="CV Markdown"]')?.value.length > 0);
    let reads = 0;
    await page.route("**/api/cv", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const n = ++reads;
      if (n === 1) await new Promise((resolve) => setTimeout(resolve, 1_000));
      await route.fulfill({ json: { content: n === 1 ? "# Older read\n" : "# Newer read\n", exists: true } });
    });
    try {
      await page.evaluate(() => {
        window.dispatchEvent(new CustomEvent("co-cv-saved", { detail: { source: "structured" } }));
        setTimeout(() => window.dispatchEvent(new CustomEvent("co-cv-saved", { detail: { source: "structured" } })), 100);
      });
      await page.waitForFunction(() => document.querySelector('textarea[aria-label="CV Markdown"]')?.value === "# Newer read\n", null, { timeout: 5_000 });
      await page.waitForTimeout(1_500);
      assert.equal(reads, 2);
      assert.equal(await markdown().inputValue(), "# Newer read\n");
    } finally {
      await page.unroute("**/api/cv");
    }
  });

  await t.test("a re-read begun before a markdown save does not put the older text back", async () => {
    await open("/cv?tab=edit");
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="CV Markdown"]')?.value.length > 0);
    let release;
    const held = new Promise((resolve) => (release = resolve));
    let answered = false;
    let captured;
    const read = new Promise((resolve) => (captured = resolve));
    await page.route("**/api/cv", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      const response = await route.fetch();
      captured();
      await held;
      await route.fulfill({ response });
      answered = true;
    });
    try {
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("co-cv-saved", { detail: { source: "structured" } })));
      // The held answer must be the file as it was before the save below.
      await read;
      await markdown().fill(`${await markdown().inputValue()}\nSaved past the re-read.\n`);
      await page.locator("main p[role=status]", { hasText: /^Saved$/ }).waitFor({ timeout: 10_000 });
      release();
      while (!answered) await page.waitForTimeout(50);
      await page.waitForTimeout(300);
      assert.match(await markdown().inputValue(), /Saved past the re-read\./);
      assert.equal(await page.locator("main").getByRole("alert").count(), 0);
    } finally {
      release();
      await page.unroute("**/api/cv");
    }
  });

  await t.test("a re-read that fails after the editor's own save is not a conflict", async () => {
    await open("/cv?tab=edit");
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="CV Markdown"]')?.value.length > 0);
    let failed = 0;
    await page.route("**/api/cv", (route) => {
      if (route.request().method() !== "GET") return route.continue();
      failed++;
      return route.abort();
    });
    try {
      await markdown().fill(`${await markdown().inputValue()}\nSaved with no re-read.\n`);
      await page.locator("main p[role=status]", { hasText: /^Saved$/ }).waitFor({ timeout: 10_000 });
      while (!failed) await page.waitForTimeout(50);
      await page.waitForTimeout(300);
      assert.equal(await page.locator("main").getByRole("alert").count(), 0, await page.locator("main").getByRole("alert").allTextContents().then((a) => a.join(" | ")));
      assert.equal(await page.locator("main p[role=status]", { hasText: /^Saved$/ }).count(), 1);
    } finally {
      await page.unroute("**/api/cv");
    }
  });

  await t.test("Export waits for a save to be read back, and a structured write with the same text is read again", async () => {
    let release = () => {};
    let held = null;
    let lossy = false;
    await page.route("**/api/resume", async (route) => {
      if (route.request().method() !== "GET") return route.continue();
      await held;
      if (lossy) return route.fulfill({ json: { data: null, cvMdSha: null, report: { unparsed: [], orphans: [] }, lossless: false } });
      await lossless(route);
    });
    try {
      await open("/cv");
      await frame().waitFor();
      held = new Promise((resolve) => (release = resolve));
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await markdown().fill(`${await markdown().inputValue()}\nRead back.\n`);
      await page.locator("main p[role=status]", { hasText: /^Saved$/ }).waitFor({ timeout: 10_000 });
      const menu = await exportMenu();
      const print = menu.getByRole("menuitem", { name: "Print" });
      assert.equal(await print.getAttribute("aria-disabled"), "true");
      assert.match(await print.evaluate((el) => document.getElementById(el.getAttribute("aria-describedby")).textContent), /until the saved cv\.md is read back/);
      assert.equal(await menu.getByRole("menuitem", { name: "Download PDF" }).getAttribute("aria-disabled"), null);
      await page.keyboard.press("Escape");
      release();
      await (await exportMenu()).locator('[role=menuitem]:not([aria-disabled])', { hasText: "Print" }).waitFor({ timeout: 10_000 });
      await page.keyboard.press("Escape");

      // What a pairing does: cv.md keeps its text and reads back differently.
      lossy = true;
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("co-cv-saved", { detail: { source: "structured" } })));
      await page.getByRole("button", { name: /would be rewritten differently/ }).waitFor({ timeout: 5_000 });
    } finally {
      release();
      await page.unroute("**/api/resume");
    }
  });

  await t.test("an edit made while the structured editor reloads is kept", async () => {
    await page.route("**/api/resume", lossless);
    try {
      await open("/cv?tab=edit");
      await page.getByRole("button", { name: "Structured editor" }).click();
      const headline = page.getByLabel("Headline");
      await headline.waitFor();
      let release;
      const held = new Promise((resolve) => (release = resolve));
      await page.unroute("**/api/resume");
      await page.route("**/api/resume", async (route) => {
        if (route.request().method() !== "GET") return route.continue();
        await held;
        await lossless(route);
      });
      const reload = page.waitForRequest((r) => new URL(r.url()).pathname === "/api/resume" && r.method() === "GET");
      await page.evaluate(() => window.dispatchEvent(new CustomEvent("co-cv-saved", { detail: { source: "markdown" } })));
      await reload;
      await headline.fill("Typed during the reload");
      release();
      await page.locator("main").getByRole("alert").filter({ hasText: "cv.md changed in the markdown editor" }).waitFor({ timeout: 5_000 });
      assert.equal(await headline.inputValue(), "Typed during the reload");
    } finally {
      await page.unroute("**/api/resume");
    }
  });

  // The stub records the frame's body height when print() runs: a frame with no layout prints a blank page.
  const stubPrint = () => frame().evaluate((el) => {
    window.__prints = [];
    el.contentWindow.print = () => window.__prints.push(el.contentDocument.body.getBoundingClientRect().height);
  });
  for (const from of ["Preview", "Edit"]) {
    await t.test(`Print from ${from} prints the rendered frame once`, async () => {
      await page.route("**/api/resume", lossless);
      try {
        await open(from === "Edit" ? "/cv?tab=edit" : "/cv");
        await frame().waitFor({ state: "attached" });
        await page.waitForFunction(() => document.querySelector('iframe[title="Tailored CV preview"]')?.contentDocument?.querySelector("h1"));
        await stubPrint();
        const menu = await exportMenu();
        await menu.getByRole("menuitem", { name: "Print" }).click();
        await page.waitForFunction(() => window.__prints.length > 0, null, { timeout: 5_000 });
        await page.waitForTimeout(200);
        const prints = await page.evaluate(() => window.__prints);
        assert.equal(prints.length, 1);
        assert.ok(prints[0] > 0, `the frame had ${prints[0]}px of layout when print() ran`);
      } finally {
        await page.unroute("**/api/resume");
      }
    });
  }

  await t.test("Portals: Space hands focus to the next switch, and a failed write hands it back", async () => {
    const switchOf = (name) => page.getByRole("switch", { name: `Scan ${name}` });
    const focused = () => page.evaluate(() => document.activeElement?.getAttribute("aria-label"));
    let revision = 0;
    await page.route("**/api/portals", (route) => (route.request().method() === "POST" ? route.fulfill({ json: { revision: `r${++revision}` } }) : route.continue()));
    try {
      await open("/portals");
      await switchOf("Alpha Labs").focus();
      await page.keyboard.press("Space");
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Scan Beta Works", null, { timeout: 5_000 });
      assert.equal(await switchOf("Alpha Labs").count(), 0);
      // Focus moves before the write answers; a switch ignores presses until it does.
      await page.locator('[role=switch][aria-label="Scan Beta Works"][aria-disabled="false"]').waitFor({ timeout: 5_000 });
    } finally {
      await page.unroute("**/api/portals");
    }
    await page.route("**/api/portals", (route) => (route.request().method() === "POST" ? route.fulfill({ status: 500, json: { error: "disk full" } }) : route.continue()));
    try {
      await page.keyboard.press("Space");
      await page.locator("main").getByRole("alert").filter({ hasText: "Beta Works: disk full" }).waitFor({ timeout: 5_000 });
      await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Scan Beta Works", null, { timeout: 5_000 }).catch(() => {});
      assert.equal(await focused(), "Scan Beta Works");
    } finally {
      await page.unroute("**/api/portals");
    }
  });
});

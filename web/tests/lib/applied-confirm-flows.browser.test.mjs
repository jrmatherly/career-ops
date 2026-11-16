// Live-browser checks that every Applied path asks first, and that Today keeps
// the paste-a-job box (disposable data only). tests/browser-suites.mjs builds a
// pipeline-status root and sets APPLIED_CONFIRM_TEST_URL and APPLIED_CONFIRM_TEST_ROOT.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";
import { settled } from "../helpers/streaming.mjs";
import { APPLIED_CONFIRM_PROMPT, APPLIED_CONFIRM_YES } from "../../src/lib/applied-confirm.mjs";

const url = process.env.APPLIED_CONFIRM_TEST_URL;
const root = process.env.APPLIED_CONFIRM_TEST_ROOT;

test("Applied asks before it writes, from the bulk bar, the checklist and a key", { skip: liveServerSkip("APPLIED_CONFIRM_TEST_URL", "APPLIED_CONFIRM_TEST_ROOT"), timeout: 120_000 }, async (t) => {
  const origin = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const relative = path.relative(os.tmpdir(), fs.realpathSync(root));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(fs.readFileSync(path.join(root, ".inline-status-fixture"), "utf8").trim(), "fictional-only");
  const tracker = path.join(root, "data/applications.md");
  const statusOf = (n) => fs.readFileSync(tracker, "utf8").split("\n").find((line) => line.startsWith(`| ${n} |`))?.split("|")[6]?.trim();
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const posts = [];
  page.on("request", (r) => { if (r.method() === "POST" && new URL(r.url()).pathname === "/api/status") posts.push(r.url()); });
  async function until(check) {
    const start = Date.now();
    while (!await check()) {
      if (Date.now() - start > 15_000) assert.fail("UI did not reach expected state");
      await page.waitForTimeout(50);
    }
  }
  // Next's route announcer is also role="alert", so the confirm is found by its text.
  const confirm = () => page.getByRole("alert").filter({ hasText: APPLIED_CONFIRM_PROMPT });
  const yes = () => page.getByRole("button", { name: APPLIED_CONFIRM_YES });
  async function asksFirst() {
    await confirm().waitFor();
    assert.equal(await yes().evaluate((b) => b === document.activeElement), true, "focus is on the Yes button");
    assert.deepEqual(posts, [], "nothing was sent before Yes");
  }
  const row = (n) => page.locator("tbody tr").filter({ has: page.getByRole("link", { name: `#${n}`, exact: true }) });
  const before = fs.readFileSync(tracker, "utf8");

  // Today keeps the paste-a-job box on a set-up root.
  await settled(page, () => page.goto(`${origin.origin}/`));
  await page.getByPlaceholder("Paste a job URL to evaluate…").waitFor();

  // The bulk bar: two Evaluated rows, Applied, then Not yet. Nothing is written.
  await settled(page, () => page.goto(`${origin.origin}/pipeline?tab=ALL&sort=tracker&dir=1`));
  await row(13).getByRole("checkbox").waitFor();
  await row(11).getByRole("checkbox").click();
  await row(13).getByRole("checkbox").click();
  await page.getByRole("combobox", { name: "Status for selected applications" }).selectOption("Applied");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await asksFirst();
  await confirm().getByRole("button", { name: "Not yet" }).click();
  await until(async () => (await confirm().count()) === 0);
  assert.deepEqual(posts, []);
  assert.equal(fs.readFileSync(tracker, "utf8"), before, "Not yet leaves the tracker alone");
  await page.getByRole("button", { name: "Clear", exact: true }).click();

  // The checklist on /pipeline/11/apply: Applied, then Yes. Exactly one write.
  await settled(page, () => page.goto(`${origin.origin}/pipeline/11/apply`));
  await page.locator("main").getByRole("button", { name: "Applied", exact: true }).click();
  await asksFirst();
  await yes().click();
  await until(() => statusOf(11) === "Applied");
  assert.equal(posts.length, 1);

  // The status key: the cursor on #13, then 2, then Yes. Exactly one more write.
  await settled(page, () => page.goto(`${origin.origin}/pipeline?tab=ALL&sort=tracker&dir=1`));
  await row(13).getByRole("checkbox").waitFor();
  await page.locator("h1").first().click();
  for (let i = 0; i < 3; i++) await page.keyboard.press("j");
  await until(async () => (await row(13).getAttribute("data-tracker-cursor")) === "true");
  posts.length = 0;
  await page.keyboard.press("2");
  await asksFirst();
  await yes().click();
  await until(() => statusOf(13) === "Applied");
  assert.equal(posts.length, 1);
  assert.deepEqual(errors, []);
});

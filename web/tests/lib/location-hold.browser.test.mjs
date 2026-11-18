// Disposable fictional data root: four pending rows and an Auto scheduled scan with a location hold.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";
import { settled } from "../helpers/streaming.mjs";

const url = process.env.LOCATION_HOLD_TEST_URL;
const root = process.env.LOCATION_HOLD_TEST_ROOT;
const options = { skip: liveServerSkip("LOCATION_HOLD_TEST_URL", "LOCATION_HOLD_TEST_ROOT"), timeout: 60_000 };
const row = (page, company) => page.locator("li:visible").filter({ hasText: company });
const tierButton = (page, name) => page.getByRole("group", { name: "Location fit" }).getByRole("button", { name, exact: true });
const badge = (page, company) => row(page, company).getByTitle(/Judged from the row's location and title/);

async function open(t) {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return { page, errors };
}

test("every row that is not a fit says why", options, async (t) => {
  const { page, errors } = await open(t);
  await settled(page, () => page.goto(`${url}/pipeline`));
  await tierButton(page, "All 4").click();
  await row(page, "Fixture Beta").waitFor();
  assert.equal(await badge(page, "Fixture Beta").count(), 0);
  assert.equal(await badge(page, "Fixture Gamma").getAttribute("title"),
    "Remote, and the posting does not say from where. Judged from the row's location and title, not the posting text.");
  assert.equal(await badge(page, "Fixture Gamma").textContent(), "Review location: Remote, and the posting does not say from where.");
  assert.equal(await badge(page, "Fixture Delta").textContent(), "Review location: The posting gives no location.");
  assert.equal(await badge(page, "Fixture Alpha").textContent(), "Elsewhere: On-site or hybrid outside your home area.");
  assert.equal(await row(page, "Fixture Alpha").getByText("est. 4.2", { exact: true }).count(), 1, "the row keeps its rank");
  assert.equal(await page.getByText("Held: location").count(), 0);
  assert.deepEqual(errors, []);
});

test("the Inbox opens on the fit rows, and Clear returns to them", options, async (t) => {
  const { page, errors } = await open(t);
  await settled(page, () => page.goto(`${url}/pipeline`));
  await row(page, "Fixture Beta").waitFor();
  assert.equal(await tierButton(page, "Fit 1").getAttribute("aria-pressed"), "true");
  for (const name of ["Review location 2", "Elsewhere 1", "All 4"]) assert.equal(await tierButton(page, name).getAttribute("aria-pressed"), "false");
  for (const company of ["Fixture Alpha", "Fixture Gamma", "Fixture Delta"]) assert.equal(await row(page, company).count(), 0, `${company} is not a fit row`);
  await page.getByRole("button", { name: "Select all 1", exact: true }).waitFor();

  await tierButton(page, "Review location 2").click();
  await row(page, "Fixture Gamma").waitFor();
  await row(page, "Fixture Delta").waitFor();
  assert.equal(await row(page, "Fixture Beta").count(), 0);

  await page.getByRole("button", { name: "Clear" }).click();
  assert.equal(await tierButton(page, "Fit 1").getAttribute("aria-pressed"), "true");
  assert.equal(await row(page, "Fixture Gamma").count(), 0, "Clear returns to Fit");
  assert.deepEqual(errors, []);
});

test("the job form shows the hold and the source groups", options, async (t) => {
  const { page, errors } = await open(t);
  await settled(page, () => page.goto(`${url}/scheduled-scans`));
  await page.getByText("other locations held").waitFor();
  await page.getByText("Groups: weekly", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Options for Fixture hold scan" }).click();
  await page.getByText("Edit Scan").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Home area", { exact: true }).waitFor();
  await dialog.getByText("Remote from", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Remove Springfield" }).waitFor();
  await dialog.getByRole("button", { name: "Remove United States" }).waitFor();
  await dialog.getByText("Home states", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Remove Illinois" }).waitFor();
  await dialog.getByText("Source groups", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Remove weekly" }).waitFor();
  for (const [role, name] of [["button", "Close"], ["textbox", "Scan Name"], ["combobox", "Where to check"], ["spinbutton", "Repeat Cadence"], ["combobox", "Repeat unit"]]) {
    assert.equal(await dialog.getByRole(role, { name, exact: true }).count(), 1, `edit dialog: ${role} "${name}"`);
  }

  // A country the gate does not know is refused by the route and named in the form.
  await dialog.getByRole("button", { name: "Remove United States" }).click();
  await dialog.getByLabel("Remote from").fill("Atlantis");
  await dialog.getByLabel("Remote from").press("Enter");
  const saved = page.waitForResponse((response) => new URL(response.url()).pathname.startsWith("/api/scheduled-jobs/") && response.request().method() !== "GET");
  await dialog.getByRole("button", { name: /Save|Update/ }).click();
  assert.equal((await saved).status(), 400);
  await dialog.getByText('"Remote from" must name a country, such as United States.').waitFor();
  assert.deepEqual(errors, []);
});

test("the Score confirm says which rows are not a location fit and still scores", options, async (t) => {
  const { page, errors } = await open(t);
  await page.addInitScript(() => {
    localStorage.setItem("career-ops:config", JSON.stringify({ cliId: "fixture-cli" }));
    localStorage.setItem("career-ops:first-score-seen", "1");
  });
  await settled(page, () => page.goto(`${url}/pipeline`));
  await tierButton(page, "All 4").click();
  for (const company of ["Fixture Alpha", "Fixture Beta", "Fixture Gamma"]) await row(page, company).getByTitle("Save to shortlist").click();
  await page.getByRole("button", { name: /^Score 3/ }).click();
  await page.getByText("2 of 3 are not a location fit. You can still score them.", { exact: true }).waitFor();
  await page.getByText("1 · Review location: Remote, and the posting does not say from where.", { exact: true }).waitFor();
  await page.getByText("1 · Elsewhere: On-site or hybrid outside your home area.", { exact: true }).waitFor();
  // Never pressed: this suite must not start a run.
  assert.equal(await page.getByRole("button", { name: "Score 3 now", exact: true }).isEnabled(), true);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  assert.equal(await page.getByText(/not a location fit/).count(), 0, "the note leaves with the confirm");
  assert.deepEqual(errors, []);
});

test("a scheduled scan keeps a comma inside a location entry", options, async (t) => {
  const { page, errors } = await open(t);
  await settled(page, () => page.goto(`${url}/scheduled-scans`));
  await page.getByRole("button", { name: "New scan" }).first().click();
  const dialog = page.getByRole("dialog");
  const place = dialog.getByRole("textbox", { name: "City or location" });
  await place.fill("Remote, US");
  await place.press("Enter");
  assert.equal(await dialog.getByRole("button", { name: "Remove Remote, US", exact: true }).count(), 1);
  await place.evaluate((input) => {
    const clipboardData = new DataTransfer();
    clipboardData.setData("text", "Atlanta, Alpharetta, Marietta");
    input.dispatchEvent(new ClipboardEvent("paste", { clipboardData, bubbles: true, cancelable: true }));
  });
  for (const chip of ["Atlanta", "Alpharetta", "Marietta"]) assert.equal(await dialog.getByRole("button", { name: `Remove ${chip}`, exact: true }).count(), 1, `a pasted list still splits: ${chip}`);
  const roles = dialog.getByRole("textbox", { name: "Roles to find" });
  await roles.fill("staff engineer, platform");
  await roles.press("Enter");
  for (const chip of ["staff engineer", "platform"]) assert.equal(await dialog.getByRole("button", { name: `Remove ${chip}`, exact: true }).count(), 1, `a title comma still splits: ${chip}`);
  // Enter on a field that still holds text adds the entry. It must not submit the form.
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  assert.deepEqual(errors, []);
});

// Last in the file, because it writes to the fixture's pipeline.
test("Select all and Skip selected act on the tier in view", options, async (t) => {
  const relative = path.relative(os.tmpdir(), fs.realpathSync(root));
  assert.ok(relative && !relative.startsWith("..") && !path.isAbsolute(relative));
  assert.equal(fs.readFileSync(path.join(root, ".inbox-undo-fixture"), "utf8").trim(), "fictional-only");
  const pipeline = path.join(root, "data/pipeline.md");
  const { page, errors } = await open(t);
  async function until(check) {
    const start = Date.now();
    while (!await check()) {
      if (Date.now() - start > 15_000) assert.fail("UI did not reach expected state");
      await page.waitForTimeout(50);
    }
  }
  await settled(page, () => page.goto(`${url}/pipeline`));
  await tierButton(page, "Elsewhere 1").click();
  await page.getByRole("button", { name: "Select all 1", exact: true }).click();
  await page.getByRole("button", { name: "Skip selected", exact: true }).click();
  await until(() => fs.readFileSync(pipeline, "utf8").includes("[x] https://example.com/fixture-held"));
  const text = fs.readFileSync(pipeline, "utf8");
  for (const kept of ["fixture-plain", "fixture-remote", "fixture-blank"]) assert.ok(text.includes(`[ ] https://example.com/${kept}`), `${kept} was skipped`);
  await page.getByText("Nothing elsewhere", { exact: true }).waitFor();
  await page.getByText("1 under Fit, 2 under Review location.", { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

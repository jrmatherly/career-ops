// Disposable fictional data root: a held inbox row and an Auto scheduled scan with a location hold.
import assert from "node:assert/strict";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";
import { settled } from "../helpers/streaming.mjs";

const url = process.env.LOCATION_HOLD_TEST_URL;
test("a held posting keeps its rank in the Inbox, and the job form shows and validates the hold", {
  skip: liveServerSkip("LOCATION_HOLD_TEST_URL"), timeout: 60_000,
}, async (t) => {
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(new URL(url).hostname));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));

  await settled(page, () => page.goto(`${url}/pipeline`));
  const held = page.locator("li:visible").filter({ hasText: "Fixture Alpha" });
  await held.getByText("Held: location", { exact: true }).waitFor();
  assert.equal(await held.getByText("est. 4.2", { exact: true }).count(), 1, "a held row still shows its rank");
  assert.equal(await page.locator("li:visible").filter({ hasText: "Fixture Beta" }).getByText("Held: location").count(), 0);

  await settled(page, () => page.goto(`${url}/scheduled-scans`));
  await page.getByText("other locations held").waitFor();
  await page.getByRole("button", { name: "Options for Fixture hold scan" }).click();
  await page.getByText("Edit Scan").click();
  const dialog = page.getByRole("dialog");
  await dialog.getByText("Home area", { exact: true }).waitFor();
  await dialog.getByText("Remote from", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Remove Springfield" }).waitFor();
  await dialog.getByRole("button", { name: "Remove United States" }).waitFor();

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

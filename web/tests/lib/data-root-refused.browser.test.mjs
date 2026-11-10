// Browser regression for the refused data root: a server whose CAREER_OPS_ROOT
// points inside a Claude Code plugin install copy must show why on every page,
// in a production build, where a thrown server error loses its message.
// tests/browser-suites.mjs starts that server from tests/fixtures/data-root-refused.mjs
// and sets DATA_ROOT_REFUSED_TEST_URL and DATA_ROOT_REFUSED_TEST_ROOT.
import assert from "node:assert/strict";
import { test } from "node:test";
import { liveServerSkip } from "../helpers/live-server.mjs";

const url = process.env.DATA_ROOT_REFUSED_TEST_URL;
const root = process.env.DATA_ROOT_REFUSED_TEST_ROOT;

test("A refused data root is explained on every page", { skip: liveServerSkip("DATA_ROOT_REFUSED_TEST_URL", "DATA_ROOT_REFUSED_TEST_ROOT"), timeout: 120_000 }, async (t) => {
  const origin = new URL(url);
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname));
  const { chromium } = await import("playwright-core");
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const main = () => page.getByRole("main");

  for (const route of ["/", "/pipeline", "/pipeline/1", "/config"]) {
    await page.goto(`${origin.origin}${route}`);
    await main().getByRole("heading", { level: 1, name: "career-ops can\u2019t use this data folder" })
      .or(main().getByRole("heading", { level: 1, name: "career-ops can't use this data folder" }))
      .waitFor({ timeout: 15_000 });
    const text = await main().innerText();
    assert.ok(text.includes("CAREER_OPS_ROOT points inside a Claude Code plugin install"), `${route} names the variable and the reason`);
    assert.ok(text.includes(root), `${route} names the refused folder`);
    assert.ok(text.includes("Restart career-ops after changing it."), `${route} says an environment variable needs a restart`);
    assert.equal(await page.getByRole("complementary").count(), 0, `${route} shows no sidebar, whose links all lead back here`);
    assert.equal(await page.getByText("This page couldn").count(), 0, `${route} does not fall through to an error page`);
  }
});

// The beta bug-report link and the banner's "similar issues" search open on
// THIS fork's repository, never on upstream's: a fork user must not file a
// fork bug at career-ops-hq. Plan:
// docs/superpowers/plans/2026-11-07-upstream-decoupling.md, Task 3.
//
// Run:  npm test   (or node --experimental-strip-types --test tests/lib/report-target.test.mjs)
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const { issueUrl } = await import("../../src/lib/report/report.ts");

const diag = {
  version: "0.1.0", coreVersion: "1.39.0", channel: "alpha", sha: "abc1234", route: "/",
  cli: "claude", ua: "test", viewport: "1x1", logs: [], shape: null, followupsAvailable: null,
};

test("issueUrl opens a new issue on this fork", () => {
  assert.ok(issueUrl(diag, "x").startsWith("https://github.com/jrmatherly/career-ops/issues/new?"));
});

test("beta-banner.tsx never names upstream (it imports REPO instead)", () => {
  const src = readFileSync(fileURLToPath(new URL("../../src/components/beta/beta-banner.tsx", import.meta.url)), "utf-8");
  assert.doesNotMatch(src, /career-ops-hq/);
});

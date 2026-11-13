import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { test } from "node:test";
import "../helpers/web-ts-alias-loader.mjs";

// Core CI runs these suites with only root dependencies installed, and nav-items.ts
// imports lucide-react. Only skip when that install is absent; a broken one must still fail.
let skip = false;
try {
  void import.meta.resolve("lucide-react");
} catch (error) {
  if (error.code !== "ERR_MODULE_NOT_FOUND" || existsSync(new URL("../../node_modules", import.meta.url))) throw error;
  skip = "web dependencies are not installed (the nav suite runs in web CI)";
}
const nav = skip ? null : await import("../../src/lib/nav-items.ts");

test("the navigation groups come in their fixed order, Settings pinned last", { skip }, () => {
  const groups = nav.navGroups(true);
  assert.deepEqual(groups.map((g) => g.label), ["Daily", "Discover", "Profile", "Insight", "Pinned"]);
  assert.deepEqual(groups[0].items.map((i) => i.href), ["/", "/pipeline", "/board", "/followups"]);
  assert.deepEqual(groups.find((g) => g.label === "Profile").items.map((i) => i.label), ["CV", "Documents", "Shares"]);
  assert.deepEqual(groups.at(-1).items.map((i) => [i.href, i.label]), [["/config", "Settings"]]);
});

test("follow-ups switched off drops /followups from its group", { skip }, () => {
  const hrefs = nav.navGroups(false).flatMap((g) => g.items.map((i) => i.href));
  assert.ok(!hrefs.includes("/followups"));
  assert.ok(hrefs.includes("/pipeline"));
});

test("no item carries a chip", { skip }, () => {
  assert.deepEqual(nav.NAV_ITEMS.filter((i) => "chip" in i).map((i) => i.href), []);
});

test("every destination appears in exactly one group", { skip }, () => {
  const grouped = nav.navGroups(true).flatMap((g) => g.items.map((i) => i.href));
  assert.deepEqual([...grouped].sort(), nav.NAV_ITEMS.map((i) => i.href).sort());
});

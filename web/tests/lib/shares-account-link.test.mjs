import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const src = (rel) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src", rel), "utf8");

test("the Shares page passes the account URL from the environment and the data root", () => {
  assert.match(src("app/shares/page.tsx"), /accountUrl=\{publishAccountUrl\(\{ env: process\.env, dataRoot: careerOpsRoot\(\) \}\)\}/);
});

test("Manage publish keys renders only with a URL, as a new-tab link with rel noopener", () => {
  const view = src("components/shares/shares-view.tsx");
  const anchor = view.match(/\{accountUrl && \(\s*<a ([^>]*)>[\s\S]*?Manage publish keys/);
  assert.ok(anchor, "the link is guarded by accountUrl and labelled Manage publish keys");
  assert.match(anchor[1], /href=\{accountUrl\}/);
  assert.match(anchor[1], /target="_blank"/);
  assert.match(anchor[1], /rel="noopener"/);
});

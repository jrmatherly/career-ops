import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { test } from "node:test";

const src = (rel) => readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../src", rel), "utf8");

test("the Shares page passes the account URL from the saved settings, the environment and the data root", () => {
  assert.match(src("app/shares/page.tsx"), /accountUrl=\{publishAccountUrl\(\{ env: await effectiveEnv\(\), dataRoot: careerOpsRoot\(\) \}\)\}/);
});

test("Manage publish keys renders only with a URL, as a new-tab link with rel noopener", () => {
  const view = src("components/shares/shares-view.tsx");
  const anchor = view.match(/\{accountUrl && \(\s*<a ([^>]*)>[\s\S]*?Manage publish keys/);
  assert.ok(anchor, "the link is guarded by accountUrl and labelled Manage publish keys");
  assert.match(anchor[1], /href=\{accountUrl\}/);
  assert.match(anchor[1], /target="_blank"/);
  assert.match(anchor[1], /rel="noopener"/);
});

test("a new pull clears the last toast before fetching", () => {
  const pull = src("components/shares/shares-view.tsx").match(/async function pull\([^)]*\) \{([\s\S]*?)\n {2}\}\n/);
  assert.ok(pull, "pull() is found");
  const clear = pull[1].indexOf("setToast(null)");
  assert.ok(clear !== -1 && clear < pull[1].indexOf("await fetch("), "setToast(null) runs before the fetch");
});

test("a 200 body without ok, missing and pulled gets its own toast and a refresh before missing is read", () => {
  const pull = src("components/shares/shares-view.tsx").match(/async function pull\([^)]*\) \{([\s\S]*?)\n {2}\}\n/)[1];
  const guard = pull.search(/if \(body\.ok !== true \|\| !Array\.isArray\(body\.missing\) \|\| typeof body\.pulled !== "number"\) \{\s*setToast\("Pull failed: the app sent a response this page cannot read"\);\s*router\.refresh\(\);\s*return;/);
  assert.ok(guard !== -1, "the shape guard sets its own toast, refreshes the rows and returns");
  assert.ok(guard < pull.indexOf("data.missing"), "the guard runs before missing is read");
});

test("every toast, the missing-shares note with its delete command included, stays until Dismiss clears it", () => {
  const view = src("components/shares/shares-view.tsx");
  assert.match(view, /setToast\(`Not on the publish service any more:[^\n]*delete --slug/, "the missing-shares note is a toast");
  assert.doesNotMatch(view, /set(?:Timeout|Interval)\([^;]*setToast|transient/, "no toast closes on a timer");
  assert.match(view, /<button[^>]*onClick=\{\(\) => setToast\(null\)\}[^>]*aria-label="Dismiss"/, "Dismiss clears the toast");
});

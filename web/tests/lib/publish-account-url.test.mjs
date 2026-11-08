// The Shares page links to the publish service's account page only when
// PUBLISH_URL is an https URL, read in the order publish/share.mjs uses.
//
// Run:  node --experimental-strip-types --test tests/lib/publish-account-url.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { publishAccountUrl } from "../../src/lib/publish-account-url.mjs";

function root(t, envFile) {
  const dir = mkdtempSync(join(tmpdir(), "co-publish-account-"));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  if (envFile !== undefined) writeFileSync(join(dir, ".env"), envFile);
  return dir;
}

test("the environment wins over the data root .env", (t) => {
  const dataRoot = root(t, "PUBLISH_URL=https://dotenv.example\n");
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "https://env.example/" }, dataRoot }), "https://env.example/account");
});

test("the data root .env is read when the environment has no PUBLISH_URL", (t) => {
  const dataRoot = root(t, 'PUBLISH_API_KEY=cops_secret\nPUBLISH_URL="https://cv.example"');
  assert.equal(publishAccountUrl({ env: {}, dataRoot }), "https://cv.example/account");
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "" }, dataRoot }), "https://cv.example/account", "an empty variable falls through, as in share.mjs");
});

test("an http URL yields null, in the environment or the .env", (t) => {
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "http://127.0.0.1:8080" }, dataRoot: root(t) }), null);
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t, "PUBLISH_URL=http://cv.example\n") }), null);
});

test("unset, unparsable or no .env at all yields null", (t) => {
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t) }), null);
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t, "OTHER=1\n") }), null);
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "not a url" }, dataRoot: root(t) }), null);
});

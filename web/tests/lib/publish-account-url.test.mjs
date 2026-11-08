// The Shares page links to the publish service's account page only when
// PUBLISH_URL is an https URL, read in the order publish/share.mjs uses.
//
// Run:  node --experimental-strip-types --test tests/lib/publish-account-url.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
  t.mock.method(console, "error", () => {});
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "http://127.0.0.1:8080" }, dataRoot: root(t) }), null);
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t, "PUBLISH_URL=http://cv.example\n") }), null);
});

test("unset, unparsable or no .env at all yields null", (t) => {
  t.mock.method(console, "error", () => {});
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t) }), null);
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t, "OTHER=1\n") }), null);
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "not a url" }, dataRoot: root(t) }), null);
});

test("the href is built from the parsed URL: trimmed, path kept, query and fragment dropped", (t) => {
  const dataRoot = root(t);
  const url = (PUBLISH_URL) => publishAccountUrl({ env: { PUBLISH_URL }, dataRoot });
  assert.equal(url("  https://cv.example/  "), "https://cv.example/account");
  assert.equal(url("https://cv.example/base//?x=1#top"), "https://cv.example/base/account");
});

test("a URL with credentials, or a .env quote that swallows the key's line, yields null and logs why without the key", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "https://user:cops_secret@cv.example" }, dataRoot: root(t) }), null);
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "https://cv.example\nPUBLISH_API_KEY=cops_secret" }, dataRoot: root(t) }), null);
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t, 'PUBLISH_URL="https://cv.example\nPUBLISH_API_KEY=cops_secret\n') }), null);
  const logged = errors.mock.calls.map((c) => String(c.arguments[0]));
  assert.equal(logged.length, 3);
  for (const line of logged) {
    assert.match(line, /Manage publish keys link is hidden because PUBLISH_URL (carries credentials|is not a URL)/);
    assert.doesNotMatch(line, /cops_secret/);
  }
});

test("a set but refused PUBLISH_URL logs one line naming the reason", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  assert.equal(publishAccountUrl({ env: { PUBLISH_URL: "http://cv.example" }, dataRoot: root(t) }), null);
  assert.deepEqual(errors.mock.calls.map((c) => c.arguments[0]), ["shares: the Manage publish keys link is hidden because PUBLISH_URL is not https"]);
});

test("a missing .env is silent; an unreadable one is logged with its code and the link is hidden", (t) => {
  const errors = t.mock.method(console, "error", () => {});
  assert.equal(publishAccountUrl({ env: {}, dataRoot: root(t) }), null);
  assert.equal(errors.mock.callCount(), 0, "no .env is the normal case");
  const dataRoot = root(t);
  mkdirSync(join(dataRoot, ".env"));
  assert.equal(publishAccountUrl({ env: {}, dataRoot }), null);
  assert.equal(errors.mock.callCount(), 1);
  assert.match(String(errors.mock.calls[0].arguments[0]), /\.env could not be read: EISDIR/);
});

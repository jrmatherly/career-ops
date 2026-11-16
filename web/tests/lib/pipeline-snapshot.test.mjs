// A failed or superseded pipeline load must not replace what the provider shows.
// Run (from web/): node --experimental-strip-types --import=./tests/helpers/saved-settings-off.mjs --test tests/lib/pipeline-snapshot.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { createPipelineLoader } from "../../src/lib/pipeline-snapshot.mjs";

const ok = (body) => Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
test("a 500, a non-array body or a network error yields null", async () => {
  assert.equal(await createPipelineLoader(() => Promise.resolve(new Response('{"error":"boom"}', { status: 500 })))(), null);
  assert.equal(await createPipelineLoader(() => ok({ inbox: "x", applications: [] }))(), null);
  assert.equal(await createPipelineLoader(() => Promise.reject(new TypeError("offline")))(), null);
  assert.deepEqual(await createPipelineLoader(() => ok({ inbox: [1], applications: [2] }))(), { inbox: [1], applications: [2] });
});
test("an older response that lands after a newer one yields null", async () => {
  let releaseFirst;
  const first = new Promise((r) => { releaseFirst = () => r(new Response(JSON.stringify({ inbox: ["old"], applications: [] }))); });
  const replies = [first, ok({ inbox: ["new"], applications: [] })];
  const load = createPipelineLoader(() => replies.shift());
  const a = load(); const b = load();
  assert.deepEqual(await b, { inbox: ["new"], applications: [] });
  releaseFirst();
  assert.equal(await a, null);
});

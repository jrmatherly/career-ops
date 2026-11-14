import test from "node:test";
import assert from "node:assert/strict";

import { HELD_REASON, markGated, markHeld } from "../../src/lib/inbox-pending.mjs";
import { HELD_LOCATION } from "../../../lib/evaluate-queue.mjs";

const jobs = [{ url: "https://example.com/a" }, { url: "https://example.com/b" }];
const held = (url) => ({ url, state: "skipped", reason: "held-location" });

test("the Inbox reads the reason the queue writes", () => {
  assert.equal(HELD_REASON, HELD_LOCATION);
});
test("a held-location entry marks its job", () => {
  assert.deepEqual(markHeld(jobs, [held("https://example.com/a?utm_source=x")]), [{ url: "https://example.com/a", held: true }, { url: "https://example.com/b" }]);
});
test("a row skipped for another reason is not marked", () => {
  assert.deepEqual(markHeld(jobs, [{ url: "https://example.com/a", state: "skipped", reason: "below-threshold" }, { url: "https://example.com/b", state: "queued", reason: "" }]), jobs);
});
test("a gated job keeps its gate beside the hold", () => {
  const ledger = [{ url: "https://example.com/a", state: "gated", reason: "dealbreaker" }, held("https://example.com/a")];
  assert.deepEqual(markHeld(markGated(jobs, ledger), ledger)[0], { url: "https://example.com/a", gated: "dealbreaker", held: true });
});
test("with no held entry the same array is returned", () => {
  assert.equal(markHeld(jobs, []), jobs);
});

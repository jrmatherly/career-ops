import test from "node:test";
import assert from "node:assert/strict";

import { addedHistory, heldForLocation } from "../../src/lib/core/evaluate-candidates.mjs";

const verdict = (location) => ({ tier: /remote, united states|springfield/i.test(location) ? "fit" : "elsewhere" });
const history = [
  { url: "https://example.com/a", status: "added", location: "Remote, United States", title: "Platform Lead" },
  { url: "https://example.com/b", status: "added", location: "Metropolis, NY", title: "Platform Lead" },
  { url: "https://example.com/c", status: "added", location: "", title: "Platform Lead" },
  { url: "https://example.com/e", status: "skipped_title", location: "Springfield", title: "x" },
  { url: "https://example.com/e", status: "added", location: "Metropolis, NY", title: "x" },
];
const urls = (...ids) => ids.map((id) => ({ url: `https://example.com/${id}` }));

test("a row the verdict does not call a fit is held and a fit is not", () => {
  assert.deepEqual([...heldForLocation({ rows: urls("a", "b"), scanHistoryRows: history, verdict })], ["https://example.com/b"]);
});
test("a blank location and a row with no scan history are held", () => {
  assert.deepEqual([...heldForLocation({ rows: urls("c", "d"), scanHistoryRows: history, verdict })].sort(), ["https://example.com/c", "https://example.com/d"]);
});
test("the last added row for a URL decides", () => {
  assert.equal(heldForLocation({ rows: urls("e"), scanHistoryRows: history, verdict }).has("https://example.com/e"), true);
});
test("a tracking parameter on the pending URL still finds its history row", () => {
  assert.equal(heldForLocation({ rows: [{ url: "https://example.com/a?utm_source=x" }], scanHistoryRows: history, verdict }).size, 0);
});
test("only added rows count, wherever a later skipped row puts the posting", () => {
  const a = "https://example.com/a";
  const abroadThenSkipped = [{ url: a, status: "added", location: "Metropolis, NY" }, { url: a, status: "skipped_expired", location: "Remote, United States" }];
  assert.equal(heldForLocation({ rows: [{ url: a }], scanHistoryRows: abroadThenSkipped, verdict }).has(a), true);
  const homeThenSkipped = [{ url: a, status: "added", location: "Remote, United States" }, { url: a, status: "skipped_location", location: "Metropolis, NY" }];
  assert.equal(heldForLocation({ rows: [{ url: a }], scanHistoryRows: homeThenSkipped, verdict }).has(a), false);
});
test("a prebuilt history index gives the same answer", () => {
  const added = addedHistory(history);
  assert.deepEqual([...heldForLocation({ rows: urls("a", "b", "d"), added, verdict })], ["https://example.com/b", "https://example.com/d"]);
});
test("the verdict is given the history row's location and title", () => {
  const seen = [];
  heldForLocation({ rows: urls("b", "d"), scanHistoryRows: history, verdict: (location, title) => { seen.push([location, title]); return { tier: "fit" }; } });
  assert.deepEqual(seen, [["Metropolis, NY", "Platform Lead"], ["", ""]]);
});
test("a review row is held like an elsewhere row", () => {
  const judge = (location) => ({ tier: { "Remote, United States": "fit", "Metropolis, NY": "elsewhere" }[location] ?? "review" });
  assert.deepEqual([...heldForLocation({ rows: urls("a", "b", "c"), scanHistoryRows: history, verdict: judge })], ["https://example.com/b", "https://example.com/c"]);
});

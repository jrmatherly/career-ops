import test from "node:test";
import assert from "node:assert/strict";

import { heldForLocation } from "../../src/lib/core/evaluate-candidates.mjs";

const gate = (location) => ({ eligible: /remote, united states|springfield/i.test(location) });
const history = [
  { url: "https://example.com/a", status: "added", location: "Remote, United States", title: "Platform Lead" },
  { url: "https://example.com/b", status: "added", location: "Metropolis, NY", title: "Platform Lead" },
  { url: "https://example.com/c", status: "added", location: "", title: "Platform Lead" },
  { url: "https://example.com/e", status: "skipped_title", location: "Springfield", title: "x" },
  { url: "https://example.com/e", status: "added", location: "Metropolis, NY", title: "x" },
];
const urls = (...ids) => ids.map((id) => ({ url: `https://example.com/${id}` }));

test("a row the gate rejects is held and one it accepts is not", () => {
  assert.deepEqual([...heldForLocation({ rows: urls("a", "b"), scanHistoryRows: history, gate })], ["https://example.com/b"]);
});
test("a blank location and a row with no scan history are held", () => {
  assert.deepEqual([...heldForLocation({ rows: urls("c", "d"), scanHistoryRows: history, gate })].sort(), ["https://example.com/c", "https://example.com/d"]);
});
test("the last added row for a URL decides", () => {
  assert.equal(heldForLocation({ rows: urls("e"), scanHistoryRows: history, gate }).has("https://example.com/e"), true);
});
test("a tracking parameter on the pending URL still finds its history row", () => {
  assert.equal(heldForLocation({ rows: [{ url: "https://example.com/a?utm_source=x" }], scanHistoryRows: history, gate }).size, 0);
});
test("the gate is given the history row's location and title", () => {
  const seen = [];
  heldForLocation({ rows: urls("b", "d"), scanHistoryRows: history, gate: (location, title) => { seen.push([location, title]); return { eligible: true }; } });
  assert.deepEqual(seen, [["Metropolis, NY", "Platform Lead"], ["", ""]]);
});

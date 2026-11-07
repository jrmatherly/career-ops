// Review Focus 4: a drop onto the same column writes nothing; a drop answered
// 503 (set-status.mjs exit 4, tracker lock busy) retries three times, then reverts.
import assert from "node:assert/strict";
import { test } from "node:test";
import { applicationKey } from "../../src/lib/pipeline-status.mjs";
import { dropCard, dropTarget, RETRIES, RETRY_DELAY_MS } from "../../src/lib/status-save.ts";

const card = { n: "7", company: "Fixture Alpha", role: "Engineer", date: "2026-10-01", report: "", status: "Applied" };
const other = { ...card, n: "8", company: "Fixture Beta", status: "Interview" };

function harness(responses) {
  let state = { rows: [card, other], holds: new Map() };
  const calls = [];
  const waits = [];
  const seen = [];
  const request = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    const [status, body] = responses[Math.min(calls.length - 1, responses.length - 1)];
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  };
  const update = (fn) => {
    state = fn(state);
    seen.push(state.rows.find((r) => r.n === card.n).status);
  };
  const wait = async (ms) => void waits.push(ms);
  return { calls, waits, seen, request, wait, update, get state() { return state; } };
}

const busy = [503, { error: "tracker is locked by another writer", code: "lock-timeout" }];

test("same column is a no-op", async () => {
  const h = harness([[200, { ok: true, status: "Applied" }]]);
  assert.equal(dropTarget(card, "APPLIED"), null);
  assert.equal(dropTarget({ ...card, status: "Aplicado 2026-08-20" }, "APPLIED"), null);
  const result = await dropCard(h.state, card, "APPLIED", h.update, { request: h.request, wait: h.wait });
  assert.deepEqual(result, { outcome: "noop" });
  assert.equal(h.calls.length, 0, "no request, so set-status.mjs never runs and no ledger row is written");
  assert.deepEqual(h.seen, []);
});

test("503 retries three times then reverts", async () => {
  const h = harness([busy]);
  const result = await dropCard(h.state, card, "RESPONDED", h.update, { request: h.request, wait: h.wait });
  assert.equal(result.outcome, "reverted");
  assert.equal(result.error, "The tracker stayed busy, so the card moved back. Try again in a moment.");
  assert.equal(h.calls.length, 1 + RETRIES);
  assert.deepEqual(h.waits, [RETRY_DELAY_MS, RETRY_DELAY_MS, RETRY_DELAY_MS]);
  assert.equal(RETRY_DELAY_MS, 250);
  assert.ok(h.calls.every((c) => c.url === "/api/status" && c.body.n === "7" && c.body.status === "Responded"));
  assert.deepEqual(h.seen, ["Responded", "Applied"], "moved at once, then moved back");
  assert.equal(h.state.holds.get(applicationKey(card))?.phase, "failed");
  assert.equal(h.state.rows.find((r) => r.n === "8").status, "Interview");
});

test("a 503 that clears within the retries saves", async () => {
  const h = harness([busy, busy, [200, { ok: true, status: "Responded" }]]);
  assert.deepEqual(await dropCard(h.state, card, "RESPONDED", h.update, { request: h.request, wait: h.wait }), { outcome: "saved", status: "Responded" });
  assert.equal(h.calls.length, 3);
  assert.deepEqual(h.seen, ["Responded", "Responded"]);
  assert.equal(h.state.holds.size, 0);
});

test("any other failure reverts at once without retrying", async () => {
  const h = harness([[409, { error: "row changed" }]]);
  assert.deepEqual(await dropCard(h.state, card, "OFFER", h.update, { request: h.request, wait: h.wait }), { outcome: "reverted", error: "row changed" });
  assert.equal(h.calls.length, 1);
  assert.deepEqual(h.waits, []);
  assert.deepEqual(h.seen, ["Offer", "Applied"]);
});

test("a card still saving ignores another drop", async () => {
  const h = harness([[200, { ok: true, status: "Offer" }]]);
  const pending = { rows: h.state.rows, holds: new Map([[applicationKey(card), { phase: "pending", status: "Responded", n: "7" }]]) };
  assert.deepEqual(await dropCard(pending, card, "OFFER", h.update, { request: h.request, wait: h.wait }), { outcome: "noop" });
  assert.equal(h.calls.length, 0);
});

// Cases ported from Reactive Resume next-step.test.ts (clone d065a9f7, MIT,
// Amruth Pillai), restated over career-ops' status log and sidecars.
import assert from "node:assert/strict";
import { test } from "node:test";
import { daysInStage, nextStep, stageSince, zonedInstant } from "../../src/lib/next-step.mjs";

const now = new Date("2026-10-31T12:00:00Z");
const app = (status, log = [], extra = {}) => ({ status, date: "2026-08-01", log, ...extra });
const entered = (to, date, source = "web") => ({ date, to, source });
const round = (at, durationMinutes = 60, status = "Scheduled") => ({ at, durationMinutes, status });
const contact = (at) => ({ at, kind: "contact" });

test("the stage clock starts at the last ledger row into the current stage, else the tracker date", () => {
  const a = app("Applied", [entered("Applied", "2026-10-01"), entered("Responded", "2026-10-05"), entered("Applied", "2026-10-21")]);
  assert.deepEqual(stageSince(a), new Date("2026-10-21T12:00:00Z"));
  assert.equal(daysInStage(a, now), 10);
  assert.deepEqual(stageSince(app("Applied", [entered("Evaluated", "2026-09-01")])), new Date("2026-08-01T12:00:00Z"));
});

test("a backfilled stage date is unknown, so it makes no elapsed-time or no-reply claim", () => {
  const a = app("Applied", [entered("Applied", "2026-01-01", "backfill")]);
  assert.equal(stageSince(a), null);
  assert.deepEqual(nextStep(a, [], [], now), { kind: "waiting", days: null });
});

test("ten quiet days after applying or a first reply is no-reply; fewer is waiting", () => {
  for (const status of ["Applied", "Responded", "Assessment"]) {
    assert.deepEqual(nextStep(app(status, [entered(status, "2026-10-21")]), [], [], now), { kind: "no-reply", days: 10 });
    assert.deepEqual(nextStep(app(status, [entered(status, "2026-10-22")]), [], [], now), { kind: "waiting", days: 9 });
  }
});

test("contact during this visit resets the silence; future and earlier-visit contact do not", () => {
  const a = app("Applied", [entered("Applied", "2026-10-01")]);
  assert.deepEqual(nextStep(a, [contact("2026-11-05T12:00")], [], now), { kind: "no-reply", days: 30 });
  assert.deepEqual(nextStep(a, [contact("2026-09-25T12:00")], [], now), { kind: "no-reply", days: 30 });
  assert.deepEqual(nextStep(a, [{ at: "2026-10-25T12:00", kind: "note" }], [], now), { kind: "no-reply", days: 30 });
  assert.deepEqual(nextStep(a, [contact("2026-10-25T12:00:00Z")], [], now), { kind: "waiting", days: 30 });
  assert.deepEqual(nextStep(a, [contact("2026-10-25T12:00:00Z")], [], new Date("2026-11-04T12:00:00Z")), { kind: "no-reply", days: 10 });
});

test("contact earlier on the stage's own day counts, a prior day's does not", () => {
  const a = app("Applied", [entered("Applied", "2026-10-20")]);
  const at = new Date("2026-10-30T08:00:00Z");
  assert.deepEqual(nextStep(a, [contact("2026-10-19T08:00:00Z")], [], at), { kind: "waiting", days: 9 });
  assert.deepEqual(nextStep(a, [contact("2026-10-20T08:00:00Z")], [], at), { kind: "no-reply", days: 10 });
});

test("an upcoming interview comes first, then the follow-up pin", () => {
  const a = app("Applied", [entered("Applied", "2026-10-01")], { followUp: { date: "2026-11-02", note: "Ping" } });
  assert.deepEqual(nextStep(a, [], [round("2026-11-03T15:00:00Z")], now), { kind: "interview", at: new Date("2026-11-03T15:00:00Z") });
  assert.deepEqual(nextStep(a, [], [round("2026-11-03T15:00:00Z", 60, "Cancelled")], now).kind, "follow-up");
  assert.deepEqual(nextStep(a, [], [], now), { kind: "follow-up", at: new Date("2026-11-02T09:00:00Z"), note: "Ping", overdue: false });
  const late = { ...a, followUp: { date: "2026-10-29" } };
  assert.equal(nextStep(late, [], [], now).overdue, true);
});

test("a date-only follow-up falls due at 09:00 in the given zone", () => {
  const a = app("Applied", [], { followUp: { date: "2026-11-02" } });
  assert.deepEqual(nextStep(a, [], [], now, "America/New_York").at, new Date("2026-11-02T14:00:00Z"));
  assert.deepEqual(zonedInstant("2026-07-01", "09:00", "America/New_York"), new Date("2026-07-01T13:00:00Z"));
  assert.deepEqual(zonedInstant("2026-07-01", "09:00", "Not/AZone"), new Date("2026-07-01T09:00:00Z"));
});

test("an interview still running counts as upcoming", () => {
  const a = app("Interview", [entered("Interview", "2026-10-25")]);
  assert.equal(nextStep(a, [], [round("2026-10-31T11:30:00Z", 60)], now).kind, "interview");
});

test("Interview with no round in this visit needs one; a finished round awaits feedback", () => {
  const a = app("Interview", [entered("Interview", "2026-10-25")]);
  assert.deepEqual(nextStep(a, [], [round("2026-10-20T10:00:00Z")], now), { kind: "no-interview", days: 6 });
  assert.deepEqual(nextStep(a, [], [round("2026-10-27T10:00:00Z")], now), { kind: "interview-feedback", days: 6 });
});

test("silence after the last round is counted from its end", () => {
  const a = app("Interview", [entered("Interview", "2026-10-01")]);
  assert.deepEqual(nextStep(a, [], [round("2026-10-05T10:00:00Z")], now), { kind: "no-reply", days: 26, after: "interview" });
  assert.equal(nextStep(a, [], [round("2026-10-05T10:00:00Z")], now, "UTC").kind, "no-reply");
  assert.equal(nextStep(a, [contact("2026-10-28T10:00:00Z")], [round("2026-10-05T10:00:00Z")], now).kind, "interview-feedback");
});

test("Offer is a decision, dated by its respond-by term; a pin stands in only without one", () => {
  const a = app("Offer", [entered("Offer", "2026-10-21")]);
  assert.deepEqual(nextStep(a, [], [], now), { kind: "offer", days: 10, respondBy: null, overdue: false, terms: false });
  const termed = { ...a, offer: { respondBy: "2026-11-03" }, followUp: { date: "2026-11-01" } };
  assert.deepEqual(nextStep(termed, [], [], now), { kind: "offer", days: 10, respondBy: new Date("2026-11-03T12:00:00Z"), overdue: false, terms: true });
  assert.equal(nextStep({ ...termed, offer: { respondBy: "2026-10-30" } }, [], [], now).overdue, true);
  assert.equal(nextStep({ ...a, offer: { respondBy: null }, followUp: { date: "2026-11-01" } }, [], [], now).kind, "follow-up");
});

test("closed stages need nothing; Evaluated and unknown statuses are not applied yet", () => {
  for (const status of ["Hired", "Rejected", "Discarded", "SKIP"]) assert.deepEqual(nextStep(app(status), [], [], now), { kind: "closed" });
  assert.deepEqual(nextStep(app("Evaluated"), [], [], now), { kind: "not-applied" });
  assert.deepEqual(nextStep(app("Not evaluated"), [], [], now), { kind: "not-applied" });
});

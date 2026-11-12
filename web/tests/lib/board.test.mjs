import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { BOARD_COLUMNS, columnOf, columnStatus, groupByColumn, nextStepLabel, splitAtApplyLine } from "../../src/lib/board.mjs";

const row = (n, status) => ({ n: String(n), status });

test("ten stage columns in pipeline order, without INBOX, ALL or OTHER", () => {
  assert.deepEqual(BOARD_COLUMNS, ["EVALUATED", "APPLIED", "RESPONDED", "ASSESSMENT", "INTERVIEW", "OFFER", "HIRED", "REJECTED", "DISCARDED", "SKIP"]);
  assert.equal(columnStatus("SKIP"), "SKIP");
  assert.equal(columnStatus("OTHER"), null);
});

test("rows land in the column their pipeline tab lists them on; OTHER rows are left out", () => {
  const rows = [row(1, "Applied"), row(2, "Aplicado 2026-08-20"), row(3, "Not evaluated"), row(4, "**Rejected**"), row(5, "Interview")];
  const cols = groupByColumn(rows, new Map());
  assert.equal(cols.length, 10);
  const by = Object.fromEntries(cols.map((c) => [c.tab, c.lanes.flatMap((l) => l.rows.map((r) => r.n))]));
  assert.deepEqual(by.APPLIED, ["1", "2"]);
  assert.deepEqual(by.REJECTED, ["4"]);
  assert.deepEqual(by.INTERVIEW, ["5"]);
  assert.equal(cols.reduce((sum, c) => sum + c.count, 0), 4);
  assert.equal(columnOf("Not evaluated"), null);
  assert.equal(columnOf("Aplicado"), "APPLIED");
});

test("lanes become sub-groups in name order with unlaned rows last; no lanes means one group", () => {
  const rows = [row(1, "Interview"), row(2, "Interview"), row(3, "Interview"), row(4, "Interview"), row(5, "Applied")];
  const meta = new Map([[1, { lane: "Onsite" }], [3, { lane: "Phone screen" }], [4, { lane: "Onsite" }]]);
  const interview = groupByColumn(rows, meta).find((c) => c.tab === "INTERVIEW");
  assert.deepEqual(interview.lanes.map((l) => [l.lane, l.rows.map((r) => r.n)]), [["Onsite", ["1", "4"]], ["Phone screen", ["3"]], [null, ["2"]]]);
  const applied = groupByColumn(rows, meta).find((c) => c.tab === "APPLIED");
  assert.deepEqual(applied.lanes.map((l) => l.lane), [null]);
  assert.deepEqual(groupByColumn([], meta)[0].lanes, []);
});

test("rows in a lane sort by score, highest first, unscored last, ties in input order", () => {
  const rows = ["2.0/5", "4.0/5", "N/A", "3.6/5", "4.0/5"].map((score, i) => ({ ...row(i + 1, "Evaluated"), score }));
  const [evaluated] = groupByColumn(rows, new Map());
  assert.deepEqual(evaluated.lanes[0].rows.map((r) => `${r.n}:${r.score}`), ["2:4.0/5", "5:4.0/5", "4:3.6/5", "1:2.0/5", "3:N/A"]);
});

test("splitAtApplyLine splits at the app's apply line, with unscored rows below", () => {
  const rows = ["4.0/5", "3.6/5", "2.0/5", "N/A"].map((score, i) => ({ ...row(i + 1, "Evaluated"), score }));
  const { above, below } = splitAtApplyLine(rows);
  assert.deepEqual(above.map((r) => r.score), ["4.0/5"]);
  assert.deepEqual(below.map((r) => r.score), ["3.6/5", "2.0/5", "N/A"]);
  assert.deepEqual(splitAtApplyLine(rows, 3.5).above.map((r) => r.score), ["4.0/5", "3.6/5"]);
});

test("next-step labels", () => {
  const at = new Date("2026-11-03T15:00:00Z");
  assert.equal(nextStepLabel({ kind: "no-reply", days: 11 }), "No reply · 11d");
  assert.equal(nextStepLabel({ kind: "no-reply", days: 26, after: "interview" }), "No reply · 26d");
  assert.equal(nextStepLabel({ kind: "waiting", days: null }), "Waiting");
  assert.equal(nextStepLabel({ kind: "interview", at }), "Interview Nov 3");
  assert.equal(nextStepLabel({ kind: "follow-up", at, note: "", overdue: true }), "Follow-up overdue · Nov 3");
  assert.equal(nextStepLabel({ kind: "offer", days: 1, respondBy: at, overdue: false, terms: true }), "Reply by Nov 3");
  assert.equal(nextStepLabel({ kind: "offer", days: 1, respondBy: null, overdue: false, terms: false }), "Decide on offer");
  assert.equal(nextStepLabel({ kind: "closed" }), "Closed");
  const day = new Date("2026-11-03T12:00:00Z"); // dayInstant("2026-11-03")
  assert.equal(nextStepLabel({ kind: "offer", days: 1, respondBy: day, overdue: false, terms: true }, "Pacific/Auckland"), "Reply by Nov 3", "a whole day keeps its date east of UTC+12");
  assert.equal(nextStepLabel({ kind: "no-interview", days: 2 }), "Schedule interview");
  assert.equal(nextStepLabel({ kind: "interview-feedback", days: 2 }), "Awaiting feedback");
  assert.equal(nextStepLabel({ kind: "not-applied" }), "Not applied");
  assert.equal(nextStepLabel({ kind: "follow-up", at, note: "", overdue: false }), "Follow up Nov 3");
  assert.equal(nextStepLabel({ kind: "interview", at: new Date("2026-11-04T02:00:00Z") }, "America/Los_Angeles"), "Interview Nov 3");
});

// Read as text: importing nav-items.ts pulls in lucide-react, which the root test job does not install.
test("the nav lists /board", () => {
  const source = readFileSync(new URL("../../src/lib/nav-items.ts", import.meta.url), "utf8");
  const items = source.slice(source.indexOf("NAV_ITEMS"), source.indexOf("];"));
  const entries = [...items.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.ok(entries.includes("/board Board"), entries.join(" | "));
});

// The board's only data path: boardCards reads the tracker, the status log and
// every sidecar off a real data root. A wrong file name here empties the board
// while every parser test still passes, so this drives it against a temp root.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../helpers/web-ts-alias-loader.mjs";

const root = mkdtempSync(join(tmpdir(), "co-board-detail-"));
const ENV_KEYS = ["CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_TRACKER", "TZ"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const now = new Date("2026-10-31T12:00:00Z");
const data = (...p) => join(root, "data", ...p);
let boardCards;

before(async () => {
  process.env.CAREER_OPS_ROOT = root;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_TRACKER = "";
  process.env.TZ = "UTC"; // boardCards labels dates in the host zone
  mkdirSync(data("offers", "fixture-alpha"), { recursive: true });
  mkdirSync(data("offers", "fixture-alpha-inc"), { recursive: true });
  writeFileSync(data("applications.md"), `# Applications Tracker

| # | Date | Company | Role | Score | Status | PDF | Report | Notes |
|---|------|---------|------|-------|--------|-----|--------|-------|
| 12 | 2026-10-01 | Fixture Alpha | Engineer | 4.0/5 | Offer | ❌ | — | |
| 13 | 2026-10-02 | Fixture Beta | Analyst | 4.0/5 | Not evaluated | ❌ | — | |
| 14 | 2026-10-03 | Fixture Gamma | PM | 4.0/5 | Applied | ❌ | — | |
`);
  writeFileSync(data("status-log.tsv"), "14\t2026-10-03\tEvaluated\tApplied\tweb\t\n");
  writeFileSync(data("application-meta.tsv"), "12\t2026-10-01\tlane\tFinal\tweb\nbad row\n");
  writeFileSync(data("contacts.tsv"), "# name\tcompany\ttype\ttitle\tphone\temail\tlinkedin\ttracker\tnotes\nPat Example\tFixture Gamma\trecruiter\t-\t-\tpat@example.test\t-\t14\t\n");
  writeFileSync(data("offers", ".DS_Store"), "x");
  const terms = (recorded, respondBy) => `Tracker: #12\nRecorded: ${recorded}\n\n| Field | Value |\n|---|---|\n| Respond by | ${respondBy} |\n`;
  writeFileSync(data("offers", "fixture-alpha", "terms.md"), terms("2026-10-28", "2026-11-05"));
  writeFileSync(data("offers", "fixture-alpha-inc", "terms.md"), terms("2026-10-20", "2026-11-01"));
  // Only the root-level file exists, the layout interview-round.mjs falls back to.
  writeFileSync(join(root, "active-interviews.md"), "| Company | Role | Round | Date/Time | Interviewer | Status | Notes |\n|---|---|---|---|---|---|---|\n| Fixture Gamma | PM | screen | 2026-11-03 15:00 UTC (30m) | — | Scheduled | #14 in tracker |\n");
  ({ boardCards } = await import("../../src/lib/application-detail.ts"));
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(root, { recursive: true, force: true });
});

test("stage rows only, newest number first, each joined to its sidecars", () => {
  const cards = boardCards(now);
  assert.deepEqual(cards.map((c) => c.n), ["14", "12"], "the Not evaluated row is not a stage");
  const [gamma, alpha] = cards;
  assert.equal(gamma.nextStep, "Interview Nov 3", "rounds read from the root-level active-interviews.md");
  assert.equal(gamma.stageDays, 28);
  assert.deepEqual(gamma.detail.contacts.map((c) => c.name), ["Pat Example"]);
  assert.equal(alpha.detail.lane, "Final");
  assert.equal(alpha.detail.offer?.respondBy, "2026-11-05", "a stray .DS_Store is skipped and the newest Recorded terms win");
  assert.equal(alpha.nextStep, "Reply by Nov 5");
});

test("an unreadable sidecar fails the board instead of reading as empty", () => {
  rmSync(data("application-meta.tsv"));
  mkdirSync(data("application-meta.tsv"));
  assert.throws(() => boardCards(now), /EISDIR/);
});

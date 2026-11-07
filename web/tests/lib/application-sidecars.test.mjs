import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isRetired, parseClearedDirectives, parseFollowups, parseNextOverrides, resolveNextOverride } from "../../../followup-cadence.mjs";
import { readMeta } from "../../../lib/application-meta.mjs";
import {
  byNumber,
  joinApplication,
  parseActiveInterviews,
  parseContacts,
  parseEvents,
  parseFollowupPins,
  parseMeta,
  parseOfferTerms,
} from "../../src/lib/core/application-sidecars.mjs";

// Fixture text in the shapes PR-08's writers produce. Fictional names only.
const META = [
  "12\t2026-10-01\tlane\tPhone screen\tweb",
  "12\t2026-10-02\ttag\tremote\tmanual",
  "12\t2026-10-03\ttag\tai\tmanual",
  "12\t2026-10-04\ttag\tremote\tmanual",
  "12\t2026-10-05\tlane\tOnsite\tweb",
  "12\t2026-10-05\tcolour\tblue\tweb",
  "x\t2026-10-05\tlane\tBad\tweb",
  "13\t2026-10-05\tlane",
].join("\n");

const EVENTS = "# header\n12\t2026-10-20T09:15\tcontact\tEmailed the recruiter\tmanual\n13\t2026-10-21T10:00\tnote\tOther row\tweb\nbroken line\n";

const INTERVIEWS = `# Active Interviews

| Company | Role | Round | Date/Time | Interviewer | Status | Notes |
|---|---|---|---|---|---|---|
| Fixture Alpha | Engineer | technical | 2026-12-01 14:00 America/New_York (45m) | Pat (EM) | Scheduled | #12 in tracker |
| Fixture Alpha | Engineer | screening | 2026-10-10 | — | Done | #12 in tracker |
| Fixture Beta | Analyst | onsite | 2026-12-02 10:00 | — | Scheduled | no reference |
`;

const CONTACTS = "# name\tcompany\ttype\ttitle\tphone\temail\tlinkedin\ttracker\tnotes\nPat Example\tFixture Alpha\trecruiter\tTalent\t-\tpat@example.test\t-\t12\tmet at fair\nSam Example\tFixture Beta\tpeer\t-\t-\t-\t-\t-\t\n";

const FOLLOWUPS = `# Follow-ups

| # | App# | Date | Company | Role | Channel | Contact | Notes |
|---|------|------|---------|------|---------|---------|-------|
| 1 | 13 | 2026-10-25 | Fixture Beta | Analyst | Email | Sam | first |

- next #12 2026-11-02 (set 2026-10-20) — chase the panel
- next #13 2026-11-04 (set 2026-10-20)
- next #14 2026-02-30 (set 2026-10-20)
`;

const TERMS = "# Offer terms — fixture-alpha\n\nTracker: #12\nRecorded: 2026-10-28\n\n| Field | Value |\n|---|---|\n| Base | 100000 |\n| Respond by | 2026-11-05 |\n";

test("meta keeps the latest lane, collects distinct tags, and reports unknown keys and bad rows", () => {
  const skipped = [];
  const meta = parseMeta(META, skipped);
  assert.deepEqual(meta.get(12), { lane: "Onsite", tag: ["remote", "ai"] });
  assert.equal(skipped.length, 3, "colour key, non-numeric number, short row");
  assert.equal(meta.has(13), false);
  assert.equal(parseMeta("").size, 0);
});

test("events parse in file order and skip comment and short rows", () => {
  assert.deepEqual(parseEvents(EVENTS), [
    { num: 12, at: "2026-10-20T09:15", kind: "contact", text: "Emailed the recruiter", source: "manual" },
    { num: 13, at: "2026-10-21T10:00", kind: "note", text: "Other row", source: "web" },
  ]);
});

test("interview rounds join by the #N in tracker reference and read the zone and duration", () => {
  const rounds = parseActiveInterviews(INTERVIEWS);
  assert.equal(rounds.length, 2);
  assert.deepEqual(rounds.map((r) => [r.num, r.round, r.at, r.durationMinutes]), [
    [12, "technical", "2026-12-01T19:00:00.000Z", 45],
    [12, "screening", "2026-10-10T12:00:00.000Z", 60],
  ]);
  assert.equal(rounds[0].interviewer, "Pat (EM)");
  assert.deepEqual(parseActiveInterviews("no table here"), []);
});

test("a first comment line that is not the header keeps the default column order", () => {
  const [c] = parseContacts("# my recruiter list\nJane Example\tFixture Alpha\trecruiter\t-\t-\tjane@example.test\t-\t#12\tnote\n");
  assert.deepEqual([c.name, c.email, c.tracker], ["Jane Example", "jane@example.test", 12]);
});

test("contacts carry their tracker number, or null for a dash", () => {
  assert.deepEqual(parseContacts(CONTACTS).map((c) => [c.name, c.tracker, c.email, c.notes]), [
    ["Pat Example", 12, "pat@example.test", "met at fair"],
    ["Sam Example", null, "-", ""],
  ]);
});

test("a pin lapses once a follow-up is logged after it was set, and an impossible date never counts", () => {
  const pins = parseFollowupPins(FOLLOWUPS);
  assert.deepEqual(pins.get(12), { date: "2026-11-02", setDate: "2026-10-20", note: "chase the panel" });
  assert.equal(pins.has(13), false);
  assert.equal(pins.has(14), false);
});

// Parity with the reader the follow-up cadence uses, so the board never shows a pin the cadence has dropped.
test("live pins match followup-cadence.mjs: retirement, revival, last pin wins, same-day log keeps the pin", () => {
  const md = `${FOLLOWUPS}
| 2 | 15 | 2026-10-26 | Fixture Gamma | Lead | Email | Kim | after retire |
- next #15 2026-11-06 (set 2026-10-27)
- cleared #15 2026-10-22 — revived by the 10-26 follow-up
- next #16 2026-11-03 (set 2026-10-21)
- cleared #16 2026-10-25 — no channel
- next #17 2026-11-01 (set 2026-10-21)
- next #17 2026-11-08 (set 2026-10-24)
- 2026-10-24 · #17 Fixture Delta — same day as the pin
`;
  const logged = new Map();
  for (const f of parseFollowups(md)) if (!(logged.get(f.appNum) >= f.date)) logged.set(f.appNum, f.date);
  const cleared = parseClearedDirectives(md);
  const core = new Map();
  for (const [num, pin] of parseNextOverrides(md)) {
    const date = resolveNextOverride(pin, logged.get(num));
    if (date && !isRetired(cleared.get(num), logged.get(num))) core.set(num, date);
  }
  const web = new Map([...parseFollowupPins(md)].map(([num, pin]) => [num, pin.date]));
  assert.deepEqual(web, core);
  assert.deepEqual([...web.keys()].sort(), [12, 15, 17]);
  assert.equal(web.get(17), "2026-11-08");
});

test("meta parsing matches lib/application-meta.mjs readMeta on the same file", () => {
  const root = mkdtempSync(join(tmpdir(), "co-board-meta-"));
  try {
    mkdirSync(join(root, "data"));
    writeFileSync(join(root, "data", "application-meta.tsv"), META);
    const core = new Map([...readMeta(root)].map(([num, rec]) => [num, Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, v.value]))]));
    assert.deepEqual(parseMeta(META), core);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("offer terms need the Tracker line and expose the respond-by date", () => {
  assert.deepEqual(parseOfferTerms(TERMS), { num: 12, recorded: "2026-10-28", fields: { Base: "100000", "Respond by": "2026-11-05" }, respondBy: "2026-11-05" });
  assert.equal(parseOfferTerms("| Base | 1 |"), null);
});

test("one application joins every source by its number and merges a newest-first timeline", () => {
  const log = [
    { num: 12, date: "2026-10-01", from: "Evaluated", to: "Applied", source: "web", note: "" },
    { num: 99, date: "2026-10-02", from: "Applied", to: "Rejected", source: "web", note: "" },
    { num: 12, date: "2026-10-15", from: "Applied", to: "Interview", source: "cli", note: "panel" },
  ];
  const byNum = (r) => r.num;
  const sources = {
    log: byNumber(log, byNum),
    meta: parseMeta(META),
    events: byNumber(parseEvents(EVENTS), byNum),
    interviews: byNumber(parseActiveInterviews(INTERVIEWS), byNum),
    contacts: byNumber(parseContacts(CONTACTS), (c) => c.tracker),
    pins: parseFollowupPins(FOLLOWUPS),
    offers: byNumber([parseOfferTerms(TERMS)], byNum),
  };
  const d = joinApplication({ n: "12" }, sources);
  assert.equal(d.lane, "Onsite");
  assert.deepEqual(d.tags, ["remote", "ai"]);
  assert.equal(d.log.length, 2);
  assert.equal(d.contacts.length, 1);
  assert.equal(d.interviews.length, 2);
  assert.equal(d.followUp?.date, "2026-11-02");
  assert.equal(d.offer?.respondBy, "2026-11-05");
  assert.deepEqual(d.timeline.map((e) => e.kind), ["interview", "contact", "status", "interview", "status"]);
  assert.equal(d.timeline[2].text, "Applied → Interview (panel)");

  const empty = joinApplication({ n: "77" }, sources);
  assert.equal(byNumber(parseContacts(CONTACTS), (c) => c.tracker).size, 1, "a contact with no tracker number joins nothing");
  assert.deepEqual([empty.lane, empty.tags, empty.timeline, empty.followUp, empty.offer], [null, [], [], null, null]);
});

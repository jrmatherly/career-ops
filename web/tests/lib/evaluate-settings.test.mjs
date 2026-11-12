import test from "node:test";
import assert from "node:assert/strict";
import {
  addedLink,
  clampEvaluate,
  enrichLedger,
  evaluateBody,
  evaluateFieldsVisible,
  evaluateForm,
  evaluateCaveat,
  evaluateModeLabel,
  groupLedger,
  postingHref,
  runCountsLine,
} from "../../src/lib/evaluate-settings.mjs";
import { scheduledEvaluate } from "../../src/lib/scheduled-job-input.mjs";

test("the threshold and per-run fields show for Auto only", () => {
  assert.equal(evaluateFieldsVisible("off"), false);
  assert.equal(evaluateFieldsVisible("review"), false);
  assert.equal(evaluateFieldsVisible("auto"), true);
});

test("the form clamps to the numbers the server stores", () => {
  const thresholds = [0.5, 1, 3.55, 5, 5.5];
  const caps = [0, 1, 99];
  for (const rankThreshold of thresholds) {
    for (const maxPerRun of caps) {
      const input = { mode: "auto", rankThreshold, maxPerRun };
      const server = scheduledEvaluate(input, undefined);
      assert.deepEqual(clampEvaluate(input), { mode: "auto", rankThreshold: server.rankThreshold, maxPerRun: server.maxPerRun }, JSON.stringify(input));
    }
  }
  assert.deepEqual(clampEvaluate({ mode: "auto", rankThreshold: 0.5, maxPerRun: 0 }), { mode: "auto", rankThreshold: 1, maxPerRun: 1 });
  assert.deepEqual(clampEvaluate({ mode: "auto", rankThreshold: 5.5, maxPerRun: 99 }), { mode: "auto", rankThreshold: 5, maxPerRun: 20 });
  assert.deepEqual(clampEvaluate({ mode: "review" }), { mode: "review", rankThreshold: 3.5, maxPerRun: 5 });
});

test("bad input throws the server's message", () => {
  assert.throws(() => clampEvaluate({ mode: "sometimes" }), /Invalid evaluate settings\./);
  assert.throws(() => clampEvaluate({ mode: "auto", rankThreshold: "" }), /Invalid rank threshold\./);
  assert.throws(() => clampEvaluate({ mode: "auto", maxPerRun: Number.NaN }), /Invalid evaluations per run\./);
});

test("the modal sends Off only to turn stored settings off, and the Auto numbers only for Auto", () => {
  const stored = { mode: "auto", enabledAt: "2026-11-09", rankThreshold: 4, maxPerRun: 3 };
  assert.equal(evaluateBody({ mode: "off", rankThreshold: "3.5", maxPerRun: "5" }, undefined), undefined, "a job without settings stays without them");
  assert.deepEqual(evaluateBody({ mode: "off", rankThreshold: "", maxPerRun: "5" }, stored), { mode: "off" }, "a hidden bad field does not block Off");
  assert.deepEqual(evaluateBody({ mode: "review", rankThreshold: "", maxPerRun: "x" }, undefined), { mode: "review" }, "nor Review");
  assert.deepEqual(evaluateBody({ mode: "auto", rankThreshold: "9", maxPerRun: "0" }, undefined), { mode: "auto", rankThreshold: 5, maxPerRun: 1 });
  assert.throws(() => evaluateBody({ mode: "auto", rankThreshold: "", maxPerRun: "5" }, stored), /Invalid rank threshold\./);
});

test("the card label names the mode and, for Auto, its numbers", () => {
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5, maxPerRun: 5 }), "Auto, rank 3.5 and above, 5 per run");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 4, maxPerRun: 3 }), "Auto, rank 4.0 and above, 3 per run");
  assert.equal(evaluateModeLabel({ mode: "review", rankThreshold: 3.5, maxPerRun: 5 }), "Review, rank only");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5 }), "Auto, settings unreadable; open Edit and save", "a hand-edited store missing a field never shows NaN");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: "high", maxPerRun: 5 }), "Auto, settings unreadable; open Edit and save");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: null, maxPerRun: 5 }), "Auto, settings unreadable; open Edit and save", "null is not a rank of 0.0");
  assert.equal(evaluateModeLabel({ mode: "auto", rankThreshold: 3.5, maxPerRun: "Infinity" }), "Auto, settings unreadable; open Edit and save");
});

test("the rank caveat shows for Review and Auto, and Auto alone adds its API-text limit", () => {
  assert.equal(evaluateCaveat("off"), null);
  assert.equal(evaluateCaveat("review"), "Rank is a guess from the title and URL.");
  assert.match(evaluateCaveat("auto"), /^Rank is a guess from the title and URL\. Auto evaluates only postings whose board exposes the job text/);
  assert.equal(evaluateModeLabel({ mode: "off" }), null);
  assert.equal(evaluateModeLabel(undefined), null);
});

test("the drawer line shows only the counts that are numbers", () => {
  assert.equal(runCountsLine({ ranked: 7, autoQueued: 7, evaluated: 3, gated: 1 }), "ranked 7, queued 7, evaluated 3, gated 1");
  assert.equal(runCountsLine({ ranked: 0, evalErrors: 2 }), "ranked 0, errors 2");
  assert.equal(runCountsLine({ rolesFound: 4 }), "");
});

test("ledger entries group by state in a fixed order, empty groups left out", () => {
  const entries = [
    { url: "a", state: "evaluated" }, { url: "b", state: "queued" }, { url: "c", state: "running" }, { url: "d", state: "queued" },
  ];
  assert.deepEqual(groupLedger(entries).map((g) => [g.state, g.entries.map((e) => e.url)]), [
    ["running", ["c"]], ["queued", ["b", "d"]], ["evaluated", ["a"]],
  ]);
  assert.deepEqual(groupLedger([]), []);
  assert.deepEqual(groupLedger([{ url: "e", state: "cancelled" }, ...entries]).map((g) => g.state), ["running", "queued", "evaluated", "cancelled"], "a state added later still shows, last");
});

test("a queued entry links to the UTC date of its first queued row", () => {
  const entry = { rows: [{ state: "queued", at: "2026-11-07T23:59:00.000Z" }, { state: "failed", at: "2026-11-08T00:10:00.000Z" }, { state: "queued", at: "2026-11-09T08:00:00.000Z" }] };
  assert.equal(addedLink(entry), "/pipeline?added=2026-11-07");
  assert.equal(addedLink({ rows: [{ state: "skipped", at: "2026-11-07T10:00:00.000Z" }] }), null);
  assert.equal(addedLink({ rows: [] }), null);
  assert.equal(addedLink({}), null);
});

test("the edit modal seeds the form from the stored settings, and a job without them reads as Off with the defaults", () => {
  assert.deepEqual(evaluateForm({ mode: "auto", enabledAt: "2026-11-09", rankThreshold: 4, maxPerRun: 3 }), { mode: "auto", rankThreshold: "4", maxPerRun: "3" });
  assert.deepEqual(evaluateForm({ mode: "review", enabledAt: "2026-11-09", rankThreshold: 3.5, maxPerRun: 5 }), { mode: "review", rankThreshold: "3.5", maxPerRun: "5" });
  assert.deepEqual(evaluateForm(undefined), { mode: "off", rankThreshold: "3.5", maxPerRun: "5" });
  // Seeded as stored: a hand-edited value outside the bounds reaches the form unchanged and is clamped on save.
  assert.deepEqual(evaluateForm({ mode: "auto", enabledAt: "2026-11-09", rankThreshold: 3.55, maxPerRun: 99 }), { mode: "auto", rankThreshold: "3.55", maxPerRun: "99" });
});

test("the panel links a ledger URL only when it is http(s)", () => {
  assert.equal(postingHref("https://jobs.example.com/1"), "https://jobs.example.com/1");
  assert.equal(postingHref("HTTP://jobs.example.com/1"), "HTTP://jobs.example.com/1");
  assert.equal(postingHref("javascript:alert(1)"), null);
  assert.equal(postingHref("local:jds/posting.md"), null);
  assert.equal(postingHref(""), null);
});

test("a ledger entry takes company, role, score and tracker number from its tracker row, else company and role from the inbox", () => {
  const entries = [
    { key: "k1", url: "https://jobs.example.com/a/1?utm_source=x", state: "evaluated", reason: "report 7" },
    { key: "k2", url: "https://jobs.example.com/b/2", state: "queued", reason: "" },
    { key: "k3", url: "https://jobs.example.com/c/3", state: "queued", reason: "" },
    { key: "k4", url: "https://jobs.example.com/d/4", state: "queued", reason: "" },
  ];
  const inbox = [
    { url: "https://jobs.example.com/a/1", company: "Inbox Name", role: "Inbox Role", done: true },
    { url: "https://jobs.example.com/b/2", company: "Company B", role: "Data Engineer", done: false },
    { url: "https://jobs.example.com/d/4", company: "", role: "", done: false },
  ];
  const applications = [{ n: "94", company: "Company A", role: "Platform Engineer", score: "4.0/5", url: "[ashby](https://jobs.example.com/a/1)" }];
  const [a, b, c, d] = enrichLedger(entries, inbox, applications);
  assert.deepEqual(a, { ...entries[0], company: "Company A", role: "Platform Engineer", score: "4.0/5", trackerN: "94" }, "the tracker row wins over the inbox, and a markdown-link URL cell still matches");
  assert.deepEqual(b, { ...entries[1], company: "Company B", role: "Data Engineer" }, "the inbox supplies company and role only");
  assert.deepEqual(c, entries[2], "no match leaves the entry as it was, URL intact");
  assert.deepEqual(d, entries[3], "an inbox row with blank cells adds nothing");
});

test("rows with no URL key never lend their name, and a score sentinel is not shown as a score", () => {
  const entries = [{ url: "local:jds/x.md" }, { url: "" }, { url: "https://jobs.example.com/e/5" }];
  const inbox = [{ url: "", company: "Inbox Blank", role: "r" }];
  const applications = [
    { n: "1", company: "No Url", role: "R", score: "3/5", url: "" },
    { n: "2", company: "Dash", role: "R", score: "3/5", url: "—" },
    { n: "3", company: "Backfilled", role: "R", score: "N/A", url: "https://jobs.example.com/e/5" },
  ];
  assert.deepEqual(enrichLedger(entries, inbox, applications), [
    entries[0],
    entries[1],
    { ...entries[2], company: "Backfilled", role: "R", trackerN: "3" },
  ]);
});

// Tests for parseInbox() — the web Pipeline inbox reader.
// Imports pipeline-table.mjs directly so the test and production path cannot drift.
//
// Run:  node --test tests/lib/inbox-parse.test.mjs

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseInbox } from "../../src/lib/pipeline-table.mjs";

const URL = "https://example.com/job/1";

test("full URL | Company | Role row still parses", () => {
  const jobs = parseInbox(`- [ ] ${URL} | Acme | Engineer`);
  assert.equal(jobs.length, 1);
  assert.deepEqual(jobs[0], {
    done: false,
    url: URL,
    company: "Acme",
    role: "Engineer",
    location: undefined,
    compensation: undefined,
    postedAt: undefined,
  });
});

test("bare checkbox URL row is kept, not skipped", () => {
  const jobs = parseInbox(`- [ ] ${URL}`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, URL);
  assert.equal(jobs[0].company, "");
  assert.equal(jobs[0].role, "");
  assert.equal(jobs[0].done, false);
});

test("URL | company without a role is kept", () => {
  const jobs = parseInbox(`- [ ] ${URL} | Acme`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, URL);
  assert.equal(jobs[0].company, "Acme");
  assert.equal(jobs[0].role, "");
});

test("labeled posted: segment still maps to postedAt on a full row", () => {
  const jobs = parseInbox(
    `- [ ] ${URL} | Acme | Engineer | Remote (US) | posted: 2026-07-14`,
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "Acme");
  assert.equal(jobs[0].role, "Engineer");
  assert.equal(jobs[0].location, "Remote (US)");
  assert.equal(jobs[0].postedAt, "2026-07-14");
  assert.equal(jobs[0].compensation, undefined);
});

test("a word: in the company or role cell stays text", () => {
  const jobs = parseInbox(`- [ ] ${URL} | note: hello | role: eng | posted: 2026-07-14`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "note: hello");
  assert.equal(jobs[0].role, "role: eng");
  assert.equal(jobs[0].postedAt, "2026-07-14");
  assert.equal(jobs[0].location, undefined);
});

test("a posted: cell in the company column is company text, not a date label", () => {
  const jobs = parseInbox(`- [ ] ${URL} | posted: 2026-07-14`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "posted: 2026-07-14");
  assert.equal(jobs[0].role, "");
  assert.equal(jobs[0].postedAt, undefined);
});

test("a scanner row with empty company and role still reads a later posted: label", () => {
  const jobs = parseInbox(`- [ ] ${URL} |  |  | posted: 2026-07-14`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].company, "");
  assert.equal(jobs[0].role, "");
  assert.equal(jobs[0].postedAt, "2026-07-14");
  assert.equal(jobs[0].location, undefined);
});

test("location and compensation stay positional on a 5-column row", () => {
  const jobs = parseInbox(
    `- [ ] ${URL} | Acme | Engineer | Remote (US) | 180000-220000 USD`,
  );
  assert.equal(jobs[0].location, "Remote (US)");
  assert.equal(jobs[0].compensation, "180000-220000 USD");
});

test("non-http junk is skipped", () => {
  const md = [
    "- [ ] not-a-url | Acme | Engineer",
    "- [ ] ftp://example.com/job/1 | Acme | Engineer",
    "- a prose line with https://example.com/job/1 in it",
    "",
  ].join("\n");
  assert.deepEqual(parseInbox(md), []);
});

test("a local: row for a saved job description is kept", () => {
  // modes/scan.md writes this row for a posting pasted as text; the inbox
  // showed it before bare URL rows were supported and must keep showing it.
  const jobs = parseInbox(
    [
      "- [ ] local:jds/acme-engineer.md | Acme | Engineer",
      "- [x] #12 | local:jds/acme-engineer.md | Acme | Engineer",
      "- [ ] local: | Acme | Engineer",
    ].join("\n"),
  );
  assert.equal(jobs.length, 2);
  assert.equal(jobs[0].url, "local:jds/acme-engineer.md");
  assert.equal(jobs[0].company, "Acme");
  assert.equal(jobs[0].role, "Engineer");
  assert.equal(jobs[1].done, true);
  assert.equal(jobs[1].url, "local:jds/acme-engineer.md");
});

test("processed #NNN | URL row keeps the http URL, not the report number", () => {
  const jobs = parseInbox(
    `- [x] #143 | ${URL} | Acme | Engineer | 4.2/5 | PDF ✅`,
  );
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].done, true);
  assert.equal(jobs[0].url, URL);
  assert.equal(jobs[0].company, "Acme");
  assert.equal(jobs[0].role, "Engineer");
});

test("processed #NNN | URL without company/role still keeps the URL", () => {
  const jobs = parseInbox(`- [x] #-- | ${URL}`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].done, true);
  assert.equal(jobs[0].url, URL);
  assert.equal(jobs[0].company, "");
  assert.equal(jobs[0].role, "");
});

test("a CRLF bare URL row still parses", () => {
  const jobs = parseInbox(`- [ ] ${URL}\r\n`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].url, URL);
  assert.ok(!jobs[0].url.includes("\r"));
  assert.equal(jobs[0].company, "");
});

test("parseInbox returns rank and reason", () => {
  const jobs = parseInbox(`- [ ] ${URL} | Acme | Engineer | Remote | rank: 4.2/5 — Strong match on platform work / infra`);
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].location, "Remote");
  assert.equal(jobs[0].rank, 4.2);
  assert.equal(jobs[0].rankReason, "Strong match on platform work / infra");
});

test("a row without rank parses as before", () => {
  const jobs = parseInbox(`- [ ] ${URL} | Acme | Engineer | posted: 2026-11-01`);
  assert.deepEqual(jobs[0], {
    done: false,
    url: URL,
    company: "Acme",
    role: "Engineer",
    location: undefined,
    compensation: undefined,
    postedAt: "2026-11-01",
  });
});

test("a rank on a short row stays a rank, not the role or company", () => {
  const jobs = parseInbox([
    `- [ ] ${URL} | Acme | rank: 4.0/5 — x`,
    `- [ ] ${URL}/2 | rank: 2.5/5 — y`,
  ].join("\n"));
  assert.deepEqual(jobs.map((j) => [j.company, j.role, j.rank, j.rankReason]), [["Acme", "", 4, "x"], ["", "", 2.5, "y"]]);
});

test("a rank label with no reason, a bad number or above 5 sets no rank", () => {
  const jobs = parseInbox([
    `- [ ] ${URL} | Acme | Engineer | rank: 4.2/5`,
    `- [ ] ${URL}/2 | Acme | Engineer | rank: high/5 — vibes`,
    `- [ ] ${URL}/3 | Acme | Engineer | rank: 9/5 — hand edit`,
  ].join("\n"));
  assert.equal(jobs.length, 3);
  for (const job of jobs) assert.ok(!("rank" in job) && !("rankReason" in job));
});

test("the rank bounds parse: 5/5 and 5.0/5 as 5, 0/5 as 0", () => {
  const jobs = parseInbox([
    `- [ ] ${URL} | Acme | Engineer | Remote | rank: 5/5 — top`,
    `- [ ] ${URL}/2 | Acme | Engineer | Remote | rank: 5.0/5 — top`,
    `- [ ] ${URL}/3 | Acme | Engineer | Remote | rank: 0/5 — low`,
  ].join("\n"));
  assert.deepEqual(jobs.map((j) => j.rank), [5, 5, 0]);
});

test("a company cell that reads rank: but holds no rank value stays the company", () => {
  const [job] = parseInbox(`- [ ] ${URL} | rank: pending | Engineer`);
  assert.equal(job.company, "rank: pending");
  assert.equal(job.role, "Engineer");
  assert.ok(!("rank" in job));
});

test("a rank label on a short row matches in any case, like the label grammar", () => {
  const [job] = parseInbox(`- [ ] ${URL} | Acme | Rank: 3.5/5 — capitalised by hand`);
  assert.deepEqual([job.company, job.role, job.rank, job.rankReason], ["Acme", "", 3.5, "capitalised by hand"]);
});

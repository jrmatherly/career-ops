import assert from "node:assert/strict";
import { test } from "node:test";
import { boardType, boardTypes, filterPortals, healthOf, portalCounts, parsePortalHealth, uncheckedCount, withToggles, withUnlisted } from "../../src/lib/portals-view-model.mjs";

const companies = [
  { name: "Acme", enabled: true, host: "jobs.ashbyhq.com" },
  { name: "Globex", enabled: true, host: "boards.greenhouse.io" },
  { name: "Initech", enabled: true, host: "jobs.lever.co" },
  { name: "Umbrella", enabled: false, host: "careers.umbrella.example" },
  { name: "Hooli", enabled: false, host: "" },
];
const health = {
  Globex: { status: "broken", detail: "slug not found" },
  Acme: { status: "live", detail: "ashby/acme · 4 jobs" },
};
const names = (list) => list.map((c) => c.name);

test("counts scanned, paused and the scanned boards a check found broken", () => {
  assert.deepEqual(portalCounts(companies, health), { scanned: 3, paused: 2, attention: 1 });
});

test("no health check means nothing needs attention", () => {
  assert.deepEqual(portalCounts(companies, {}), { scanned: 3, paused: 2, attention: 0 });
});

test("each tab keeps its own companies", () => {
  assert.deepEqual(names(filterPortals(companies, { query: "", tab: "scanned", health })), ["Acme", "Globex", "Initech"]);
  assert.deepEqual(names(filterPortals(companies, { query: "", tab: "paused", health })), ["Umbrella", "Hooli"]);
  assert.deepEqual(names(filterPortals(companies, { query: "", tab: "attention", health })), ["Globex"]);
});

test("a paused company is never in Needs attention, even when its last check was broken", () => {
  const stale = { ...health, Umbrella: { status: "broken", detail: "slug not found" } };
  assert.deepEqual(names(filterPortals(companies, { query: "", tab: "attention", health: stale })), ["Globex"]);
});

test("search matches the name or the host, ignoring case", () => {
  assert.deepEqual(names(filterPortals(companies, { query: "ASHBY", tab: "scanned", health })), ["Acme"]);
  assert.deepEqual(names(filterPortals(companies, { query: " glob ", tab: "scanned", health })), ["Globex"]);
  assert.deepEqual(names(filterPortals(companies, { query: "nothing", tab: "scanned", health })), []);
});

test("a missing health file is no health; a broken one is an error", () => {
  assert.equal(parsePortalHealth(null), null);
  const saved = { checkedAt: "2026-11-11T07:00:00.000Z", companies: [{ name: "Acme", status: "live", detail: "ok" }] };
  assert.deepEqual(parsePortalHealth(JSON.stringify(saved)), { checkedAt: saved.checkedAt, health: { Acme: { status: "live", detail: "ok" } } });
  assert.throws(() => parsePortalHealth("{ not json"));
  assert.throws(() => parsePortalHealth(JSON.stringify({ companies: "nope" })), /portal-health\.json/);
  assert.throws(() => parsePortalHealth("null"), /portal-health\.json/);
});

test("a checked board the list does not hold still gets a row, so a broken one is counted", () => {
  const watched = [{ name: "Acme ", enabled: true, host: "jobs.example.com" }];
  const health = { Acme: { status: "live", detail: "3 jobs" }, "Example Board": { status: "broken", detail: "404" } };
  const rows = withUnlisted(watched, health);
  assert.deepEqual(rows.map((c) => c.name), ["Acme ", "Example Board"]);
  assert.equal(healthOf(health, "Acme ").status, "live", "a tracked name with stray whitespace finds its result");
  assert.deepEqual(portalCounts(rows, health), { scanned: 2, paused: 0, attention: 1 });
});

test("two entries with one name keep their own switch and count", () => {
  const watched = [{ name: "Acme", enabled: true, host: "a.example" }, { name: "Acme", enabled: false, host: "b.example" }];
  const rows = withToggles(watched, [true, false]);
  assert.deepEqual(rows.map((c) => [c.index, c.enabled]), [[0, true], [1, false]]);
  assert.deepEqual(portalCounts(rows, {}), { scanned: 1, paused: 1, attention: 0 });
  assert.equal(withToggles(watched, [false, false])[0].enabled, false);
});

test("a scanned company the last check does not hold is counted as unchecked", () => {
  const rows = [{ name: "Acme", enabled: true, host: "" }, { name: "Globex", enabled: true, host: "" }, { name: "Initech", enabled: false, host: "" }];
  assert.equal(uncheckedCount(rows, { Acme: { status: "live", detail: "" } }), 1);
});

test("a saved entry without a status or detail is an error, not a blank row", () => {
  assert.throws(() => parsePortalHealth(JSON.stringify({ checkedAt: "2026-11-12T00:00:00Z", companies: [{ name: "Acme" }] })), /portal-health\.json/);
});

test("a board is named by its provider, else by the host of its api or careers URL", () => {
  assert.equal(boardType({ careers_url: "https://jobs.ashbyhq.com/acme" }), "Ashby");
  assert.equal(boardType({ careers_url: "https://acme.example/careers", api: "https://boards-api.greenhouse.io/v1/boards/acme/jobs" }), "Greenhouse");
  assert.equal(boardType({ provider: "smartrecruiters", careers_url: "https://acme.example" }), "Smartrecruiters");
  // One spelling per board, however the entry cases it, and the same one a host gives.
  for (const provider of ["greenhouse", "GreenHouse", " GREENHOUSE "]) assert.equal(boardType({ provider }), "Greenhouse");
  assert.equal(boardType({ careers_url: "https://acme.wd5.myworkdayjobs.com/jobs" }), "Workday");
  assert.equal(boardType({ careers_url: "https://apply.workable.com/acme" }), "Workable");
  assert.equal(boardType({ careers_url: "https://jobs.lever.co/acme" }), "Lever");
  for (const other of [{ careers_url: "https://notlever.co/x" }, { careers_url: "not a url" }, { provider: " " }, { provider: 7 }, {}]) assert.equal(boardType(other), "Other");
});

const boards = [
  { name: "Acme", enabled: true, host: "", board: "Greenhouse" },
  { name: "Globex", enabled: true, host: "", board: "Greenhouse" },
  { name: "Initech", enabled: true, host: "", board: "Lever" },
  { name: "Umbrella", enabled: true, host: "", board: "Other" },
  { name: "Hooli", enabled: false, host: "", board: "Other" },
];

test("the board types present are listed once, sorted, with Other last", () => {
  assert.deepEqual(boardTypes(boards), ["Greenhouse", "Lever", "Other"]);
  assert.deepEqual(boardTypes([{ name: "Zed", enabled: true, host: "", board: "Workday" }, { name: "Odd", enabled: true, host: "", board: "Other" }, { name: "Ash", enabled: true, host: "", board: "Ashby" }]), ["Ashby", "Workday", "Other"]);
  assert.deepEqual(boardTypes([]), []);
});

test("the board filter narrows a tab, combines with the search, and any shows every board", () => {
  const filter = (extra) => names(filterPortals(boards, { query: "", tab: "scanned", health: {}, ...extra }));
  assert.deepEqual(filter({ board: "Lever" }), ["Initech"]);
  assert.deepEqual(filter({ board: "" }), ["Acme", "Globex", "Initech", "Umbrella"]);
  assert.deepEqual(filter({}), filter({ board: "" }));
  assert.deepEqual(filter({ board: "Greenhouse", query: "glob" }), ["Globex"]);
  assert.deepEqual(filter({ board: "Other", tab: "paused" }), ["Hooli"]);
});

test("a board the check found that the list does not hold is Other, and shows under any and Other only", () => {
  const all = withUnlisted(boards, { Stray: { status: "broken", detail: "gone" } });
  assert.equal(all.at(-1).board, "Other");
  const filter = (board) => names(filterPortals(all, { query: "", tab: "attention", health: { Stray: { status: "broken", detail: "gone" } }, board }));
  assert.deepEqual(filter(""), ["Stray"]);
  assert.deepEqual(filter("Other"), ["Stray"]);
  assert.deepEqual(filter("Lever"), []);
});

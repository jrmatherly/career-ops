import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPortals, healthOf, portalCounts, parsePortalHealth, uncheckedCount, withToggles, withUnlisted } from "../../src/lib/portals-view-model.mjs";

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

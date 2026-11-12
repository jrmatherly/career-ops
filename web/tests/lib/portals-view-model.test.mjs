import assert from "node:assert/strict";
import { test } from "node:test";
import { filterPortals, portalCounts, parsePortalHealth } from "../../src/lib/portals-view-model.mjs";

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

// POST /api/portals with { company, request_delay_ms, revision } sets the least
// time between one tracked company's requests, the line lib/entry-pacing.mjs reads.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as yaml from "js-yaml";
import "../helpers/web-ts-alias-loader.mjs";
import { MAX_REQUEST_DELAY_MS as CORE_MAX } from "../../../lib/entry-pacing.mjs";
import { MAX_REQUEST_DELAY_MS, setCompanyRequestDelayText, watchedCompanies } from "../../src/lib/portals-config.mjs";
import { requestDelayFromSeconds } from "../../src/lib/portals-view-model.mjs";
import { revisionOf } from "../../src/lib/settings-state.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataRoot = mkdtempSync(join(tmpdir(), "co-portals-delay-"));
const portalsFile = join(dataRoot, "portals.yml");
const SOURCE = "tracked_companies:\n  # keep me\n  - name: Acme\n    careers_url: https://acme.example\n    enabled: true\n  - name: Globex\n    careers_url: https://globex.example\n";
const PACED = SOURCE.replace("  - name: Acme\n", "  - name: Acme\n    request_delay_ms: 10000\n");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PORTALS"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let POST;

const post = async (body) => {
  const res = await POST(new Request("http://127.0.0.1/api/portals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};

before(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  ({ POST } = await import("../../src/app/api/portals/route.ts"));
});

beforeEach(() => {
  for (const f of readdirSync(dataRoot)) rmSync(join(dataRoot, f), { recursive: true, force: true });
  writeFileSync(portalsFile, SOURCE);
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

test("the page's ceiling is the scanner's", () => {
  assert.equal(MAX_REQUEST_DELAY_MS, CORE_MAX);
});

test("a delay is added after the name, changed in place and removed again", () => {
  assert.equal(setCompanyRequestDelayText(SOURCE, "Acme", 10000), PACED);
  assert.equal(setCompanyRequestDelayText(PACED, "Acme", 2500), PACED.replace("10000", "2500"));
  assert.equal(setCompanyRequestDelayText(PACED, "Acme", null), SOURCE);
  assert.equal(setCompanyRequestDelayText(SOURCE, "Acme", null), SOURCE);
});

test("a changed delay keeps the comment after the value and CRLF endings", () => {
  const source = "tracked_companies:\r\n  - name: Acme\r\n    request_delay_ms: 10000  # rate-limited\r\n";
  assert.equal(setCompanyRequestDelayText(source, "Acme", 5000), source.replace("10000", "5000"));
});

test("a delay on the entry's dash line can change but not be removed", () => {
  const source = "tracked_companies:\n  - request_delay_ms: 10000\n    name: Acme\n";
  assert.equal(setCompanyRequestDelayText(source, "Acme", 5000), source.replace("10000", "5000"));
  assert.equal(setCompanyRequestDelayText(source, "Acme", null), null);
});

test("watchedCompanies carries a delay the scanner would apply and flags any other value as ignored", () => {
  const withGlobex = (value) => yaml.load(PACED.replace("  - name: Globex\n", `  - name: Globex\n    request_delay_ms: ${value}\n`));
  assert.equal(watchedCompanies(withGlobex(1)).find((c) => c.name === "Acme").requestDelayMs, 10000);
  for (const value of [1, MAX_REQUEST_DELAY_MS]) assert.equal(watchedCompanies(withGlobex(value)).find((c) => c.name === "Globex").requestDelayMs, value);
  for (const value of ["fast", '"10000"', 1.5, 0, -5, MAX_REQUEST_DELAY_MS + 1]) {
    const globex = watchedCompanies(withGlobex(value)).find((c) => c.name === "Globex");
    assert.equal("requestDelayMs" in globex, false, `value: ${value}`);
    assert.equal(globex.requestDelayIgnored, true, `value: ${value}`);
  }
  // No key is not an ignored value.
  assert.equal("requestDelayIgnored" in watchedCompanies(yaml.load(PACED)).find((c) => c.name === "Globex"), false);
});

test("a deeper key of the same name is left alone", () => {
  const source = "tracked_companies:\n  - name: Acme\n    opts:\n      request_delay_ms: 7\n";
  assert.equal(setCompanyRequestDelayText(source, "Acme", null), source);
  assert.equal(setCompanyRequestDelayText(source, "Acme", 5000), source.replace("  - name: Acme\n", "  - name: Acme\n    request_delay_ms: 5000\n"));
});

test("the seconds field becomes whole milliseconds, null when empty or 0, undefined when unusable", () => {
  assert.equal(requestDelayFromSeconds("2.5"), 2500);
  assert.equal(requestDelayFromSeconds("600"), MAX_REQUEST_DELAY_MS);
  assert.equal(requestDelayFromSeconds("0.001"), 1);
  for (const empty of ["", "  ", "0", "0.0"]) assert.equal(requestDelayFromSeconds(empty), null, `draft: "${empty}"`);
  for (const bad of ["abc", "-1", "0.0004", "601", "Infinity"]) assert.equal(requestDelayFromSeconds(bad), undefined, `draft: "${bad}"`);
});

test("the route writes the one line and returns the new revision", async () => {
  const { status, body } = await post({ company: "Acme", request_delay_ms: 10000, revision: revisionOf(SOURCE) });
  assert.equal(status, 200);
  assert.equal(readFileSync(portalsFile, "utf8"), PACED);
  assert.equal(body.revision, revisionOf(PACED));
});

test("null removes the line", async () => {
  writeFileSync(portalsFile, PACED);
  assert.equal((await post({ company: "Acme", request_delay_ms: null, revision: revisionOf(PACED) })).status, 200);
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
});

test("a value the scanner would ignore is 400 and the file is untouched", async () => {
  for (const bad of [0, -1, 1.5, MAX_REQUEST_DELAY_MS + 1, "10000", true]) {
    const { status } = await post({ company: "Acme", request_delay_ms: bad, revision: revisionOf(SOURCE) });
    assert.equal(status, 400, `value: ${String(bad)}`);
  }
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
});

test("a request that also carries enabled is 400 and the file is untouched", async () => {
  assert.equal((await post({ company: "Acme", enabled: false, request_delay_ms: 10000, revision: revisionOf(SOURCE) })).status, 400);
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
});

test("a stale revision is 409 and an unknown company is 404", async () => {
  assert.equal((await post({ company: "Acme", request_delay_ms: 10000, revision: "stale" })).status, 409);
  assert.equal((await post({ company: "Initech", request_delay_ms: 10000, revision: revisionOf(SOURCE) })).status, 404);
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
});

test("1 and the ceiling are accepted", async () => {
  const first = await post({ company: "Acme", request_delay_ms: 1, revision: revisionOf(SOURCE) });
  assert.equal(first.status, 200);
  assert.equal((await post({ company: "Acme", request_delay_ms: MAX_REQUEST_DELAY_MS, revision: first.body.revision })).status, 200);
  assert.match(readFileSync(portalsFile, "utf8"), /request_delay_ms: 600000\n/);
});

test("an entry the page cannot edit is 409 and the file is untouched", async () => {
  const dash = "tracked_companies:\n  - request_delay_ms: 10000\n    name: Acme\n";
  writeFileSync(portalsFile, dash);
  const { status, body } = await post({ company: "Acme", request_delay_ms: null, revision: revisionOf(dash) });
  assert.equal(status, 409);
  assert.match(body.error, /cannot be paced here/);
  assert.equal(readFileSync(portalsFile, "utf8"), dash);
});

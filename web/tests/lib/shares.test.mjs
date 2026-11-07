// /shares reads what publish/share.mjs writes (data/shares.json and
// data/share-feedback/*.md) and refreshes it through POST /api/shares/pull,
// which turns a request into `share.mjs pull [--slug s]` argv. The reader runs
// against a temp data root; the route runs under the @/ loader against a
// stand-in publish/share.mjs in a temp checkout (CAREER_OPS_CODE_ROOT) that
// records its argv and exits as told.
import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = mkdtempSync(join(tmpdir(), "co-shares-code-"));
const dataRoot = mkdtempSync(join(tmpdir(), "co-shares-data-"));
const argvFile = join(codeRoot, "argv.json");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let readShares;
let POST;

const sharesFile = join(dataRoot, "data", "shares.json");
const record = (slug, extra = {}) => ({
  slug,
  source: { kind: "resume", ref: null },
  template: null,
  hide: { sections: [], items: [] },
  url: `http://127.0.0.1:8099/s/${slug}`,
  hideContacts: false,
  hasPassword: false,
  pulled: null,
  ...extra,
});

// Exits and prints what the next run should, as set in stand-in.json.
const standIn = (exitCode, stderr = "") => {
  writeFileSync(join(codeRoot, "stand-in.json"), JSON.stringify({ exitCode, stderr }));
  writeFileSync(join(codeRoot, "publish", "share.mjs"), `import { readFileSync, writeFileSync } from "node:fs";
const plan = JSON.parse(readFileSync(${JSON.stringify(join(codeRoot, "stand-in.json"))}, "utf8"));
writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));
if (plan.stderr) process.stderr.write(plan.stderr);
process.exit(plan.exitCode);
`);
};

const post = async (body) => {
  rmSync(argvFile, { force: true });
  const init = body === undefined ? { method: "POST" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await POST(new Request("http://127.0.0.1/api/shares/pull", init));
  return { status: res.status, body: await res.json(), argv: existsSync(argvFile) ? JSON.parse(readFileSync(argvFile, "utf8")) : null };
};

before(async () => {
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_TRACKER = "";
  mkdirSync(join(codeRoot, "publish"), { recursive: true });
  mkdirSync(join(dataRoot, "data", "share-feedback"), { recursive: true });
  ({ readShares } = await import("../../src/lib/shares.ts"));
  ({ POST } = await import("../../src/app/api/shares/pull/route.ts"));
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(codeRoot, { recursive: true, force: true });
  rmSync(dataRoot, { recursive: true, force: true });
});

test("no shares.json is an empty list, not an error", () => {
  rmSync(sharesFile, { force: true });
  assert.deepEqual(readShares(), { shares: [], error: null });
  assert.deepEqual(readShares(dataRoot), { shares: [], error: null });
});

test("a present shares.json yields one row per slug with the feedback file as text", () => {
  const feedback = "# Feedback: alpha\n\n## Rae — 2026-11-07T06:23:46.669Z\n\n> Lead with the <script>alert(1)</script> migration.\n\n";
  writeFileSync(join(dataRoot, "data", "share-feedback", "alpha.md"), feedback);
  writeFileSync(sharesFile, JSON.stringify({
    alpha: record("alpha", { source: { kind: "html", ref: "/tmp/cv.html" }, hideContacts: true, hide: { sections: ["education"], items: ["work-1"] }, hasPassword: true, pulled: { at: "2026-11-07T07:05:08.727Z", views: 3, comments: 1 } }),
    beta: record("beta"),
    "Not A Slug": record("x"),
  }));
  const { shares, error } = readShares(dataRoot);
  assert.equal(error, null);
  assert.deepEqual(shares.map((s) => s.slug), ["alpha", "beta"], "a key outside the CLI's slug rule is skipped");
  assert.deepEqual(shares[0], {
    slug: "alpha",
    url: "http://127.0.0.1:8099/s/alpha",
    source: "html /tmp/cv.html",
    overlay: "contacts, education, work-1",
    hasPassword: true,
    pulled: { at: "2026-11-07T07:05:08.727Z", views: 3, comments: 1 },
    feedback,
  });
  assert.deepEqual(shares[1], { slug: "beta", url: "http://127.0.0.1:8099/s/beta", source: "resume", overlay: "", hasPassword: false, pulled: null, feedback: null });
});

test("a malformed shares.json reports an error and no rows, and a partial record never throws", () => {
  writeFileSync(sharesFile, "{ not json");
  const bad = readShares(dataRoot);
  assert.deepEqual(bad.shares, []);
  assert.match(bad.error, /not valid JSON/);
  writeFileSync(sharesFile, "[]");
  assert.match(readShares(dataRoot).error, /not a record/);
  writeFileSync(sharesFile, JSON.stringify({ gamma: null, delta: { pulled: { views: "7" } } }));
  const { shares, error } = readShares(dataRoot);
  assert.equal(error, null);
  assert.equal(shares[0].slug, "gamma");
  assert.equal(shares[1].pulled, null, "a pulled block without a timestamp counts as never pulled");
});

test("pull runs share.mjs pull, with --slug only when one is given; a bad slug is refused first", async () => {
  standIn(0);
  const all = await post({});
  assert.equal(all.status, 200);
  assert.deepEqual(all.body, { ok: true });
  assert.deepEqual(all.argv, ["pull"]);
  const none = await post();
  assert.equal(none.status, 200, "a body-less POST pulls everything");
  assert.deepEqual(none.argv, ["pull"]);
  const one = await post({ slug: "alpha-1" });
  assert.equal(one.status, 200);
  assert.deepEqual(one.argv, ["pull", "--slug", "alpha-1"]);
  for (const slug of ["--help", "Alpha", "a b", "", "x".repeat(65), 42, ["alpha"]]) {
    const r = await post({ slug });
    assert.equal(r.status, 400, JSON.stringify(slug));
    assert.equal(r.argv, null, `share.mjs never runs for ${JSON.stringify(slug)}`);
  }
});

test("a service that does not answer is a 502 whose message names no URL or path", async () => {
  standIn(1, "publish: GET http://127.0.0.1:8099/api/shares/alpha/stats: connect ECONNREFUSED 127.0.0.1:8099\n");
  const r = await post({ slug: "alpha" });
  assert.equal(r.status, 502);
  assert.doesNotMatch(r.body.error, /127\.0\.0\.1|\//);
  standIn(1, "publish: PUBLISH_URL is not set (environment or /home/u/root/.env)\n");
  const unset = await post({});
  assert.equal(unset.status, 503);
  assert.doesNotMatch(unset.body.error, /\/home/);
});

test("any other non-zero exit is a 500 with a generic message; a missing record is a 404", async () => {
  standIn(1, "publish: something else broke at /abs/path\n");
  const r = await post({});
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.body.error, /\/abs/);
  standIn(1, "publish: no local record for zeta\n");
  assert.equal((await post({ slug: "zeta" })).status, 404);
});

test("a data-only root (no share.mjs) is a 503 before anything runs", async () => {
  rmSync(join(codeRoot, "publish", "share.mjs"), { force: true });
  const r = await post({});
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "core-script-missing");
  assert.equal(r.argv, null);
});

// Read as text: importing nav-items.ts pulls in lucide-react, which the root test job does not install.
test("the nav lists /shares right after /board, where PR-14 appended it", () => {
  const source = readFileSync(new URL("../../src/lib/nav-items.ts", import.meta.url), "utf8");
  const items = source.slice(source.indexOf("NAV_ITEMS"), source.indexOf("];"));
  const entries = [...items.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.equal(entries[entries.indexOf("/board Board") + 1], "/shares Shares");
});

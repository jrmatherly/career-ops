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
import { createServer } from "node:net";
import { createServer as createHttpServer } from "node:http";
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
const standIn = (exitCode, stderr = "", stdout = "") => {
  writeFileSync(join(codeRoot, "stand-in.json"), JSON.stringify({ exitCode, stderr, stdout }));
  writeFileSync(join(codeRoot, "publish", "share.mjs"), `import { readFileSync, writeFileSync } from "node:fs";
const plan = JSON.parse(readFileSync(${JSON.stringify(join(codeRoot, "stand-in.json"))}, "utf8"));
writeFileSync(${JSON.stringify(argvFile)}, JSON.stringify(process.argv.slice(2)));
if (plan.stderr) process.stderr.write(plan.stderr);
if (plan.stdout) process.stdout.write(plan.stdout);
process.exit(plan.exitCode);
`);
};

const post = async (body, raw = false) => {
  rmSync(argvFile, { force: true });
  const init = body === undefined ? { method: "POST" } : { method: "POST", headers: { "Content-Type": "application/json" }, body: raw ? body : JSON.stringify(body) };
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
    "-draft": record("-draft"),
    "Not A Slug": record("x"),
  }));
  const { shares, error } = readShares(dataRoot);
  assert.equal(error, null);
  assert.deepEqual(shares.map((s) => s.slug), ["alpha", "beta", "-draft"], "a key the CLI could have written is listed; one outside its rule is skipped");
  assert.deepEqual(shares[0], {
    slug: "alpha",
    url: "http://127.0.0.1:8099/s/alpha",
    source: "html /tmp/cv.html",
    overlay: "contacts, education, work-1",
    hasPassword: true,
    pulled: { at: "2026-11-07T07:05:08.727Z", views: 3, comments: 1 },
    feedback,
    pullable: true,
  });
  assert.deepEqual(shares[1], { slug: "beta", url: "http://127.0.0.1:8099/s/beta", source: "resume", overlay: "", hasPassword: false, pulled: null, feedback: null, pullable: true });
  assert.equal(shares[2].pullable, false, "a leading-dash slug is listed but cannot be passed as --slug");
});

test("a malformed shares.json reports an error and no rows, and a partial record never throws", () => {
  writeFileSync(sharesFile, "{ not json");
  const bad = readShares(dataRoot);
  assert.deepEqual(bad.shares, []);
  assert.match(bad.error, /not valid JSON/);
  writeFileSync(sharesFile, "[]");
  assert.match(readShares(dataRoot).error, /not a record/);
  writeFileSync(sharesFile, JSON.stringify({ gamma: null, delta: { pulled: { views: "7" } }, eps: { pulled: { at: "2026-11-07T00:00:00.000Z", views: "7", comments: "abc" } } }));
  const { shares, error } = readShares(dataRoot);
  assert.equal(error, null);
  assert.equal(shares[0].slug, "gamma");
  assert.equal(shares[1].pulled, null, "a pulled block without a timestamp counts as never pulled");
  assert.deepEqual(shares[2].pulled, { at: "2026-11-07T00:00:00.000Z", views: 7, comments: 0 }, "counts are coerced, a corrupt one reads 0");
  rmSync(sharesFile, { force: true });
  mkdirSync(sharesFile);
  const unreadable = readShares(dataRoot);
  rmSync(sharesFile, { recursive: true, force: true });
  assert.deepEqual(unreadable.shares, []);
  assert.match(unreadable.error, /could not be read/, "a non-ENOENT read failure is an error, not an empty page");
});

test("pull runs share.mjs pull, with --slug only when one is given; a bad slug is refused first", async () => {
  standIn(0);
  const all = await post({});
  assert.equal(all.status, 200);
  assert.deepEqual(all.body, { ok: true, missing: [], pulled: 0 });
  assert.deepEqual(all.argv, ["pull"]);
  const max = await post({ slug: "a".repeat(64) });
  assert.equal(max.status, 200, "64 characters is the limit, not past it");
  assert.deepEqual(max.argv, ["pull", "--slug", "a".repeat(64)]);
  for (const raw of ["not json", "[\"alpha\"]", "\"alpha\""]) {
    const r = await post(raw, true);
    assert.equal(r.status, 400, raw);
    assert.equal(r.argv, null, `a non-object body never runs share.mjs (${raw})`);
  }
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

test("a share the service no longer has comes back as missing on a successful pull, with the count that did answer", async () => {
  standIn(0, "publish: alpha is not on the server; run delete --slug alpha to drop the record\npublish: beta is not on the server; run delete --slug beta to drop the record\n", "gamma views 3 comments 1\n");
  const r = await post({});
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, { ok: true, missing: ["alpha", "beta"], pulled: 1 });
  standIn(0, "publish: warning: something harmless\n");
  assert.deepEqual((await post({})).body, { ok: true, missing: [], pulled: 0 }, "other stderr on exit 0 is logged, not reported");
});

// A cluster install takes the key from cluster.toml as pod env, which wins over .env, so both places are named.
const KEY_DESTINATIONS = /publish_api_key = "cops_\.\.\." in the \[career_ops\] block of cluster\.toml.*data root's \.env/;

test("a refused key is a 503, rate limiting a 429 and a service error a 502, none naming a URL", async () => {
  const cases = [
    ["publish: GET /api/shares/alpha/stats answered 401 (api key required)\n", 503, /PUBLISH_API_KEY/],
    ["publish: GET /api/shares/alpha/stats answered 403 (forbidden)\n", 503, /PUBLISH_API_KEY/],
    ["publish: GET /api/shares/alpha/stats answered 429 (rate limited)\n", 429, /rate limit/],
    ["publish: GET /api/shares/alpha/stats answered 500\n", 502, /did not answer/],
    ["publish: GET http://127.0.0.1:8099/api/shares/alpha/stats answered 200 with a non-JSON body; is PUBLISH_URL the publish service?\n", 502, /did not answer/],
    ["publish: lock timeout: /home/u/root/data/shares.json.lock held > 10000ms\n", 503, /try again shortly/],
    ["publish: /home/u/root/data/shares.json is not valid JSON: Unexpected token\n", 500, /not valid JSON/],
  ];
  for (const [stderr, status, message] of cases) {
    standIn(1, stderr);
    const r = await post({ slug: "alpha" });
    assert.equal(r.status, status, stderr);
    assert.match(r.body.error, message);
    assert.doesNotMatch(r.body.error, /127\.0\.0\.1|\/api|\/home/);
    if (status === 503 && /40[13]/.test(stderr)) assert.match(r.body.error, KEY_DESTINATIONS);
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
  assert.match(unset.body.error, KEY_DESTINATIONS);
});

test("any other non-zero exit is a 500 with a generic message; a missing record is a 404", async () => {
  standIn(1, "publish: something else broke at /abs/path\n");
  const r = await post({});
  assert.equal(r.status, 500);
  assert.doesNotMatch(r.body.error, /\/abs/);
  standIn(1, "publish: no local record for zeta\n");
  assert.equal((await post({ slug: "zeta" })).status, 404);
});

// Deletes the stand-in, so it stays after every stand-in case above.
test("a data-only root (no share.mjs) is a 503 before anything runs", async () => {
  rmSync(join(codeRoot, "publish", "share.mjs"), { force: true });
  const r = await post({});
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "core-script-missing");
  assert.equal(r.argv, null);
});

// The classes above are regexes over share.mjs's wording; these cases run the real CLI
// (CAREER_OPS_CODE_ROOT at the checkout) so a reworded message fails here, not in the UI.
// None needs the service: the record check and the env check happen before any request,
// the third hits a port nothing listens on, and the fourth a server that answers 404 to everything.
test("the real share.mjs produces the 404, 503 and 502 classes the route reads", async () => {
  const checkout = join(import.meta.dirname, "..", "..", "..");
  const env = { ...process.env };
  process.env.CAREER_OPS_CODE_ROOT = checkout;
  delete process.env.PUBLISH_URL;
  delete process.env.PUBLISH_API_KEY;
  rmSync(join(dataRoot, ".env"), { force: true });
  try {
    writeFileSync(sharesFile, JSON.stringify({ alpha: record("alpha") }));
    const unknown = await post({ slug: "zeta" });
    assert.equal(unknown.status, 404, JSON.stringify(unknown.body));
    const unset = await post({ slug: "alpha" });
    assert.equal(unset.status, 503, JSON.stringify(unset.body));
    assert.match(unset.body.error, /not set/);
    // A port just freed, not a reserved one: fetch refuses the spec's bad ports (1, 7, 9, ...) before connecting.
    const srv = createServer();
    await new Promise((r) => srv.listen(0, "127.0.0.1", r));
    const port = srv.address().port;
    await new Promise((r) => srv.close(r));
    process.env.PUBLISH_URL = `http://127.0.0.1:${port}`;
    process.env.PUBLISH_API_KEY = "cops_test";
    const refused = await post({ slug: "alpha" });
    assert.equal(refused.status, 502, JSON.stringify(refused.body));
    // A host that is not the service (or a share it lost) answers 404; the CLI skips the share and exits 0.
    const gone = createHttpServer((req, res) => { res.statusCode = 404; res.end("{}"); });
    await new Promise((r) => gone.listen(0, "127.0.0.1", r));
    process.env.PUBLISH_URL = `http://127.0.0.1:${gone.address().port}`;
    try {
      const r = await post({ slug: "alpha" });
      assert.equal(r.status, 200, JSON.stringify(r.body));
      assert.deepEqual(r.body, { ok: true, missing: ["alpha"], pulled: 0 });
    } finally {
      await new Promise((r) => gone.close(r));
    }
  } finally {
    for (const k of ["CAREER_OPS_CODE_ROOT", "PUBLISH_URL", "PUBLISH_API_KEY"]) {
      if (env[k] === undefined) delete process.env[k];
      else process.env[k] = env[k];
    }
  }
});

// Read as text: importing nav-items.ts pulls in lucide-react, which the root test job does not install.
test("the nav lists /shares right after /board, where PR-14 appended it", () => {
  const source = readFileSync(new URL("../../src/lib/nav-items.ts", import.meta.url), "utf8");
  const items = source.slice(source.indexOf("NAV_ITEMS"), source.indexOf("];"));
  const entries = [...items.matchAll(/\{ href: "([^"]+)", label: "([^"]+)"/g)].map((m) => `${m[1]} ${m[2]}`);
  assert.ok(entries.includes("/board Board"), `nav-items.ts no longer matches the one-line entry shape: ${entries.join(" | ")}`);
  assert.equal(entries[entries.indexOf("/board Board") + 1], "/shares Shares");
});

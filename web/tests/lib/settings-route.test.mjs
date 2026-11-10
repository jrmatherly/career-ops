// /api/settings shows every setting with its source and saves the ones that are
// environment variables to {DATA_ROOT}/config/settings.json. Driven for real:
// the handlers run under the @/ loader against a temp data root and this
// checkout's registry and store.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataRoot = mkdtempSync(join(tmpdir(), "co-settings-route-"));
const file = join(dataRoot, "config", "settings.json");
const ID = "CAREER_OPS_SCAN_CONCURRENCY";
const SECRET = "test-secret-value";
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_SETTINGS", "CAREER_OPS_SETTINGS_APPLIED", "CAREER_OPS_PROFILE", "CAREER_OPS_PORTALS", ID, "CAREER_OPS_RANK_TIMEOUT_MS", "GEMINI_API_KEY"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let GET;
let POST;

const get = async () => {
  const res = await GET();
  const text = await res.text();
  return { status: res.status, text, body: JSON.parse(text) };
};
const post = async (body) => {
  const res = await POST(new Request("http://127.0.0.1/api/settings", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const rowOf = (body, id) => body.groups.flatMap((g) => g.settings).find((s) => s.id === id);
const save = (values) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, typeof values === "string" ? values : JSON.stringify({ version: 1, values }));
};
const onDisk = () => (existsSync(file) ? readFileSync(file, "utf8") : null);

before(async () => {
  for (const k of ENV_KEYS) delete process.env[k];
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  // The web test script turns saved settings off; this suite is about them.
  process.env.CAREER_OPS_SETTINGS = "";
  ({ GET, POST } = await import("../../src/app/api/settings/route.ts"));
});

beforeEach(() => {
  rmSync(join(dataRoot, "config"), { recursive: true, force: true });
  rmSync(join(dataRoot, ".env"), { force: true });
  for (const k of [ID, "GEMINI_API_KEY", "CAREER_OPS_SETTINGS_APPLIED", "CAREER_OPS_RANK_TIMEOUT_MS"]) delete process.env[k];
  process.env.CAREER_OPS_SETTINGS = "";
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

test("GET with nothing saved reports defaults, the environment and .env", async () => {
  let { status, body } = await get();
  assert.equal(status, 200);
  assert.deepEqual(body.revision, { settings: "absent", profile: "absent", portals: "absent" });
  assert.equal(body.fileError, null);
  assert.equal(body.overlayDisabled, false);
  assert.equal(body.groups[0].id, "scanner");
  assert.deepEqual([rowOf(body, ID).value, rowOf(body, ID).source], [10, "default"]);
  assert.equal(rowOf(body, "CAREER_OPS_ROOT").value, dataRoot);

  writeFileSync(join(dataRoot, ".env"), `${ID}=8 # a note`);
  ({ body } = await get());
  assert.deepEqual([rowOf(body, ID).value, rowOf(body, ID).source], [8, "dotenv"]);

  process.env[ID] = "7";
  ({ body } = await get());
  assert.deepEqual([rowOf(body, ID).value, rowOf(body, ID).source], [7, "environment"]);
});

test("a secret is reported as set and its value never leaves the server", async () => {
  process.env.GEMINI_API_KEY = SECRET;
  writeFileSync(join(dataRoot, ".env"), `OPENAI_API_KEY=${SECRET}\nPUBLISH_URL=https://bob:${SECRET}@pub.example\n`);
  const { text, body } = await get();
  assert.equal(rowOf(body, "PUBLISH_URL").value, null, "a URL with credentials is refused and not echoed");
  assert.ok(!text.includes(SECRET));
  assert.deepEqual([rowOf(body, "GEMINI_API_KEY").value, rowOf(body, "GEMINI_API_KEY").source], [null, "environment"]);
  assert.equal(rowOf(body, "OPENAI_API_KEY").source, "dotenv");
});

test("POST saves a value, a stale revision is refused, and null resets", async () => {
  process.env[ID] = "7";
  const { body: loaded } = await get();
  const saved = await post({ revision: loaded.revision, changes: { [ID]: 4 } });
  assert.equal(saved.status, 200);
  assert.deepEqual(JSON.parse(onDisk()), { version: 1, values: { [ID]: 4 } });
  assert.deepEqual([rowOf(saved.body, ID).value, rowOf(saved.body, ID).source], [4, "saved"]);
  assert.notEqual(saved.body.revision.settings, loaded.revision.settings);
  assert.equal(process.env[ID], "7", "the server's own environment is not written");

  const before = onDisk();
  const stale = await post({ revision: loaded.revision, changes: { [ID]: 5 } });
  assert.equal(stale.status, 409);
  assert.match(stale.body.error, /changed since this page loaded/);
  assert.equal(onDisk(), before);
  assert.equal((await post({ changes: { [ID]: 5 } })).status, 409, "a save with no revision is stale");

  const reset = await post({ revision: saved.body.revision, changes: { [ID]: null } });
  assert.equal(reset.status, 200);
  assert.deepEqual(JSON.parse(onDisk()), { version: 1, values: {} });
  assert.deepEqual([rowOf(reset.body, ID).value, rowOf(reset.body, ID).source], [7, "environment"]);
});

test("a bad change set writes nothing and names every id", async () => {
  save({ [ID]: 4 });
  const before = onDisk();
  const { body: loaded } = await get();
  const res = await post({ revision: loaded.revision, changes: { [ID]: 0, GEMINI_API_KEY: "x", CAREER_OPS_ROOT: "/x", NOPE: 1, CAREER_OPS_RANK_TIMEOUT_MS: 20000 } });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.errors, { [ID]: "must be a whole number from 1 to 50", GEMINI_API_KEY: "cannot be changed here", CAREER_OPS_ROOT: "cannot be changed here", NOPE: "is not a setting" });
  assert.equal(onDisk(), before);

  assert.deepEqual(await post({ revision: loaded.revision, changes: {} }), { status: 400, body: { error: "nothing to change" } });
  assert.deepEqual(await post({ revision: loaded.revision }), { status: 400, body: { error: "nothing to change" } });
  assert.deepEqual(await post("{not json"), { status: 400, body: { error: "bad json" } });
  assert.deepEqual(await post("[1]"), { status: 400, body: { error: "bad json" } });
  assert.equal(onDisk(), before);
});

test("a settings file that does not parse is shown and never replaced", async () => {
  save("{not json");
  const { status, body } = await get();
  assert.equal(status, 200);
  assert.match(body.fileError, /^config\/settings\.json is not valid JSON/);
  const envRows = body.groups.flatMap((g) => g.settings).filter((s) => s.kind === "env");
  assert.ok(envRows.length > 0 && envRows.every((s) => s.editable === false));
  const res = await post({ revision: body.revision, changes: { [ID]: 4 } });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /config\/settings\.json is not valid JSON/);
  assert.equal(onDisk(), "{not json");
});

test("with CAREER_OPS_SETTINGS=off the page shows the environment and refuses a save", async () => {
  save({ [ID]: 4 });
  const before = onDisk();
  process.env.CAREER_OPS_SETTINGS = "off";
  const { body } = await get();
  assert.equal(body.overlayDisabled, true);
  assert.deepEqual([rowOf(body, ID).value, rowOf(body, ID).source, rowOf(body, ID).editable], [10, "default", false]);
  const res = await post({ revision: body.revision, changes: { [ID]: 5 } });
  assert.equal(res.status, 409);
  assert.match(res.body.error, /CAREER_OPS_SETTINGS=off/);
  assert.equal(onDisk(), before);
});

test("a value the overlay put in the server's environment does not outlive its reset", async () => {
  // url-guard.mjs imports liveness-browser.mjs in-process, which applies the overlay to this process.
  save({ CAREER_OPS_RANK_TIMEOUT_MS: 12345, [ID]: 4 });
  process.env[ID] = "7";
  const { applySettings } = await import(pathToFileURL(join(codeRoot, "lib/settings-env.mjs")).href);
  applySettings();
  assert.equal(process.env.CAREER_OPS_RANK_TIMEOUT_MS, "12345", "the overlay ran in this process");

  const { body: loaded } = await get();
  const reset = await post({ revision: loaded.revision, changes: { CAREER_OPS_RANK_TIMEOUT_MS: null, [ID]: null } });
  assert.equal(reset.status, 200);
  assert.deepEqual([rowOf(reset.body, "CAREER_OPS_RANK_TIMEOUT_MS").value, rowOf(reset.body, "CAREER_OPS_RANK_TIMEOUT_MS").source], [180000, "default"]);
  assert.deepEqual([rowOf(reset.body, ID).value, rowOf(reset.body, ID).source], [7, "environment"]);

  const { effectiveEnv } = await import("../../src/lib/settings-server.ts");
  const env = await effectiveEnv();
  assert.deepEqual([env.CAREER_OPS_RANK_TIMEOUT_MS, env[ID]], [undefined, "7"], "what a caller passes on is the environment from before the overlay");
  save({ [ID]: 4 });
  assert.equal((await effectiveEnv())[ID], "4");
  process.env.CAREER_OPS_SETTINGS = "off";
  assert.equal((await effectiveEnv())[ID], "7");
});

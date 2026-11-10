// POST /api/portals with { company, enabled, revision } turns one tracked
// company on or off. Driven for real under the @/ loader against a temp data root.
import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";
import { loadPortalsDocument } from "../../src/lib/portals-config.mjs";
import { revisionOf } from "../../src/lib/settings-state.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "../../..");
const dataRoot = mkdtempSync(join(tmpdir(), "co-portals-route-"));
const portalsFile = join(dataRoot, "portals.yml");
const SOURCE = "tracked_companies:\n  # keep me\n  - name: Acme\n    careers_url: https://acme.example\n    enabled: true\n";
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PORTALS"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
let POST;

const post = async (body) => {
  const res = await POST(new Request("http://127.0.0.1/api/portals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
  return { status: res.status, body: await res.json() };
};
const backups = () => readdirSync(dataRoot).filter((f) => f.startsWith(`${basename(portalsFile)}.bak-`));

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

test("turning a company off writes the one line, keeps a backup and returns the new revision", async () => {
  const { status, body } = await post({ company: "Acme", enabled: false, revision: revisionOf(SOURCE) });
  assert.equal(status, 200);
  const text = readFileSync(portalsFile, "utf8");
  assert.equal(text, SOURCE.replace("enabled: true", "enabled: false"));
  assert.equal(body.revision, revisionOf(text));
  assert.equal(backups().length, 1);
});

test("an unknown company is 404 and the file is untouched", async () => {
  const { status, body } = await post({ company: "Initech", enabled: false, revision: revisionOf(SOURCE) });
  assert.equal(status, 404);
  assert.equal(body.error, 'no company named "Initech" in portals.yml');
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
});

test("a stale revision is 409 and the file is untouched", async () => {
  const { status } = await post({ company: "Acme", enabled: false, revision: "stale" });
  assert.equal(status, 409);
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
  assert.equal(backups().length, 0);
});

test("a company listed twice is 409", async () => {
  const twice = `${SOURCE}  - name: Acme\n    enabled: false\n`;
  writeFileSync(portalsFile, twice);
  const { status } = await post({ company: "Acme", enabled: false, revision: revisionOf(twice) });
  assert.equal(status, 409);
  assert.equal(readFileSync(portalsFile, "utf8"), twice);
});

test("a non-boolean enabled is 400 and the file is untouched", async () => {
  const { status } = await post({ company: "Acme", enabled: "false", revision: revisionOf(SOURCE) });
  assert.equal(status, 400);
  assert.equal(readFileSync(portalsFile, "utf8"), SOURCE);
  assert.equal(backups().length, 0);
});

test("the revision the Portals page computes is the one the route accepts", async () => {
  const { source } = loadPortalsDocument(portalsFile, join(codeRoot, "templates", "portals.example.yml"));
  assert.equal((await post({ company: "Acme", enabled: false, revision: revisionOf(source) })).status, 200);
});

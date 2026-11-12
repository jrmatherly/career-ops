// GET /api/cv/pdf on a scratch data root: every failure answers JSON with a
// status, and none leaves a temp directory behind. A real render needs
// Chromium, so the success case is in cv-page.browser.test.mjs.
//
// Run:  node --experimental-strip-types --test tests/lib/cv-pdf-route.test.mjs

import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import "../helpers/web-ts-alias-loader.mjs";

const codeRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const dataRoot = mkdtempSync(join(tmpdir(), "cv-pdf-route-data-"));
const cvPath = join(dataRoot, "cv.md");
const ENV_KEYS = ["CAREER_OPS_CODE_ROOT", "CAREER_OPS_ROOT", "CAREER_OPS_DATA_DIR", "CAREER_OPS_PROFILE", "CAREER_OPS_TRACKER"];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
const tempDirs = () => readdirSync(tmpdir()).filter((f) => f.startsWith("cv-master-pdf-"));

let route;

before(async () => {
  process.env.CAREER_OPS_CODE_ROOT = codeRoot;
  process.env.CAREER_OPS_ROOT = dataRoot;
  process.env.CAREER_OPS_DATA_DIR = "";
  process.env.CAREER_OPS_PROFILE = "";
  process.env.CAREER_OPS_TRACKER = "";
  route = await import("../../src/app/api/cv/pdf/route.ts");
});

after(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  rmSync(dataRoot, { recursive: true, force: true });
});

test("no cv.md answers 404 JSON", async (t) => {
  t.mock.method(console, "warn", () => {});
  const res = await route.GET();
  assert.equal(res.status, 404);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.equal((await res.json()).error, "cv.md not found");
});

test("a lossy cv.md answers 409 JSON and leaves no temp directory", async (t) => {
  t.mock.method(console, "warn", () => {});
  copyFileSync(join(codeRoot, "examples", "cv-example.md"), cvPath);
  // A list row under Skills without its bold lead is a line the absorb cannot place.
  writeFileSync(cvPath, `${readFileSync(cvPath, "utf8").trimEnd()}\n- stray bullet without a bold lead\n`);
  const before = tempDirs();
  const res = await route.GET();
  assert.equal(res.status, 409);
  assert.match(res.headers.get("content-type"), /application\/json/);
  assert.equal((await res.json()).error, "cv.md could not be read cleanly");
  assert.deepEqual(tempDirs().filter((d) => !before.includes(d)), []);
});
